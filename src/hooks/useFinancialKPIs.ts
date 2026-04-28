import { useMemo } from 'react';
import type { Transaction } from '../shared/types/transaction';
import { getTransactionAbsCentavos, isIncome } from '../utils/transactionUtils';
import { fromCentavos } from '../shared/types/money';

// ─── ViewModel ────────────────────────────────────────────────────────────────

export interface FinancialKPIs {
  totalIncome:      number;
  totalExpense:     number;
  balance:          number;
  burnRate:         number;  // despesa média por dia no mês corrente
  projectedBalance: number;  // saldo estimado no fim do mês
}

// ─── Pure computation (exported for deterministic testing) ────────────────────

export function computeKPIs(transactions: Transaction[], now: Date): FinancialKPIs {
  let totalIncome  = 0;
  let totalExpense = 0;

  for (const tx of transactions) {
    const val = fromCentavos(getTransactionAbsCentavos(tx));
    if (isIncome(tx.type)) totalIncome  += val;
    else                   totalExpense += val;
  }

  const balance = totalIncome - totalExpense;

  const daysPassed    = Math.max(now.getDate(), 1);                                        // ≥ 1 evita divisão por 0
  const daysInMonth   = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysRemaining = daysInMonth - daysPassed;

  const burnRate         = totalExpense / daysPassed;
  const projectedBalance = balance - burnRate * daysRemaining;

  return { totalIncome, totalExpense, balance, burnRate, projectedBalance };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * @param transactions Transações do período
 * @param now Data de referência — injectável para testes. Default: new Date()
 */
export function useFinancialKPIs(transactions: Transaction[], now?: Date): FinancialKPIs {
  return useMemo(
    () => computeKPIs(transactions, now ?? new Date()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [transactions, now],
  );
}
