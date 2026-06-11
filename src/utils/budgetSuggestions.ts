import type { Transaction } from '../shared/types/transaction';
import { fromCentavos } from '../shared/types/money';
import { getTransactionCentavos } from '../utils/transactionUtils';
import { isExpense as checkExpense } from '../utils/transactionUtils';

export interface BudgetSuggestion {
  category:    string;
  suggestedCents: number;
  avgCents:    number;
  months:      number;
  reason:      string;
}

function monthKey(date: string): string {
  return date.slice(0, 7); // YYYY-MM
}

function prevMonths(count: number): string[] {
  const now = new Date();
  const months: string[] = [];
  for (let i = 1; i <= count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return months;
}

export function computeBudgetSuggestions(
  transactions: Transaction[],
  existingCategories: Set<string> = new Set(),
  lookbackMonths = 3,
): BudgetSuggestion[] {
  const targetMonths = new Set(prevMonths(lookbackMonths));

  // Aggregate expenses per category per month
  const catMonthMap: Record<string, Record<string, number>> = {};

  for (const tx of transactions) {
    if (!checkExpense(tx.type)) continue;
    const mk = monthKey(tx.date ?? '');
    if (!targetMonths.has(mk)) continue;
    const cat = (tx.category ?? 'Outros').trim();
    if (!catMonthMap[cat]) catMonthMap[cat] = {};
    const cents = Math.abs(getTransactionCentavos(tx) ?? 0);
    catMonthMap[cat][mk] = (catMonthMap[cat][mk] ?? 0) + cents;
  }

  const suggestions: BudgetSuggestion[] = [];

  for (const [cat, monthData] of Object.entries(catMonthMap)) {
    // Skip categories already budgeted
    if (existingCategories.has(cat)) continue;

    const values   = Object.values(monthData);
    const months   = values.length;
    if (months === 0) continue;

    const totalCents = values.reduce((s, v) => s + v, 0);
    const avgCents   = Math.round(totalCents / months);

    if (avgCents < 100) continue; // ignore < R$ 1 average

    // Suggest 10% buffer above average (rounded to nearest R$10 = 1000 cents)
    const bufferedCents  = Math.round(avgCents * 1.10);
    const roundedCents   = Math.ceil(bufferedCents / 1000) * 1000;

    const reason =
      months === 1
        ? `Gasto de R$ ${fromCentavos(avgCents).toFixed(0)} registrado no último mês.`
        : `Média de R$ ${fromCentavos(avgCents).toFixed(0)}/mês nos últimos ${months} meses.`;

    suggestions.push({
      category:       cat,
      suggestedCents: roundedCents,
      avgCents,
      months,
      reason,
    });
  }

  // Sort by average spend descending (biggest expense categories first)
  return suggestions.sort((a, b) => b.avgCents - a.avgCents).slice(0, 8);
}
