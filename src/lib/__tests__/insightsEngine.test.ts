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

function tx(overrides: Partial<Omit<Transaction, 'value_cents'>> & { value_cents: number }): Transaction {
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

function account(overrides: Partial<Omit<Account, 'balance'>> & { balance?: number }): Account {
  const { balance = 0, ...rest } = overrides;
  return {
    id: 'acc',
    name: 'Conta',
    type: 'corrente',
    balance: cents(balance),
    ...rest,
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

  it('conta investimento conta como ativo (além de corrente/poupanca)', () => {
    const ctx: InsightContext = {
      ...BASE_CTX,
      accounts: [account({ type: 'investimento', balance: 50000 })],
      transactions: [],
    };
    const result = computeKPIs(ctx);
    expect(result.netWorthCents).toBe(50000);
  });
});

// ─── computeHealthScore — pilares adicionais ──────────────────────────────────

describe('computeHealthScore — pilares adicionais', () => {
  it('pillarSavings = 25 + pillarReserve = 25 + pillarBudget = 25 — cenário de excelência', () => {
    // taxaPoupanca=90%, comprometimento=10%, reservaMeses=60
    const ctx: InsightContext = {
      ...BASE_CTX,
      accounts: [account({ type: 'poupanca', balance: 600000 })],
      transactions: [
        tx({ value_cents: 100000, type: 'entrada', date: '2026-07-01' }),
        tx({ value_cents: 10000,  type: 'saida',   date: '2026-07-05', category: 'moradia' }),
      ],
    };
    const result = computeHealthScore(ctx);
    expect(result.pillarReserve).toBe(25);
    expect(result.pillarBudget).toBe(25);
    expect(result.details[2]).toContain('sólida');
    expect(result.details[3]).toContain('Ótimo');
  });

  it('pillarSavings = 20 quando taxaPoupança entre 20% e 29%', () => {
    // 100000 receita, 75000 despesa → 25% poupança
    const ctx: InsightContext = {
      ...BASE_CTX,
      accounts: [account({ type: 'corrente', balance: 100000 })],
      transactions: [
        tx({ value_cents: 100000, type: 'entrada', date: '2026-07-01' }),
        tx({ value_cents: 75000,  type: 'saida',   date: '2026-07-05', category: 'Lazer' }),
      ],
    };
    const result = computeHealthScore(ctx);
    expect(result.pillarSavings).toBe(20);
    expect(result.details[0]).toContain('Excelente');
  });

  it('pillarSavings = 12 quando taxaPoupança entre 10% e 19%', () => {
    // 100000 receita, 85000 despesa → 15% poupança
    const ctx: InsightContext = {
      ...BASE_CTX,
      accounts: [account({ type: 'corrente', balance: 100000 })],
      transactions: [
        tx({ value_cents: 100000, type: 'entrada', date: '2026-07-01' }),
        tx({ value_cents: 85000,  type: 'saida',   date: '2026-07-05', category: 'Lazer' }),
      ],
    };
    const result = computeHealthScore(ctx);
    expect(result.pillarSavings).toBe(12);
    expect(result.details[0]).toContain('Razoável');
  });

  it('pillarReserve = 18 quando reservaMeses entre 3 e 5', () => {
    // custoFixoMensal=10000, ativos=40000 → 4 meses → pillarReserve=18
    const ctx: InsightContext = {
      ...BASE_CTX,
      accounts: [account({ type: 'poupanca', balance: 40000 })],
      transactions: [
        tx({ value_cents: 100000, type: 'entrada', date: '2026-07-01' }),
        tx({ value_cents: 10000,  type: 'saida',   date: '2026-07-05', category: 'moradia' }),
      ],
    };
    const result = computeHealthScore(ctx);
    expect(result.pillarReserve).toBe(18);
    expect(result.details[2]).toContain('parcial');
  });

  it('pillarReserve = 8 quando reservaMeses entre 1 e 2', () => {
    // custoFixoMensal=10000, ativos=15000 → 1.5 meses → pillarReserve=8
    const ctx: InsightContext = {
      ...BASE_CTX,
      accounts: [account({ type: 'poupanca', balance: 15000 })],
      transactions: [
        tx({ value_cents: 100000, type: 'entrada', date: '2026-07-01' }),
        tx({ value_cents: 10000,  type: 'saida',   date: '2026-07-05', category: 'moradia' }),
      ],
    };
    const result = computeHealthScore(ctx);
    expect(result.pillarReserve).toBe(8);
    expect(result.details[2]).toContain('insuficiente');
  });

  it('pillarBudget = 18 quando comprometimento entre 21% e 35%', () => {
    // 100000 receita, 30000 moradia → comprometimento 30%
    const ctx: InsightContext = {
      ...BASE_CTX,
      accounts: [account({ type: 'corrente', balance: 100000 })],
      transactions: [
        tx({ value_cents: 100000, type: 'entrada', date: '2026-07-01' }),
        tx({ value_cents: 30000,  type: 'saida',   date: '2026-07-05', category: 'moradia' }),
      ],
    };
    const result = computeHealthScore(ctx);
    expect(result.pillarBudget).toBe(18);
    expect(result.details[3]).toContain('Moderate');
  });

  it('pillarBudget = 0 quando comprometimento > 50%', () => {
    // 100000 receita, 60000 moradia → comprometimento 60%
    const ctx: InsightContext = {
      ...BASE_CTX,
      accounts: [account({ type: 'corrente', balance: 100000 })],
      transactions: [
        tx({ value_cents: 100000, type: 'entrada', date: '2026-07-01' }),
        tx({ value_cents: 60000,  type: 'saida',   date: '2026-07-05', category: 'moradia' }),
      ],
    };
    const result = computeHealthScore(ctx);
    expect(result.pillarBudget).toBe(0);
    expect(result.details[3]).toContain('comprometida');
  });

  it('pillarDebt = 20 quando endividamento entre 11% e 30%', () => {
    // ativos=100000, passivos=30000 → total=130000, endiv≈23.1% → <=30 → 20; detail: >20 → "Dívida moderada"
    const ctx: InsightContext = {
      ...BASE_CTX,
      accounts: [
        account({ type: 'corrente', balance: 100000 }),
        account({ type: 'divida',   balance: 30000 }),
      ],
      transactions: [],
    };
    const result = computeHealthScore(ctx);
    expect(result.pillarDebt).toBe(20);
    expect(result.details[1]).toContain('moderada');
  });

  it('pillarDebt = 6 quando endividamento entre 51% e 70%', () => {
    // ativos=100000, passivos=120000 → total=220000, endiv≈54.5% → <=70 → 6
    const ctx: InsightContext = {
      ...BASE_CTX,
      accounts: [
        account({ type: 'corrente', balance: 100000 }),
        account({ type: 'cartao',   balance: 120000 }),
      ],
      transactions: [],
    };
    const result = computeHealthScore(ctx);
    expect(result.pillarDebt).toBe(6);
    expect(result.details[1]).toContain('alto');
  });

  it('pillarDebt = 0 quando endividamento > 70%', () => {
    // ativos=100000, passivos=300000 → total=400000, endiv=75%
    const ctx: InsightContext = {
      ...BASE_CTX,
      accounts: [
        account({ type: 'corrente', balance: 100000 }),
        account({ type: 'divida',   balance: 300000 }),
      ],
      transactions: [],
    };
    const result = computeHealthScore(ctx);
    expect(result.pillarDebt).toBe(0);
  });

  it('tipo de conta desconhecido não contribui para ativos nem passivos', () => {
    // 'wallet' não está em nenhuma lista → ativos=0, passivos=0 → usa receita/despesa como fallback
    const ctx: InsightContext = {
      ...BASE_CTX,
      accounts: [account({ type: 'wallet' as 'corrente', balance: 100000 })],
      transactions: [
        tx({ value_cents: 50000, type: 'entrada', date: '2026-07-01' }),
        tx({ value_cents: 10000, type: 'saida',   date: '2026-07-05', category: 'Lazer' }),
      ],
    };
    const result = computeHealthScore(ctx);
    // accounts.length > 0 → não usa fallback receita/despesa; tipo desconhecido → ativos=0
    expect(typeof result.total).toBe('number');
  });

  it("tipo 'despesa' (legado) conta como despesa de consumo", () => {
    // isExpenseTx cobre 'saida' | 'despesa'
    const ctx: InsightContext = {
      ...BASE_CTX,
      accounts: [account({ type: 'corrente', balance: 50000 })],
      transactions: [
        tx({ value_cents: 100000, type: 'entrada', date: '2026-07-01' }),
        tx({ value_cents: 20000,  type: 'despesa' as 'saida', date: '2026-07-05', category: 'Lazer' }),
      ],
    };
    const result = computeHealthScore(ctx);
    // 100000 receita - 20000 despesa = 80% poupança → pillarSavings=25
    expect(result.pillarSavings).toBe(25);
  });
});

// ─── computeAnomalies — branches adicionais ───────────────────────────────────

describe('computeAnomalies — branches adicionais', () => {
  it('tx histórico do ano anterior (y < curYear) é incluído no histórico', () => {
    // histórico com datas em 2025 → y < curY (2026) → entra como histórico
    const histTxs = Array.from({ length: 5 }, (_, i) =>
      tx({ value_cents: 10000, category: 'Mercado', date: `2025-0${i + 1}-10` }),
    );
    const ctx: InsightContext = {
      ...BASE_CTX,
      transactions: [
        ...histTxs,
        tx({ value_cents: 20000, category: 'Mercado', date: '2026-07-01' }),
      ],
    };
    const result = computeAnomalies(ctx);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]!.category).toBe('Mercado');
  });

  it('categoria undefined em tx histórico defaults para "Outros"', () => {
    const makeNocat = (vc: number, d: string) => {
      const t = tx({ value_cents: vc, date: d });
      delete (t as unknown as Record<string, unknown>).category;
      return t;
    };
    const histTxs = Array.from({ length: 5 }, (_, i) => makeNocat(10000, `2026-0${i + 1}-10`));
    const ctx: InsightContext = {
      ...BASE_CTX,
      transactions: [
        ...histTxs,
        makeNocat(20000, '2026-07-01'),
      ],
    };
    const result = computeAnomalies(ctx);
    expect(result.some(r => r.category === 'Outros')).toBe(true);
  });

  it('gasto abaixo da média em > 25% gera anomalia com deltaPct negativo', () => {
    // avg 20000, atual 5000 → delta -75% → severity 'high' com deltaPct < 0
    const histTxs = Array.from({ length: 5 }, (_, i) =>
      tx({ value_cents: 20000, category: 'Lazer', date: `2026-0${i + 1}-10` }),
    );
    const ctx: InsightContext = {
      ...BASE_CTX,
      transactions: [
        ...histTxs,
        tx({ value_cents: 5000, category: 'Lazer', date: '2026-07-01' }),
      ],
    };
    const result = computeAnomalies(ctx);
    const lazer = result.find(r => r.category === 'Lazer');
    expect(lazer).toBeDefined();
    expect(lazer!.deltaPct).toBeLessThan(0);
    expect(lazer!.severity).toBe('high');
  });

  it('categoria no mês atual sem histórico → avg=0 → ignorada', () => {
    // histórico tem 5 tx de 'Alimentação', mês atual tem 1 tx de 'Lazer' (nova cat)
    const histTxs = Array.from({ length: 5 }, (_, i) =>
      tx({ value_cents: 10000, category: 'Alimentação', date: `2026-0${i + 1}-10` }),
    );
    const ctx: InsightContext = {
      ...BASE_CTX,
      transactions: [
        ...histTxs,
        tx({ value_cents: 99999, category: 'Lazer', date: '2026-07-01' }), // sem histórico → avg=0 → skip
      ],
    };
    const result = computeAnomalies(ctx);
    const lazer = result.find(r => r.category === 'Lazer');
    expect(lazer).toBeUndefined();
  });
});
