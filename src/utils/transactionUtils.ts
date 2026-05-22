import type { Transaction } from '../shared/types/transaction';
import { absCentavos, addCentavos, subtractCentavos, toCentavos, type Centavos } from '../shared/types/money';

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

/**
 * Identifica a etiqueta de exibição para a origem da transação.
 */
export function getTransactionOriginLabel(tx: Pick<Transaction, 'source'>): string {
  if (!tx.source || tx.source === 'manual') return 'Manual';
  const labels: Record<string, string> = {
    csv: 'CSV',
    ofx: 'OFX',
    pdf: 'PDF',
  };
  return labels[tx.source] ?? tx.source.toUpperCase();
}

/**
 * Retorna true se a transação foi importada (não manual).
 */
export function isImportedTransaction(tx: Pick<Transaction, 'source'>): boolean {
  return !!tx.source && tx.source !== 'manual';
}

/**
 * Retorna true se a transação está explicitamente conciliada.
 */
export function isReconciledTransaction(tx: Pick<Transaction, 'reconciliationStatus'>): boolean {
  return tx.reconciliationStatus === 'reconciled';
}

/**
 * Retorna true se a transação foi importada mas ainda não foi conciliada.
 */
export function isImportedUnreconciledTransaction(tx: Pick<Transaction, 'source' | 'reconciliationStatus'>): boolean {
  return isImportedTransaction(tx) && !isReconciledTransaction(tx);
}

function createdAtToMillis(createdAt: Transaction['createdAt']): number | null {
  if (typeof createdAt === 'number' && Number.isFinite(createdAt)) {
    return createdAt;
  }

  if (typeof createdAt === 'string') {
    const millis = Date.parse(createdAt);
    return Number.isFinite(millis) ? millis : null;
  }

  if (createdAt && typeof createdAt === 'object') {
    if ('toMillis' in createdAt && typeof createdAt.toMillis === 'function') {
      const millis = createdAt.toMillis();
      return Number.isFinite(millis) ? millis : null;
    }

    const seconds = (createdAt as { seconds?: unknown }).seconds;
    const nanoseconds = (createdAt as { nanoseconds?: unknown }).nanoseconds;
    if (typeof seconds === 'number' && Number.isFinite(seconds)) {
      const nanos = typeof nanoseconds === 'number' && Number.isFinite(nanoseconds) ? nanoseconds : 0;
      return seconds * 1000 + Math.trunc(nanos / 1_000_000);
    }
  }

  return null;
}

function compareTransactionsChronologically(a: Transaction, b: Transaction): number {
  const byDate = (a.date ?? '').localeCompare(b.date ?? '');
  if (byDate !== 0) return byDate;

  const aCreatedAt = createdAtToMillis(a.createdAt);
  const bCreatedAt = createdAtToMillis(b.createdAt);

  if (aCreatedAt !== null && bCreatedAt !== null && aCreatedAt !== bCreatedAt) {
    return aCreatedAt - bCreatedAt;
  }

  if (aCreatedAt !== null && bCreatedAt === null) return -1;
  if (aCreatedAt === null && bCreatedAt !== null) return 1;

  return a.id.localeCompare(b.id);
}

export function calculateRunningBalances(transactions: Transaction[]): Record<string, Centavos> {
  const runningBalances: Record<string, Centavos> = {};
  let running = 0 as Centavos;

  const chronological = transactions
    .filter(tx => tx.isDeleted !== true)
    .slice()
    .sort(compareTransactionsChronologically);

  for (const tx of chronological) {
    const amount = tx.value_cents === undefined ? (0 as Centavos) : absCentavos(tx.value_cents);

    if (isIncome(tx.type)) {
      running = addCentavos(running, amount);
    } else if (isExpense(tx.type)) {
      running = subtractCentavos(running, amount);
    }

    runningBalances[tx.id] = running;
  }

  return runningBalances;
}
