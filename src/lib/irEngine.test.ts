import { describe, it, expect } from 'vitest';
import { gerarInformeIR, anosDisponiveis, exportarInformeCSV } from './irEngine';
import type { Transaction } from '../shared/types/transaction';
import type { Centavos } from '../shared/types/money';

function makeTx(overrides: Partial<Transaction> & { value_cents: Centavos }): Transaction {
  return {
    id: crypto.randomUUID(),
    description: 'Test',
    type: 'entrada',
    category: 'Salário',
    date: '2024-06-01',
    isDeleted: false,
    ...overrides,
  } as Transaction;
}

// ──────────────────────────────────────────────
// anosDisponiveis
// ──────────────────────────────────────────────

describe('anosDisponiveis', () => {
  it('returns distinct years sorted descending', () => {
    const txs = [
      makeTx({ value_cents: 100 as Centavos, date: '2023-01-01' }),
      makeTx({ value_cents: 100 as Centavos, date: '2024-06-15' }),
      makeTx({ value_cents: 100 as Centavos, date: '2024-12-31' }),
      makeTx({ value_cents: 100 as Centavos, date: '2022-03-10' }),
    ];
    expect(anosDisponiveis(txs)).toEqual([2024, 2023, 2022]);
  });

  it('ignores deleted transactions', () => {
    const txs = [
      makeTx({ value_cents: 100 as Centavos, date: '2024-01-01' }),
      makeTx({ value_cents: 100 as Centavos, date: '2020-01-01', isDeleted: true }),
    ];
    expect(anosDisponiveis(txs)).toEqual([2024]);
  });

  it('returns empty for no transactions', () => {
    expect(anosDisponiveis([])).toEqual([]);
  });
});

// ──────────────────────────────────────────────
// gerarInformeIR — rendimentos básicos
// ──────────────────────────────────────────────

describe('gerarInformeIR — rendimentos', () => {
  it('aggregates salary transactions', () => {
    const txs = [
      makeTx({ value_cents: 500000 as Centavos, category: 'Salário', date: '2024-01-01' }),
      makeTx({ value_cents: 500000 as Centavos, category: 'Salário', date: '2024-02-01' }),
    ];
    const informe = gerarInformeIR(txs, 2024);
    const salario = informe.rendimentos.find((r) => r.category === 'salario');
    expect(salario?.totalCents).toBe(1000000);
    expect(salario?.transactionCount).toBe(2);
  });

  it('aggregates freelance transactions', () => {
    const txs = [
      makeTx({ value_cents: 200000 as Centavos, category: 'Freelance', date: '2024-03-10' }),
    ];
    const informe = gerarInformeIR(txs, 2024);
    const freelance = informe.rendimentos.find((r) => r.category === 'freelance');
    expect(freelance?.totalCents).toBe(200000);
  });

  it('aggregates investimento rendimento', () => {
    const txs = [
      makeTx({ value_cents: 50000 as Centavos, category: 'Investimento', date: '2024-05-01' }),
    ];
    const informe = gerarInformeIR(txs, 2024);
    const inv = informe.rendimentos.find((r) => r.category === 'investimento_rendimento');
    expect(inv?.totalCents).toBe(50000);
  });

  it('ignores saida transactions', () => {
    const txs = [
      makeTx({ value_cents: 100000 as Centavos, category: 'Salário', type: 'saida', date: '2024-01-01' }),
    ];
    const informe = gerarInformeIR(txs, 2024);
    expect(informe.rendimentos).toHaveLength(0);
    expect(informe.totalTributavelCents).toBe(0);
  });

  it('ignores deleted transactions', () => {
    const txs = [
      makeTx({ value_cents: 100000 as Centavos, category: 'Salário', isDeleted: true, date: '2024-01-01' }),
    ];
    const informe = gerarInformeIR(txs, 2024);
    expect(informe.totalTributavelCents).toBe(0);
  });

  it('ignores transactions from different year', () => {
    const txs = [
      makeTx({ value_cents: 300000 as Centavos, category: 'Salário', date: '2023-12-31' }),
    ];
    const informe = gerarInformeIR(txs, 2024);
    expect(informe.rendimentos).toHaveLength(0);
  });

  it('computes totalTributavelCents correctly', () => {
    const txs = [
      makeTx({ value_cents: 300000 as Centavos, category: 'Salário', date: '2024-01-01' }),
      makeTx({ value_cents: 100000 as Centavos, category: 'Freelance', date: '2024-02-01' }),
    ];
    const informe = gerarInformeIR(txs, 2024);
    expect(informe.totalTributavelCents).toBe(400000);
  });

  it('returns zero IR devido when no ganho de capital', () => {
    const txs = [
      makeTx({ value_cents: 500000 as Centavos, category: 'Salário', date: '2024-01-01' }),
    ];
    const informe = gerarInformeIR(txs, 2024);
    expect(informe.totalIRDevidoCents).toBe(0);
    expect(informe.aliquotaEfetiva).toBe(0);
  });

  it('categorizes outros tributaveis for unknown income category', () => {
    const txs = [
      makeTx({ value_cents: 80000 as Centavos, category: 'Diversos', date: '2024-04-01' }),
    ];
    const informe = gerarInformeIR(txs, 2024);
    const outros = informe.rendimentos.find((r) => r.category === 'outros_tributaveis');
    expect(outros?.totalCents).toBe(80000);
  });
});

// ──────────────────────────────────────────────
// gerarInformeIR — ganho de capital
// ──────────────────────────────────────────────

describe('gerarInformeIR — ganho de capital', () => {
  it('computes capital gain with 15% tax', () => {
    const txs = [
      makeTx({
        description: 'Ações PETR4',
        value_cents: 100000 as Centavos,
        type: 'saida',
        category: 'Investimento',
        tags: ['compra-ativo'],
        date: '2024-02-01',
      }),
      makeTx({
        description: 'Ações PETR4',
        value_cents: 150000 as Centavos,
        type: 'entrada',
        category: 'Investimento',
        tags: ['venda-ativo'],
        date: '2024-08-01',
      }),
    ];
    const informe = gerarInformeIR(txs, 2024);
    expect(informe.ganhoCapital).toHaveLength(1);
    const gc = informe.ganhoCapital[0]!;
    expect(gc.gainCents).toBe(50000);
    expect(gc.irDevidoCents).toBe(7500); // 50000 × 0.15
    expect(informe.totalIRDevidoCents).toBe(7500);
  });

  it('records prejuizo (negative gain) with zero IR', () => {
    const txs = [
      makeTx({
        description: 'Fundo X',
        value_cents: 200000 as Centavos,
        type: 'saida',
        tags: ['compra-ativo'],
        date: '2024-01-01',
      }),
      makeTx({
        description: 'Fundo X',
        value_cents: 150000 as Centavos,
        type: 'entrada',
        tags: ['venda-ativo'],
        date: '2024-06-01',
      }),
    ];
    const informe = gerarInformeIR(txs, 2024);
    expect(informe.ganhoCapital[0]!.gainCents).toBe(-50000);
    expect(informe.ganhoCapital[0]!.irDevidoCents).toBe(0);
  });

  it('handles multiple assets independently', () => {
    const txs = [
      makeTx({ description: 'Ativo A', value_cents: 50000 as Centavos, type: 'saida', tags: ['compra-ativo'], date: '2024-01-01' }),
      makeTx({ description: 'Ativo A', value_cents: 80000 as Centavos, type: 'entrada', tags: ['venda-ativo'], date: '2024-06-01' }),
      makeTx({ description: 'Ativo B', value_cents: 30000 as Centavos, type: 'saida', tags: ['compra-ativo'], date: '2024-02-01' }),
      makeTx({ description: 'Ativo B', value_cents: 40000 as Centavos, type: 'entrada', tags: ['venda-ativo'], date: '2024-07-01' }),
    ];
    const informe = gerarInformeIR(txs, 2024);
    expect(informe.ganhoCapital).toHaveLength(2);
    const totalIR = informe.totalIRDevidoCents;
    // A: 30000 × 0.15 = 4500; B: 10000 × 0.15 = 1500 → total 6000
    expect(totalIR).toBe(6000);
  });

  it('venda-ativo sem compra correspondente usa custo zero', () => {
    const txs = [
      makeTx({ description: 'CRI X', value_cents: 100000 as Centavos, type: 'entrada', tags: ['venda-ativo'], date: '2024-05-01' }),
    ];
    const informe = gerarInformeIR(txs, 2024);
    expect(informe.ganhoCapital[0]!.costCents).toBe(0);
    expect(informe.ganhoCapital[0]!.gainCents).toBe(100000);
  });
});

// ──────────────────────────────────────────────
// exportarInformeCSV
// ──────────────────────────────────────────────

describe('exportarInformeCSV', () => {
  it('includes ano in header', () => {
    const txs = [makeTx({ value_cents: 100000 as Centavos, category: 'Salário', date: '2024-01-01' })];
    const csv = exportarInformeCSV(gerarInformeIR(txs, 2024));
    expect(csv).toContain('2024');
  });

  it('contains rendimento data', () => {
    const txs = [makeTx({ value_cents: 500000 as Centavos, category: 'Salário', date: '2024-01-01' })];
    const csv = exportarInformeCSV(gerarInformeIR(txs, 2024));
    expect(csv).toContain('Salários e Pró-labore');
    expect(csv).toContain('5000,00');
  });

  it('contains capital gain section when present', () => {
    const txs = [
      makeTx({ description: 'Ativo A', value_cents: 10000 as Centavos, type: 'saida', tags: ['compra-ativo'], date: '2024-01-01' }),
      makeTx({ description: 'Ativo A', value_cents: 20000 as Centavos, type: 'entrada', tags: ['venda-ativo'], date: '2024-06-01' }),
    ];
    const csv = exportarInformeCSV(gerarInformeIR(txs, 2024));
    expect(csv).toContain('Ganhos de Capital');
    expect(csv).toContain('ativo a');
  });

  it('omits capital gain section when absent', () => {
    const txs = [makeTx({ value_cents: 100000 as Centavos, category: 'Salário', date: '2024-01-01' })];
    const csv = exportarInformeCSV(gerarInformeIR(txs, 2024));
    expect(csv).not.toContain('Ganhos de Capital');
  });

  it('uses comma as decimal separator', () => {
    const txs = [makeTx({ value_cents: 123456 as Centavos, category: 'Salário', date: '2024-01-01' })];
    const csv = exportarInformeCSV(gerarInformeIR(txs, 2024));
    expect(csv).toContain('1234,56');
    expect(csv).not.toMatch(/\d\.\d{2}"/);
  });
});
