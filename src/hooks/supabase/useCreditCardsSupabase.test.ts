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

const channel = { on: vi.fn(() => channel), subscribe: vi.fn(() => channel) };
const client = {
  from: vi.fn(() => builder()),
  channel: vi.fn(() => channel),
  removeChannel: vi.fn(() => Promise.resolve()),
};

vi.mock('../../shared/api/supabase/client', () => ({ getSupabase: () => client }));
vi.mock('../../shared/lib/firebaseErrorHandling', () => ({ logSanitizedFirebaseError: vi.fn() }));

import { useCreditCardStoreSupabase, mapCreditCardRow, toCreditCardColumns } from './useCreditCardsSupabase';

beforeEach(() => {
  calls.length = 0;
  selectResult = { data: [], error: null };
  writeResult = { data: { id: 'new-id' }, error: null };
  vi.clearAllMocks();
});

describe('mapCreditCardRow', () => {
  it('converte a linha do banco no tipo CreditCard (limite em centavos)', () => {
    expect(mapCreditCardRow({
      id: 'c1', name: 'Nubank', limit_cents: '500000', closing_day: 5, due_day: 12,
      color: '#000', active: false, created_at: null, updated_at: '2026-11-20T10:00:00Z',
    })).toEqual({
      id: 'c1', name: 'Nubank', limit: 500000, closingDay: 5, dueDay: 12, color: '#000',
      active: false, createdAt: null, updatedAt: Date.parse('2026-11-20T10:00:00Z'),
    });
  });
});

describe('toCreditCardColumns', () => {
  it('mapeia campos para colunas e limite para centavos inteiros', () => {
    expect(toCreditCardColumns({ name: 'Inter', limit: 1500.5, closingDay: 3, dueDay: 10, color: '#fff', active: true }))
      .toEqual({ name: 'Inter', limit_cents: 150050, closing_day: 3, due_day: 10, color: '#fff', active: true });
  });
  it('ignora campos ausentes', () => {
    expect(toCreditCardColumns({ dueDay: 20 })).toEqual({ due_day: 20 });
  });
});

describe('useCreditCardStoreSupabase', () => {
  it('carrega cartões e assina tempo real', async () => {
    selectResult = { data: [{ id: 'c1', name: 'A', limit_cents: 100, closing_day: 1, due_day: 8, color: null, active: null, created_at: null, updated_at: null }], error: null };
    const { result, unmount } = renderHook(() => useCreditCardStoreSupabase('u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.cards[0]?.limit).toBe(100);
    expect(client.channel).toHaveBeenCalledWith('credit_cards:u1');
    unmount();
    expect(client.removeChannel).toHaveBeenCalled();
  });

  it('addCard grava limite em centavos e active padrão true', async () => {
    const { result } = renderHook(() => useCreditCardStoreSupabase('u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.addCard({ name: 'X', limit: 200, closingDay: 2, dueDay: 9, color: '#111' } as never);
    });
    expect(calls).toContainEqual({ op: 'insert', args: [{ name: 'X', limit_cents: 20000, closing_day: 2, due_day: 9, color: '#111', active: true }] });
  });

  it('erro ao excluir vira mensagem amigável', async () => {
    writeResult = { data: null, error: { code: '42501' } };
    const { result } = renderHook(() => useCreditCardStoreSupabase('u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await expect(result.current.removeCard('c1')).rejects.toThrow('Não foi possível excluir o cartão.');
  });
});
