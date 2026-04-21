import { useMemo } from 'react';
import Decimal from 'decimal.js';
import type { Transaction, ModuleBalances, CategoryDataPoint } from '../shared/types/transaction';

interface FirestoreTimestamp { toDate: () => Date; }

function resolveDate(raw: unknown): Date | null {
  if (!raw) return null;
  if (typeof raw === 'object' && raw !== null && 'toDate' in raw) {
    return (raw as FirestoreTimestamp).toDate();
  }
  if (typeof raw === 'string' && !raw.includes('T')) {
    const [y, m, d] = raw.split('T')[0].split('-');
    return new Date(Number(y), Number(m) - 1, Number(d) || 1);
  }
  const d = new Date(raw as string | number);
  return isNaN(d.getTime()) ? null : d;
}

export interface FinancialDataReturn {
  displayedTransactions: Transaction[];
  moduleBalances: ModuleBalances;
  categoryData: CategoryDataPoint[];
  topExpensesData: CategoryDataPoint[];
  allTransactions: Transaction[];
}

export function useFinancialData(
  transactions: Transaction[],
  activeModule: string,
  currentMonth: number,
  currentYear: number
): FinancialDataReturn {

  const displayedTransactions = useMemo(() => {
    if (!transactions) return [];
    return transactions.filter(t => {
      const txAccount = t.account || 'conta_corrente';
      if (activeModule !== 'geral' && txAccount !== activeModule) return false;
      const rawDate = t.date || t.createdAt;
      if (!rawDate) return false;
      const txDate = resolveDate(rawDate);
      return txDate !== null &&
             (txDate.getMonth() + 1 === currentMonth) &&
             (txDate.getFullYear() === currentYear);
    });
  }, [transactions, activeModule, currentMonth, currentYear]);

  const moduleBalances = useMemo((): ModuleBalances => {
    if (!transactions) return { geral: { saldo: 0, receitas: 0, despesas: 0, patrimonio: 0, dividas: 0 } };

    let receitasMes    = new Decimal(0);
    let despesasMes    = new Decimal(0);
    let saldoAcumulado = new Decimal(0);

    transactions.forEach(tx => {
      const txAccount = tx.account || 'conta_corrente';
      if (activeModule !== 'geral' && txAccount !== activeModule) return;

      const val = new Decimal(Math.abs(Number(tx.value || 0))).dividedBy(100);
      const isIncome = tx.type === 'entrada' || tx.type === 'receita';

      if (isIncome) saldoAcumulado = saldoAcumulado.plus(val);
      else          saldoAcumulado = saldoAcumulado.minus(val);

      const rawDate = tx.date || tx.createdAt;
      if (rawDate) {
        const txDate = resolveDate(rawDate);
        if (txDate && txDate.getMonth() + 1 === currentMonth && txDate.getFullYear() === currentYear) {
          if (isIncome) receitasMes  = receitasMes.plus(val);
          else          despesasMes  = despesasMes.plus(val);
        }
      }
    });

    return {
      geral: {
        saldo:     saldoAcumulado.toNumber(),
        receitas:  receitasMes.toNumber(),
        despesas:  despesasMes.toNumber(),
        patrimonio: saldoAcumulado.toNumber(),
        dividas:   0
      }
    };
  }, [transactions, activeModule, currentMonth, currentYear]);

  const categoryData = useMemo((): CategoryDataPoint[] => {
    const map: Record<string, number> = {};
    displayedTransactions.forEach(tx => {
      if (tx.type === 'saida' || tx.type === 'despesa') {
        const cat = tx.category || 'Diversos';
        const current = map[cat] ? new Decimal(map[cat]) : new Decimal(0);
        const val = new Decimal(Math.abs(Number(tx.value || 0))).dividedBy(100);
        map[cat] = current.plus(val).toNumber();
      }
    });

    const colors = ['#ef4444','#06b6d4','#a855f7','#f59e0b','#10b981','#3b82f6','#f43f5e'];
    return Object.keys(map).map((name, idx) => ({
      name,
      value: map[name],
      color: colors[idx % colors.length]
    })).sort((a, b) => b.value - a.value);
  }, [displayedTransactions]);

  const topExpensesData = useMemo(() => categoryData.slice(0, 4), [categoryData]);

  const allTransactionsDecrypted = useMemo(() => {
    return (transactions || []).map(tx => ({
      ...tx,
      value: new Decimal(Number(tx.value || 0)).dividedBy(100).toNumber()
    }));
  }, [transactions]);

  const displayedTransactionsDecrypted = useMemo(() => {
    return (displayedTransactions || []).map(tx => ({
      ...tx,
      value: new Decimal(Number(tx.value || 0)).dividedBy(100).toNumber()
    }));
  }, [displayedTransactions]);

  return {
    displayedTransactions: displayedTransactionsDecrypted,
    moduleBalances,
    categoryData,
    topExpensesData,
    allTransactions: allTransactionsDecrypted
  };
}
