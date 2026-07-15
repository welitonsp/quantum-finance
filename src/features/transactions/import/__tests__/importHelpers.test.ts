import { describe, it, expect } from 'vitest';
import {
  buildReconciliationHistoryDelta,
  calculatePreviewTotals,
} from '../importHelpers';
import type { Transaction } from '../../../shared/types/transaction';
import type { PreviewTotalSource } from '../importTypes';

// Partial fixtures cast to Transaction: the helper only reads tracked fields.
function makeBefore(overrides: Partial<Transaction>): Transaction {
  return {
    category: 'Alimentação',
    description: 'Compra',
    date: '2026-07-01',
    type: 'saida',
    value_cents: 5000,
    ...overrides,
  } as Transaction;
}

describe('buildReconciliationHistoryDelta', () => {
  it('returns { changedFields: [] } and no before/after when before is undefined', () => {
    const result = buildReconciliationHistoryDelta(undefined, { category: 'Nova' });
    expect(result).toEqual({ changedFields: [] });
    expect(result.before).toBeUndefined();
    expect(result.after).toBeUndefined();
  });

  it('returns no changes when all tracked fields are identical', () => {
    const before = makeBefore({ category: 'Alimentação', value_cents: 5000 });
    const result = buildReconciliationHistoryDelta(before, {
      category: 'Alimentação',
      value_cents: 5000,
    });
    expect(result).toEqual({ changedFields: [] });
    expect(result.before).toBeUndefined();
    expect(result.after).toBeUndefined();
  });

  it('tracks a changed category with correct before/after values', () => {
    const before = makeBefore({ category: 'Alimentação' });
    const result = buildReconciliationHistoryDelta(before, { category: 'Transporte' });
    expect(result.changedFields).toContain('category');
    expect(result.before?.category).toBe('Alimentação');
    expect(result.after?.category).toBe('Transporte');
  });

  it('tracks a changed value_cents', () => {
    const before = makeBefore({ value_cents: 5000 });
    const result = buildReconciliationHistoryDelta(before, { value_cents: 7500 } as Partial<Transaction>);
    expect(result.changedFields).toContain('value_cents');
    expect(result.before?.value_cents).toBe(5000);
    expect(result.after?.value_cents).toBe(7500);
  });

  it('never surfaces importHash (not a tracked field) even when different in after', () => {
    const before = makeBefore({ category: 'Alimentação' });
    const result = buildReconciliationHistoryDelta(before, {
      category: 'Transporte',
      importHash: 'abc123',
    } as Partial<Transaction>);
    expect(result.changedFields).toContain('category');
    expect(result.changedFields).not.toContain('importHash');
    expect(result.before).not.toHaveProperty('importHash');
    expect(result.after).not.toHaveProperty('importHash');
  });

  it('maps an undefined after-value to null in the delta', () => {
    const before = makeBefore({ category: 'Alimentação' });
    const result = buildReconciliationHistoryDelta(before, {
      category: undefined,
    } as Partial<Transaction>);
    expect(result.changedFields).toContain('category');
    expect(result.before?.category).toBe('Alimentação');
    expect(result.after?.category).toBeNull();
  });

  it('skips fields not present in after at all (no spurious changedFields)', () => {
    const before = makeBefore({ category: 'Alimentação', value_cents: 5000 });
    const result = buildReconciliationHistoryDelta(before, { category: 'Transporte' });
    expect(result.changedFields).toEqual(['category']);
    expect(result.after).not.toHaveProperty('value_cents');
  });
});

describe('calculatePreviewTotals', () => {
  const entry = (cents: number): PreviewTotalSource => ({
    type: 'entrada',
    value_cents: cents,
    value: cents / 100,
    schemaVersion: 2,
  });
  const exit = (cents: number): PreviewTotalSource => ({
    type: 'saida',
    value_cents: cents,
    value: cents / 100,
    schemaVersion: 2,
  });

  it('returns zero totals for an empty array', () => {
    const { totEntry, totExit } = calculatePreviewTotals([]);
    expect(totEntry).toBeCloseTo(0);
    expect(totExit).toBeCloseTo(0);
  });

  it('sums only entradas into totEntry, leaving totExit at 0', () => {
    const { totEntry, totExit } = calculatePreviewTotals([entry(5000), entry(2500)]);
    expect(totExit).toBeCloseTo(0);
    expect(totEntry).toBeGreaterThan(0);
    expect(totEntry).toBeCloseTo(75);
  });

  it('sums only saidas into totExit, leaving totEntry at 0', () => {
    const { totEntry, totExit } = calculatePreviewTotals([exit(5000), exit(1000)]);
    expect(totEntry).toBeCloseTo(0);
    expect(totExit).toBeGreaterThan(0);
    expect(totExit).toBeCloseTo(60);
  });

  it('splits mixed transactions into both totals', () => {
    const { totEntry, totExit } = calculatePreviewTotals([entry(5000), exit(3000)]);
    expect(totEntry).toBeCloseTo(50);
    expect(totExit).toBeCloseTo(30);
  });
});
