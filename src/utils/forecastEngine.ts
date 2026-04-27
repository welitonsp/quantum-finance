// Forecast Engine — Deterministic, immutable, UTC-strict, float-safe
import type { Transaction } from '../shared/types/transaction';
import { isIncome as isIncomeStr } from './transactionUtils';

// ─── Public types ─────────────────────────────────────────────────────────────

export type ForecastHealth = 'good' | 'warning' | 'danger';

export interface ForecastPoint {
  date:    string; // YYYY-MM-DD UTC
  balance: number;
}

export interface ForecastResult {
  points:       ForecastPoint[];
  finalBalance: number;
  minBalance:   number;
  health:       ForecastHealth;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Float-safe rounding to cents. Applied at every accumulation step. */
const round = (v: number): number => Math.round(v * 100) / 100;

function isIncome(tx: Transaction): boolean {
  return isIncomeStr(tx.type);
}

/** Population median of a numeric array. Returns 0 for empty input. */
function median(values: number[]): number {
  if (!values.length) return 0;
  const s   = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1]! + s[mid]!) / 2 : s[mid]!;
}

/** UTC date string YYYY-MM-DD, offset by `deltaDays` from `base`. */
function utcDateStr(base: Date, deltaDays = 0): string {
  const d = new Date(Date.UTC(
    base.getUTCFullYear(),
    base.getUTCMonth(),
    base.getUTCDate() + deltaDays,
  ));
  return d.toISOString().slice(0, 10);
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * @param transactions  Transações históricas
 * @param currentBalance Saldo atual em reais
 * @param days          Horizonte em dias (default 30)
 * @param now           Data de referência — injectável para testes. Default: new Date()
 */
export function calculateForecast(
  transactions: Transaction[],
  currentBalance: number,
  days = 30,
  now: Date = new Date(),
): ForecastResult {
  const EMPTY: ForecastResult = {
    points:       [],
    finalBalance: currentBalance,
    minBalance:   currentBalance,
    health:       'good',
  };

  if (!transactions.length) return EMPTY;

  // ── 1. Immutable sort (chronological) ─────────────────────────────────────
  const sorted = [...transactions].sort((a, b) =>
    (a.date ?? '').localeCompare(b.date ?? ''),
  );

  // ── 2. Recurring detection ─────────────────────────────────────────────────
  //    Group by (description, type) → dates → intervals → std-dev check
  interface GroupEntry { dates: string[]; lastValue: number }
  const groups = new Map<string, GroupEntry>();

  sorted.forEach(tx => {
    if (!tx.date) return;
    const key = `${tx.description ?? ''}\x00${tx.type}`;
    const entry = groups.get(key) ?? { dates: [], lastValue: 0 };
    entry.dates.push(tx.date);
    entry.lastValue = Math.abs(Number(tx.value ?? 0));
    groups.set(key, entry);
  });

  // key → { avgInterval, lastDate, signedValue }
  interface RecurringMeta { avgInterval: number; lastDate: string; signedValue: number; type: string }
  const recurringMeta = new Map<string, RecurringMeta>();

  groups.forEach((entry, key) => {
    if (entry.dates.length < 2) return;
    const dates = [...entry.dates].sort((a, b) => a.localeCompare(b));

    const intervals: number[] = [];
    for (let i = 1; i < dates.length; i++) {
      const ms = new Date(dates[i]! + 'T00:00:00Z').getTime()
               - new Date(dates[i - 1]! + 'T00:00:00Z').getTime();
      intervals.push(ms / 86_400_000);
    }

    const avg    = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    if (avg <= 0) return; // same-day duplicates — not recurring

    const variance = intervals.reduce((acc, v) => acc + (v - avg) ** 2, 0) / intervals.length;
    const stdDev   = Math.sqrt(variance);
    if (stdDev / avg >= 0.20) return; // too irregular

    const txSample = sorted.find(t => t.date === dates[dates.length - 1]
      && `${t.description ?? ''}\x00${t.type}` === key);
    if (!txSample) return;

    const signed = isIncome(txSample) ? entry.lastValue : -entry.lastValue;
    recurringMeta.set(key, {
      avgInterval:  Math.round(avg),
      lastDate:     dates[dates.length - 1]!,
      signedValue:  signed,
      type:         txSample.type,
    });
  });

  const recurringKeys = new Set(recurringMeta.keys());

  // ── 3. Net run rate — last 30 days, excluding recurrings ──────────────────
  const todayStr  = utcDateStr(now);
  const cutoffStr = utcDateStr(now, -30);

  const recent = sorted.filter(tx =>
    (tx.date ?? '') > cutoffStr &&
    (tx.date ?? '') <= todayStr &&
    !recurringKeys.has(`${tx.description ?? ''}\x00${tx.type}`),
  );

  const incomeVals:  number[] = [];
  const expenseVals: number[] = [];

  recent.forEach(tx => {
    const v = Math.abs(Number(tx.value ?? 0));
    if (isIncome(tx)) incomeVals.push(v);
    else              expenseVals.push(v);
  });

  // Anomaly filter — only if median > 0
  const medInc = median(incomeVals);
  const medExp = median(expenseVals);

  const filteredInc = medInc > 0 ? incomeVals.filter(v => v <= medInc  * 3) : incomeVals;
  const filteredExp = medExp > 0 ? expenseVals.filter(v => v <= medExp * 3) : expenseVals;

  const totalInc = filteredInc.reduce((a, b) => a + b, 0);
  const totalExp = filteredExp.reduce((a, b) => a + b, 0);

  const netRunRate = round(totalInc / 30 - totalExp / 30);

  // ── 4. Recurring projection map — date → net signed delta ─────────────────
  //    Performance: single map, no intermediate arrays
  const endStr = utcDateStr(now, days);
  const recurringMap: Record<string, number> = {};

  recurringMeta.forEach(({ avgInterval, lastDate, signedValue }) => {
    if (avgInterval <= 0) return;

    // Anchor: next occurrence after last known date
    let cursor = new Date(lastDate + 'T00:00:00Z');
    cursor.setUTCDate(cursor.getUTCDate() + avgInterval);

    while (true) {
      const dateStr = cursor.toISOString().slice(0, 10);
      if (dateStr > endStr) break;
      // PROJECTION GUARD: future only
      if (dateStr > todayStr) {
        recurringMap[dateStr] = round((recurringMap[dateStr] ?? 0) + signedValue);
      }
      cursor.setUTCDate(cursor.getUTCDate() + avgInterval);
    }
  });

  // ── 5. Day-by-day projection ───────────────────────────────────────────────
  const points: ForecastPoint[] = [];
  let balance    = currentBalance;
  let minBalance = currentBalance;

  for (let i = 1; i <= days; i++) {
    const dateStr = utcDateStr(now, i);
    balance    = round(balance + netRunRate + (recurringMap[dateStr] ?? 0));
    minBalance = Math.min(minBalance, balance);
    points.push({ date: dateStr, balance });
  }

  const finalBalance = balance;

  // ── 6. Health — deterministic priority ────────────────────────────────────
  let health: ForecastHealth;
  if (minBalance < 0 || finalBalance < 0) {
    health = 'danger';
  } else if (finalBalance >= currentBalance) {
    health = 'good';
  } else {
    health = 'warning';
  }

  return { points, finalBalance, minBalance, health };
}
