// Orçamentos no Supabase (tabela public.budgets, único por usuário+mês+categoria).
import { useCallback } from 'react';
import { getSupabase } from '../../shared/api/supabase/client';
import { logSanitizedFirebaseError } from '../../shared/lib/firebaseErrorHandling';
import { fromCentavos, toCentavos } from '../../shared/types/money';
import type { Budget, BudgetStore, BudgetWriteData } from '../useBudgets';
import { centsFromBigint } from './useAccountsSupabase';
import { millisOrNull, useSupabaseTable } from './useSupabaseTable';

export interface BudgetRow {
  id: string;
  category: string | null;
  target_cents: number | string | null;
  month: string | null;
  created_at: string | null;
}

export function mapBudgetRow(row: BudgetRow): Budget {
  const targetAmountCents = centsFromBigint(row.target_cents);
  return {
    id: row.id,
    category: row.category ?? '',
    targetAmountCents,
    targetAmount: fromCentavos(targetAmountCents),
    period: 'monthly',
    month: row.month ?? '',
    createdAt: millisOrNull(row.created_at) ?? 0,
  };
}

/** Entrada do formulário (valor em reais) → colunas (centavos inteiros). */
export function toBudgetColumns(data: Partial<BudgetWriteData>): Record<string, unknown> {
  const cols: Record<string, unknown> = {};
  if (typeof data.category === 'string')   cols['category'] = data.category;
  if (data.targetAmount !== undefined)     cols['target_cents'] = toCentavos(data.targetAmount);
  if (typeof data.month === 'string')      cols['month'] = data.month;
  return cols;
}

/** Violação do único (usuário, mês, categoria) vira mensagem clara. */
/** Erro com mensagem já pronta para o usuário (português, sem detalhe técnico). */
export class BudgetUserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BudgetUserError';
  }
}

function friendlyBudgetError(error: { code?: string } | null, fallback: string): BudgetUserError {
  return new BudgetUserError(error?.code === '23505'
    ? 'Já existe um orçamento para essa categoria neste mês.'
    : fallback);
}

const BUDGET_OPTIONS = {
  table: 'budgets',
  columns: 'id, category, target_cents, month, created_at',
  orderBy: 'created_at',
  ascending: false,
  map: mapBudgetRow,
  loadOp: 'budgets_load',
} as const;

export function useBudgetStoreSupabase(uid: string): BudgetStore {
  const { items, loading, refresh } = useSupabaseTable<BudgetRow, Budget>(uid, BUDGET_OPTIONS);

  const addBudget = useCallback(async (data: BudgetWriteData): Promise<void> => {
    if (!uid) return;
    const { error } = await getSupabase().from('budgets').insert(toBudgetColumns(data));
    if (error) {
      logSanitizedFirebaseError('budget_create', error);
      throw friendlyBudgetError(error, 'Não foi possível criar o orçamento.');
    }
    await refresh();
  }, [uid, refresh]);

  const removeBudget = useCallback(async (id: string): Promise<void> => {
    if (!uid) return;
    const { error } = await getSupabase().from('budgets').delete().eq('id', id);
    if (error) {
      logSanitizedFirebaseError('budget_delete', error);
      throw new Error('Não foi possível excluir o orçamento.');
    }
    await refresh();
  }, [uid, refresh]);

  const updateBudget = useCallback(async (id: string, data: Partial<BudgetWriteData>): Promise<void> => {
    if (!uid) return;
    const cols = toBudgetColumns(data);
    if (Object.keys(cols).length === 0) return;
    const { error } = await getSupabase().from('budgets').update(cols).eq('id', id);
    if (error) {
      logSanitizedFirebaseError('budget_update', error);
      throw friendlyBudgetError(error, 'Não foi possível atualizar o orçamento.');
    }
    await refresh();
  }, [uid, refresh]);

  return { budgets: items, loading, addBudget, removeBudget, updateBudget };
}
