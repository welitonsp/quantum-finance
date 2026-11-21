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
import { millisOrNull, useSupabaseTable } from './useSupabaseTable';
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

  it('exclusão em outra aba (DELETE sem filtro) recarrega só se a linha era nossa', async () => {
    selectResult = { data: [{ id: 'g1', name: 'A', target_cents: 100, current_cents: 0, deadline: null, emoji: null, created_at: null, updated_at: null }], error: null };
    const { result } = renderHook(() => useGoalStoreSupabase('u1'));
    await waitFor(() => expect(result.current.rawGoals).toHaveLength(1));
    const del = channel.on.mock.calls.find(c => (c as unknown[])[1] && ((c as unknown[])[1] as { event?: string }).event === 'DELETE') as unknown[] | undefined;
    expect(del?.[1]).toEqual({ event: 'DELETE', schema: 'public', table: 'goals' });
    const onDelete = del?.[2] as (p: { old: { id: string } }) => void;
    const loads = () => calls.filter(c => c.op === 'order').length;
    const before = loads();
    await act(async () => { onDelete({ old: { id: 'de-outro-usuario' } }); });
    expect(loads()).toBe(before);
    selectResult = { data: [], error: null };
    await act(async () => { onDelete({ old: { id: 'g1' } }); });
    await waitFor(() => expect(result.current.rawGoals).toHaveLength(0));
    expect(loads()).toBe(before + 1);
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

describe('useSupabaseTable', () => {
  const opts = {
    table: 'goals', columns: 'id', orderBy: 'id',
    map: (r: { id: string }) => r.id, loadOp: 'goals_load' as const,
  };

  it('na troca de usuário não expõe, nem por um render, os itens do anterior', async () => {
    selectResult = { data: [{ id: 'g-do-a' }], error: null };
    const { result, rerender } = renderHook(({ uid }) => useSupabaseTable(uid, opts), { initialProps: { uid: 'a' } });
    await waitFor(() => expect(result.current.items).toEqual(['g-do-a']));

    selectResult = { data: [{ id: 'g-do-b' }], error: null };
    const seen: string[][] = [];
    rerender({ uid: 'b' });
    seen.push(result.current.items);
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.items).toEqual(['g-do-b']));
    expect(seen.flat()).not.toContain('g-do-a');
  });

  it('falha na leitura aparece em error (e some quando volta a funcionar)', async () => {
    selectResult = { data: null, error: { code: '500' } };
    const { result } = renderHook(() => useSupabaseTable('a', opts));
    await waitFor(() => expect(result.current.error).not.toBeNull());
    selectResult = { data: [{ id: 'g1' }], error: null };
    await act(async () => { await result.current.refresh(); });
    expect(result.current.error).toBeNull();
    expect(result.current.items).toEqual(['g1']);
  });
});
