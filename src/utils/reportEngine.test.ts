import { describe, it, expect } from 'vitest';
import { calcPatrimonyEvolution, calcPareto } from './reportEngine';
import type { Transaction, Account } from '../shared/types/transaction';
import type { Centavos } from '../shared/types/money';

const c = (n: number): Centavos => n as Centavos;

describe('calcPatrimonyEvolution — determinismo', () => {
  const FIXED_DATE = new Date('2026-04-26T12:00:00Z');

  it('mesmo input + mesma referenceDate produz output idêntico', () => {
    const accounts: Account[] = [
      { id: 'a1', name: 'Conta', type: 'corrente', balance: c(100_000) },
    ];
    const r1 = calcPatrimonyEvolution([], accounts, FIXED_DATE);
    const r2 = calcPatrimonyEvolution([], accounts, FIXED_DATE);
    expect(r1).toEqual(r2);
  });

  it('retorna 6 pontos de evolução', () => {
    const accounts: Account[] = [
      { id: 'a1', name: 'C', type: 'corrente', balance: c(100_000) },
    ];
    const result = calcPatrimonyEvolution([], accounts, FIXED_DATE);
    expect(result).toHaveLength(6);
    expect(result[5]!.monthLabel).toBe('Atual');
  });

  it('não muta accounts nem referenceDate', () => {
    const accounts: Account[] = [
      { id: 'a1', name: 'C', type: 'corrente', balance: c(100_000) },
    ];
    const refCopy = new Date(FIXED_DATE.getTime());
    calcPatrimonyEvolution([], accounts, FIXED_DATE);
    expect(FIXED_DATE.getTime()).toBe(refCopy.getTime());
  });
});

describe('calcPatrimonyEvolution — precisão financeira (centavos)', () => {
  const FIXED_DATE = new Date('2026-04-26T12:00:00Z');

  it('soma de 3 contas em centavos não tem drift float', () => {
    // R$ 10,10 + R$ 20,20 + R$ 30,10 = R$ 60,40 EXATO
    const accounts: Account[] = [
      { id: 'a1', name: 'C1', type: 'corrente', balance: c(1_010) },
      { id: 'a2', name: 'C2', type: 'corrente', balance: c(2_020) },
      { id: 'a3', name: 'C3', type: 'corrente', balance: c(3_010) },
    ];
    const result = calcPatrimonyEvolution([], accounts, FIXED_DATE);
    // 'Atual' = índice 5 (último point.unshift)
    expect(result[5]!.patrimonio).toBe(60.4);
  });

  it('rebobina transação de despesa do mês corretamente', () => {
    // Saldo atual: R$ 100,00 (10000 centavos)
    // Em abril/2026 houve despesa de R$ 30,00 (3000 centavos)
    // Mês anterior (março): saldo deve ser R$ 130,00 (estava maior antes da despesa)
    const accounts: Account[] = [
      { id: 'a1', name: 'C', type: 'corrente', balance: c(10_000) },
    ];
    const transactions: Transaction[] = [
      {
        id: 't1', description: 'Despesa Abr', value: 3000,
        type: 'despesa', category: 'Lazer', date: '2026-04-15',
      } as Transaction,
    ];
    const result = calcPatrimonyEvolution(transactions, accounts, FIXED_DATE);
    expect(result[5]!.patrimonio).toBe(100);   // Atual (abril)
    expect(result[4]!.patrimonio).toBe(130);   // Março (rebobinou despesa)
  });

  it('rebobina receita do mês: saldo anterior é menor', () => {
    // Saldo atual: R$ 100,00. Receita de R$ 50,00 em abril.
    // Antes da receita (março): R$ 50,00.
    const accounts: Account[] = [
      { id: 'a1', name: 'C', type: 'corrente', balance: c(10_000) },
    ];
    const transactions: Transaction[] = [
      {
        id: 't1', description: 'Receita Abr', value: 5000,
        type: 'receita', category: 'Salário', date: '2026-04-15',
      } as Transaction,
    ];
    const result = calcPatrimonyEvolution(transactions, accounts, FIXED_DATE);
    expect(result[5]!.patrimonio).toBe(100);
    expect(result[4]!.patrimonio).toBe(50);
  });
});

describe('calcPareto — não-regressão (sem mudança nesta PR)', () => {
  it('retorna array vazio sem despesas', () => {
    expect(calcPareto([])).toEqual([]);
  });

  it('classifica top 20% corretamente', () => {
    const txs: Transaction[] = [
      { id: '1', description: 'A', value: 10000, type: 'despesa',
        category: 'Alimentação', date: '2026-01-01' } as Transaction,
      { id: '2', description: 'B', value: 5000, type: 'despesa',
        category: 'Transporte', date: '2026-01-02' } as Transaction,
      { id: '3', description: 'C', value: 1000, type: 'despesa',
        category: 'Lazer', date: '2026-01-03' } as Transaction,
    ];
    const result = calcPareto(txs);
    expect(result).toHaveLength(3);
    expect(result[0]!.category).toBe('Alimentação');
    expect(result[0]!.isInTop20).toBe(true);
  });
});
