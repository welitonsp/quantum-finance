import { useMemo } from 'react';
import Decimal from 'decimal.js';

export function useForecast(transactions, currentBalance, recurringTasks = []) {
  return useMemo(() => {
    if (!transactions) return { data: [], isAlert: false, projectedBalance: 0, dailyBurnRate: 0 };

    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);

    // 1. Calcular o "Burn Rate" Variável (Média gasta por dia em coisas variáveis)
    const recentVariableExpenses = transactions.filter(tx => 
      tx.type === 'saida' && 
      (!tx.tags?.includes('Fixa')) && 
      new Date(tx.date || tx.createdAt) >= thirtyDaysAgo
    );

    const totalVariableBurn = recentVariableExpenses.reduce((acc, tx) => acc + Number(tx.value), 0);
    const dailyVariableBurn = totalVariableBurn / 30;

    // 2. Calcular o peso diário das Despesas Fixas (Recorrentes)
    let totalMensalFixo = 0;
    recurringTasks.forEach(task => {
      if (task.active !== false && task.type !== 'entrada') {
        const val = Number(task.value || 0);
        if (task.frequency === 'mensal') totalMensalFixo += val;
        if (task.frequency === 'anual') totalMensalFixo += (val / 12);
      }
    });
    const dailyFixedBurn = totalMensalFixo / 30;

    // Ritmo de Gasto Total Diário
    const totalDailyBurn = dailyVariableBurn + dailyFixedBurn;

    // 3. Projetar o futuro (Próximos 30 dias)
    let runningBalance = new Decimal(currentBalance || 0);
    const forecastData = [];
    let isAlert = false;
    let daysUntilZero = null;

    for (let i = 0; i <= 30; i++) {
      const projDate = new Date();
      projDate.setDate(today.getDate() + i);
      
      if (i > 0) {
        runningBalance = runningBalance.minus(totalDailyBurn);
      }

      const currentPointBalance = runningBalance.toNumber();
      
      if (currentPointBalance < 0 && !isAlert) {
        isAlert = true;
        daysUntilZero = i;
      }

      forecastData.push({
        date: projDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
        balance: currentPointBalance
      });
    }

    return {
      data: forecastData,
      isAlert,
      daysUntilZero,
      projectedBalance: runningBalance.toNumber(),
      dailyBurnRate: totalDailyBurn
    };

  }, [transactions, currentBalance, recurringTasks]);
}