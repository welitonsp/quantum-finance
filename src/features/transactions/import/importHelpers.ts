import { getTransactionAbsCentavos, isIncome, isExpense } from '../../../utils/transactionUtils';
import { fromCentavos } from '../../../shared/types/money';
import type { Transaction } from '../../../shared/types/transaction';
import type { PreviewTotalSource } from './importTypes';

// ─── Reconciliation history delta ─────────────────────────────────────────────

export const RECONCILIATION_HISTORY_FIELDS = [
  'category',
  'description',
  'date',
  'type',
  'source',
  'value_cents',
  'fitId',
  'reconciliationStatus',
  'reconciliationSource',
  'reconciledAt',
  'reconciledBy',
] as const satisfies readonly (keyof Transaction)[];

function historyDeltaValue(value: unknown): unknown {
  return value === undefined ? null : value;
}

export function buildReconciliationHistoryDelta(
  before: Transaction | undefined,
  after: Partial<Transaction>,
): {
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  changedFields: string[];
} {
  if (!before) return { changedFields: [] };

  const beforeDelta: Record<string, unknown> = {};
  const afterDelta:  Record<string, unknown> = {};
  const changedFields: string[] = [];

  for (const field of RECONCILIATION_HISTORY_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(after, field)) continue;

    const previousValue = before[field];
    const nextValue     = after[field];
    if (Object.is(previousValue, nextValue)) continue;

    changedFields.push(field);
    beforeDelta[field] = historyDeltaValue(previousValue);
    afterDelta[field]  = historyDeltaValue(nextValue);
  }

  return changedFields.length > 0
    ? { before: beforeDelta, after: afterDelta, changedFields }
    : { changedFields };
}

// ─── Preview totals ───────────────────────────────────────────────────────────

export function calculatePreviewTotals(transactions: PreviewTotalSource[]) {
  let entryCents = 0;
  let exitCents  = 0;

  transactions.forEach(tx => {
    const cents = getTransactionAbsCentavos(tx);
    if (isIncome(tx.type))  entryCents += cents;
    if (isExpense(tx.type)) exitCents  += cents;
  });

  return {
    totEntry: fromCentavos(entryCents),
    totExit:  fromCentavos(exitCents),
  };
}
