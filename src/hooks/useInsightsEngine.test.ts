import { describe, it, expect } from 'vitest';
import {
  buildYearMonth,
  filterByMonth,
  computeTopExpenses,
  computeTrend,
  detectAnomalies,
  buildSuggestions,
} from './useInsightsEngine';
import type { Transaction } from '../shared/types/transaction';
import type { Centavos } from '../shared/types/money';

function makeTx(overrides: Partial<Transaction> & { id: string }): Transaction {
  return {
    uid: 'u1',
    type: 'saida',
    description: 'Test',
    category: 'alimentação',
    value_cents: 10000 as Centavos,
    date: '2026-06-15',
    source: 'manual',
    account: 'conta_corrente',
    isDeleted: false,
    descriptionLower: 'test',
    createdAt: '2026-06-15',
    updatedAt: '2026-06-15',
    _lastOpId: 'op1',
    ...overrides,
  };
}

describe('buildYearMonth', () => {
  it('formats single-digit month with leading zero', () => {
    expect(buildYearMonth(2026, 6)).toBe('2026-06');
  });
  it('formats December correctly', () => {
    expect(buildYearMonth(2025, 12)).toBe('2025-12');
  });
});

describe('filterByMonth', () => {
  const txs: Transaction[] = [
    makeTx({ id: '1', date: '2026-06-01' }),
    makeTx({ id: '2', date: '2026-05-31' }),
    makeTx({ id: '3', date: '2026-06-30' }),
  ];

  it('returns only transactions from the given month', () => {
    const result = filterByMonth(txs, 2026, 6);
    expect(result.map(t => t.id)).toEqual(['1', '3']);
  });

  it('returns empty for month with no transactions', () => {
    expect(filterByMonth(txs, 2026, 7)).toHaveLength(0);
  });
});

describe('computeTopExpenses', () => {
  const txs: Transaction[] = [
    makeTx({ id: '1', category: 'moradia',     value_cents: 300000 as Centavos }),
    makeTx({ id: '2', category: 'alimentação', value_cents: 100000 as Centavos }),
    makeTx({ id: '3', category: 'alimentação', value_cents:  50000 as Centavos }),
    makeTx({ id: '4', category: 'lazer',       value_cents:  80000 as Centavos }),
    makeTx({ id: '5', type: 'entrada',         value_cents: 500000 as Centavos }),
  ];

  it('returns expenses sorted by total descending', () => {
    const result = computeTopExpenses(txs);
    expect(result[0]!.category).toBe('moradia');
    expect(result[1]!.category).toBe('alimentação');
  });

  it('aggregates category totals correctly', () => {
    const result = computeTopExpenses(txs);
    const alim = result.find(r => r.category === 'alimentação');
    expect(alim?.totalCents).toBe(150000);
    expect(alim?.count).toBe(2);
  });

  it('excludes income transactions', () => {
    const result = computeTopExpenses(txs);
    expect(result.every(r => r.category !== undefined)).toBe(true);
    expect(result.map(r => r.totalCents).every(v => v > 0)).toBe(true);
  });

  it('computes share summing to ≤ 1', () => {
    const result = computeTopExpenses(txs);
    const total = result.reduce((s, r) => s + r.share, 0);
    expect(total).toBeLessThanOrEqual(1.001);
  });
});

describe('computeTrend', () => {
  const makeMonthTxs = (expCents: number, incCents: number): Transaction[] => [
    makeTx({ id: 'e', type: 'saida',   value_cents: expCents as Centavos }),
    makeTx({ id: 'i', type: 'entrada', value_cents: incCents as Centavos }),
  ];

  it('detects spending_up when expenses increase >5%', () => {
    const curr = makeMonthTxs(120000, 200000);
    const prev = makeMonthTxs(100000, 200000);
    const trend = computeTrend(curr, prev);
    expect(trend?.type).toBe('spending_up');
    expect(trend?.ratio).toBeCloseTo(0.2, 2);
  });

  it('detects spending_down when expenses decrease >5%', () => {
    const curr = makeMonthTxs(80000, 200000);
    const prev = makeMonthTxs(100000, 200000);
    const trend = computeTrend(curr, prev);
    expect(trend?.type).toBe('spending_down');
  });

  it('returns null when change is within 5%', () => {
    const curr = makeMonthTxs(103000, 200000);
    const prev = makeMonthTxs(100000, 200000);
    expect(computeTrend(curr, prev)).toBeNull();
  });
});

describe('detectAnomalies', () => {
  it('flags transaction much larger than category average', () => {
    const txs: Transaction[] = [
      makeTx({ id: '1', category: 'alimentação', value_cents:  10000 as Centavos }),
      makeTx({ id: '2', category: 'alimentação', value_cents:  12000 as Centavos }),
      makeTx({ id: '3', category: 'alimentação', value_cents:  11000 as Centavos }),
      makeTx({ id: '4', category: 'alimentação', value_cents: 100000 as Centavos }),
    ];
    const anomalies = detectAnomalies(txs, 3);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0]!.transactionId).toBe('4');
    expect(anomalies[0]!.multiplier).toBeGreaterThanOrEqual(3);
  });

  it('returns empty when no anomaly', () => {
    const txs: Transaction[] = [
      makeTx({ id: '1', value_cents: 10000 as Centavos }),
      makeTx({ id: '2', value_cents: 11000 as Centavos }),
    ];
    expect(detectAnomalies(txs, 3)).toHaveLength(0);
  });
});

describe('buildSuggestions', () => {
  it('returns at least one suggestion always', () => {
    const suggestions = buildSuggestions([], null, []);
    expect(suggestions.length).toBeGreaterThan(0);
  });

  it('returns high-priority suggestion for spending_up >15%', () => {
    const trend = {
      type: 'spending_up' as const,
      currentCents: 120000 as Centavos,
      previousCents: 100000 as Centavos,
      ratio: 0.2,
    };
    const suggestions = buildSuggestions([], trend, []);
    expect(suggestions.some(s => s.priority === 'high')).toBe(true);
  });
});
