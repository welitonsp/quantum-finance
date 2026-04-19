// src/hooks/useFinancialData.ts
import { useMemo } from 'react';
import Decimal from 'decimal.js';

type AnyRecord = Record<string, unknown>;

interface FirestoreTimestamp { toDate: () => Date; }

interface Transaction extends AnyRecord {
  id: string;
  type?: string;
  value?: number;
  category?: string;
  account?: string;
  date?: string | FirestoreTimestamp;
  data?: string | FirestoreTimestamp;
  createdAt?: string | FirestoreTimestamp;
}

interface CategoryDataPoint {
  name: string;
  value: number;
  color: string;
}

interface ModuleBalances {
  geral: {
    saldo: number;
    receitas: number;
    despesas: number;
    patrimonio: number;
    dividas: number;
  };
}

function resolveTxDate(rawDate: unknown): Date | null {
  if (!rawDate) return null;
  const fd = rawDate as FirestoreTimestamp;
  if (typeof fd.toDate === 'function') return fd.toDate();
  if (typeof rawDate === 'string') {
    if (!rawDate.includes('T')) {
      const [y, m, d] = rawDate.split('-');
      return new Date(Number(y), Number(m) - 1, Number(d) || 1);
    }
    return new Date(rawDate);
  }
  return null;
}

export function useFinancialData(
  transactions: Transaction[] | null | undefined,
  activeModule: string,
  currentMonth: number,
  currentYear: number,
) {
  const displayedTransactions = useMemo(() => {
    if (!transactions) return [];
    return transactions.filter(t => {
      const txAccount = (t.account as string) || 'conta_corrente';
      if (activeModule !== 'geral' && txAccount !== activeModule) return false;
      const txDate = resolveTxDate(t.date || t.data || t.createdAt);
      return (
        txDate !== null &&
        !isNaN(txDate.getTime()) &&
        txDate.getMonth() + 1 === currentMonth &&
        txDate.getFullYear() === currentYear
      );
    });
  }, [transactions, activeModule, currentMonth, currentYear]);

  const moduleBalances = useMemo((): ModuleBalances => {
    if (!transactions) {
      return { geral: { saldo: 0, receitas: 0, despesas: 0, patrimonio: 0, dividas: 0 } };
    }

    let receitasMes    = new Decimal(0);
    let despesasMes    = new Decimal(0);
    let saldoAcumulado = new Decimal(0);

    transactions.forEach(tx => {
      const txAccount = (tx.account as string) || 'conta_corrente';
      if (activeModule !== 'geral' && txAccount !== activeModule) return;

      // Desencriptar centavos: divide por 100 para restabelecer os decimais reais.
      const val      = new Decimal(Math.abs(Number(tx.value || 0))).dividedBy(100);
      const isIncome = tx.type === 'entrada' || tx.type === 'receita';

      if (isIncome) saldoAcumulado = saldoAcumulado.plus(val);
      else          saldoAcumulado = saldoAcumulado.minus(val);

      const txDate = resolveTxDate(tx.date || tx.data || tx.createdAt);
      if (
        txDate &&
        !isNaN(txDate.getTime()) &&
        txDate.getMonth() + 1 === currentMonth &&
        txDate.getFullYear() === currentYear
      ) {
        if (isIncome) receitasMes = receitasMes.plus(val);
        else          despesasMes = despesasMes.plus(val);
      }
    });

    return {
      geral: {
        saldo:      saldoAcumulado.toNumber(),
        receitas:   receitasMes.toNumber(),
        despesas:   despesasMes.toNumber(),
        patrimonio: saldoAcumulado.toNumber(),
        dividas:    0,
      },
    };
  }, [transactions, activeModule, currentMonth, currentYear]);

  const categoryData = useMemo((): CategoryDataPoint[] => {
    const map: Record<string, number> = {};
    displayedTransactions.forEach(tx => {
      if (tx.type === 'saida' || tx.type === 'despesa') {
        const cat = (tx.category as string) || 'Diversos';
        const val = new Decimal(Math.abs(Number(tx.value || 0))).dividedBy(100);
        map[cat]  = new Decimal(map[cat] ?? 0).plus(val).toNumber();
      }
    });

    const colors = ['#ef4444', '#06b6d4', '#a855f7', '#f59e0b', '#10b981', '#3b82f6', '#f43f5e'];
    return Object.keys(map)
      .map((name, idx) => ({ name, value: map[name], color: colors[idx % colors.length] }))
      .sort((a, b) => b.value - a.value);
  }, [displayedTransactions]);

  const topExpensesData = useMemo(() => categoryData.slice(0, 4), [categoryData]);

  const allTransactionsDecrypted = useMemo(() => {
    return (transactions || []).map(tx => ({
      ...tx,
      value: new Decimal(Number(tx.value || 0)).dividedBy(100).toNumber(),
    }));
  }, [transactions]);

  const displayedTransactionsDecrypted = useMemo(() => {
    return displayedTransactions.map(tx => ({
      ...tx,
      value: new Decimal(Number(tx.value || 0)).dividedBy(100).toNumber(),
    }));
  }, [displayedTransactions]);

  return {
    displayedTransactions: displayedTransactionsDecrypted,
    moduleBalances,
    categoryData,
    topExpensesData,
    allTransactions: allTransactionsDecrypted,
  };
}
