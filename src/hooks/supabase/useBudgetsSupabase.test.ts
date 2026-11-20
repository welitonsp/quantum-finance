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

import { useBudgetStoreSupabase, mapBudgetRow, toBudgetColumns } from './useBudgetsSupabase';

beforeEach(() => {
  calls.length = 0;
  selectResult = { data: [], error: null };
  writeResult = { data: { id: 'new-id' }, error: null };
  vi.clearAllMocks();
});

describe('mapBudgetRow / toBudgetColumns', () => {
  it('mapeia a linha com centavos e reais derivados', () => {
    expect(mapBudgetRow({ id: 'b1', category: 'Mercado', target_cents: '80000', month: '2026-11', created_at: '2026-11-01T00:00:00Z' }))
      .toEqual({
        id: 'b1', category: 'Mercado', targetAmountCents: 80000, targetAmount: 800,
        period: 'monthly', month: '2026-11', createdAt: Date.parse('2026-11-01T00:00:00Z'),
      });
  });

  it('valor do formulário em reais vira centavos inteiros', () => {
    expect(toBudgetColumns({ category: 'Lazer', targetAmount: 150.35, month: '2026-12', period: 'monthly' }))
      .toEqual({ category: 'Lazer', target_cents: 15035, month: '2026-12' });
  });
});

describe('useBudgetStoreSupabase', () => {
  it('carrega mais recentes primeiro e assina tempo real', async () => {
    const { result } = renderHook(() => useBudgetStoreSupabase('u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(calls).toContainEqual({ op: 'order', args: ['created_at', { ascending: false }] });
    expect(client.channel).toHaveBeenCalledWith('budgets:u1');
  });

  it('orçamento duplicado no mês mostra mensagem clara', async () => {
    writeResult = { data: null, error: { code: '23505' } };
    const { result } = renderHook(() => useBudgetStoreSupabase('u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await expect(result.current.addBudget({ category: 'Mercado', targetAmount: 10, month: '2026-11', period: 'monthly' }))
      .rejects.toThrow('Já existe um orçamento para essa categoria neste mês.');
  });

  it('updateBudget grava só campos informados em centavos', async () => {
    const { result } = renderHook(() => useBudgetStoreSupabase('u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.updateBudget('b1', { targetAmount: 99.99 }); });
    expect(calls).toContainEqual({ op: 'update', args: [{ target_cents: 9999 }] });
  });
});
