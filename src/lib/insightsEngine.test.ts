// src/lib/insightsEngine.test.ts
// Testes unitários do motor puro de insights financeiros.

import { describe, it, expect } from 'vitest';
import {
  computeAnomalies,
  computeHealthScore,
  computeForecast,
  computeKPIs,
  type InsightContext,
} from './insightsEngine';
import type { Transaction, Account } from '../shared/types/transaction';
import type { Centavos } from '../shared/types/money';

// ─── Factories ────────────────────────────────────────────────────────────────

function tx(
  overrides: Partial<Transaction> & { value_cents: Centavos; date: string; type: Transaction['type'] },
): Transaction {
  return {
    id:          overrides.id ?? 'tx-' + Math.random().toString(36).slice(2),
    description: overrides.description ?? 'Test',
    category:    overrides.category ?? 'alimentação',
    ...overrides,
  } as Transaction;
}

function acc(overrides: Partial<Account> & { type: Account['type']; balance: Centavos }): Account {
  return {
    id:   overrides.id ?? 'acc-' + Math.random().toString(36).slice(2),
    name: overrides.name ?? 'Conta',
    ...overrides,
  } as Account;
}

function ctx(
  partial: Partial<InsightContext> & { today?: string; currentMonth?: string },
): InsightContext {
  return {
    transactions: [],
    accounts:     [],
    today:        partial.today        ?? '2026-06-10',
    currentMonth: partial.currentMonth ?? '2026-06',
    ...partial,
  };
}

// ─── computeAnomalies ─────────────────────────────────────────────────────────

describe('computeAnomalies', () => {
  it('returns empty when historical transactions < 5', () => {
    const c = ctx({
      transactions: [
        tx({ value_cents: 10000 as Centavos, date: '2026-06-01', type: 'saida', category: 'alimentação' }),
        tx({ value_cents: 10000 as Centavos, date: '2026-05-01', type: 'saida', category: 'alimentação' }),
      ],
    });
    expect(computeAnomalies(c)).toHaveLength(0);
  });

  it('detects anomaly when category is >25% above historical average', () => {
    // 5 historical months with 10000 cents each in "alimentação"
    const historical: Transaction[] = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05'].map(
      (month, i) => tx({ id: `h${i}`, value_cents: 10000 as Centavos, date: `${month}-15`, type: 'saida', category: 'alimentação' }),
    );
    // Current month: 15000 cents = 50% above avg
    const current = tx({ value_cents: 15000 as Centavos, date: '2026-06-01', type: 'saida', category: 'alimentação' });

    const result = computeAnomalies(ctx({ transactions: [...historical, current] }));
    expect(result).toHaveLength(1);
    expect(result[0]!.category).toBe('alimentação');
    expect(result[0]!.deltaPct).toBe(50);
  });

  it('does NOT flag anomaly when delta is below threshold (25%)', () => {
    const historical: Transaction[] = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05'].map(
      (month, i) => tx({ id: `h${i}`, value_cents: 10000 as Centavos, date: `${month}-15`, type: 'saida', category: 'alimentação' }),
    );
    // 10% above avg — below 25% threshold
    const current = tx({ value_cents: 11000 as Centavos, date: '2026-06-01', type: 'saida', category: 'alimentação' });

    const result = computeAnomalies(ctx({ transactions: [...historical, current] }));
    expect(result).toHaveLength(0);
  });

  it('ignores income transactions', () => {
    const historical: Transaction[] = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05'].map(
      (month, i) => tx({ id: `h${i}`, value_cents: 10000 as Centavos, date: `${month}-15`, type: 'saida', category: 'alimentação' }),
    );
    const income = tx({ value_cents: 99999 as Centavos, date: '2026-06-01', type: 'entrada', category: 'alimentação' });

    const result = computeAnomalies(ctx({ transactions: [...historical, income] }));
    expect(result).toHaveLength(0);
  });

  it('assigns severity correctly', () => {
    const historical: Transaction[] = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05'].map(
      (month, i) => tx({ id: `h${i}`, value_cents: 10000 as Centavos, date: `${month}-15`, type: 'saida', category: 'alimentação' }),
    );
    // 80% above avg → should be 'high'
    const current = tx({ value_cents: 18000 as Centavos, date: '2026-06-01', type: 'saida', category: 'alimentação' });
    const result = computeAnomalies(ctx({ transactions: [...historical, current] }));
    expect(result[0]!.severity).toBe('high');
  });
});

// ─── computeHealthScore ───────────────────────────────────────────────────────

describe('computeHealthScore', () => {
  it('total score is within 0-100', () => {
    const c = ctx({
      transactions: [
        tx({ value_cents: 500000 as Centavos, date: '2026-06-01', type: 'entrada', category: 'salário' }),
        tx({ value_cents: 100000 as Centavos, date: '2026-06-05', type: 'saida',   category: 'alimentação' }),
      ],
      accounts: [
        acc({ type: 'corrente',    balance: 1200000 as Centavos }),
        acc({ type: 'poupanca',    balance: 600000  as Centavos }),
        acc({ type: 'investimento',balance: 200000  as Centavos }),
      ],
    });
    const result = computeHealthScore(c);
    expect(result.total).toBeGreaterThanOrEqual(0);
    expect(result.total).toBeLessThanOrEqual(100);
  });

  it('total = sum of 4 pillars', () => {
    const c = ctx({
      transactions: [
        tx({ value_cents: 500000 as Centavos, date: '2026-06-01', type: 'entrada', category: 'salário' }),
        tx({ value_cents: 200000 as Centavos, date: '2026-06-05', type: 'saida',   category: 'moradia' }),
      ],
      accounts: [
        acc({ type: 'corrente', balance: 3000000 as Centavos }),
        acc({ type: 'divida',   balance: 100000  as Centavos }),
      ],
    });
    const r = computeHealthScore(c);
    expect(r.total).toBe(r.pillarSavings + r.pillarDebt + r.pillarReserve + r.pillarBudget);
  });

  it('each pillar is 0-25', () => {
    const c = ctx({ transactions: [], accounts: [] });
    const r = computeHealthScore(c);
    for (const p of [r.pillarSavings, r.pillarDebt, r.pillarReserve, r.pillarBudget]) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(25);
    }
  });

  it('details has 4 entries', () => {
    const r = computeHealthScore(ctx({}));
    expect(r.details).toHaveLength(4);
  });

  it('returns max score for excellent finances', () => {
    const c = ctx({
      transactions: [
        // 40% savings rate: income 1M, expense 600k
        tx({ value_cents: 1000000 as Centavos, date: '2026-06-01', type: 'entrada', category: 'salário' }),
        tx({ value_cents: 600000  as Centavos, date: '2026-06-05', type: 'saida',   category: 'alimentação' }),
      ],
      accounts: [
        // Large reserves, no debt
        acc({ type: 'poupanca',    balance: 60000000 as Centavos }),  // 600k → 100 months
        acc({ type: 'investimento',balance: 10000000 as Centavos }),
      ],
    });
    const r = computeHealthScore(c);
    // Savings >= 30 → pillarSavings = 25
    expect(r.pillarSavings).toBe(25);
    // No debt → endividamento = 0 → pillarDebt = 25
    expect(r.pillarDebt).toBe(25);
  });
});

// ─── computeForecast ──────────────────────────────────────────────────────────

describe('computeForecast', () => {
  it('projected expense >= current expense', () => {
    const c = ctx({
      today:        '2026-06-10',
      currentMonth: '2026-06',
      transactions: [
        tx({ value_cents: 300000 as Centavos, date: '2026-06-01', type: 'entrada', category: 'salário' }),
        tx({ value_cents: 100000 as Centavos, date: '2026-06-05', type: 'saida',   category: 'alimentação' }),
      ],
    });
    const r = computeForecast(c);
    expect(r.projectedExpenseCents).toBeGreaterThanOrEqual(100000);
  });

  it('daysRemaining is positive and < 31', () => {
    const c = ctx({ today: '2026-06-10', currentMonth: '2026-06' });
    const r = computeForecast(c);
    expect(r.daysRemaining).toBeGreaterThan(0);
    expect(r.daysRemaining).toBeLessThan(31);
  });

  it('daysRemaining is 0 for last day of month', () => {
    const c = ctx({ today: '2026-06-30', currentMonth: '2026-06', transactions: [] });
    const r = computeForecast(c);
    expect(r.daysRemaining).toBe(0);
  });

  it('projectedBalance = projectedIncome - projectedExpense', () => {
    const c = ctx({
      today: '2026-06-10',
      currentMonth: '2026-06',
      transactions: [
        tx({ value_cents: 500000 as Centavos, date: '2026-06-01', type: 'entrada', category: 'salário' }),
        tx({ value_cents: 200000 as Centavos, date: '2026-06-05', type: 'saida',   category: 'alimentação' }),
      ],
    });
    const r = computeForecast(c);
    // projected balance should be income minus projected expense (rounded)
    const expected = r.projectedIncomeCents - r.projectedExpenseCents;
    expect(Math.abs(r.projectedBalanceCents - expected)).toBeLessThanOrEqual(1); // ±1 cent rounding
  });
});

// ─── computeKPIs ─────────────────────────────────────────────────────────────

describe('computeKPIs', () => {
  it('netWorthCents = sum of asset balances minus liabilities', () => {
    const c = ctx({
      accounts: [
        acc({ type: 'corrente',    balance: 500000 as Centavos }),
        acc({ type: 'poupanca',    balance: 300000 as Centavos }),
        acc({ type: 'investimento',balance: 200000 as Centavos }),
        acc({ type: 'divida',      balance: 100000 as Centavos }),
      ],
    });
    const r = computeKPIs(c);
    // 500k + 300k + 200k - 100k = 900k
    expect(r.netWorthCents).toBe(900000);
  });

  it('netWorthCents is zero when no accounts', () => {
    const r = computeKPIs(ctx({ accounts: [] }));
    expect(r.netWorthCents).toBe(0);
  });

  it('netWorthCents subtracts cardOpenInvoicesCents from asset balances', () => {
    const c = ctx({
      accounts: [
        acc({ type: 'corrente', balance: 1000000 as Centavos }),
        acc({ type: 'poupanca', balance: 500000  as Centavos }),
      ],
      cardOpenInvoicesCents: 30000 as Centavos,
    });
    const r = computeKPIs(c);
    // 1000000 + 500000 - 30000 = 1470000
    expect(r.netWorthCents).toBe(1470000);
  });

  it('netWorthCents ignores zero cardOpenInvoicesCents', () => {
    const c = ctx({
      accounts: [acc({ type: 'corrente', balance: 200000 as Centavos })],
      cardOpenInvoicesCents: 0 as Centavos,
    });
    expect(computeKPIs(c).netWorthCents).toBe(200000);
  });

  it('netWorthCents can be negative when invoices exceed assets', () => {
    const c = ctx({
      accounts: [acc({ type: 'corrente', balance: 10000 as Centavos })],
      cardOpenInvoicesCents: 50000 as Centavos,
    });
    expect(computeKPIs(c).netWorthCents).toBe(-40000);
  });

  it('monthlyIncomeCents and monthlyExpenseCents only count current month', () => {
    const c = ctx({
      today:        '2026-06-10',
      currentMonth: '2026-06',
      transactions: [
        tx({ value_cents: 500000 as Centavos, date: '2026-06-01', type: 'entrada', category: 'salário' }),
        tx({ value_cents: 200000 as Centavos, date: '2026-06-05', type: 'saida',   category: 'alimentação' }),
        // Previous month — should be excluded
        tx({ value_cents: 999999 as Centavos, date: '2026-05-20', type: 'entrada', category: 'salário' }),
        tx({ value_cents: 888888 as Centavos, date: '2026-05-20', type: 'saida',   category: 'alimentação' }),
      ],
    });
    const r = computeKPIs(c);
    expect(r.monthlyIncomeCents).toBe(500000);
    expect(r.monthlyExpenseCents).toBe(200000);
  });

  it('savingsRatePct is correct', () => {
    const c = ctx({
      currentMonth: '2026-06',
      transactions: [
        tx({ value_cents: 1000000 as Centavos, date: '2026-06-01', type: 'entrada', category: 'salário' }),
        tx({ value_cents: 300000  as Centavos, date: '2026-06-05', type: 'saida',   category: 'alimentação' }),
      ],
    });
    const r = computeKPIs(c);
    // (1000000 - 300000) / 1000000 * 100 = 70%
    expect(r.savingsRatePct).toBeCloseTo(70, 1);
  });

  it('savingsRatePct is 0 when no income', () => {
    const c = ctx({
      currentMonth: '2026-06',
      transactions: [
        tx({ value_cents: 50000 as Centavos, date: '2026-06-01', type: 'saida', category: 'alimentação' }),
      ],
    });
    const r = computeKPIs(c);
    expect(r.savingsRatePct).toBe(0);
  });

  it('conta do tipo cartao entra como passivo (valor absoluto)', () => {
    const c = ctx({
      accounts: [
        acc({ type: 'corrente', balance: 500000 as Centavos }),
        acc({ type: 'cartao',   balance: -80000 as Centavos }),
      ],
    });
    // 500000 − |−80000| = 420000
    expect(computeKPIs(c).netWorthCents).toBe(420000);
  });

  it('conta de tipo desconhecido não entra em ativos nem passivos', () => {
    const c = ctx({
      accounts: [
        acc({ type: 'corrente', balance: 100000 as Centavos }),
        acc({ type: 'outro' as Account['type'], balance: 999999 as Centavos }),
      ],
    });
    expect(computeKPIs(c).netWorthCents).toBe(100000);
  });

  it('ignora transação sem data e pagamento de fatura no cálculo mensal', () => {
    const c = ctx({
      currentMonth: '2026-06',
      transactions: [
        tx({ value_cents: 400000 as Centavos, date: '2026-06-01', type: 'entrada', category: 'salário' }),
        tx({ value_cents: 100000 as Centavos, date: '2026-06-05', type: 'saida',   category: 'alimentação' }),
        // Pagamento de fatura: não conta como despesa de consumo
        tx({ value_cents: 70000 as Centavos, date: '2026-06-07', type: 'saida', category: 'Cartão', paidInvoiceMonth: '2026-05' }),
        // Sem data: ignorada
        tx({ value_cents: 555555 as Centavos, date: '', type: 'saida', category: 'alimentação' }),
      ],
    });
    const r = computeKPIs(c);
    expect(r.monthlyIncomeCents).toBe(400000);
    expect(r.monthlyExpenseCents).toBe(100000);
  });
});

describe('computeForecast — branches adicionais', () => {
  it('ignora transações sem data e de pagamento de fatura', () => {
    const c = ctx({
      today: '2026-06-10',
      currentMonth: '2026-06',
      transactions: [
        tx({ value_cents: 300000 as Centavos, date: '2026-06-01', type: 'entrada', category: 'salário' }),
        tx({ value_cents: 90000 as Centavos, date: '2026-06-05', type: 'saida', category: 'alimentação' }),
        tx({ value_cents: 40000 as Centavos, date: '2026-06-06', type: 'saida', category: 'Cartão', paidInvoiceMonth: '2026-05' }),
        tx({ value_cents: 111111 as Centavos, date: '', type: 'saida', category: 'alimentação' }),
      ],
    });
    const r = computeForecast(c);
    expect(r.projectedIncomeCents).toBe(300000);
    // despesa base = 90000 (fatura e sem-data excluídas), projeção ≥ base
    expect(r.projectedExpenseCents).toBeGreaterThanOrEqual(90000);
  });

  it('receita e despesa zeradas quando nada no mês corrente', () => {
    const c = ctx({
      today: '2026-06-10',
      currentMonth: '2026-06',
      transactions: [
        tx({ value_cents: 999999 as Centavos, date: '2026-05-01', type: 'saida', category: 'alimentação' }),
      ],
    });
    const r = computeForecast(c);
    expect(r.projectedIncomeCents).toBe(0);
    expect(r.projectedExpenseCents).toBe(0);
  });
});
