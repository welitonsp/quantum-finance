import { useState, useMemo } from 'react';
import Decimal from 'decimal.js';
import type { Transaction, Account, ModuleBalances, CategoryDataPoint } from '../shared/types/transaction';
import { isIncome as checkIncome, isExpense as checkExpense } from '../utils/transactionUtils';
import { fromCentavos } from '../shared/schemas/financialSchemas';

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

// ─── Existing hook (kept for App.tsx compatibility) ──────────────────────────

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
  currentYear: number,
  accounts: Account[] = []
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
      const isIncome = checkIncome(tx.type);

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

    // FIX C: saldo inclui saldo de abertura das contas; patrimônio usa contas reais
    // balance vem em CENTAVOS do useAccounts — converter para reais antes de somar
    const openingBalance = accounts.reduce((sum, acc) => sum + fromCentavos(acc.balance), 0);

    let ativos = 0, passivos = 0;
    accounts.forEach(acc => {
      const v = fromCentavos(acc.balance);
      if (['corrente', 'poupanca', 'investimento'].includes(acc.type)) ativos += v;
      if (['cartao', 'divida'].includes(acc.type))                     passivos += Math.abs(v);
    });

    return {
      geral: {
        saldo:     saldoAcumulado.plus(new Decimal(openingBalance)).toNumber(),
        receitas:  receitasMes.toNumber(),
        despesas:  despesasMes.toNumber(),
        patrimonio: ativos - passivos,
        dividas:   passivos,
      }
    };
  }, [transactions, activeModule, currentMonth, currentYear, accounts]);

  const categoryData = useMemo((): CategoryDataPoint[] => {
    const map: Record<string, number> = {};
    displayedTransactions.forEach(tx => {
      if (checkExpense(tx.type)) {
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

// ─── Dashboard Aggregation Hook ───────────────────────────────────────────────

export type TimeRange = '7d' | '30d' | '90d' | 'all';

export interface DashboardKPIs {
  totalBalance: number;
  totalIncome:  number;
  totalExpense: number;
}

export interface TimelineDataPoint {
  date:    string;
  income:  number;
  expense: number;
}

export interface CategoryChartPoint {
  name:  string;
  value: number;
}

export interface DashboardDataReturn {
  kpis:         DashboardKPIs;
  timelineData: TimelineDataPoint[];
  categoryData: CategoryChartPoint[];
  timeRange:    TimeRange;
  setTimeRange: (r: TimeRange) => void;
  loading:      boolean;
}

const RANGE_DAYS: Record<Exclude<TimeRange, 'all'>, number> = {
  '7d': 7, '30d': 30, '90d': 90,
};

// FIX: single source of truth for transactions
export function useDashboardData(transactions: Transaction[], loading: boolean): DashboardDataReturn {
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');

  const filtered = useMemo(() => {
    if (!transactions.length) return [];
    if (timeRange === 'all') return transactions;
    const cutoff = new Date(Date.now() - RANGE_DAYS[timeRange] * 86_400_000);
    return transactions.filter(tx => {
      const d = resolveDate(tx.date || tx.createdAt);
      return d !== null && d >= cutoff;
    });
  }, [transactions, timeRange]);

  const kpis = useMemo((): DashboardKPIs => {
    let totalBalance = new Decimal(0);
    let totalIncome  = new Decimal(0);
    let totalExpense = new Decimal(0);

    transactions.forEach(tx => {
      const val = new Decimal(Math.abs(Number(tx.value || 0))).dividedBy(100);
      if (checkIncome(tx.type)) totalBalance = totalBalance.plus(val);
      else                      totalBalance = totalBalance.minus(val);
    });

    filtered.forEach(tx => {
      const val = new Decimal(Math.abs(Number(tx.value || 0))).dividedBy(100);
      if (checkIncome(tx.type)) totalIncome  = totalIncome.plus(val);
      else                      totalExpense = totalExpense.plus(val);
    });

    return {
      totalBalance: totalBalance.toNumber(),
      totalIncome:  totalIncome.toNumber(),
      totalExpense: totalExpense.toNumber(),
    };
  }, [transactions, filtered]);

  const timelineData = useMemo((): TimelineDataPoint[] => {
    const map = new Map<string, { income: Decimal; expense: Decimal }>();

    filtered.forEach(tx => {
      const d = resolveDate(tx.date || tx.createdAt);
      if (!d) return;
      const key   = d.toISOString().slice(0, 10);
      const entry = map.get(key) ?? { income: new Decimal(0), expense: new Decimal(0) };
      const val   = new Decimal(Math.abs(Number(tx.value || 0))).dividedBy(100);
      if (checkIncome(tx.type)) entry.income  = entry.income.plus(val);
      else                      entry.expense = entry.expense.plus(val);
      map.set(key, entry);
    });

    return Array.from(map.entries())
      .map(([date, { income, expense }]) => ({
        date,
        income:  income.toNumber(),
        expense: expense.toNumber(),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [filtered]);

  const categoryData = useMemo((): CategoryChartPoint[] => {
    const map = new Map<string, Decimal>();

    filtered.forEach(tx => {
      if (!checkExpense(tx.type)) return;
      const cat = tx.category || 'Diversos';
      map.set(cat, (map.get(cat) ?? new Decimal(0)).plus(
        new Decimal(Math.abs(Number(tx.value || 0))).dividedBy(100)
      ));
    });

    return Array.from(map.entries())
      .map(([name, val]) => ({ name, value: val.toNumber() }))
      .sort((a, b) => b.value - a.value);
  }, [filtered]);

  return { kpis, timelineData, categoryData, timeRange, setTimeRange, loading };
}
