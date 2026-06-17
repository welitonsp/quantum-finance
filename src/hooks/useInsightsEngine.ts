import { useMemo } from 'react';
import Decimal from 'decimal.js';
import type { Transaction } from '../shared/types/transaction';
import { type Centavos } from '../shared/types/money';
import { getTransactionCentavos, isInvoicePayment } from '../utils/transactionUtils';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CategorySpend {
  category: string;
  totalCents: Centavos;
  count: number;
  /** Share of total expenses 0–1 */
  share: number;
}

export interface TrendInsight {
  type: 'spending_up' | 'spending_down' | 'income_up' | 'income_down';
  currentCents: Centavos;
  previousCents: Centavos;
  /** Change ratio: positive = increase, negative = decrease */
  ratio: number;
}

export interface AnomalyInsight {
  transactionId: string;
  description: string;
  valueCents: Centavos;
  category: string;
  /** How many × the category average this transaction is */
  multiplier: number;
}

export interface Suggestion {
  id: string;
  priority: 'high' | 'medium' | 'low';
  message: string;
}

export interface InsightsResult {
  topExpenses: CategorySpend[];
  trend: TrendInsight | null;
  anomalies: AnomalyInsight[];
  suggestions: Suggestion[];
  /** Month analysed (YYYY-MM) */
  month: string;
}

// ─── Pure helpers (exported for testing) ─────────────────────────────────────

export function buildYearMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function txDate(tx: Transaction): Date | null {
  const raw = tx.date ?? tx.createdAt;
  if (!raw) return null;
  if (typeof raw === 'object' && 'toDate' in (raw as object)) {
    return (raw as { toDate: () => Date }).toDate();
  }
  const s = raw as string;
  // Parse date-only strings as local to avoid UTC offset issues
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number) as [number, number, number];
    return new Date(y, m - 1, d);
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function isExpenseTx(tx: Transaction): boolean {
  return tx.type === 'saida' || tx.type === 'despesa';
}
function isIncomeTx(tx: Transaction): boolean {
  return tx.type === 'entrada' || tx.type === 'receita';
}
function isConsumptionExpenseTx(tx: Transaction): boolean {
  return isExpenseTx(tx) && !isInvoicePayment(tx);
}

export function filterByMonth(transactions: Transaction[], year: number, month: number): Transaction[] {
  return transactions.filter(tx => {
    const d = txDate(tx);
    return d !== null && d.getFullYear() === year && d.getMonth() + 1 === month;
  });
}

export function computeTopExpenses(transactions: Transaction[], topN = 5): CategorySpend[] {
  const expenses = transactions.filter(isConsumptionExpenseTx);
  const totals = new Map<string, { cents: Decimal; count: number }>();

  for (const tx of expenses) {
    const cents = getTransactionCentavos(tx);
    if (!cents) continue;
    const cat = tx.category ?? 'Outros';
    const entry = totals.get(cat) ?? { cents: new Decimal(0), count: 0 };
    totals.set(cat, { cents: entry.cents.plus(cents), count: entry.count + 1 });
  }

  const grandTotal = [...totals.values()].reduce(
    (acc, v) => acc.plus(v.cents), new Decimal(0),
  );

  const sorted = [...totals.entries()]
    .sort((a, b) => b[1].cents.comparedTo(a[1].cents))
    .slice(0, topN);

  return sorted.map(([category, { cents, count }]) => ({
    category,
    totalCents: cents.toNumber() as Centavos,
    count,
    share: grandTotal.isZero() ? 0 : cents.dividedBy(grandTotal).toNumber(),
  }));
}

export function computeTrend(
  current: Transaction[],
  previous: Transaction[],
): TrendInsight | null {
  const sumCents = (txs: Transaction[], filter: (t: Transaction) => boolean) =>
    txs.filter(filter).reduce((acc, tx) => {
      const c = getTransactionCentavos(tx);
      return c ? acc.plus(c) : acc;
    }, new Decimal(0));

  const curExpense  = sumCents(current,  isConsumptionExpenseTx);
  const prevExpense = sumCents(previous, isConsumptionExpenseTx);
  const curIncome   = sumCents(current,  isIncomeTx);
  const prevIncome  = sumCents(previous, isIncomeTx);

  // Pick the most significant change to surface
  const expenseRatio = prevExpense.isZero() ? 0 :
    curExpense.minus(prevExpense).dividedBy(prevExpense).toNumber();
  const incomeRatio  = prevIncome.isZero() ? 0 :
    curIncome.minus(prevIncome).dividedBy(prevIncome).toNumber();

  if (Math.abs(expenseRatio) >= Math.abs(incomeRatio) && Math.abs(expenseRatio) > 0.05) {
    return {
      type: expenseRatio > 0 ? 'spending_up' : 'spending_down',
      currentCents:  curExpense.toNumber()  as Centavos,
      previousCents: prevExpense.toNumber() as Centavos,
      ratio: expenseRatio,
    };
  }
  if (Math.abs(incomeRatio) > 0.05) {
    return {
      type: incomeRatio > 0 ? 'income_up' : 'income_down',
      currentCents:  curIncome.toNumber()  as Centavos,
      previousCents: prevIncome.toNumber() as Centavos,
      ratio: incomeRatio,
    };
  }
  return null;
}

export function detectAnomalies(transactions: Transaction[], threshold = 3): AnomalyInsight[] {
  const expenses = transactions.filter(isConsumptionExpenseTx);
  const byCategory = new Map<string, number[]>();

  for (const tx of expenses) {
    const cents = getTransactionCentavos(tx);
    if (!cents) continue;
    const cat = tx.category ?? 'Outros';
    const arr = byCategory.get(cat) ?? [];
    arr.push(cents);
    byCategory.set(cat, arr);
  }

  const anomalies: AnomalyInsight[] = [];

  for (const tx of expenses) {
    const cents = getTransactionCentavos(tx);
    if (!cents) continue;
    const cat = tx.category ?? 'Outros';
    const arr = byCategory.get(cat) ?? [];
    if (arr.length < 2) continue;

    const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
    const multiplier = avg > 0 ? cents / avg : 0;

    if (multiplier >= threshold) {
      anomalies.push({
        transactionId: tx.id,
        description:   tx.description ?? '',
        valueCents:    cents,
        category:      cat,
        multiplier:    Math.round(multiplier * 10) / 10,
      });
    }
  }

  return anomalies.sort((a, b) => b.multiplier - a.multiplier).slice(0, 3);
}

export function buildSuggestions(
  topExpenses: CategorySpend[],
  trend: TrendInsight | null,
  anomalies: AnomalyInsight[],
): Suggestion[] {
  const suggestions: Suggestion[] = [];

  if (trend?.type === 'spending_up' && trend.ratio > 0.15) {
    suggestions.push({
      id: 'trend_spending_up',
      priority: 'high',
      message: `Gastos ${Math.round(trend.ratio * 100)}% acima do mês anterior. Revise suas despesas variáveis.`,
    });
  }
  if (trend?.type === 'income_down' && trend.ratio < -0.1) {
    suggestions.push({
      id: 'trend_income_down',
      priority: 'high',
      message: `Receita ${Math.round(Math.abs(trend.ratio) * 100)}% menor que o mês anterior.`,
    });
  }
  if (anomalies.length > 0) {
    const top = anomalies[0]!;
    suggestions.push({
      id: `anomaly_${top.transactionId}`,
      priority: 'medium',
      message: `"${top.description || top.category}" é ${top.multiplier}× acima da média da categoria.`,
    });
  }
  if (topExpenses[0] && topExpenses[0].share > 0.4) {
    suggestions.push({
      id: `top_category_${topExpenses[0].category}`,
      priority: 'medium',
      message: `${topExpenses[0].category} representa ${Math.round(topExpenses[0].share * 100)}% das despesas. Considere revisar.`,
    });
  }
  if (suggestions.length === 0) {
    suggestions.push({
      id: 'all_good',
      priority: 'low',
      message: 'Seus gastos estão estáveis. Continue assim!',
    });
  }

  return suggestions;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useInsightsEngine(
  allTransactions: Transaction[],
  year: number,
  month: number,
): InsightsResult {
  return useMemo(() => {
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear  = month === 1 ? year - 1 : year;

    const current  = filterByMonth(allTransactions, year, month);
    const previous = filterByMonth(allTransactions, prevYear, prevMonth);

    const topExpenses = computeTopExpenses(current);
    const trend       = computeTrend(current, previous);
    const anomalies   = detectAnomalies(current);
    const suggestions = buildSuggestions(topExpenses, trend, anomalies);

    return {
      topExpenses,
      trend,
      anomalies,
      suggestions,
      month: buildYearMonth(year, month),
    };
  }, [allTransactions, year, month]);
}
