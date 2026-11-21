import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const calls: Array<{ op: string; args: unknown[] }> = [];
let selectResult: { data: unknown; error: unknown } = { data: [], error: null };
let writeResult: { data: unknown; error: unknown } = { data: { id: 'new-id' }, error: null };

function builder() {
  const b: Record<string, unknown> = {};
  const record = (op: string) => (...args: unknown[]) => { calls.push({ op, args }); return b; };
  b['select'] = record('select');
  b['insert'] = record('insert');
  b['update'] = record('update');
  b['delete'] = record('delete');
  b['eq'] = record('eq');
  b['order'] = (...args: unknown[]) => { calls.push({ op: 'order', args }); return Promise.resolve(selectResult); };
  b['single'] = () => Promise.resolve(writeResult);
  b['then'] = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve({ error: writeResult.error }).then(res, rej);
  return b;
}

const channel: { on: ReturnType<typeof vi.fn>; subscribe: ReturnType<typeof vi.fn> } = {
  on: vi.fn(() => channel),
  subscribe: vi.fn(() => channel),
};
const client = {
  from: vi.fn(() => builder()),
  channel: vi.fn(() => channel),
  removeChannel: vi.fn(() => Promise.resolve()),
};

vi.mock('../../shared/api/supabase/client', () => ({ getSupabase: () => client }));
vi.mock('../../shared/lib/firebaseErrorHandling', () => ({ logSanitizedFirebaseError: vi.fn() }));

import { useAccountsSupabase, mapAccountRow, centsFromBigint } from './useAccountsSupabase';

beforeEach(() => {
  calls.length = 0;
  selectResult = { data: [], error: null };
  writeResult = { data: { id: 'new-id' }, error: null };
  vi.clearAllMocks();
});

describe('centsFromBigint', () => {
  it('aceita inteiro seguro e string de dígitos; recusa float e lixo', () => {
    expect(centsFromBigint(12345)).toBe(12345);
    expect(centsFromBigint('-990')).toBe(-990);
    expect(centsFromBigint(10.5)).toBe(0);
    expect(centsFromBigint('10.5')).toBe(0);
    expect(centsFromBigint(null)).toBe(0);
  });
});

describe('mapAccountRow', () => {
  it('converte a linha do banco no tipo Account (centavos, schemaVersion 2)', () => {
    const acc = mapAccountRow({
      id: 'a1', name: 'Nubank', type: 'corrente', balance_cents: '150000',
      created_at: '2026-11-20T10:00:00Z', updated_at: null,
    });
    expect(acc).toEqual({
      id: 'a1', name: 'Nubank', type: 'corrente', balance: 150000, schemaVersion: 2,
      createdAt: Date.parse('2026-11-20T10:00:00Z'), updatedAt: null,
    });
  });

  it('tipo desconhecido vira corrente', () => {
    expect(mapAccountRow({ id: 'x', name: null, type: 'bitcoin', balance_cents: 0, created_at: null, updated_at: null }).type)
      .toBe('corrente');
  });
});

describe('useAccountsSupabase', () => {
  it('sem uid não consulta o banco', async () => {
    const { result } = renderHook(() => useAccountsSupabase(''));
    await waitFor(() => expect(result.current.loadingAccounts).toBe(false));
    expect(client.from).not.toHaveBeenCalled();
  });

  it('carrega contas ordenadas por nome e assina tempo real', async () => {
    selectResult = { data: [{ id: 'a1', name: 'C', type: 'poupanca', balance_cents: 500, created_at: null, updated_at: null }], error: null };
    const { result, unmount } = renderHook(() => useAccountsSupabase('u1'));
    await waitFor(() => expect(result.current.loadingAccounts).toBe(false));
    expect(result.current.accounts).toHaveLength(1);
    expect(result.current.accounts[0]?.balance).toBe(500);
    expect(calls).toContainEqual({ op: 'order', args: ['name', { ascending: true }] });
    expect(client.channel).toHaveBeenCalledWith('accounts:u1');
    unmount();
    expect(client.removeChannel).toHaveBeenCalled();
  });

  it('recarrega quando o canal de tempo real termina de entrar', async () => {
    const { result } = renderHook(() => useAccountsSupabase('u1'));
    await waitFor(() => expect(result.current.loadingAccounts).toBe(false));
    const loadsBefore = calls.filter(c => c.op === 'order').length;
    const subCalls = channel.subscribe.mock.calls;
    const onStatus = subCalls[subCalls.length - 1]?.[0] as (s: string) => void;
    await act(async () => { onStatus('SUBSCRIBED'); });
    expect(calls.filter(c => c.op === 'order').length).toBe(loadsBefore + 1);
  });

  it('addAccount grava saldo em centavos inteiros (reais → centavos)', async () => {
    const { result } = renderHook(() => useAccountsSupabase('u1'));
    await waitFor(() => expect(result.current.loadingAccounts).toBe(false));
    let id = '';
    await act(async () => { id = await result.current.addAccount({ name: 'Inter', type: 'corrente', balance: 10.1 }); });
    expect(id).toBe('new-id');
    expect(calls).toContainEqual({ op: 'insert', args: [{ name: 'Inter', type: 'corrente', balance_cents: 1010 }] });
  });

  it('updateAccount envia só os campos informados', async () => {
    const { result } = renderHook(() => useAccountsSupabase('u1'));
    await waitFor(() => expect(result.current.loadingAccounts).toBe(false));
    await act(async () => { await result.current.updateAccount('a1', { balance: 0.29 }); });
    expect(calls).toContainEqual({ op: 'update', args: [{ balance_cents: 29 }] });
    expect(calls).toContainEqual({ op: 'eq', args: ['id', 'a1'] });
  });

  it('erro de escrita vira mensagem amigável', async () => {
    writeResult = { data: null, error: { code: '42501', message: 'rls' } };
    const { result } = renderHook(() => useAccountsSupabase('u1'));
    await waitFor(() => expect(result.current.loadingAccounts).toBe(false));
    await expect(result.current.removeAccount('a1')).rejects.toThrow('Não foi possível excluir a conta.');
  });

  it('descarta resposta atrasada do usuário anterior após troca de uid', async () => {
    let releaseOld: (v: unknown) => void = () => {};
    const oldRows = { data: [{ id: 'old', name: 'Antiga', type: 'corrente', balance_cents: 1, created_at: null, updated_at: null }], error: null };
    const newRows = { data: [{ id: 'new', name: 'Nova', type: 'corrente', balance_cents: 2, created_at: null, updated_at: null }], error: null };
    let first = true;
    client.from.mockImplementation(() => {
      const b = builder();
      if (first) {
        first = false;
        b['order'] = () => new Promise(res => { releaseOld = () => res(oldRows); });
      } else {
        b['order'] = () => Promise.resolve(newRows);
      }
      return b;
    });
    const { result, rerender } = renderHook(({ uid }) => useAccountsSupabase(uid), { initialProps: { uid: 'u1' } });
    rerender({ uid: 'u2' });
    await waitFor(() => expect(result.current.accounts.map(a => a.id)).toEqual(['new']));
    await act(async () => { releaseOld(undefined); await Promise.resolve(); });
    expect(result.current.accounts.map(a => a.id)).toEqual(['new']);
    client.from.mockImplementation(() => builder());
  });
});
