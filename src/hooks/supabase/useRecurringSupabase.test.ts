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
  b['delete'] = record('delete');
  b['update'] = record('update');
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


import { useRecurringSupabase, mapRecurringRow, toRecurringColumns } from './useRecurringSupabase';

const aluguel = {
  id: 'r1', description: 'Aluguel', value_cents: '150000', category: 'Moradia', type: 'saida',
  frequency: 'mensal', due_day: 5, due_month: null, active: true, last_executed_month: '2026-10',
};

beforeEach(() => {
  calls.length = 0;
  selectResult = { data: [], error: null };
  writeResult = { data: { id: 'new-id' }, error: null };
  vi.clearAllMocks();
});

describe('mapRecurringRow / toRecurringColumns', () => {
  it('mapeia centavos (bigint em texto) e o valor em reais derivado', () => {
    expect(mapRecurringRow(aluguel)).toEqual({
      id: 'r1', description: 'Aluguel', value_cents: 150000, value: 1500, category: 'Moradia',
      dueDay: 5, active: true, type: 'saida', frequency: 'mensal', lastExecutedMonth: '2026-10',
    });
  });

  it('anual traz o mês de vencimento', () => {
    expect(mapRecurringRow({ ...aluguel, frequency: 'anual', due_month: 3 }))
      .toMatchObject({ frequency: 'anual', dueMonth: 3 });
  });

  it('valor do formulário em reais vira centavos inteiros sem float', () => {
    expect(toRecurringColumns({
      description: 'IPVA', value: 1234.56, category: 'Impostos/Taxas', frequency: 'anual',
      dueDay: 10, dueMonth: 2, active: true,
    })).toEqual({
      description: 'IPVA', value_cents: 123456, category: 'Impostos/Taxas', frequency: 'anual',
      due_day: 10, due_month: 2, active: true,
    });
  });

  it('voltar para mensal limpa o mês de vencimento', () => {
    expect(toRecurringColumns({ frequency: 'mensal' })).toEqual({ frequency: 'mensal', due_month: null });
  });
});

describe('useRecurringSupabase', () => {
  it('carrega por dia de vencimento e assina tempo real', async () => {
    selectResult = { data: [aluguel], error: null };
    const { result } = renderHook(() => useRecurringSupabase('u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.recurringTasks).toHaveLength(1);
    expect(calls).toContainEqual({ op: 'order', args: ['due_day', { ascending: true }] });
    expect(client.channel).toHaveBeenCalledWith('recurring_tasks:u1');
  });

  it('addRecurring insere sem user_id e devolve o id', async () => {
    const { result } = renderHook(() => useRecurringSupabase('u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    let id: string | undefined;
    await act(async () => {
      id = await result.current.addRecurring({
        description: 'Netflix', value: 39.9, category: 'Assinaturas', dueDay: 12, active: true, frequency: 'mensal',
      });
    });
    expect(id).toBe('new-id');
    expect(calls).toContainEqual({
      op: 'insert',
      args: [{ description: 'Netflix', value_cents: 3990, category: 'Assinaturas', frequency: 'mensal', due_month: null, due_day: 12, active: true }],
    });
  });

  it('updateRecurring e removeRecurring agem pelo id', async () => {
    const { result } = renderHook(() => useRecurringSupabase('u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.updateRecurring('r1', { active: false }); });
    expect(calls).toContainEqual({ op: 'update', args: [{ active: false }] });
    await act(async () => { await result.current.removeRecurring('r1'); });
    expect(calls).toContainEqual({ op: 'delete', args: [] });
    expect(calls.filter(c => c.op === 'eq')).toEqual([
      { op: 'eq', args: ['id', 'r1'] }, { op: 'eq', args: ['id', 'r1'] },
    ]);
  });

  it('erro vira mensagem amigável; sem usuário não grava', async () => {
    writeResult = { data: null, error: { code: '23514' } };
    const { result } = renderHook(() => useRecurringSupabase('u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await expect(result.current.updateRecurring('r1', { dueDay: 40 }))
      .rejects.toThrow('Não foi possível atualizar a recorrência.');

    vi.clearAllMocks();
    const { result: r0 } = renderHook(() => useRecurringSupabase(''));
    await waitFor(() => expect(r0.current.loading).toBe(false));
    expect(await r0.current.addRecurring({ description: 'X', value: 1, category: 'Outros', dueDay: 1, active: true }))
      .toBeUndefined();
    expect(client.from).not.toHaveBeenCalled();
  });
});
