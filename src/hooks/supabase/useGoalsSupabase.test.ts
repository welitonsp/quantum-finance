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

import { useGoalStoreSupabase, mapGoalRow, toGoalColumns } from './useGoalsSupabase';
import { millisOrNull } from './useSupabaseTable';
import type { Centavos } from '../../shared/types/money';

beforeEach(() => {
  calls.length = 0;
  selectResult = { data: [], error: null };
  writeResult = { data: { id: 'new-id' }, error: null };
  vi.clearAllMocks();
});

describe('millisOrNull', () => {
  it('converte ISO e devolve null para vazio/inválido', () => {
    expect(millisOrNull('2026-11-20T00:00:00Z')).toBe(Date.parse('2026-11-20T00:00:00Z'));
    expect(millisOrNull(null)).toBeNull();
    expect(millisOrNull('lixo')).toBeNull();
  });
});

describe('mapGoalRow / toGoalColumns', () => {
  it('mapeia a linha para SavingsGoal em centavos', () => {
    expect(mapGoalRow({
      id: 'g1', name: 'Viagem', target_cents: '1000000', current_cents: 2500, deadline: '2027-01-31',
      emoji: '✈️', created_at: null, updated_at: null,
    })).toEqual({
      id: 'g1', name: 'Viagem', targetCents: 1000000, currentCents: 2500, deadline: '2027-01-31',
      emoji: '✈️', createdAt: null, updatedAt: null,
    });
  });

  it('prazo e emoji vazios viram null; só campos informados', () => {
    expect(toGoalColumns({ deadline: '', emoji: '' })).toEqual({ deadline: null, emoji: null });
    expect(toGoalColumns({ currentCents: 99 as Centavos })).toEqual({ current_cents: 99 });
  });
});

describe('useGoalStoreSupabase', () => {
  it('carrega metas por data de criação e assina tempo real', async () => {
    selectResult = { data: [{ id: 'g1', name: 'A', target_cents: 100, current_cents: 0, deadline: null, emoji: null, created_at: null, updated_at: null }], error: null };
    const { result, unmount } = renderHook(() => useGoalStoreSupabase('u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.rawGoals).toHaveLength(1);
    expect(calls).toContainEqual({ op: 'order', args: ['created_at', { ascending: true }] });
    expect(client.channel).toHaveBeenCalledWith('goals:u1');
    unmount();
    expect(client.removeChannel).toHaveBeenCalled();
  });

  it('addGoal e setProgress gravam centavos inteiros', async () => {
    const { result } = renderHook(() => useGoalStoreSupabase('u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.addGoal({ name: 'Casa', targetCents: 500000 as Centavos, currentCents: 0 as Centavos });
      await result.current.setProgress('g1', 1234 as Centavos);
    });
    expect(calls).toContainEqual({ op: 'insert', args: [{ name: 'Casa', target_cents: 500000, current_cents: 0 }] });
    expect(calls).toContainEqual({ op: 'update', args: [{ current_cents: 1234 }] });
  });

  it('sem uid não consulta o banco', async () => {
    const { result } = renderHook(() => useGoalStoreSupabase(''));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(client.from).not.toHaveBeenCalled();
  });
});
