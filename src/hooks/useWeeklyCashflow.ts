import { useMemo } from 'react';
import type { Transaction, RecurringTask } from '../shared/types/transaction';
import { fromCentavos } from '../shared/types/money';
import { getTransactionCentavos } from '../utils/transactionUtils';
import { isIncome as checkIncome, isExpense as checkExpense } from '../utils/transactionUtils';

export interface WeekBucket {
  label:        string; // e.g. "Sem 1", "Semana 23/06"
  startDate:    string; // ISO YYYY-MM-DD
  endDate:      string;
  incomeCents:  number;
  expenseCents: number; // always positive
  isForecast:   boolean;
}

export interface FutureEvent {
  date:        string; // YYYY-MM-DD
  description: string;
  amountCents: number; // signed — negative = despesa
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function weekLabel(start: Date): string {
  return `${String(start.getDate()).padStart(2, '0')}/${String(start.getMonth() + 1).padStart(2, '0')}`;
}

function startOfWeek(d: Date): Date {
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day; // Monday-based
  return addDays(d, diff);
}

/** Returns the due date for a recurring task in a given year+month */
function dueDate(task: RecurringTask, year: number, month: number): Date {
  const day = Math.min(task.dueDay, new Date(year, month, 0).getDate());
  return new Date(year, month - 1, day);
}

/** Is this task due in the given year/month? (handles annual) */
function isDueInMonth(task: RecurringTask, _year: number, month: number): boolean {
  if (!task.active) return false;
  if (task.frequency === 'anual') {
    return task.dueMonth === month;
  }
  return true; // monthly tasks are due every month
}

export interface WeeklyCashflowResult {
  weeks:        WeekBucket[];
  futureEvents: FutureEvent[];
}

export function useWeeklyCashflow(
  transactions: Transaction[],
  recurringTasks: RecurringTask[],
): WeeklyCashflowResult {
  return useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // ── Build 4 historical week buckets (Mon–Sun, ending last complete week) ──
    const thisWeekStart = startOfWeek(today);

    const weeks: WeekBucket[] = [];
    for (let w = 3; w >= 0; w--) {
      const start = addDays(thisWeekStart, -w * 7);
      const end   = addDays(start, 6);
      weeks.push({
        label:        weekLabel(start),
        startDate:    isoDate(start),
        endDate:      isoDate(end),
        incomeCents:  0,
        expenseCents: 0,
        isForecast:   false,
      });
    }

    // ── Accumulate real transactions into historical buckets ──
    for (const tx of transactions) {
      if (!tx.date) continue;
      for (const bucket of weeks) {
        if (tx.date >= bucket.startDate && tx.date <= bucket.endDate) {
          const cents = Math.abs(getTransactionCentavos(tx) ?? 0);
          if (checkIncome(tx.type)) bucket.incomeCents  += cents;
          if (checkExpense(tx.type)) bucket.expenseCents += cents;
          break;
        }
      }
    }

    // ── Build 2 forecast week buckets ──
    const fw1Start = thisWeekStart;
    const fw1End   = addDays(fw1Start, 6);
    const fw2Start = addDays(fw1Start, 7);
    const fw2End   = addDays(fw1Start, 13);

    // Average historical income/expense per week (last 3 complete weeks as base)
    const historicalComplete = weeks.filter(w => w.endDate < isoDate(today));
    const histCount = historicalComplete.length || 1;
    const avgIncome  = historicalComplete.reduce((s, w) => s + w.incomeCents,  0) / histCount;
    const avgExpense = historicalComplete.reduce((s, w) => s + w.expenseCents, 0) / histCount;

    const forecastBuckets: WeekBucket[] = [
      {
        label: weekLabel(fw1Start), startDate: isoDate(fw1Start), endDate: isoDate(fw1End),
        incomeCents: avgIncome, expenseCents: avgExpense, isForecast: true,
      },
      {
        label: weekLabel(fw2Start), startDate: isoDate(fw2Start), endDate: isoDate(fw2End),
        incomeCents: avgIncome, expenseCents: avgExpense, isForecast: true,
      },
    ];

    // ── Add recurring tasks into forecast buckets ──
    const futureEvents: FutureEvent[] = [];

    // Check current month + next month for recurring tasks
    const monthsToCheck: Array<{ year: number; month: number }> = [];
    for (let offset = 0; offset <= 1; offset++) {
      const d = new Date(today.getFullYear(), today.getMonth() + offset, 1);
      monthsToCheck.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
    }

    for (const task of recurringTasks) {
      const valueCents = task.value_cents ?? 0;
      if (valueCents === 0) continue;

      for (const { year, month } of monthsToCheck) {
        if (!isDueInMonth(task, year, month)) continue;

        const due = dueDate(task, year, month);
        const dueDateStr = isoDate(due);

        // Only care about future dates (from today onward)
        if (dueDateStr < isoDate(today)) continue;

        const isIncome = checkIncome(task.type ?? '');
        const signed   = isIncome ? Number(valueCents) : -Number(valueCents);

        futureEvents.push({
          date:        dueDateStr,
          description: task.description,
          amountCents: signed,
        });

        // Add into forecast bucket
        for (const fb of forecastBuckets) {
          if (dueDateStr >= fb.startDate && dueDateStr <= fb.endDate) {
            if (checkIncome(task.type ?? '')) fb.incomeCents  += Number(valueCents);
            else          fb.expenseCents += Number(valueCents);
            break;
          }
        }
      }
    }

    // Sort future events by date
    futureEvents.sort((a, b) => a.date.localeCompare(b.date));

    return {
      weeks:        [...weeks, ...forecastBuckets],
      futureEvents: futureEvents.slice(0, 8),
    };
  }, [transactions, recurringTasks]);
}

export function formatCents(cents: number): string {
  return `R$ ${fromCentavos(Math.abs(cents)).toFixed(0)}`;
}
