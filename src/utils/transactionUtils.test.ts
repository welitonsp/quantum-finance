import { describe, expect, it } from 'vitest';
import type { Transaction } from '../shared/types/transaction';
import type { Centavos } from '../shared/types/money';
import { calculateRunningBalances } from './transactionUtils';

const cents = (value: number): Centavos => value as Centavos;

function tx(overrides: Partial<Transaction>): Transaction {
  return {
    id: 'tx-test',
    description: 'Movimentacao',
    value_cents: cents(0),
    schemaVersion: 2,
    type: 'saida',
    category: 'Outros',
    date: '2026-05-01',
    ...overrides,
  } as Transaction;
}

describe('calculateRunningBalances', () => {
  it('retorna estrutura vazia para lista vazia', () => {
    expect(calculateRunningBalances([])).toEqual({});
  });

  it('calcula receita e despesa em ordem cronologica', () => {
    const balances = calculateRunningBalances([
      tx({ id: 'income', type: 'entrada', value_cents: cents(10000), date: '2026-05-01' }),
      tx({ id: 'expense', type: 'saida', value_cents: cents(3500), date: '2026-05-02' }),
    ]);

    expect(balances.income).toBe(10000);
    expect(balances.expense).toBe(6500);
  });

  it('nao depende da ordem recebida no array', () => {
    const balances = calculateRunningBalances([
      tx({ id: 'expense', type: 'saida', value_cents: cents(3500), date: '2026-05-02' }),
      tx({ id: 'income', type: 'entrada', value_cents: cents(10000), date: '2026-05-01' }),
    ]);

    expect(balances.income).toBe(10000);
    expect(balances.expense).toBe(6500);
  });

  it('usa createdAt asc e id como desempate deterministico para datas iguais', () => {
    const balances = calculateRunningBalances([
      tx({ id: 'c', type: 'entrada', value_cents: cents(8000), date: '2026-05-01', createdAt: 3 }),
      tx({ id: 'b', type: 'entrada', value_cents: cents(5000), date: '2026-05-01', createdAt: 2 }),
      tx({ id: 'a', type: 'saida', value_cents: cents(1000), date: '2026-05-01', createdAt: 2 }),
    ]);

    expect(balances.a).toBe(-1000);
    expect(balances.b).toBe(4000);
    expect(balances.c).toBe(12000);
  });

  it('reduz o acumulado em saidas', () => {
    const balances = calculateRunningBalances([
      tx({ id: 'income', type: 'entrada', value_cents: cents(10000), date: '2026-05-01' }),
      tx({ id: 'expense', type: 'saida', value_cents: cents(4000), date: '2026-05-02' }),
    ]);

    expect(balances.expense).toBe(6000);
  });

  it('ignora transacoes marcadas como deletadas', () => {
    const balances = calculateRunningBalances([
      tx({ id: 'deleted', type: 'entrada', value_cents: cents(10000), isDeleted: true }),
      tx({ id: 'expense', type: 'saida', value_cents: cents(4000), date: '2026-05-02' }),
    ]);

    expect(balances.deleted).toBeUndefined();
    expect(balances.expense).toBe(-4000);
  });

  it('nao muta o array original', () => {
    const transactions = [
      tx({ id: 'later', date: '2026-05-02', value_cents: cents(2000) }),
      tx({ id: 'older', date: '2026-05-01', value_cents: cents(1000) }),
    ];
    const before = transactions.map(item => item.id);

    calculateRunningBalances(transactions);

    expect(transactions.map(item => item.id)).toEqual(before);
  });

  it('usa apenas value_cents e nao deriva de value legado', () => {
    const legacyOnly = tx({ id: 'legacy-only', type: 'entrada', value: 999999, date: '2026-05-02' });
    delete legacyOnly.value_cents;

    const balances = calculateRunningBalances([
      tx({ id: 'canonical', type: 'entrada', value: 999999, value_cents: cents(100), date: '2026-05-01' }),
      legacyOnly,
    ]);

    expect(balances.canonical).toBe(100);
    expect(balances['legacy-only']).toBe(100);
  });
});
