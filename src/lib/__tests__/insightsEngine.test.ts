import { describe, it, expect } from 'vitest';
import {
  computeAnomalies,
  computeHealthScore,
  computeForecast,
  computeKPIs,
  type InsightContext,
} from '../insightsEngine';
import type { Transaction, Account } from '../../shared/types/transaction';
import type { Centavos } from '../../shared/types/money';

const cents = (n: number): Centavos => n as Centavos;

function tx(overrides: Partial<Transaction> & { value_cents: number }): Transaction {
  const { value_cents, ...rest } = overrides;
  return {
    id: 'tx',
    description: 'Teste',
    value_cents: cents(value_cents),
    schemaVersion: 2,
    type: 'saida',
    category: 'Alimentação',
    date: '2026-07-01',
    ...rest,
  } as Transaction;
}

function account(overrides: Partial<Account>): Account {
  return {
    id: 'acc',
    name: 'Conta',
    type: 'corrente',
    balance: 0,
    ...overrides,
  } as Account;
}

const BASE_CTX: InsightContext = {
  transactions: [],
  accounts: [],
  today: '2026-07-09',
  currentMonth: '2026-07',
};

// ─── computeAnomalies ─────────────────────────────────────────────────────────

describe('computeAnomalies', () => {
  it('retorna [] quando histórico tem menos de 5 transações', () => {
    const ctx: InsightContext = {
      ...BASE_CTX,
      transactions: [
        tx({ value_cents: 1000, date: '2026-06-01' }),
        tx({ value_cents: 1000, date: '2026-05-01' }),
      ],
    };
    expect(computeAnomalies(ctx)).toEqual([]);
  });

  it('retorna [] quando não há despesas de consumo no histórico (avg = 0)', () => {
    // histórico com só receitas → byMonth vazio → months.length === 0
    const histTxs = Array.from({ length: 6 }, (_, i) =>
      tx({ value_cents: 5000, date: `2026-0${i + 1 <= 6 ? String(i + 1).padStart(2, '0') : '06'}-01`, type: 'entrada' }),
    );
    const ctx: InsightContext = {
      ...BASE_CTX,
      transactions: [
        ...histTxs,
        tx({ value_cents: 9999, date: '2026-07-01' }),
      ],
    };
    expect(computeAnomalies(ctx)).toEqual([]);
  });

  it('detecta anomalia de severidade high (delta >= 75%)', () => {
    // 5 meses de histórico: R$10 cada; mês atual: R$200 (2000% acima → 'high')
    const histTxs = Array.from({ length: 5 }, (_, i) =>
      tx({ value_cents: 1000, category: 'Restaurante', date: `2026-0${i + 1}-10` }),
    );
    const ctx: InsightContext = {
      ...BASE_CTX,
      transactions: [
        ...histTxs,
        tx({ value_cents: 20000, category: 'Restaurante', date: '2026-07-01' }),
      ],
    };
    const result = computeAnomalies(ctx);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]!.severity).toBe('high');
    expect(result[0]!.category).toBe('Restaurante');
  });

  it('detecta anomalia de severidade medium (delta 40–74%)', () => {
    // avg 10000, atual 15000 → delta 50% → medium
    const histTxs = Array.from({ length: 5 }, (_, i) =>
      tx({ value_cents: 10000, category: 'Mercado', date: `2026-0${i + 1}-10` }),
    );
    const ctx: InsightContext = {
      ...BASE_CTX,
      transactions: [
        ...histTxs,
        tx({ value_cents: 15000, category: 'Mercado', date: '2026-07-01' }),
      ],
    };
    const result = computeAnomalies(ctx);
    const mercado = result.find(r => r.category === 'Mercado');
    expect(mercado?.severity).toBe('medium');
  });

  it('detecta anomalia de severidade low (delta 25–39%)', () => {
    // avg 10000, atual 13000 → delta 30% → low
    const histTxs = Array.from({ length: 5 }, (_, i) =>
      tx({ value_cents: 10000, category: 'Farmácia', date: `2026-0${i + 1}-10` }),
    );
    const ctx: InsightContext = {
      ...BASE_CTX,
      transactions: [
        ...histTxs,
        tx({ value_cents: 13000, category: 'Farmácia', date: '2026-07-01' }),
      ],
    };
    const result = computeAnomalies(ctx);
    const item = result.find(r => r.category === 'Farmácia');
    expect(item?.severity).toBe('low');
  });

  it('ignora tx com date inválida (parseDateParts retorna null)', () => {
    const ctx: InsightContext = {
      ...BASE_CTX,
      transactions: [
        tx({ value_cents: 1000, date: 'nao-e-data' }),
      ],
    };
    expect(() => computeAnomalies(ctx)).not.toThrow();
    expect(computeAnomalies(ctx)).toEqual([]);
  });

  it('não sinaliza quando delta < 25% (abaixo do threshold)', () => {
    const histTxs = Array.from({ length: 5 }, (_, i) =>
      tx({ value_cents: 10000, category: 'Lazer', date: `2026-0${i + 1}-10` }),
    );
    const ctx: InsightContext = {
      ...BASE_CTX,
      transactions: [
        ...histTxs,
        tx({ value_cents: 11000, category: 'Lazer', date: '2026-07-01' }),
      ],
    };
    const result = computeAnomalies(ctx);
    const lazer = result.find(r => r.category === 'Lazer');
    expect(lazer).toBeUndefined();
  });
});

// ─── computeHealthScore ───────────────────────────────────────────────────────

describe('computeHealthScore', () => {
  it('usa receita/despesa do mês como ativos/passivos quando accounts é vazio', () => {
    const ctx: InsightContext = {
      ...BASE_CTX,
      accounts: [],
      transactions: [
        tx({ value_cents: 50000, type: 'entrada', date: '2026-07-01' }),
        tx({ value_cents: 10000, type: 'saida',   date: '2026-07-05' }),
      ],
    };
    const result = computeHealthScore(ctx);
    expect(typeof result.total).toBe('number');
    expect(result.total).toBeGreaterThanOrEqual(0);
    expect(result.total).toBeLessThanOrEqual(100);
  });

  it('pilar savings = 25 quando taxa poupança >= 30%', () => {
    // 10000 receita, 5000 despesa → 50% poupança
    const ctx: InsightContext = {
      ...BASE_CTX,
      accounts: [account({ type: 'corrente', balance: 100000 })],
      transactions: [
        tx({ value_cents: 100000, type: 'entrada', date: '2026-07-01' }),
        tx({ value_cents: 50000,  type: 'saida',   date: '2026-07-05', category: 'Lazer' }),
      ],
    };
    const result = computeHealthScore(ctx);
    expect(result.pillarSavings).toBe(25);
  });

  it('pilar savings = 6 quando taxa poupança entre 5% e 9%', () => {
    // 100000 receita, 93000 despesa → 7% poupança
    const ctx: InsightContext = {
      ...BASE_CTX,
      accounts: [account({ type: 'corrente', balance: 100000 })],
      transactions: [
        tx({ value_cents: 100000, type: 'entrada', date: '2026-07-01' }),
        tx({ value_cents: 93000,  type: 'saida',   date: '2026-07-05', category: 'Lazer' }),
      ],
    };
    const result = computeHealthScore(ctx);
    expect(result.pillarSavings).toBe(6);
  });

  it('pilar savings = 0 quando não há receita', () => {
    const ctx: InsightContext = {
      ...BASE_CTX,
      accounts: [account({ type: 'corrente', balance: 1000 })],
      transactions: [
        tx({ value_cents: 5000, type: 'saida', date: '2026-07-05', category: 'Lazer' }),
      ],
    };
    const result = computeHealthScore(ctx);
    expect(result.pillarSavings).toBe(0);
  });

  it('conta tipo cartao/divida como passivo (eleva endividamento)', () => {
    const ctx: InsightContext = {
      ...BASE_CTX,
      accounts: [
        account({ type: 'corrente', balance: 10000 }),
        account({ type: 'cartao',   balance: 9000 }),
      ],
      transactions: [],
    };
    const result = computeHealthScore(ctx);
    // ativos=10000, passivos=9000 → endividamento 47% → pillarDebt=12
    expect(result.pillarDebt).toBe(12);
  });

  it('pilar debt = 25 quando endividamento <= 10%', () => {
    // ativos=100000, passivos=5000 → endividamento 4.76%
    const ctx: InsightContext = {
      ...BASE_CTX,
      accounts: [
        account({ type: 'corrente', balance: 100000 }),
        account({ type: 'divida',   balance: 5000 }),
      ],
      transactions: [],
    };
    const result = computeHealthScore(ctx);
    expect(result.pillarDebt).toBe(25);
  });

  it('custoFixo com categoria moradia incrementa pilar de comprometimento', () => {
    const ctx: InsightContext = {
      ...BASE_CTX,
      accounts: [account({ type: 'poupanca', balance: 600000 })],
      transactions: [
        tx({ value_cents: 100000, type: 'entrada', date: '2026-07-01' }),
        tx({ value_cents: 40000,  type: 'saida',   date: '2026-07-05', category: 'moradia' }),
      ],
    };
    const result = computeHealthScore(ctx);
    expect(typeof result.pillarBudget).toBe('number');
    // comprometimento = 40% → pillarBudget = 8
    expect(result.pillarBudget).toBe(8);
  });

  it('details tem 4 strings (uma por pilar)', () => {
    const ctx: InsightContext = { ...BASE_CTX, accounts: [account({ type: 'corrente', balance: 5000 })], transactions: [] };
    const result = computeHealthScore(ctx);
    expect(result.details).toHaveLength(4);
    expect(typeof result.details[0]).toBe('string');
  });
});

// ─── computeForecast ──────────────────────────────────────────────────────────

describe('computeForecast', () => {
  it('retorna daysRemaining correto para dia 9 de julho (31 dias no mês)', () => {
    const ctx: InsightContext = {
      ...BASE_CTX,
      today: '2026-07-09',
      currentMonth: '2026-07',
      transactions: [],
    };
    const result = computeForecast(ctx);
    expect(result.daysRemaining).toBe(31 - 9); // 22
  });

  it('projeta despesa extra baseado no burn rate diário', () => {
    // 9000 centavos em 9 dias → burn 1000/dia; 22 dias restantes → +22000
    const ctx: InsightContext = {
      ...BASE_CTX,
      transactions: [
        tx({ value_cents: 9000, type: 'saida', date: '2026-07-05', category: 'Lazer' }),
      ],
    };
    const result = computeForecast(ctx);
    expect(result.projectedExpenseCents).toBe(9000 + 22000); // 31000
  });

  it('projectedIncomeCents soma apenas receitas do mês corrente', () => {
    const ctx: InsightContext = {
      ...BASE_CTX,
      transactions: [
        tx({ value_cents: 50000, type: 'entrada', date: '2026-07-01' }),
        tx({ value_cents: 50000, type: 'entrada', date: '2026-06-01' }), // outro mês
      ],
    };
    const result = computeForecast(ctx);
    expect(result.projectedIncomeCents).toBe(50000);
  });

  it('projectedBalanceCents é negativo quando despesas excedem receitas', () => {
    const ctx: InsightContext = {
      ...BASE_CTX,
      transactions: [
        tx({ value_cents: 100000, type: 'saida', date: '2026-07-05', category: 'Lazer' }),
      ],
    };
    const result = computeForecast(ctx);
    expect(result.projectedBalanceCents).toBeLessThan(0);
  });

  it('ignora pagamentos de fatura (isConsumptionExpenseTx = false)', () => {
    const ctx: InsightContext = {
      ...BASE_CTX,
      transactions: [
        tx({ value_cents: 10000, type: 'saida', date: '2026-07-01', paidInvoiceMonth: '2026-06' }),
      ],
    };
    const result = computeForecast(ctx);
    // paidInvoiceMonth → isConsumptionExpenseTx = false → não conta como despesa
    expect(result.projectedExpenseCents).toBe(0);
  });
});

// ─── computeKPIs ─────────────────────────────────────────────────────────────

describe('computeKPIs', () => {
  it('netWorthCents = ativos − passivos de contas', () => {
    const ctx: InsightContext = {
      ...BASE_CTX,
      accounts: [
        account({ type: 'corrente',   balance: 100000 }),
        account({ type: 'investimento', balance: 50000 }),
        account({ type: 'divida',     balance: 30000 }),
      ],
      transactions: [],
    };
    const result = computeKPIs(ctx);
    expect(result.netWorthCents).toBe(100000 + 50000 - 30000);
  });

  it('cardOpenInvoicesCents reduz o net worth', () => {
    const ctx: InsightContext = {
      ...BASE_CTX,
      accounts: [account({ type: 'corrente', balance: 100000 })],
      cardOpenInvoicesCents: cents(20000),
      transactions: [],
    };
    const result = computeKPIs(ctx);
    expect(result.netWorthCents).toBe(100000 - 20000);
  });

  it('savingsRatePct = 0 quando não há receita', () => {
    const ctx: InsightContext = {
      ...BASE_CTX,
      accounts: [account({ type: 'corrente', balance: 5000 })],
      transactions: [
        tx({ value_cents: 3000, type: 'saida', date: '2026-07-01', category: 'Lazer' }),
      ],
    };
    const result = computeKPIs(ctx);
    expect(result.savingsRatePct).toBe(0);
  });

  it('savingsRatePct correto quando há receita', () => {
    // 10000 receita, 6000 despesa → 40% poupança
    const ctx: InsightContext = {
      ...BASE_CTX,
      accounts: [],
      transactions: [
        tx({ value_cents: 10000, type: 'entrada', date: '2026-07-01' }),
        tx({ value_cents: 6000,  type: 'saida',   date: '2026-07-05', category: 'Lazer' }),
      ],
    };
    const result = computeKPIs(ctx);
    expect(result.savingsRatePct).toBeCloseTo(40, 1);
  });

  it('conta poupanca conta como ativo', () => {
    const ctx: InsightContext = {
      ...BASE_CTX,
      accounts: [account({ type: 'poupanca', balance: 80000 })],
      transactions: [],
    };
    const result = computeKPIs(ctx);
    expect(result.netWorthCents).toBe(80000);
  });

  it('tx de outros meses não afeta KPIs do mês corrente', () => {
    const ctx: InsightContext = {
      ...BASE_CTX,
      accounts: [],
      transactions: [
        tx({ value_cents: 99999, type: 'saida', date: '2026-06-15', category: 'Lazer' }),
      ],
    };
    const result = computeKPIs(ctx);
    expect(result.monthlyExpenseCents).toBe(0);
  });
});
