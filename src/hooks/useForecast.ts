// src/hooks/useForecast.ts
import { useMemo } from 'react';
import Decimal from 'decimal.js';

type AnyRecord = Record<string, unknown>;

interface Transaction extends AnyRecord {
  type?: string;
  value?: number;
  tags?: string[];
  date?: string;
  createdAt?: string;
}

interface RecurringTask extends AnyRecord {
  active?: boolean;
  type?: string;
  value?: number;
  frequency?: string;
}

interface ForecastPoint {
  date: string;
  balance: number;
}

interface ForecastResult {
  data: ForecastPoint[];
  isAlert: boolean;
  daysUntilZero: number | null;
  projectedBalance: number;
  dailyBurnRate: number;
}

export function useForecast(
  transactions: Transaction[] | null | undefined,
  currentBalance: number,
  recurringTasks: RecurringTask[] = [],
): ForecastResult {
  return useMemo(() => {
    if (!transactions) {
      return { data: [], isAlert: false, daysUntilZero: null, projectedBalance: 0, dailyBurnRate: 0 };
    }

    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);

    // Burn rate variável: média diária de despesas não-fixas nos últimos 30 dias.
    const recentVariableExpenses = transactions.filter(tx =>
      tx.type === 'saida' &&
      !tx.tags?.includes('Fixa') &&
      new Date((tx.date || tx.createdAt) as string) >= thirtyDaysAgo
    );
    const totalVariableBurn = recentVariableExpenses.reduce((acc, tx) => acc + Number(tx.value), 0);
    const dailyVariableBurn = totalVariableBurn / 30;

    // Peso diário das despesas fixas (recorrentes).
    let totalMensalFixo = 0;
    recurringTasks.forEach(task => {
      if (task.active !== false && task.type !== 'entrada') {
        const val = Number(task.value || 0);
        if (task.frequency === 'mensal') totalMensalFixo += val;
        if (task.frequency === 'anual')  totalMensalFixo += val / 12;
      }
    });
    const dailyFixedBurn = totalMensalFixo / 30;
    const totalDailyBurn = dailyVariableBurn + dailyFixedBurn;

    let runningBalance       = new Decimal(currentBalance || 0);
    const forecastData: ForecastPoint[] = [];
    let isAlert              = false;
    let daysUntilZero: number | null = null;

    for (let i = 0; i <= 30; i++) {
      const projDate = new Date();
      projDate.setDate(today.getDate() + i);

      if (i > 0) runningBalance = runningBalance.minus(totalDailyBurn);

      const currentPointBalance = runningBalance.toNumber();

      if (currentPointBalance < 0 && !isAlert) {
        isAlert       = true;
        daysUntilZero = i;
      }

      forecastData.push({
        date:    projDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
        balance: currentPointBalance,
      });
    }

    return {
      data:             forecastData,
      isAlert,
      daysUntilZero,
      projectedBalance: runningBalance.toNumber(),
      dailyBurnRate:    totalDailyBurn,
    };
  }, [transactions, currentBalance, recurringTasks]);
}
