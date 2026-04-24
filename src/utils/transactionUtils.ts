import type { Transaction } from '../shared/types/transaction';

export const isIncome = (t: string): boolean =>
  t === 'entrada' || t === 'receita';

export const isExpense = (t: string): boolean =>
  t === 'saida' || t === 'despesa';

/** Convenience overload accepting a full Transaction object. */
export const isIncomeTx = (tx: Transaction): boolean => isIncome(tx.type);
export const isExpenseTx = (tx: Transaction): boolean => isExpense(tx.type);
