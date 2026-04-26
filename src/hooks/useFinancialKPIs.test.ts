import { describe, it, expect } from 'vitest';
import { computeKPIs } from './useFinancialKPIs';
import type { Transaction } from '../shared/types/transaction';

// Dia 15 de abril de 2026 (30 dias no mês)
const FIXED_DATE = new Date('2026-04-15T12:00:00Z');

const tx = (type: 'entrada' | 'saida', value: number): Transaction =>
  ({ id: crypto.randomUUID(), description: '', value, type, category: 'Outros', date: '2026-04-01' }) as Transaction;

describe('computeKPIs — determinismo', () => {
  it('mesmo input + mesma data produz resultado idêntico', () => {
    const txs = [tx('entrada', 3000), tx('saida', 1000)];
    expect(computeKPIs(txs, FIXED_DATE)).toEqual(computeKPIs(txs, FIXED_DATE));
  });

  it('datas diferentes produzem burnRate diferentes', () => {
    const txs = [tx('saida', 1500)];
    const day5  = new Date('2026-04-05T12:00:00Z');
    const day25 = new Date('2026-04-25T12:00:00Z');
    expect(computeKPIs(txs, day5).burnRate).toBeGreaterThan(
      computeKPIs(txs, day25).burnRate,
    );
  });
});

describe('computeKPIs — cálculos financeiros', () => {
  it('burnRate = totalExpense / daysPassed', () => {
    // FIXED_DATE = dia 15 → daysPassed = 15
    const txs = [tx('saida', 1500)];
    const kpis = computeKPIs(txs, FIXED_DATE);
    expect(kpis.burnRate).toBeCloseTo(1500 / 15, 10);
  });

  it('projectedBalance = balance - burnRate * daysRemaining', () => {
    // dia 15 de abril (30 dias) → daysRemaining = 15
    const txs = [tx('entrada', 3000), tx('saida', 1500)];
    const kpis = computeKPIs(txs, FIXED_DATE);
    const expectedBurn = 1500 / 15;
    const expectedProjected = (3000 - 1500) - expectedBurn * 15;
    expect(kpis.projectedBalance).toBeCloseTo(expectedProjected, 10);
  });

  it('sem transações → balance 0, burnRate 0', () => {
    const kpis = computeKPIs([], FIXED_DATE);
    expect(kpis.balance).toBe(0);
    expect(kpis.burnRate).toBe(0);
    expect(kpis.projectedBalance).toBe(0);
  });

  it('daysPassed nunca é 0 (evita divisão por zero no dia 1)', () => {
    const dia1 = new Date('2026-04-01T00:00:00Z');
    const kpis = computeKPIs([tx('saida', 100)], dia1);
    expect(Number.isFinite(kpis.burnRate)).toBe(true);
  });

  it('totalIncome e totalExpense usam valor absoluto', () => {
    const txs = [tx('saida', -500)];   // valor negativo deve ser tratado como 500
    const kpis = computeKPIs(txs, FIXED_DATE);
    expect(kpis.totalExpense).toBe(500);
  });
});
