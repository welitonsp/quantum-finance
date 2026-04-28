import type { Transaction } from '../shared/types/transaction';
import { absCentavos, toCentavos, type Centavos } from '../shared/types/money';

export const isIncome = (t: string): boolean =>
  t === 'entrada' || t === 'receita';

export const isExpense = (t: string): boolean =>
  t === 'saida' || t === 'despesa';

/** Convenience overload accepting a full Transaction object. */
export const isIncomeTx = (tx: Transaction): boolean => isIncome(tx.type);
export const isExpenseTx = (tx: Transaction): boolean => isExpense(tx.type);

/**
 * Canonical read helper for financial calculations.
 * v2 documents must contain value_cents. Legacy `value` is only converted when
 * the document is explicitly pre-v2/unknown, so new corrupt writes do not get
 * silently interpreted as money.
 */
export function getTransactionCentavos(tx: Pick<Transaction, 'value_cents' | 'value' | 'schemaVersion'>): Centavos | null {
  if (tx.value_cents !== undefined) return tx.value_cents;
  if (tx.schemaVersion === 2) return null;
  if (tx.value === undefined || !Number.isFinite(tx.value)) return null;
  return toCentavos(tx.value);
}

export function getTransactionAbsCentavos(tx: Pick<Transaction, 'value_cents' | 'value' | 'schemaVersion'>): Centavos {
  const centavos = getTransactionCentavos(tx);
  return absCentavos(centavos ?? 0);
}

export function canonicalizeTransactionType(type: string | undefined): 'entrada' | 'saida' {
  return isIncome(type ?? '') ? 'entrada' : 'saida';
}
