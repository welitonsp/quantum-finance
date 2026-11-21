// Dívidas no Supabase (tabela public.debts). Taxa mensal em numeric exato.
import { useCallback } from 'react';
import Decimal from 'decimal.js';
import { getSupabase } from '../../shared/api/supabase/client';
import { logSanitizedFirebaseError } from '../../shared/lib/firebaseErrorHandling';
import type { Debt, DebtCategory, DebtCreateDTO, DebtUpdateDTO, UseDebtsReturn } from '../useDebts';
import { centsFromBigint } from './useAccountsSupabase';
import { useSupabaseTable } from './useSupabaseTable';

const DEBT_CATEGORIES: ReadonlySet<DebtCategory> = new Set([
  'emprestimo', 'financiamento', 'cartao', 'cheque_especial', 'outro',
]);

export interface DebtRow {
  id: string;
  user_id: string;
  name: string | null;
  creditor: string | null;
  total_cents: number | string | null;
  remaining_cents: number | string | null;
  interest_rate: number | string | null;
  installments: number | null;
  paid_installments: number | null;
  due_day_of_month: number | null;
  start_date: string | null;
  category: string | null;
  active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
}

/** numeric do Postgres (number ou string) → number, sem parseFloat. Não é dinheiro. */
export function rateFromNumeric(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && /^\d+(\.\d+)?$/.test(value)) return new Decimal(value).toNumber();
  return 0;
}

export function mapDebtRow(row: DebtRow): Debt {
  const category = DEBT_CATEGORIES.has(row.category as DebtCategory) ? (row.category as DebtCategory) : 'outro';
  return {
    id: row.id,
    uid: row.user_id,
    name: row.name ?? '',
    creditor: row.creditor ?? '',
    totalCents: centsFromBigint(row.total_cents),
    remainingCents: centsFromBigint(row.remaining_cents),
    interestRate: rateFromNumeric(row.interest_rate),
    installments: row.installments ?? 1,
    paidInstallments: row.paid_installments ?? 0,
    dueDayOfMonth: row.due_day_of_month ?? 1,
    startDate: row.start_date ?? '',
    category,
    active: row.active !== false,
    createdAt: row.created_at ?? '',
    updatedAt: row.updated_at ?? '',
  };
}

const FIELD_TO_COLUMN: Record<string, string> = {
  name: 'name',
  creditor: 'creditor',
  totalCents: 'total_cents',
  remainingCents: 'remaining_cents',
  installments: 'installments',
  paidInstallments: 'paid_installments',
  dueDayOfMonth: 'due_day_of_month',
  startDate: 'start_date',
  category: 'category',
  active: 'active',
};

/** DTO do app → colunas. A taxa vai como string decimal (numeric exato no banco). */
export function toDebtColumns(data: DebtUpdateDTO): Record<string, unknown> {
  const cols: Record<string, unknown> = {};
  for (const [field, column] of Object.entries(FIELD_TO_COLUMN)) {
    const value = (data as Record<string, unknown>)[field];
    if (value !== undefined) cols[column] = value;
  }
  if (data.interestRate !== undefined) cols['interest_rate'] = new Decimal(data.interestRate.toString()).toFixed(6);
  return cols;
}

const DEBT_OPTIONS = {
  table: 'debts',
  columns: 'id, user_id, name, creditor, total_cents, remaining_cents, interest_rate, installments, paid_installments, due_day_of_month, start_date, category, active, created_at, updated_at',
  orderBy: 'created_at',
  ascending: false,
  map: mapDebtRow,
  loadOp: 'debt_load',
} as const;

export function useDebtsSupabase(uid: string): UseDebtsReturn {
  const { items, loading, refresh } = useSupabaseTable<DebtRow, Debt>(uid, DEBT_OPTIONS);

  const addDebt = useCallback(async (data: DebtCreateDTO): Promise<string> => {
    if (!uid) throw new Error('Utilizador não autenticado.');
    const { data: row, error } = await getSupabase()
      .from('debts').insert(toDebtColumns(data)).select('id').single();
    if (error || !row) {
      logSanitizedFirebaseError('debt_add', error);
      throw new Error('Não foi possível cadastrar a dívida.');
    }
    await refresh();
    return (row as { id: string }).id;
  }, [uid, refresh]);

  const updateDebt = useCallback(async (id: string, data: DebtUpdateDTO): Promise<void> => {
    if (!uid || !id) return;
    const cols = toDebtColumns(data);
    if (Object.keys(cols).length === 0) return;
    const { error } = await getSupabase().from('debts').update(cols).eq('id', id);
    if (error) {
      logSanitizedFirebaseError('debt_update', error);
      throw new Error('Não foi possível atualizar a dívida.');
    }
    await refresh();
  }, [uid, refresh]);

  const deleteDebt = useCallback(async (id: string): Promise<void> => {
    if (!uid || !id) return;
    const { error } = await getSupabase().from('debts').delete().eq('id', id);
    if (error) {
      logSanitizedFirebaseError('debt_delete', error);
      throw new Error('Não foi possível excluir a dívida.');
    }
    await refresh();
  }, [uid, refresh]);

  return { debts: items, loading, addDebt, updateDebt, deleteDebt };
}
