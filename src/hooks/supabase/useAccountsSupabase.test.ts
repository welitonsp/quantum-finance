import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const calls: Array<{ op: string; args: unknown[] }> = [];
let selectResult: { data: unknown; error: unknown } = { data: [], error: null };
let writeResult: { data: unknown; error: unknown } = { data: { id: 'new-id' }, error: null };
let rpcResult: { data: unknown; error: unknown } = { data: [], error: null };

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
  rpc: vi.fn(() => Promise.resolve(rpcResult)),
  channel: vi.fn(() => channel),
  removeChannel: vi.fn(() => Promise.resolve()),
};

vi.mock('../../shared/api/supabase/client', () => ({ getSupabase: () => client }));
vi.mock('../../shared/lib/firebaseErrorHandling', () => ({ logSanitizedFirebaseError: vi.fn() }));

import { useAccountsSupabase, mapAccountRow, centsFromBigint, parseCashPosition } from './useAccountsSupabase';

beforeEach(() => {
  calls.length = 0;
  selectResult = { data: [], error: null };
  writeResult = { data: { id: 'new-id' }, error: null };
  rpcResult = { data: [], error: null };
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
      id: 'a1', name: 'Nubank', type: 'corrente', balance: 150000, openingBalance: 150000, schemaVersion: 2,
      createdAt: Date.parse('2026-11-20T10:00:00Z'), updatedAt: null,
    });
  });

  it('guarda a data de abertura válida e ignora formato estranho', () => {
    const base = { id: 'a1', name: 'N', type: 'corrente', balance_cents: 0, created_at: null, updated_at: null };
    expect(mapAccountRow({ ...base, opening_date: '2026-11-01' }).openingDate).toBe('2026-11-01');
    expect(mapAccountRow({ ...base, opening_date: '01/11/2026' }).openingDate).toBeUndefined();
  });
});

describe('parseCashPosition', () => {
  it('separa saldo por conta e líquido sem conta', () => {
    const r = parseCashPosition([
      { account_id: 'a1', balance_cents: '625000' },
      { account_id: 'a2', balance_cents: -3000 },
      { account_id: null, balance_cents: '18500' },
    ]);
    expect(r.byAccount.get('a1')).toBe(625000);
    expect(r.byAccount.get('a2')).toBe(-3000);
    expect(r.unassignedCents).toBe(18500);
  });

  it('resposta inválida vira vazio', () => {
    const r = parseCashPosition(null);
    expect(r.byAccount.size).toBe(0);
    expect(r.unassignedCents).toBe(0);
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

  it('mostra o saldo de hoje do servidor e mantém a abertura', async () => {
    selectResult = { data: [{ id: 'a1', name: 'C', type: 'corrente', balance_cents: 300000, opening_date: '2026-11-01', created_at: null, updated_at: null }], error: null };
    rpcResult = { data: [{ account_id: 'a1', balance_cents: 625000 }, { account_id: null, balance_cents: 18500 }], error: null };
    const { result } = renderHook(() => useAccountsSupabase('u1'));
    await waitFor(() => expect(result.current.accounts[0]?.balance).toBe(625000));
    expect(result.current.accounts[0]?.openingBalance).toBe(300000);
    expect(result.current.unassignedCashCents).toBe(18500);
    expect(client.rpc).toHaveBeenCalledWith('cash_position', { p_today: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
  });

  it('se o saldo do servidor falhar, mostra a abertura', async () => {
    selectResult = { data: [{ id: 'a1', name: 'C', type: 'corrente', balance_cents: 300000, created_at: null, updated_at: null }], error: null };
    rpcResult = { data: null, error: { code: '42883', message: 'x' } };
    const { result } = renderHook(() => useAccountsSupabase('u1'));
    await waitFor(() => expect(result.current.accounts).toHaveLength(1));
    expect(result.current.accounts[0]?.balance).toBe(300000);
    expect(result.current.unassignedCashCents).toBe(0);
  });

  it('assina contas e lançamentos do usuário', async () => {
    const { result } = renderHook(() => useAccountsSupabase('u1'));
    await waitFor(() => expect(result.current.loadingAccounts).toBe(false));
    const tables = (channel.on.mock.calls as unknown[][]).map(c => (c[1] as { table?: string }).table);
    expect(tables).toEqual(expect.arrayContaining(['accounts', 'transactions']));
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

  it('não escuta DELETE sem filtro e recarrega quando a aba volta a ficar visível', async () => {
    const { result } = renderHook(() => useAccountsSupabase('u1'));
    await waitFor(() => expect(result.current.loadingAccounts).toBe(false));
    for (const c of channel.on.mock.calls as unknown[][]) {
      expect((c[1] as { filter?: string }).filter).toBe('user_id=eq.u1');
    }
    const loads = () => calls.filter(c => c.op === 'order').length;
    const before = loads();
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(loads()).toBe(before + 1);
  });

  it('addAccount grava saldo em centavos inteiros (reais → centavos)', async () => {
    const { result } = renderHook(() => useAccountsSupabase('u1'));
    await waitFor(() => expect(result.current.loadingAccounts).toBe(false));
    let id = '';
    await act(async () => { id = await result.current.addAccount({ name: 'Inter', type: 'corrente', balance: 10.1 }); });
    expect(id).toBe('new-id');
    expect(calls).toContainEqual({ op: 'insert', args: [{ name: 'Inter', type: 'corrente', balance_cents: 1010 }] });
  });

  it('addAccount e updateAccount gravam a data do saldo quando informada', async () => {
    const { result } = renderHook(() => useAccountsSupabase('u1'));
    await waitFor(() => expect(result.current.loadingAccounts).toBe(false));
    await act(async () => { await result.current.addAccount({ name: 'Inter', type: 'corrente', balance: 1, openingDate: '2026-11-01' }); });
    expect(calls).toContainEqual({ op: 'insert', args: [{ name: 'Inter', type: 'corrente', balance_cents: 100, opening_date: '2026-11-01' }] });
    await act(async () => { await result.current.updateAccount('a1', { openingDate: '2026-10-31' }); });
    expect(calls).toContainEqual({ op: 'update', args: [{ opening_date: '2026-10-31' }] });
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
