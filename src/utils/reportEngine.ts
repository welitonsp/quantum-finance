import type { Transaction, Account } from '../shared/types/transaction';
import { isExpense, isIncome } from './transactionUtils';

export interface ParetoEntry {
  category:  string;
  total:     number;
  cumPct:    number;
  isInTop20: boolean;
}

/** Pareto 80/20 das despesas. */
export function calcPareto(transactions: Transaction[]): ParetoEntry[] {
  const totals: Record<string, number> = {};
  let grand = 0;

  for (const tx of transactions) {
    if (!isExpense(tx.type)) continue;
    const v = Math.abs(Number(tx.value ?? 0));
    const cat = tx.category ?? 'Diversos';
    totals[cat] = (totals[cat] ?? 0) + v;
    grand += v;
  }

  if (grand === 0) return [];

  const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  const top20Cutoff = Math.max(1, Math.ceil(sorted.length * 0.2));
  let cumulative = 0;

  return sorted.map(([category, total], idx) => {
    cumulative += total;
    return {
      category,
      total:     Math.round(total * 100) / 100,
      cumPct:    Math.round((cumulative / grand) * 1000) / 10,
      isInTop20: idx < top20Cutoff,
    };
  });
}

export interface PatrimonyPoint {
  monthLabel: string;
  patrimonio: number;
}

const PT_MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
                   'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/** Evolução patrimonial dos últimos 6 meses (incluindo o atual). */
export function calcPatrimonyEvolution(
  transactions: Transaction[],
  accounts: Account[],
  referenceDate: Date = new Date(),
): PatrimonyPoint[] {
  let balance = accounts.reduce((sum, a) => sum + (Number(a.balance) || 0), 0);

  const points: PatrimonyPoint[] = [];
  const ref = new Date(referenceDate);

  for (let i = 0; i < 6; i++) {
    const month = ref.getMonth();
    const year  = ref.getFullYear();
    const label = i === 0 ? 'Atual' : PT_MONTHS[month]!;

    points.unshift({ monthLabel: label, patrimonio: Math.round(balance * 100) / 100 });

    // Rebobinar: desfazer transações deste mês para chegar ao mês anterior
    for (const tx of transactions) {
      const d = new Date(tx.date ?? '');
      if (d.getFullYear() === year && d.getMonth() === month) {
        const v = Math.abs(Number(tx.value ?? 0));
        if (isIncome(tx.type))   balance -= v;
        if (isExpense(tx.type))  balance += v;
      }
    }

    ref.setMonth(ref.getMonth() - 1);
  }

  return points;
}
