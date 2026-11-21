// Tarefas recorrentes no Supabase (tabela public.recurring_tasks).
// Histórico gravado por trigger no banco (planning_history), na mesma transação.
import { useCallback } from 'react';
import { getSupabase } from '../../shared/api/supabase/client';
import { logSanitizedFirebaseError } from '../../shared/lib/firebaseErrorHandling';
import { toCentavos, fromCentavos } from '../../shared/types/money';
import type { RecurringTask, TransactionType } from '../../shared/types/transaction';
import type { UseRecurringReturn } from '../useRecurring';
import { centsFromBigint } from './useAccountsSupabase';
import { useSupabaseTable } from './useSupabaseTable';

export interface RecurringRow {
  id: string;
  description: string | null;
  value_cents: number | string | null;
  category: string | null;
  type: string | null;
  frequency: string | null;
  due_day: number | null;
  due_month: number | null;
  active: boolean | null;
  last_executed_month: string | null;
}

export function mapRecurringRow(row: RecurringRow): RecurringTask {
  const cents = centsFromBigint(row.value_cents);
  const task: RecurringTask = {
    id: row.id,
    description: row.description ?? '',
    value_cents: cents,
    value: fromCentavos(cents),
    category: row.category ?? 'Outros',
    dueDay: row.due_day ?? 1,
    active: row.active !== false,
    type: (row.type === 'entrada' ? 'entrada' : 'saida') as TransactionType,
    frequency: row.frequency === 'anual' ? 'anual' : 'mensal',
  };
  if (row.due_month !== null) task.dueMonth = row.due_month;
  if (row.last_executed_month) task.lastExecutedMonth = row.last_executed_month;
  return task;
}

/** Campos do app → colunas do banco. `value` (reais) vira centavos inteiros. */
export function toRecurringColumns(data: Partial<RecurringTask>): Record<string, unknown> {
  const cols: Record<string, unknown> = {};
  if (data.description !== undefined) cols['description'] = data.description;
  if (data.value !== undefined) cols['value_cents'] = toCentavos(data.value);
  else if (data.value_cents !== undefined) cols['value_cents'] = data.value_cents;
  if (data.category !== undefined) cols['category'] = data.category;
  if (data.type !== undefined) cols['type'] = data.type;
  if (data.frequency !== undefined) {
    cols['frequency'] = data.frequency;
    if (data.frequency === 'mensal') cols['due_month'] = null;
  }
  if (data.dueDay !== undefined) cols['due_day'] = data.dueDay;
  if (data.dueMonth !== undefined) cols['due_month'] = data.dueMonth;
  if (data.active !== undefined) cols['active'] = data.active;
  if (data.lastExecutedMonth !== undefined) cols['last_executed_month'] = data.lastExecutedMonth;
  return cols;
}

const RECURRING_OPTIONS = {
  table: 'recurring_tasks',
  columns: 'id, description, value_cents, category, type, frequency, due_day, due_month, active, last_executed_month',
  orderBy: 'due_day',
  map: mapRecurringRow,
  loadOp: 'recurring_load',
} as const;

export function useRecurringSupabase(uid: string): UseRecurringReturn {
  const { items, loading, refresh } = useSupabaseTable<RecurringRow, RecurringTask>(uid, RECURRING_OPTIONS);

  const addRecurring = useCallback(async (data: Omit<RecurringTask, 'id'>): Promise<string | undefined> => {
    if (!uid) return undefined;
    const { data: row, error } = await getSupabase()
      .from('recurring_tasks')
      .insert(toRecurringColumns(data))
      .select('id')
      .single();
    if (error || !row) {
      logSanitizedFirebaseError('recurring_create', error);
      throw new Error('Não foi possível criar a recorrência.');
    }
    await refresh();
    return (row as { id: string }).id;
  }, [uid, refresh]);

  const updateRecurring = useCallback(async (id: string, data: Partial<RecurringTask>): Promise<void> => {
    if (!uid || !id) return;
    const cols = toRecurringColumns(data);
    if (Object.keys(cols).length === 0) return;
    const { error } = await getSupabase().from('recurring_tasks').update(cols).eq('id', id);
    if (error) {
      logSanitizedFirebaseError('recurring_update', error);
      throw new Error('Não foi possível atualizar a recorrência.');
    }
    await refresh();
  }, [uid, refresh]);

  const removeRecurring = useCallback(async (id: string): Promise<void> => {
    if (!uid || !id) return;
    const { error } = await getSupabase().from('recurring_tasks').delete().eq('id', id);
    if (error) {
      logSanitizedFirebaseError('recurring_delete', error);
      throw new Error('Não foi possível excluir a recorrência.');
    }
    await refresh();
  }, [uid, refresh]);

  return { recurringTasks: items, loading, error: null, addRecurring, updateRecurring, removeRecurring };
}
