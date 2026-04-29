import { describe, it, expect } from 'vitest';
import { PAGE_SIZE, mergeTransactionPages, hasMorePages } from './transactionPagination';
import type { Transaction } from '../shared/types/transaction';

function makeTx(id: string, createdAt: number): Transaction {
  return {
    id,
    uid: 'test-user',
    description: `tx-${id}`,
    value: 10,
    value_cents: 1000 as import('../shared/types/money').Centavos,
    type: 'saida',
    category: 'Outros',
    date: '2024-01-01',
    createdAt,
    updatedAt: createdAt,
    schemaVersion: 2,
  } as Transaction;
}

describe('mergeTransactionPages', () => {
  it('returns base unchanged when older is empty', () => {
    const base = [makeTx('a', 3), makeTx('b', 2)];
    expect(mergeTransactionPages(base, [])).toEqual(base);
  });

  it('appends unique older items after base', () => {
    const base  = [makeTx('a', 3), makeTx('b', 2)];
    const older = [makeTx('c', 1), makeTx('d', 0)];
    const result = mergeTransactionPages(base, older);
    expect(result.map(t => t.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('deduplicates: skips older items whose id is already in base', () => {
    const base  = [makeTx('a', 3), makeTx('b', 2)];
    const older = [makeTx('b', 2), makeTx('c', 1)];
    const result = mergeTransactionPages(base, older);
    expect(result.map(t => t.id)).toEqual(['a', 'b', 'c']);
  });

  it('preserves createdAt desc order when inputs are already ordered', () => {
    const base  = [makeTx('a', 100), makeTx('b', 80)];
    const older = [makeTx('c', 60),  makeTx('d', 40)];
    const result = mergeTransactionPages(base, older);
    const times = result.map(t => t.createdAt as number);
    expect(times).toEqual([100, 80, 60, 40]);
  });

  it('does not mutate the base or older arrays', () => {
    const base  = [makeTx('a', 2)];
    const older = [makeTx('b', 1)];
    const baseCopy  = [...base];
    const olderCopy = [...older];
    mergeTransactionPages(base, older);
    expect(base).toEqual(baseCopy);
    expect(older).toEqual(olderCopy);
  });
});

describe('hasMorePages', () => {
  it('returns true when fetchedCount equals pageSize', () => {
    expect(hasMorePages(PAGE_SIZE, PAGE_SIZE)).toBe(true);
  });

  it('returns true when fetchedCount exceeds pageSize (defensive)', () => {
    expect(hasMorePages(PAGE_SIZE, PAGE_SIZE + 1)).toBe(true);
  });

  it('returns false when fetchedCount is less than pageSize', () => {
    expect(hasMorePages(PAGE_SIZE, PAGE_SIZE - 1)).toBe(false);
  });

  it('returns false for an empty page', () => {
    expect(hasMorePages(PAGE_SIZE, 0)).toBe(false);
  });

  it('returns false for arbitrary smaller counts', () => {
    expect(hasMorePages(10, 9)).toBe(false);
    expect(hasMorePages(10, 0)).toBe(false);
  });

  it('returns true for arbitrary full pages', () => {
    expect(hasMorePages(10, 10)).toBe(true);
    expect(hasMorePages(10, 11)).toBe(true);
  });
});
