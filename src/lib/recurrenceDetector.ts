import type { Transaction } from '../shared/types/transaction';
import type { Centavos } from '../shared/types/money';

export interface RecurrenceCandidate {
  description: string;
  intervalDays: number;
  avgAmountCents: number;
  occurrences: Transaction[];
  confidence: number; // 0-1
  suggestedCategory?: string;
}

/**
 * Parses a YYYY-MM-DD string into [year, month, day] without using new Date(string)
 * to avoid timezone pitfalls.
 */
function parseDateParts(dateStr: string): [number, number, number] {
  const parts = dateStr.split('-').map(Number);
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

/**
 * Converts a YYYY-MM-DD string to an integer representing days since epoch
 * (using UTC arithmetic without floating point).
 */
function dateToDays(dateStr: string): number {
  const [y, m, d] = parseDateParts(dateStr);
  // Zeller-style day count: days since 0000-01-01
  const my = m <= 2 ? y - 1 : y;
  const mm = m <= 2 ? m + 9 : m - 3;
  return (
    Math.floor(365.25 * (my + 4716)) +
    Math.floor(30.6 * (mm + 1)) +
    d -
    1524
  );
}

/**
 * Coefficient of variation (stddev / mean).
 * Returns Infinity if mean is 0.
 */
function coefficientOfVariation(values: number[]): number {
  if (values.length === 0) return Infinity;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean === 0) return Infinity;
  const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

/**
 * Detects recurring patterns in transactions.
 *
 * Criteria:
 * - ≥3 occurrences of same normalized description
 * - Regular interval: coefficient of variation of gaps < 0.20
 * - Amount variation ≤ ±15%
 * - Excludes: transferencia type, installmentGroupId present, type === 'entrada' / 'receita'
 */
export function detectRecurrenceCandidates(
  transactions: Transaction[],
): RecurrenceCandidate[] {
  // 1. Filter eligible transactions
  const eligible = transactions.filter(tx => {
    if (!tx.date || tx.value_cents === undefined || tx.value_cents <= 0) return false;
    if (tx.isDeleted || tx.deletedAt) return false;
    if (tx.installmentGroupId) return false;
    if (tx.type === 'transferencia') return false;
    if (tx.type === 'entrada' || tx.type === 'receita') return false;
    return true;
  });

  // 2. Group by normalized description
  const groups = new Map<string, Transaction[]>();
  for (const tx of eligible) {
    const key = tx.description.toLowerCase().trim();
    const existing = groups.get(key) ?? [];
    existing.push(tx);
    groups.set(key, existing);
  }

  const candidates: RecurrenceCandidate[] = [];

  for (const [desc, txs] of groups) {
    if (txs.length < 3) continue;

    // Sort by date ascending
    const sorted = [...txs].sort((a, b) => {
      const da = dateToDays(a.date);
      const db = dateToDays(b.date);
      return da - db;
    });

    // Compute day intervals between consecutive occurrences
    const intervals: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      if (!prev?.date || !curr?.date) continue;
      intervals.push(dateToDays(curr.date) - dateToDays(prev.date));
    }

    if (intervals.length === 0) continue;

    // Coefficient of variation of intervals must be < 0.20
    const cvIntervals = coefficientOfVariation(intervals);
    if (cvIntervals >= 0.20) continue;

    // Average interval
    const avgInterval = Math.round(
      intervals.reduce((a, b) => a + b, 0) / intervals.length,
    );

    // Value variation check: all values within ±15% of average
    const amounts = sorted.map(tx => tx.value_cents as number);
    const avgAmount = Math.round(amounts.reduce((a, b) => a + b, 0) / amounts.length);
    const withinRange = amounts.every(v => {
      const diff = Math.abs(v - avgAmount);
      return diff / avgAmount <= 0.15;
    });
    if (!withinRange) continue;

    // Confidence: combine interval regularity (1-cv) and value consistency
    const cvAmounts = coefficientOfVariation(amounts);
    const intervalScore = Math.max(0, 1 - cvIntervals / 0.20);
    const amountScore = Math.max(0, 1 - cvAmounts / 0.15);
    const confidence = Math.round(((intervalScore * 0.6 + amountScore * 0.4) * 100)) / 100;

    // Infer category from most common category
    const categoryCounts = new Map<string, number>();
    for (const tx of sorted) {
      if (tx.category) {
        categoryCounts.set(tx.category, (categoryCounts.get(tx.category) ?? 0) + 1);
      }
    }
    let suggestedCategory: string | undefined;
    let maxCount = 0;
    for (const [cat, count] of categoryCounts) {
      if (count > maxCount) { maxCount = count; suggestedCategory = cat; }
    }

    candidates.push({
      description:    desc,
      intervalDays:   avgInterval,
      avgAmountCents: avgAmount as Centavos,
      occurrences:    sorted,
      confidence,
      ...(suggestedCategory !== undefined ? { suggestedCategory } : {}),
    });
  }

  // Sort by confidence descending
  return candidates.sort((a, b) => b.confidence - a.confidence);
}
