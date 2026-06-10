// src/hooks/useInsightsEngine.ts
// Hook React que centraliza todos os cálculos de insights financeiros.
// Retorna resultados memoizados de anomalias, health score, forecast e KPIs.

import { useMemo } from 'react';
import type { Transaction, Account } from '../shared/types/transaction';
import type { Centavos } from '../shared/types/money';
import {
  computeAnomalies,
  computeHealthScore,
  computeForecast,
  computeKPIs,
} from '../lib/insightsEngine';

export function useInsightsEngine(
  transactions: Transaction[],
  accounts: Account[],
  /** Soma das faturas abertas de cartões em centavos (fonte: useCreditCards.totalFaturaCents). */
  cardOpenInvoicesCents?: Centavos,
) {
  // today injetado via sv-SE locale → YYYY-MM-DD sem depender de timezone do browser
  const today        = new Date().toLocaleDateString('sv-SE');
  const currentMonth = today.slice(0, 7);

  // Parcelas futuras já contratadas — passivo contingente informativo
  const futureInstallmentsCents = useMemo((): Centavos => {
    const todayStr = new Date().toLocaleDateString('sv-SE');
    let sum = 0;
    for (const tx of transactions) {
      if (tx.installmentGroupId && tx.date > todayStr && !tx.isDeleted) {
        sum += tx.value_cents ?? 0;
      }
    }
    return Math.trunc(sum) as Centavos;
  }, [transactions]);

  return useMemo(() => {
    const ctx = {
      transactions,
      accounts,
      today,
      currentMonth,
      ...(cardOpenInvoicesCents !== undefined ? { cardOpenInvoicesCents } : {}),
      futureInstallmentsCents,
    };
    return {
      anomalies:              computeAnomalies(ctx),
      healthScore:            computeHealthScore(ctx),
      forecast:               computeForecast(ctx),
      kpis:                   computeKPIs(ctx),
      futureInstallmentsCents,
    };
  }, [transactions, accounts, today, currentMonth, cardOpenInvoicesCents, futureInstallmentsCents]);
}
