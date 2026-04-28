import { describe, it, expect } from 'vitest';
import { calcPatrimonyEvolution, calcPareto } from './reportEngine';
import type { Transaction, Account } from '../shared/types/transaction';
import type { Centavos } from '../shared/types/money';

const c = (n: number): Centavos => n as Centavos;

describe('calcPatrimonyEvolution - determinismo', () => {
  const FIXED_DATE = new Date('2026-04-26T12:00:00Z');

  it('mesmo input + mesma referenceDate produz output identico', () => {
    const accounts: Account[] = [
      { id: 'a1', name: 'Conta', type: 'corrente', balance: c(100_000) },
    ];

    const r1 = calcPatrimonyEvolution([], accounts, FIXED_DATE);
    const r2 = calcPatrimonyEvolution([], accounts, FIXED_DATE);

    expect(r1).toEqual(r2);
  });

  it('retorna 6 pontos de evolucao', () => {
    const accounts: Account[] = [
      { id: 'a1', name: 'C', type: 'corrente', balance: c(100_000) },
    ];

    const result = calcPatrimonyEvolution([], accounts, FIXED_DATE);

    expect(result).toHaveLength(6);
    expect(result[5]!.monthLabel).toBe('Atual');
  });

  it('nao muta accounts nem referenceDate', () => {
    const accounts: Account[] = [
      { id: 'a1', name: 'C', type: 'corrente', balance: c(100_000) },
    ];

    const refCopy = new Date(FIXED_DATE.getTime());

    calcPatrimonyEvolution([], accounts, FIXED_DATE);

    expect(FIXED_DATE.getTime()).toBe(refCopy.getTime());
  });
});

describe('calcPatrimonyEvolution - precisao financeira em centavos', () => {
  const FIXED_DATE = new Date('2026-04-26T12:00:00Z');

  it('soma de 3 contas em centavos nao tem drift float', () => {
    const accounts: Account[] = [
      { id: 'a1', name: 'C1', type: 'corrente', balance: c(1_010) },
      { id: 'a2', name: 'C2', type: 'corrente', balance: c(2_020) },
      { id: 'a3', name: 'C3', type: 'corrente', balance: c(3_010) },
    ];

    const result = calcPatrimonyEvolution([], accounts, FIXED_DATE);

    expect(result[5]!.patrimonio).toBe(60.4);
  });

  it('rebobina transacao de despesa do mes corretamente usando value legado em centavos', () => {
    const accounts: Account[] = [
      { id: 'a1', name: 'C', type: 'corrente', balance: c(10_000) },
    ];

    const transactions: Transaction[] = [
      {
        id: 't1',
        description: 'Despesa Abr',
        value: 3_000,
        type: 'despesa',
        category: 'Lazer',
        date: '2026-04-15',
      } as Transaction,
    ];

    const result = calcPatrimonyEvolution(transactions, accounts, FIXED_DATE);

    expect(result[5]!.patrimonio).toBe(100);
    expect(result[4]!.patrimonio).toBe(130);
  });

  it('rebobina receita do mes corretamente usando value legado em centavos', () => {
    const accounts: Account[] = [
      { id: 'a1', name: 'C', type: 'corrente', balance: c(10_000) },
    ];

    const transactions: Transaction[] = [
      {
        id: 't1',
        description: 'Receita Abr',
        value: 5_000,
        type: 'receita',
        category: 'Salário',
        date: '2026-04-15',
      } as Transaction,
    ];

    const result = calcPatrimonyEvolution(transactions, accounts, FIXED_DATE);

    expect(result[5]!.patrimonio).toBe(100);
    expect(result[4]!.patrimonio).toBe(50);
  });

  it('prioriza value_cents quando value e value_cents coexistem', () => {
    const accounts: Account[] = [
      { id: 'a1', name: 'C', type: 'corrente', balance: c(10_000) },
    ];

    const transactions: Transaction[] = [
      {
        id: 't1',
        description: 'Despesa Abr',
        value: 999_999,
        value_cents: c(3_000),
        type: 'saida',
        category: 'Lazer',
        date: '2026-04-15',
      } as Transaction,
    ];

    const result = calcPatrimonyEvolution(transactions, accounts, FIXED_DATE);

    expect(result[5]!.patrimonio).toBe(100);
    expect(result[4]!.patrimonio).toBe(130);
  });
});

describe('calcPareto - despesas por categoria', () => {
  it('retorna array vazio sem despesas', () => {
    expect(calcPareto([])).toEqual([]);
  });

  it('classifica top 20 corretamente', () => {
    const txs: Transaction[] = [
      {
        id: '1',
        description: 'A',
        value: 10_000,
        type: 'despesa',
        category: 'Alimentação',
        date: '2026-01-01',
      } as Transaction,
      {
        id: '2',
        description: 'B',
        value: 5_000,
        type: 'despesa',
        category: 'Transporte',
        date: '2026-01-02',
      } as Transaction,
      {
        id: '3',
        description: 'C',
        value: 1_000,
        type: 'despesa',
        category: 'Lazer',
        date: '2026-01-03',
      } as Transaction,
    ];

    const result = calcPareto(txs);

    expect(result).toHaveLength(3);
    expect(result[0]!.category).toBe('Alimentação');
    expect(result[0]!.isInTop20).toBe(true);
  });
});
