/**
 * useUpcomingEvents — Pure computation hook.
 * Generates upcoming financial events for the next N days from:
 *   - Recurring tasks (monthly/annual)
 *   - Future installment transactions
 *
 * Critical: all amounts stay as Centavos (integers). No float math.
 */

import { useMemo } from 'react';
import type { Transaction, RecurringTask, TransactionType } from '../shared/types/transaction';
import type { Centavos } from '../shared/types/money';

export type UpcomingEventKind = 'recurring' | 'installment' | 'income' | 'expense' | 'transfer';

export interface UpcomingEvent {
  id: string;               // stable key for React
  date: string;             // YYYY-MM-DD
  description: string;
  amountCents: Centavos;
  direction: 'in' | 'out';
  kind: UpcomingEventKind;
  /** Original transaction id (for installments) */
  txId?: string;
  /** Original recurring task id */
  recurringId?: string;
  installmentIndex?: number | undefined;
  installmentCount?: number | undefined;
}

// ─── Internal date helpers (no new Date(string) parsing) ──────────────────────

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function parseParts(iso: string): [number, number, number] {
  const [y, m, d] = iso.split('-').map(Number);
  return [y ?? 0, m ?? 0, d ?? 0];
}

function isoFromUTC(ms: number): string {
  const dt = new Date(ms);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = parseParts(iso);
  return isoFromUTC(Date.UTC(y, m - 1, d + days));
}

function lastDayOfMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/**
 * Returns the next occurrence date of a recurring task strictly after `fromDate`.
 */
function nextOccurrence(task: RecurringTask, fromDate: string): string | null {
  const [fy, fm, fd] = parseParts(fromDate);

  if (!task.frequency || task.frequency === 'mensal') {
    const dueDay = task.dueDay;
    // Try same month
    const lastDay = lastDayOfMonth(fy, fm);
    const clamped = Math.min(dueDay, lastDay);
    if (clamped > fd) return `${fy}-${pad(fm)}-${pad(clamped)}`;
    // Next month
    const nm = fm === 12 ? 1 : fm + 1;
    const ny = fm === 12 ? fy + 1 : fy;
    const nextLast = lastDayOfMonth(ny, nm);
    return `${ny}-${pad(nm)}-${pad(Math.min(dueDay, nextLast))}`;
  }

  if (task.frequency === 'anual') {
    const dm = task.dueMonth ?? 1;
    const dd = task.dueDay;
    // Try this year
    const lastDay = lastDayOfMonth(fy, dm);
    const thisYear = `${fy}-${pad(dm)}-${pad(Math.min(dd, lastDay))}`;
    if (thisYear > fromDate) return thisYear;
    // Next year
    const nextLast = lastDayOfMonth(fy + 1, dm);
    return `${fy + 1}-${pad(dm)}-${pad(Math.min(dd, nextLast))}`;
  }

  return null;
}

function directionForType(type: TransactionType | undefined): 'in' | 'out' {
  if (type === 'entrada' || type === 'receita') return 'in';
  if (type === 'transferencia') return 'out'; // treat as neutral/out for balance
  return 'out';
}

function kindForType(type: TransactionType | undefined): UpcomingEventKind {
  if (type === 'entrada' || type === 'receita') return 'income';
  if (type === 'transferencia') return 'transfer';
  return 'expense';
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

interface UseUpcomingEventsParams {
  transactions: Transaction[];
  recurringTasks: RecurringTask[];
  days?: number;
  /** Override today for testing (YYYY-MM-DD) */
  today?: string;
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function useUpcomingEvents({
  transactions,
  recurringTasks,
  days = 90,
  today,
}: UseUpcomingEventsParams): UpcomingEvent[] {
  return useMemo(() => {
    const base = today ?? todayISO();
    const endDate = addDays(base, days);
    const events: UpcomingEvent[] = [];

    // 1. Future installments
    for (const tx of transactions) {
      if (!tx.date || tx.date <= base) continue;
      if (tx.date >= endDate) continue;
      if (tx.isDeleted || tx.deletedAt) continue;
      if (!tx.installmentGroupId) continue;

      events.push({
        id:               `inst-${tx.id}`,
        date:             tx.date,
        description:      tx.description,
        amountCents:      (tx.value_cents ?? 0) as Centavos,
        direction:        directionForType(tx.type),
        kind:             'installment',
        txId:             tx.id,
        installmentIndex: tx.installmentIndex,
        installmentCount: tx.installmentCount,
      });
    }

    // 2. Recurring task projections
    // Build set of installment descriptions to avoid double-counting
    const instDescLower = new Set(
      transactions
        .filter(tx => tx.installmentGroupId && !tx.isDeleted && !tx.deletedAt)
        .map(tx => tx.description.toLowerCase().trim()),
    );

    for (const task of recurringTasks) {
      if (task.active === false) continue;
      const descLower = task.description.toLowerCase().trim();
      if (instDescLower.has(descLower)) continue;

      let cursor = base;
      for (let iter = 0; iter < 15; iter++) {
        const next = nextOccurrence(task, cursor);
        if (!next || next >= endDate) break;

        events.push({
          id:          `rec-${task.id}-${next}`,
          date:        next,
          description: task.description,
          amountCents: (task.value_cents ?? 0) as Centavos,
          direction:   directionForType(task.type),
          kind:        'recurring',
          recurringId: task.id,
        });

        cursor = next;
      }
    }

    // 3. Non-installment future transactions (already confirmed, date in future)
    for (const tx of transactions) {
      if (!tx.date || tx.date <= base) continue;
      if (tx.date >= endDate) continue;
      if (tx.isDeleted || tx.deletedAt) continue;
      if (tx.installmentGroupId) continue; // already covered above

      events.push({
        id:        `tx-${tx.id}`,
        date:      tx.date,
        description: tx.description,
        amountCents: (tx.value_cents ?? 0) as Centavos,
        direction:   directionForType(tx.type),
        kind:        kindForType(tx.type),
        txId:        tx.id,
      });
    }

    // Sort by date ascending, then by direction (income before expense)
    events.sort((a, b) => {
      if (a.date < b.date) return -1;
      if (a.date > b.date) return 1;
      // income first within same date
      if (a.direction === 'in' && b.direction !== 'in') return -1;
      if (b.direction === 'in' && a.direction !== 'in') return 1;
      return 0;
    });

    return events;
  }, [transactions, recurringTasks, days, today]);
}
