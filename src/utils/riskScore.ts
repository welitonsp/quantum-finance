import type { Transaction } from '../shared/types/transaction';
import { getTransactionCentavos } from './transactionUtils';
import { isExpense as checkExpense } from './transactionUtils';

export type RiskLevel = 'normal' | 'elevated' | 'anomalous';

/**
 * Assigns a statistical risk level to each expense transaction based on how
 * many standard deviations its value is from the mean for that category.
 *
 * Thresholds (z-score):
 *   < 1.5 σ  → normal
 *   1.5–2.5 σ → elevated
 *   > 2.5 σ  → anomalous
 *
 * Returns a new array of transactions with `riskScore` set.
 * Income and transfer transactions always get 'normal'.
 * Categories with fewer than 3 data points are left as 'normal' (insufficient baseline).
 */
export function annotateRiskScores(transactions: Transaction[]): Transaction[] {
  // Build per-category stats from expense transactions
  const catValues: Record<string, number[]> = {};

  for (const tx of transactions) {
    if (!checkExpense(tx.type)) continue;
    const cents = Math.abs(getTransactionCentavos(tx) ?? 0);
    if (cents === 0) continue;
    const cat = tx.category ?? 'Outros';
    if (!catValues[cat]) catValues[cat] = [];
    catValues[cat].push(cents);
  }

  // Compute mean + stddev per category
  const catStats: Record<string, { mean: number; std: number; count: number }> = {};
  for (const [cat, values] of Object.entries(catValues)) {
    if (values.length < 3) {
      catStats[cat] = { mean: 0, std: 0, count: values.length };
      continue;
    }
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
    const std = Math.sqrt(variance);
    catStats[cat] = { mean, std, count: values.length };
  }

  return transactions.map(tx => {
    if (!checkExpense(tx.type)) return { ...tx, riskScore: 'normal' as RiskLevel };

    const cents = Math.abs(getTransactionCentavos(tx) ?? 0);
    if (cents === 0) return { ...tx, riskScore: 'normal' as RiskLevel };

    const cat   = tx.category ?? 'Outros';
    const stats = catStats[cat];

    if (!stats || stats.count < 3 || stats.std === 0) {
      return { ...tx, riskScore: 'normal' as RiskLevel };
    }

    const z = (cents - stats.mean) / stats.std;

    const riskScore: RiskLevel =
      z > 2.5 ? 'anomalous' :
      z > 1.5 ? 'elevated'  :
                'normal';

    return { ...tx, riskScore };
  });
}
