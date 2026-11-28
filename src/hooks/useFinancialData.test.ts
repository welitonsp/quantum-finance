import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';

import { useFinancialData } from './useFinancialData';
import type { Transaction } from '../shared/types/transaction';
import type { Centavos } from '../shared/types/money';

function tx(over: Partial<Transaction>): Transaction {
  return { id: Math.random().toString(36), description: 'x', type: 'saida', category: 'Outros', date: '2026-03-10', ...over } as Transaction;
}

const c = (n: number) => n as Centavos;

describe('useFinancialData — saldo e totais do mês', () => {
  const txs = [
    tx({ type: 'entrada', value_cents: c(500000), date: '2026-03-05' }),
    tx({ type: 'saida', value_cents: c(12345) }),
    tx({ type: 'transferencia', value_cents: c(100000), fromAccountId: 'a1', toAccountId: 'a2' }),
    tx({ type: 'saida', value_cents: c(80000), paidInvoiceMonth: '2026-02' }),
  ];

  it('transferência entre contas próprias não é despesa nem reduz o saldo', () => {
    const { result } = renderHook(() => useFinancialData(txs, 'geral', 3, 2026));
    const g = result.current.moduleBalances.geral!;
    expect(g.receitas).toBe(5000);
    expect(g.despesas).toBe(123.45);
    expect(g.saldo).toBe(4876.55);
  });

  it('com totais do servidor, usa-os no lugar da soma local', () => {
    const server = { incomeCents: c(900000), expenseCents: c(100000), netAllCents: c(1234500) };
    const { result } = renderHook(() =>
      useFinancialData(txs, 'geral', 3, 2026, [], [], undefined, server));
    const g = result.current.moduleBalances.geral!;
    expect(g.receitas).toBe(9000);
    expect(g.despesas).toBe(1000);
    expect(g.saldo).toBe(12345);
  });

  it('sem totais do servidor (null) mantém a soma local', () => {
    const { result } = renderHook(() =>
      useFinancialData(txs, 'geral', 3, 2026, [], [], undefined, null));
    expect(result.current.moduleBalances.geral!.receitas).toBe(5000);
  });
});
