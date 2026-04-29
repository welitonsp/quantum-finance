import type { Transaction } from '../shared/types/transaction';

export const PAGE_SIZE = 500;

/**
 * Merges a base page with an older page, excluding from `older` any IDs
 * already present in `base`. Does NOT sort — caller owns ordering.
 */
export function mergeTransactionPages(
  base: Transaction[],
  older: Transaction[],
): Transaction[] {
  const baseIds = new Set(base.map(tx => tx.id));
  return [...base, ...older.filter(tx => !baseIds.has(tx.id))];
}

/**
 * Returns true when the number of fetched documents equals the page size,
 * indicating there may be additional pages to load.
 */
export function hasMorePages(pageSize: number, fetchedCount: number): boolean {
  return fetchedCount >= pageSize;
}
