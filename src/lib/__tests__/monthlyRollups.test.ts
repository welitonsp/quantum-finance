import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  parseMonthRollup,
  selectAllTimeTotals,
  selectCumulativeNetCents,
  selectExpenseByCategory,
  selectMonthTotals,
  type RollupState,
} from '../monthlyRollups';
import { useDashboardData, useFinancialData } from '../../hooks/useFinancialData';
import type { Transaction } from '../../shared/types/transaction';
import type { Centavos } from '../../shared/types/money';

const C = (n: number) => n as Centavos;

function rollupDoc(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    incomeCents: 500_000,
    expenseCents: 120_000,
    invoicePaymentCents: 30_000,
    transferCents: 10_000,
    txCount: 5,
    expenseByCategory: { Alimentação: 80_000, Transporte: 40_000 },
    incomeByCategory: { Salário: 500_000 },
    byAccount: {
      conta_corrente: { incomeCents: 500_000, expenseCents: 100_000, invoicePaymentCents: 30_000, transferCents: 10_000, txCount: 4 },
      nubank: { incomeCents: 0, expenseCents: 20_000, invoicePaymentCents: 0, transferCents: 0, txCount: 1 },
    },
    needsRebuild: false,
    ...overrides,
  };
}

function state(months: Record<string, Record<string, unknown>>, ready = true): RollupState {
  const parsed: RollupState['months'] = {};
  for (const [id, data] of Object.entries(months)) {
    const m = parseMonthRollup(id, data);
    if (m) parsed[id] = m;
  }
  return { ready, months: parsed };
}

function tx(overrides: Partial<Transaction>): Transaction {
  return {
    id: Math.random().toString(36).slice(2),
    type: 'saida',
    value_cents: C(1000),
    category: 'Diversos',
    date: '2026-03-10',
    schemaVersion: 2,
    ...overrides,
  } as Transaction;
}

describe('parseMonthRollup', () => {
  it('aceita só ids YYYY-MM e lê totais', () => {
    expect(parseMonthRollup('_meta', rollupDoc())).toBeNull();
    expect(parseMonthRollup('2026-13', rollupDoc())).toBeNull();
    const m = parseMonthRollup('2026-03', rollupDoc())!;
    expect(m.incomeCents).toBe(500_000);
    expect(m.byAccount.nubank!.expenseCents).toBe(20_000);
    expect(m.needsRebuild).toBe(false);
  });

  it('marca needsRebuild quando há valor negativo ou não inteiro', () => {
    expect(parseMonthRollup('2026-03', rollupDoc({ expenseCents: -1 }))!.needsRebuild).toBe(true);
    expect(parseMonthRollup('2026-03', rollupDoc({ incomeCents: 10.5 }))!.needsRebuild).toBe(true);
  });
});

describe('seletores', () => {
  const s = state({ '2026-03': rollupDoc(), '2026-02': rollupDoc({ incomeCents: 100_000, expenseCents: 50_000 }) });

  it('selectMonthTotals: geral, por conta e mês sem documento = zero', () => {
    expect(selectMonthTotals(s, 'geral', 2026, 3)).toEqual({ incomeCents: 500_000, expenseCents: 120_000 });
    expect(selectMonthTotals(s, 'nubank', 2026, 3)).toEqual({ incomeCents: 0, expenseCents: 20_000 });
    expect(selectMonthTotals(s, 'geral', 2025, 1)).toEqual({ incomeCents: 0, expenseCents: 0 });
  });

  it('não confia nos rollups sem _meta (ready=false) ou com mês em needsRebuild', () => {
    expect(selectMonthTotals(state({ '2026-03': rollupDoc() }, false), 'geral', 2026, 3)).toBeNull();
    const broken = state({ '2026-03': rollupDoc({ needsRebuild: true }), '2026-02': rollupDoc() });
    expect(selectMonthTotals(broken, 'geral', 2026, 3)).toBeNull();
    expect(selectMonthTotals(broken, 'geral', 2026, 2)).not.toBeNull();
    expect(selectCumulativeNetCents(broken, 'geral')).toBeNull();
  });

  it('selectCumulativeNetCents soma receita − despesa de todo o histórico, sem transferência nem fatura', () => {
    expect(selectCumulativeNetCents(s, 'geral')).toBe((500_000 - 120_000) + (100_000 - 50_000));
  });

  it('selectExpenseByCategory só na visão geral', () => {
    expect(selectExpenseByCategory(s, 'geral', 2026, 3)).toEqual({ Alimentação: 80_000, Transporte: 40_000 });
    expect(selectExpenseByCategory(s, 'nubank', 2026, 3)).toBeNull();
  });
});

describe('useFinancialData com rollups (P-01)', () => {
  it('usa os rollups e ignora a janela parcial de transações carregadas', () => {
    const loaded = [tx({ type: 'entrada', value_cents: C(999) })]; // só 1 tx carregada no cliente
    const s = state({ '2026-03': rollupDoc() });
    const { result } = renderHook(() =>
      useFinancialData(loaded, 'geral', 3, 2026, [], [], undefined, s));
    const geral = result.current.moduleBalances['geral']!;
    expect(geral.receitas).toBe(5000);
    expect(geral.despesas).toBe(1200);
    expect(geral.saldo).toBe(3800);
    expect(result.current.categoryData.map(c => c.name)).toEqual(['Alimentação', 'Transporte']);
  });

  it('cai no cálculo legado quando os rollups não estão prontos', () => {
    const loaded = [tx({ type: 'entrada', value_cents: C(10_000) }), tx({ value_cents: C(4_000) })];
    const { result } = renderHook(() =>
      useFinancialData(loaded, 'geral', 3, 2026, [], [], undefined, state({}, false)));
    const geral = result.current.moduleBalances['geral']!;
    expect(geral.receitas).toBe(100);
    expect(geral.despesas).toBe(40);
    expect(geral.saldo).toBe(60);
  });

  it('legado: transferência e pagamento de fatura não contam como despesa nem reduzem o saldo', () => {
    const loaded = [
      tx({ type: 'entrada', value_cents: C(10_000) }),
      tx({ type: 'transferencia', value_cents: C(3_000) }),
      tx({ value_cents: C(2_000), paidInvoiceMonth: '2026-02' }),
      tx({ value_cents: C(1_000) }),
    ];
    const { result } = renderHook(() => useFinancialData(loaded, 'geral', 3, 2026));
    const geral = result.current.moduleBalances['geral']!;
    expect(geral.despesas).toBe(10);
    expect(geral.saldo).toBe(90);
  });
});

describe('painel (useDashboardData) com rollups (P-01)', () => {
  const s = state({
    '2025-12': rollupDoc({ expenseByCategory: { Alimentação: 30_000, Lazer: 90_000 } }),
    '2026-03': rollupDoc(),
  });

  it('selectAllTimeTotals soma todos os meses e não confia sem _meta ou com rebuild pendente', () => {
    expect(selectAllTimeTotals(s)).toEqual({
      incomeCents: 1_000_000,
      expenseCents: 240_000,
      expenseByCategory: { Alimentação: 110_000, Lazer: 90_000, Transporte: 40_000 },
    });
    expect(selectAllTimeTotals(state({ '2026-03': rollupDoc() }, false))).toBeNull();
    expect(selectAllTimeTotals(state({ '2026-03': rollupDoc({ needsRebuild: true }) }))).toBeNull();
  });

  it('saldo e período "Tudo" (KPIs e gráfico de categorias) vêm dos rollups', () => {
    const loaded = [tx({ type: 'entrada', value_cents: C(999) })];
    const { result } = renderHook(() => useDashboardData(loaded, false, [], s));
    expect(result.current.kpis.totalBalance).toBe(7600);
    act(() => result.current.setTimeRange('all'));
    expect(result.current.kpis.totalIncome).toBe(10_000);
    expect(result.current.kpis.totalExpense).toBe(2400);
    expect(result.current.categoryData.map(c => [c.name, c.value])).toEqual([
      ['Alimentação', 1100], ['Lazer', 900], ['Transporte', 400],
    ]);
  });

  it('legado: transferência não é despesa nem reduz o saldo do painel', () => {
    const loaded = [
      tx({ type: 'entrada', value_cents: C(10_000), date: new Date().toISOString().slice(0, 10) }),
      tx({ type: 'transferencia', value_cents: C(3_000), date: new Date().toISOString().slice(0, 10) }),
      tx({ value_cents: C(1_000), date: new Date().toISOString().slice(0, 10) }),
    ];
    const { result } = renderHook(() => useDashboardData(loaded, false));
    expect(result.current.kpis.totalBalance).toBe(90);
    expect(result.current.kpis.totalExpense).toBe(10);
  });
});
