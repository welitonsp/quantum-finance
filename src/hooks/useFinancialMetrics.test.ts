import { describe, it, expect } from 'vitest';
import { computeFinancialMetrics } from './useFinancialMetrics';
import type { Transaction, Account } from '../shared/types/transaction';
import type { Centavos } from '../shared/types/money';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const c = (n: number): Centavos => n as Centavos;

const mkTx = (overrides: Partial<Transaction>): Transaction => ({
  id:          'tx-test',
  description: 'Test',
  value:       0,
  type:        'despesa',
  category:    'Diversos',
  date:        '2026-04-01',
  ...overrides,
} as Transaction);

const mkAcc = (overrides: Partial<Account>): Account => ({
  id:      'acc-test',
  name:    'Conta',
  type:    'corrente',
  balance: c(0),
  ...overrides,
} as Account);

// ─── Suite 1: cálculos básicos ────────────────────────────────────────────────

describe('computeFinancialMetrics — cálculos básicos', () => {
  it('soma receitas e despesas corretamente', () => {
    const txs: Transaction[] = [
      mkTx({ id: '1', value: 5000, type: 'receita', category: 'Salário' }),
      mkTx({ id: '2', value: 1000, type: 'despesa', category: 'Lazer' }),
      mkTx({ id: '3', value: 500,  type: 'despesa', category: 'Lazer' }),
    ];
    const m = computeFinancialMetrics(txs);
    expect(m.receita).toBe(5000);
    expect(m.despesa).toBe(1500);
  });

  it('aceita tipos `entrada` e `receita` como income', () => {
    const txs: Transaction[] = [
      mkTx({ id: '1', value: 100, type: 'entrada' }),
      mkTx({ id: '2', value: 200, type: 'receita' }),
    ];
    const m = computeFinancialMetrics(txs);
    expect(m.receita).toBe(300);
  });

  it('aceita tipos `saida` e `despesa` como expense', () => {
    const txs: Transaction[] = [
      mkTx({ id: '1', value: 100, type: 'saida' }),
      mkTx({ id: '2', value: 200, type: 'despesa' }),
    ];
    const m = computeFinancialMetrics(txs);
    expect(m.despesa).toBe(300);
  });

  it('values negativos são tratados como abs', () => {
    const txs: Transaction[] = [
      mkTx({ id: '1', value: -500, type: 'despesa' }),
    ];
    const m = computeFinancialMetrics(txs);
    expect(m.despesa).toBe(500);
  });

  it('retorna zeros para entrada vazia', () => {
    const m = computeFinancialMetrics([]);
    expect(m.receita).toBe(0);
    expect(m.despesa).toBe(0);
    expect(m.ativos).toBe(0);
    expect(m.passivos).toBe(0);
    expect(m.taxaPoupanca).toBe(0);
    expect(m.endividamento).toBe(0);
    expect(m.comprometimento).toBe(0);
    expect(m.reservaMeses).toBe(0);
  });

  it('filtra receitas e despesas pelo mes/ano selecionado', () => {
    const txs: Transaction[] = [
      mkTx({ id: '1', value: 5000, type: 'receita', category: 'Salario', date: '2026-04-10' }),
      mkTx({ id: '2', value: 1200, type: 'despesa', category: 'Moradia', date: '2026-04-15' }),
      mkTx({ id: '3', value: 9000, type: 'receita', category: 'Salario', date: '2026-03-10' }),
      mkTx({ id: '4', value: 4000, type: 'despesa', category: 'Moradia', date: '2025-04-15' }),
    ];

    const m = computeFinancialMetrics(txs, [], 4, 2026);

    expect(m.receita).toBe(5000);
    expect(m.despesa).toBe(1200);
    expect(m.custoFixoMensal).toBe(1200);
    expect(m.ativos).toBe(5000);
    expect(m.passivos).toBe(1200);
  });
});

// ─── Suite 2: ativos/passivos das CONTAS (correto) ────────────────────────────

describe('computeFinancialMetrics — ativos/passivos das contas', () => {
  it('ativos = soma de contas corrente/poupanca/investimento', () => {
    const accounts: Account[] = [
      mkAcc({ id: 'a1', type: 'corrente',     balance: c(100_000) }),  // R$ 1000
      mkAcc({ id: 'a2', type: 'poupanca',     balance: c(50_000) }),   // R$ 500
      mkAcc({ id: 'a3', type: 'investimento', balance: c(200_000) }),  // R$ 2000
    ];
    const m = computeFinancialMetrics([], accounts);
    expect(m.ativos).toBe(3500);
    expect(m.passivos).toBe(0);
  });

  it('passivos = soma absoluta de cartao/divida', () => {
    const accounts: Account[] = [
      mkAcc({ id: 'a1', type: 'cartao', balance: c(-150_000) }),   // R$ -1500
      mkAcc({ id: 'a2', type: 'divida', balance: c(-50_000) }),    // R$ -500
    ];
    const m = computeFinancialMetrics([], accounts);
    expect(m.ativos).toBe(0);
    expect(m.passivos).toBe(2000);   // valor absoluto
  });

  it('patrimônio líquido = ativos - passivos', () => {
    const accounts: Account[] = [
      mkAcc({ id: 'a1', type: 'corrente', balance: c(500_000) }),   // R$ 5000
      mkAcc({ id: 'a2', type: 'cartao',   balance: c(-100_000) }),  // R$ -1000
    ];
    const m = computeFinancialMetrics([], accounts);
    expect(m.patrimonioLiquido).toBe(4000);
  });

  it('fallback legado: sem accounts, usa soma de transações', () => {
    const txs: Transaction[] = [
      mkTx({ id: '1', value: 1000, type: 'receita' }),
      mkTx({ id: '2', value: 300,  type: 'despesa' }),
    ];
    const m = computeFinancialMetrics(txs);
    expect(m.ativos).toBe(1000);    // fallback = receita
    expect(m.passivos).toBe(300);   // fallback = despesa
  });
});

// ─── Suite 3: KPIs derivados ─────────────────────────────────────────────────

describe('computeFinancialMetrics — KPIs derivados', () => {
  it('taxaPoupanca = (receita - despesa) / receita * 100', () => {
    const txs: Transaction[] = [
      mkTx({ id: '1', value: 1000, type: 'receita' }),
      mkTx({ id: '2', value: 200,  type: 'despesa' }),
    ];
    const m = computeFinancialMetrics(txs);
    expect(m.taxaPoupanca).toBe(80);   // (1000 - 200) / 1000 * 100
  });

  it('endividamento = passivos / (ativos + passivos) * 100', () => {
    const accounts: Account[] = [
      mkAcc({ id: 'a1', type: 'corrente', balance: c(700_000) }),    // R$ 7000
      mkAcc({ id: 'a2', type: 'cartao',   balance: c(-300_000) }),   // R$ -3000
    ];
    const m = computeFinancialMetrics([], accounts);
    // 3000 / (7000 + 3000) * 100 = 30%
    expect(m.endividamento).toBe(30);
  });

  it('endividamento ALTO dispara alerta (>50%)', () => {
    const accounts: Account[] = [
      mkAcc({ id: 'a1', type: 'corrente', balance: c(100_000) }),    // R$ 1000
      mkAcc({ id: 'a2', type: 'cartao',   balance: c(-500_000) }),   // R$ -5000
    ];
    const m = computeFinancialMetrics([], accounts);
    // 5000 / 6000 * 100 ≈ 83.33%
    expect(m.endividamento).toBeGreaterThan(50);
  });

  it('comprometimento = custoFixoMensal / receita * 100', () => {
    const txs: Transaction[] = [
      mkTx({ id: '1', value: 5000, type: 'receita', category: 'Salário' }),
      mkTx({ id: '2', value: 2000, type: 'despesa', category: 'Moradia' }),
      mkTx({ id: '3', value: 500,  type: 'despesa', category: 'Lazer' }),
    ];
    const m = computeFinancialMetrics(txs);
    // 2000 (Moradia, fixo) / 5000 = 40%
    expect(m.comprometimento).toBe(40);
    // Lazer NÃO é categoria fixa → não soma em custoFixoMensal
    expect(m.custoFixoMensal).toBe(2000);
  });

  it('reservaMeses = ativos / custoFixoMensal', () => {
    const accounts: Account[] = [
      mkAcc({ id: 'a1', type: 'corrente', balance: c(1_200_000) }),   // R$ 12000
    ];
    const txs: Transaction[] = [
      mkTx({ id: '1', value: 2000, type: 'despesa', category: 'Moradia' }),
    ];
    const m = computeFinancialMetrics(txs, accounts);
    // 12000 / 2000 = 6 meses
    expect(m.reservaMeses).toBe(6);
  });
});

// ─── Suite 4: edge cases ──────────────────────────────────────────────────────

describe('computeFinancialMetrics — edge cases (proteção contra bugs)', () => {
  it('receita zero → taxaPoupanca não diverge (zero)', () => {
    const txs: Transaction[] = [
      mkTx({ id: '1', value: 100, type: 'despesa' }),
    ];
    const m = computeFinancialMetrics(txs);
    expect(m.taxaPoupanca).toBe(0);
    expect(Number.isFinite(m.taxaPoupanca)).toBe(true);
  });

  it('custoFixoMensal zero → reservaMeses não diverge (zero)', () => {
    const accounts: Account[] = [
      mkAcc({ id: 'a1', type: 'corrente', balance: c(100_000) }),
    ];
    const m = computeFinancialMetrics([], accounts);
    expect(m.reservaMeses).toBe(0);
    expect(Number.isFinite(m.reservaMeses)).toBe(true);
  });

  it('ativos + passivos = 0 → endividamento não diverge (zero)', () => {
    const m = computeFinancialMetrics([]);
    expect(m.endividamento).toBe(0);
    expect(Number.isFinite(m.endividamento)).toBe(true);
  });

  it('categoria com case diferente conta como fixa', () => {
    const txs: Transaction[] = [
      mkTx({ id: '1', value: 5000, type: 'receita' }),
      mkTx({ id: '2', value: 1000, type: 'despesa', category: 'MORADIA' }),
      mkTx({ id: '3', value: 500,  type: 'despesa', category: 'Saúde' }),
    ];
    const m = computeFinancialMetrics(txs);
    expect(m.custoFixoMensal).toBe(1500);
  });

  it('precisão financeira: soma de centavos não acumula drift', () => {
    const accounts: Account[] = [
      mkAcc({ id: 'a1', type: 'corrente', balance: c(1_010) }),   // R$ 10,10
      mkAcc({ id: 'a2', type: 'corrente', balance: c(2_020) }),   // R$ 20,20
      mkAcc({ id: 'a3', type: 'corrente', balance: c(3_010) }),   // R$ 30,10
    ];
    const m = computeFinancialMetrics([], accounts);
    // Soma exata: 60,40 (sem 60.39999999...)
    expect(m.ativos).toBe(60.4);
  });

  it('valores não-finitos (NaN, Infinity) são ignorados', () => {
    const txs: Transaction[] = [
      mkTx({ id: '1', value: NaN as unknown as number,      type: 'receita' }),
      mkTx({ id: '2', value: Infinity as unknown as number, type: 'despesa' }),
      mkTx({ id: '3', value: 100,                            type: 'receita' }),
    ];
    const m = computeFinancialMetrics(txs);
    expect(m.receita).toBe(100);
    expect(m.despesa).toBe(0);
  });
});

// ─── Suite 5: cenário "Saúde Financeira de Elite" (integração) ────────────────

describe('computeFinancialMetrics — cenário integração', () => {
  it('cenário ideal: alta poupança + baixo endividamento + reserva sólida', () => {
    const txs: Transaction[] = [
      mkTx({ id: '1', value: 10000, type: 'receita', category: 'Salário' }),
      mkTx({ id: '2', value: 2000,  type: 'despesa', category: 'Moradia' }),
      mkTx({ id: '3', value: 1000,  type: 'despesa', category: 'Lazer' }),
    ];
    const accounts: Account[] = [
      mkAcc({ id: 'a1', type: 'investimento', balance: c(5_000_000) }), // R$ 50000
      mkAcc({ id: 'a2', type: 'cartao',       balance: c(-100_000) }),  // R$ -1000
    ];
    const m = computeFinancialMetrics(txs, accounts);

    // Taxa poupança = (10000 - 3000) / 10000 = 70%
    expect(m.taxaPoupanca).toBe(70);
    // Endividamento = 1000 / (50000 + 1000) ≈ 1.96%
    expect(m.endividamento).toBeLessThan(5);
    // Comprometimento = 2000 / 10000 = 20%
    expect(m.comprometimento).toBe(20);
    // Reserva = 50000 / 2000 = 25 meses
    expect(m.reservaMeses).toBe(25);
    // Patrimônio = 50000 - 1000 = 49000
    expect(m.patrimonioLiquido).toBe(49000);

    // Disparam alertas QuantumInsights:
    // ✓ taxaPoupanca >= 20 (saudável)
    // ✓ endividamento < 30 (saudável)
    // → alerta "Saúde Financeira de Elite" deve aparecer
  });
});
