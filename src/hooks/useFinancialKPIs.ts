import { useMemo } from 'react';
import type { Transaction } from '../shared/types/transaction';
import { isIncome } from '../utils/transactionUtils';

// ─── ViewModel ────────────────────────────────────────────────────────────────

export interface FinancialKPIs {
  totalIncome:      number;
  totalExpense:     number;
  balance:          number;
  burnRate:         number;  // despesa média por dia no mês corrente
  projectedBalance: number;  // saldo estimado no fim do mês
}

// ─── Guard ────────────────────────────────────────────────────────────────────

const safe = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// ─── Pure computation (exported for deterministic testing) ────────────────────

export function computeKPIs(transactions: Transaction[], now: Date): FinancialKPIs {
  let totalIncome  = 0;
  let totalExpense = 0;

  for (const tx of transactions) {
    const val = Math.abs(safe(tx.value));
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
