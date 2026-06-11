import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { computeFinancialMetrics, useFinancialMetrics } from './useFinancialMetrics';
import type { Account, Transaction } from '../shared/types/transaction';
import type { Centavos } from '../shared/types/money';

const c = (value: number): Centavos => value as Centavos;

const mkTx = (overrides: Partial<Transaction>): Transaction => ({
  id: 'tx-test',
  description: 'Test',
  value_cents: c(0),
  schemaVersion: 2,
  type: 'saida',
  category: 'Diversos',
  date: '2026-04-01',
  ...overrides,
} as Transaction);

const mkAcc = (overrides: Partial<Account>): Account => ({
  id: 'acc-test',
  name: 'Conta',
  type: 'corrente',
  balance: c(0),
  schemaVersion: 2,
  ...overrides,
} as Account);

describe('computeFinancialMetrics - centavos canônicos', () => {
  it('calcula receitas, despesas e poupança a partir de value_cents', () => {
    const txs: Transaction[] = [
      mkTx({ id: '1', value_cents: c(500000), type: 'entrada', category: 'Salário' }),
      mkTx({ id: '2', value_cents: c(120000), type: 'saida', category: 'Moradia' }),
      mkTx({ id: '3', value_cents: c(30000), type: 'saida', category: 'Lazer' }),
    ];

    const metrics = computeFinancialMetrics(txs);

    expect(metrics.receita).toBe(5000);
    expect(metrics.despesa).toBe(1500);
    expect(metrics.ativos).toBe(5000);
    expect(metrics.passivos).toBe(1500);
    expect(metrics.taxaPoupanca).toBe(70);
  });

  it('métricas batem receitas - despesas no patrimônio legado sem contas', () => {
    const txs: Transaction[] = [
      mkTx({ id: '1', value_cents: c(100000), type: 'entrada' }),
      mkTx({ id: '2', value_cents: c(25000), type: 'saida' }),
    ];

    const metrics = computeFinancialMetrics(txs);

    expect(metrics.patrimonioLiquido).toBe(metrics.receita - metrics.despesa);
    expect(metrics.patrimonioLiquido).toBe(750);
  });

  it('usa accounts.balance em centavos para ativos/passivos quando contas existem', () => {
    const accounts: Account[] = [
      mkAcc({ id: 'a1', type: 'corrente', balance: c(100000) }),
      mkAcc({ id: 'a2', type: 'investimento', balance: c(250000) }),
      mkAcc({ id: 'a3', type: 'cartao', balance: c(-50000) }),
    ];

    const metrics = computeFinancialMetrics([], accounts);

    expect(metrics.ativos).toBe(3500);
    expect(metrics.passivos).toBe(500);
    expect(metrics.patrimonioLiquido).toBe(3000);
    expect(metrics.endividamento).toBe(12.5);
  });

  it('cardOpenInvoicesCents é subtraído do patrimônio líquido como passivo corrente', () => {
    const accounts: Account[] = [
      mkAcc({ id: 'a1', type: 'corrente',    balance: c(500000) }),  // R$ 5.000
      mkAcc({ id: 'a2', type: 'investimento', balance: c(300000) }), // R$ 3.000
    ];
    // Fatura aberta: R$ 200,00 = 20000 centavos
    const metrics = computeFinancialMetrics([], accounts, undefined, undefined, 20000);

    expect(metrics.ativos).toBe(8000);       // 5000 + 3000
    expect(metrics.passivos).toBe(200);      // 20000 centavos = R$ 200
    expect(metrics.patrimonioLiquido).toBe(7800); // 8000 - 200
  });

  it('cardOpenInvoicesCents zero não altera patrimônio líquido', () => {
    const accounts: Account[] = [
      mkAcc({ id: 'a1', type: 'corrente', balance: c(100000) }),
    ];
    const sem  = computeFinancialMetrics([], accounts);
    const zero = computeFinancialMetrics([], accounts, undefined, undefined, 0);
    expect(sem.patrimonioLiquido).toBe(zero.patrimonioLiquido);
    expect(sem.patrimonioLiquido).toBe(1000);
  });

  it('filtra por mês/ano sem depender de value legado', () => {
    const txs: Transaction[] = [
      mkTx({ id: '1', value_cents: c(500000), type: 'entrada', date: '2026-04-10' }),
      mkTx({ id: '2', value_cents: c(120000), type: 'saida', category: 'Moradia', date: '2026-04-15' }),
      mkTx({ id: '3', value_cents: c(900000), type: 'entrada', date: '2026-03-10' }),
    ];

    const metrics = computeFinancialMetrics(txs, [], 4, 2026);

    expect(metrics.receita).toBe(5000);
    expect(metrics.despesa).toBe(1200);
    expect(metrics.custoFixoMensal).toBe(1200);
    expect(metrics.comprometimento).toBe(24);
  });

  it('ignora value legado em documentos v2 sem value_cents', () => {
    const corrupt = mkTx({ id: '1', schemaVersion: 2, type: 'entrada' });
    delete corrupt.value_cents;
    corrupt.value = 999999;
    const metrics = computeFinancialMetrics([corrupt]);

    expect(metrics.receita).toBe(0);
  });

  it('transações fora do período não afetam métricas mensais', () => {
    const txs: Transaction[] = [
      mkTx({ id: '1', value_cents: c(200000), type: 'entrada', date: '2026-03-01' }),
    ];
    const metrics = computeFinancialMetrics(txs, [], 4, 2026);
    expect(metrics.receita).toBe(0);
    expect(metrics.despesa).toBe(0);
  });
});

// ─── Suite: useFinancialMetrics hook branches (uid vazio, sem dados) ──────────

describe('useFinancialMetrics — branches do hook', () => {

  it('retorna null quando uid está vazio', () => {
    const { result } = renderHook(() => useFinancialMetrics('', [], []));
    expect(result.current.metrics).toBeNull();
  });

  it('retorna null quando não há transações nem contas', () => {
    const { result } = renderHook(() => useFinancialMetrics('uid-1', [], []));
    expect(result.current.metrics).toBeNull();
  });

  it('computa métricas quando há apenas contas sem transações', () => {
    const accounts: Account[] = [
      mkAcc({ id: 'a1', type: 'corrente', balance: c(50000) }),
    ];
    const { result } = renderHook(() => useFinancialMetrics('uid-1', [], accounts));
    expect(result.current.metrics).not.toBeNull();
    expect(result.current.metrics!.ativos).toBe(500);
  });
});
