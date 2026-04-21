import { useState, useEffect, useMemo } from 'react';
import Decimal from 'decimal.js';
import type { Transaction } from '../shared/types/transaction';

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
  currentYear: number
): UseFinancialMetricsReturn {
  const [loadingMetrics, setLoadingMetrics] = useState(true);
  const [error, setError]                   = useState<Error | null>(null);

  const metrics = useMemo((): FinancialMetrics | null => {
    if (!uid || !transactions || transactions.length === 0) {
      setLoadingMetrics(false);
      return null;
    }

    try {
      let receita = new Decimal(0), despesa = new Decimal(0);
      let ativos  = new Decimal(0), passivos = new Decimal(0);
      let custoFixoMensal = new Decimal(0);

      const categoriasFixas = ['moradia','assinaturas','educação','impostos','impostos/taxas','saúde'];

      transactions.forEach(tx => {
        const valor = new Decimal(Math.abs(Number(tx.value || 0)));
        if (tx.type === 'receita' || tx.type === 'entrada') {
          receita = receita.plus(valor);
          ativos  = ativos.plus(valor);
        } else if (tx.type === 'saida' || tx.type === 'despesa') {
          despesa  = despesa.plus(valor);
          passivos = passivos.plus(valor);
          const cat = (tx.category || '').toLowerCase();
          if (categoriasFixas.includes(cat)) custoFixoMensal = custoFixoMensal.plus(valor);
        }
      });

      const patrimonioLiquido = ativos.minus(passivos);
      const taxaPoupanca      = receita.greaterThan(0)
        ? receita.minus(despesa).dividedBy(receita).times(100)
        : new Decimal(0);
      const reservaMeses = custoFixoMensal.greaterThan(0)
        ? ativos.dividedBy(custoFixoMensal)
        : new Decimal(0);

      setLoadingMetrics(false);
      return {
        receita:          receita.toNumber(),
        despesa:          despesa.toNumber(),
        ativos:           ativos.toNumber(),
        passivos:         passivos.toNumber(),
        patrimonioLiquido: patrimonioLiquido.toNumber(),
        custoFixoMensal:  custoFixoMensal.toNumber(),
        taxaPoupanca:     taxaPoupanca.toDecimalPlaces(2).toNumber(),
        endividamento:    0,
        comprometimento:  0,
        reservaMeses:     reservaMeses.toDecimalPlaces(1).toNumber(),
      };
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Erro ao calcular métricas quânticas.'));
      setLoadingMetrics(false);
      return null;
    }
  }, [uid, transactions, currentMonth, currentYear]);

  return { metrics, loadingMetrics, error };
}
