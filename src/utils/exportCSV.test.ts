import { describe, expect, it } from 'vitest';
import type { Transaction } from '../shared/types/transaction';
import type { Centavos } from '../shared/types/money';
import { computeMonthlyReport, generateMonthlyReportCSV } from './exportCSV';

const cents = (n: number) => n as Centavos;

function tx(overrides: Partial<Transaction>): Transaction {
  return {
    id:            'tx-1',
    description:   'Test',
    value_cents:   cents(0),
    schemaVersion: 2,
    type:          'saida',
    category:      'Outros',
    date:          '2026-06-01',
    ...overrides,
  } as Transaction;
}

describe('computeMonthlyReport', () => {
  it('retorna zeros para lista vazia', () => {
    const r = computeMonthlyReport([], 2026, 6);
    expect(r.incomeCents).toBe(0);
    expect(r.expenseCents).toBe(0);
    expect(r.netCents).toBe(0);
    expect(r.savingsRate).toBe(0);
    expect(r.txCount).toBe(0);
    expect(r.transferCount).toBe(0);
    expect(r.topCategories).toHaveLength(0);
  });

  it('soma apenas transacoes do mes/ano solicitado', () => {
    const txs = [
      tx({ date: '2026-06-10', type: 'saida',   value_cents: cents(5000) }),
      tx({ date: '2026-05-10', type: 'saida',   value_cents: cents(9999) }), // outro mês
      tx({ date: '2026-07-01', type: 'entrada', value_cents: cents(9999) }), // outro mês
    ];
    const r = computeMonthlyReport(txs, 2026, 6);
    expect(r.txCount).toBe(1);
    expect(r.expenseCents).toBe(5000);
    expect(r.incomeCents).toBe(0);
  });

  it('exclui transacoes deletadas', () => {
    const txs = [
      tx({ date: '2026-06-01', type: 'saida', value_cents: cents(2000) }),
      tx({ date: '2026-06-02', type: 'saida', value_cents: cents(1000), isDeleted: true }),
    ];
    const r = computeMonthlyReport(txs, 2026, 6);
    expect(r.txCount).toBe(1);
    expect(r.expenseCents).toBe(2000);
  });

  it('computa receita, despesa e saldo net corretamente', () => {
    const txs = [
      tx({ date: '2026-06-01', type: 'entrada', value_cents: cents(10000) }),
      tx({ date: '2026-06-05', type: 'saida',   value_cents: cents(3000) }),
    ];
    const r = computeMonthlyReport(txs, 2026, 6);
    expect(r.incomeCents).toBe(10000);
    expect(r.expenseCents).toBe(3000);
    expect(r.netCents).toBe(7000);
  });

  it('calcula taxa de poupanca corretamente', () => {
    const txs = [
      tx({ date: '2026-06-01', type: 'entrada', value_cents: cents(10000) }),
      tx({ date: '2026-06-05', type: 'saida',   value_cents: cents(4000) }),
    ];
    const r = computeMonthlyReport(txs, 2026, 6);
    expect(r.savingsRate).toBeCloseTo(60, 1);
  });

  it('taxa de poupanca e zero quando nao ha receita', () => {
    const txs = [tx({ date: '2026-06-01', type: 'saida', value_cents: cents(5000) })];
    const r = computeMonthlyReport(txs, 2026, 6);
    expect(r.savingsRate).toBe(0);
  });

  it('conta transferencias separadamente e nao as soma como receita ou despesa', () => {
    const txs = [
      tx({ date: '2026-06-01', type: 'transferencia', value_cents: cents(5000) }),
      tx({ date: '2026-06-02', type: 'entrada',        value_cents: cents(2000) }),
    ];
    const r = computeMonthlyReport(txs, 2026, 6);
    expect(r.transferCount).toBe(1);
    expect(r.incomeCents).toBe(2000);
    expect(r.expenseCents).toBe(0);
    expect(r.txCount).toBe(2);
  });

  it('agrega gastos por categoria e retorna top 5 ordenado', () => {
    const txs = [
      tx({ date: '2026-06-01', type: 'saida', category: 'A', value_cents: cents(6000) }),
      tx({ date: '2026-06-01', type: 'saida', category: 'B', value_cents: cents(3000) }),
      tx({ date: '2026-06-01', type: 'saida', category: 'C', value_cents: cents(1000) }),
      tx({ date: '2026-06-01', type: 'saida', category: 'D', value_cents: cents(500) }),
      tx({ date: '2026-06-01', type: 'saida', category: 'E', value_cents: cents(300) }),
      tx({ date: '2026-06-01', type: 'saida', category: 'F', value_cents: cents(200) }),
    ];
    const r = computeMonthlyReport(txs, 2026, 6);
    expect(r.topCategories).toHaveLength(5);
    expect(r.topCategories[0]!.name).toBe('A');
    expect(r.topCategories[0]!.cents).toBe(6000);
    expect(r.topCategories[4]!.name).toBe('E');
  });

  it('percentual de categoria e relativo ao total de despesas', () => {
    const txs = [
      tx({ date: '2026-06-01', type: 'saida', category: 'X', value_cents: cents(5000) }),
      tx({ date: '2026-06-01', type: 'saida', category: 'Y', value_cents: cents(5000) }),
    ];
    const r = computeMonthlyReport(txs, 2026, 6);
    expect(r.topCategories[0]!.pct).toBeCloseTo(50, 0);
    expect(r.topCategories[1]!.pct).toBeCloseTo(50, 0);
  });

  it('aceita tipos legados entrada/saida e receita/despesa', () => {
    const txs = [
      tx({ date: '2026-06-01', type: 'receita', value_cents: cents(8000) }),
      tx({ date: '2026-06-02', type: 'despesa', value_cents: cents(2000) }),
    ];
    const r = computeMonthlyReport(txs, 2026, 6);
    expect(r.incomeCents).toBe(8000);
    expect(r.expenseCents).toBe(2000);
  });
});

describe('generateMonthlyReportCSV', () => {
  it('inclui BOM UTF-8 no inicio', () => {
    const csv = generateMonthlyReportCSV([], 2026, 6);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it('inclui linha do mes no cabecalho', () => {
    const csv = generateMonthlyReportCSV([], 2026, 6);
    expect(csv).toContain('junho de 2026');
  });

  it('inclui secoes SUMARIO, TOP CATEGORIAS e MOVIMENTACOES', () => {
    const csv = generateMonthlyReportCSV([], 2026, 6);
    expect(csv).toContain('SUMÁRIO');
    expect(csv).toContain('TOP CATEGORIAS');
    expect(csv).toContain('MOVIMENTAÇÕES DO PERÍODO');
  });

  it('reflete valores corretos no sumario', () => {
    const txs = [
      tx({ date: '2026-06-01', type: 'entrada', value_cents: cents(10000) }),
      tx({ date: '2026-06-02', type: 'saida',   value_cents: cents(3500) }),
    ];
    const csv = generateMonthlyReportCSV(txs, 2026, 6);
    expect(csv).toContain('100,00');
    expect(csv).toContain('35,00');
  });

  it('inclui linhas de transacoes no detalhe', () => {
    const txs = [
      tx({ date: '2026-06-15', type: 'saida', description: 'Supermercado', value_cents: cents(4500) }),
    ];
    const csv = generateMonthlyReportCSV(txs, 2026, 6);
    expect(csv).toContain('2026-06-15');
    expect(csv).toContain('Supermercado');
    expect(csv).toContain('45,00');
  });

  it('nao inclui transacoes de outros meses no detalhe', () => {
    const txs = [
      tx({ date: '2026-05-10', type: 'saida', description: 'Fora do mes', value_cents: cents(9999) }),
    ];
    const csv = generateMonthlyReportCSV(txs, 2026, 6);
    expect(csv).not.toContain('Fora do mes');
  });
});
