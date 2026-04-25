import { useState, useEffect, useMemo } from 'react';
import Decimal from 'decimal.js';
import type { Transaction, Account } from '../shared/types/transaction';
import { isIncome, isExpense } from '../utils/transactionUtils';

export interface FinancialMetrics {
  receita: number;
  despesa: number;
  ativos: number;
  passivos: number;
  patrimonioLiquido: number;
  custoFixoMensal: number;
  taxaPoupanca: number;
  endividamento: number;
  comprometimento: number;
  reservaMeses: number;
}

interface UseFinancialMetricsReturn {
  metrics: FinancialMetrics | null;
  loadingMetrics: boolean;
  error: Error | null;
}

export function useFinancialMetrics(
  uid: string,
  transactions: Transaction[],
  currentMonth: number,
  currentYear: number,
  accounts: Account[] = [],
  recurringMonthlyTotal: number = 0
): UseFinancialMetricsReturn {
  const [loadingMetrics, setLoadingMetrics] = useState(true);
  const [error, setError]                   = useState<Error | null>(null);

  // FIX A: useMemo puro — sem setState interno (viola React 19 concurrent rendering)
  const metricsResult = useMemo((): { data: FinancialMetrics | null; err: Error | null } => {
    if (!uid || !transactions || transactions.length === 0) return { data: null, err: null };

    try {
      let receita = new Decimal(0), despesa = new Decimal(0);
      let custoFixoMensal = new Decimal(0);

      const categoriasFixas = ['moradia','assinaturas','educação','impostos','impostos/taxas','saúde'];

      transactions.forEach(tx => {
        const valor = new Decimal(Math.abs(Number(tx.value || 0)));
        if (isIncome(tx.type)) {
          receita = receita.plus(valor);
        } else if (isExpense(tx.type)) {
          despesa = despesa.plus(valor);
          const cat = (tx.category || '').toLowerCase();
          if (categoriasFixas.includes(cat)) custoFixoMensal = custoFixoMensal.plus(valor);
        }
      });

      // FIX B: ativos/passivos reais baseados em contas (balance em reais, não centavos)
      let ativos = 0, passivos = 0;
      accounts.forEach(acc => {
        const v = Number(acc.balance) || 0;
        if (['corrente', 'poupanca', 'investimento'].includes(acc.type)) ativos += v;
        if (['cartao', 'divida'].includes(acc.type))                     passivos += Math.abs(v);
      });

      const patrimonioLiquido = ativos - passivos;
      const taxaPoupanca      = receita.greaterThan(0)
        ? receita.minus(despesa).dividedBy(receita).times(100)
        : new Decimal(0);
      const endividamento  = (ativos + passivos) > 0
        ? (passivos / (ativos + passivos)) * 100
        : 0;
      const comprometimento = receita.greaterThan(0)
        ? (recurringMonthlyTotal / receita.toNumber()) * 100
        : 0;
      const reservaMeses = custoFixoMensal.greaterThan(0)
        ? ativos / custoFixoMensal.toNumber()
        : 0;

      return {
        data: {
          receita:           receita.toNumber(),
          despesa:           despesa.toNumber(),
          ativos,
          passivos,
          patrimonioLiquido,
          custoFixoMensal:   custoFixoMensal.toNumber(),
          taxaPoupanca:      taxaPoupanca.toDecimalPlaces(2).toNumber(),
          endividamento,
          comprometimento,
          reservaMeses:      Number(reservaMeses.toFixed(1)),
        },
        err: null,
      };
    } catch (err) {
      return { data: null, err: err instanceof Error ? err : new Error('Erro ao calcular métricas quânticas.') };
    }
  }, [uid, transactions, currentMonth, currentYear, accounts, recurringMonthlyTotal]);

  // FIX A: sincroniza estado fora do memo
  useEffect(() => {
    setLoadingMetrics(false);
    setError(metricsResult.err);
  }, [metricsResult]);

  return { metrics: metricsResult.data, loadingMetrics, error };
}
