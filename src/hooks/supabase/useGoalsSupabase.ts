// Metas de poupança no Supabase (tabela public.goals). Histórico por trigger no banco.
import { useCallback } from 'react';
import { getSupabase } from '../../shared/api/supabase/client';
import { logSanitizedFirebaseError } from '../../shared/lib/firebaseErrorHandling';
import type { SavingsGoal } from '../../shared/types/transaction';
import type { Centavos } from '../../shared/types/money';
import type { GoalCreateInput, GoalUpdateInput, GoalStore } from '../useGoals';
import { centsFromBigint } from './useAccountsSupabase';
import { millisOrNull, useSupabaseTable } from './useSupabaseTable';

export interface GoalRow {
  id: string;
  name: string | null;
  target_cents: number | string | null;
  current_cents: number | string | null;
  deadline: string | null;
  emoji: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export function mapGoalRow(row: GoalRow): SavingsGoal {
  const goal: SavingsGoal = {
    id: row.id,
    name: row.name ?? '',
    targetCents: centsFromBigint(row.target_cents),
    currentCents: centsFromBigint(row.current_cents),
    deadline: row.deadline,
    createdAt: millisOrNull(row.created_at),
    updatedAt: millisOrNull(row.updated_at),
  };
  if (row.emoji) goal.emoji = row.emoji;
  return goal;
}

/** Entrada do app → colunas do banco (valores já em centavos inteiros). */
export function toGoalColumns(data: GoalUpdateInput): Record<string, unknown> {
  const cols: Record<string, unknown> = {};
  if (typeof data.name === 'string')         cols['name'] = data.name;
  if (data.targetCents !== undefined)        cols['target_cents'] = data.targetCents;
  if (data.currentCents !== undefined)       cols['current_cents'] = data.currentCents;
  if (data.deadline !== undefined)           cols['deadline'] = data.deadline || null;
  if (data.emoji !== undefined)              cols['emoji'] = data.emoji || null;
  return cols;
}

const GOAL_OPTIONS = {
  table: 'goals',
  columns: 'id, name, target_cents, current_cents, deadline, emoji, created_at, updated_at',
  orderBy: 'created_at',
  map: mapGoalRow,
  loadOp: 'goals_load',
} as const;

export function useGoalStoreSupabase(uid: string): GoalStore {
  const { items, loading, refresh } = useSupabaseTable<GoalRow, SavingsGoal>(uid, GOAL_OPTIONS);

  const addGoal = useCallback(async (data: GoalCreateInput): Promise<string> => {
    if (!uid) throw new Error('Utilizador não autenticado.');
    const { data: row, error } = await getSupabase()
      .from('goals').insert(toGoalColumns(data)).select('id').single();
    if (error || !row) {
      logSanitizedFirebaseError('goal_create', error);
      throw new Error('Não foi possível criar a meta.');
    }
    await refresh();
    return (row as { id: string }).id;
  }, [uid, refresh]);

  const updateGoal = useCallback(async (id: string, data: GoalUpdateInput): Promise<void> => {
    if (!uid || !id) return;
    const cols = toGoalColumns(data);
    if (Object.keys(cols).length === 0) return;
    const { error } = await getSupabase().from('goals').update(cols).eq('id', id);
    if (error) {
      logSanitizedFirebaseError('goal_update', error);
      throw new Error('Não foi possível atualizar a meta.');
    }
    await refresh();
  }, [uid, refresh]);

  const removeGoal = useCallback(async (id: string): Promise<void> => {
    if (!uid || !id) return;
    const { error } = await getSupabase().from('goals').delete().eq('id', id);
    if (error) {
      logSanitizedFirebaseError('goal_delete', error);
      throw new Error('Não foi possível excluir a meta.');
    }
    await refresh();
  }, [uid, refresh]);

  const setProgress = useCallback(
    (id: string, currentCents: Centavos) => updateGoal(id, { currentCents }),
    [updateGoal],
  );

  return { rawGoals: items, loading, addGoal, updateGoal, removeGoal, setProgress };
}
