import type { Transaction, RecurringTask } from '../shared/types/transaction';
import type { Centavos } from '../shared/types/money';

export interface TimelineEvent {
  type: 'recurring' | 'installment' | 'projection';
  description: string;
  amountCents: Centavos;
  direction: 'in' | 'out';
}

export interface DailyBalance {
  date: string; // YYYY-MM-DD
  balanceCents: Centavos;
  events: TimelineEvent[];
}

export type IncomeScenario = 'pessimistic' | 'median' | 'optimistic';

/**
 * Parses YYYY-MM-DD without new Date(string) to avoid timezone issues.
 */
function parseDateParts(dateStr: string): [number, number, number] {
  const parts = dateStr.split('-').map(Number);
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

/**
 * Formats a YYYY-MM-DD from year, month, day integers.
 */
function formatDate(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Adds `days` to a YYYY-MM-DD string using pure arithmetic.
 */
function addDays(dateStr: string, days: number): string {
  const [y, m, d] = parseDateParts(dateStr);
  // Use Date only for arithmetic (no string parsing), safe for DST-free UTC ops:
  const ms = Date.UTC(y, m - 1, d + days);
  const dt = new Date(ms);
  return formatDate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/**
 * Returns last day of a given month (1-based).
 */
function lastDayOfMonth(y: number, m: number): number {
  // Day 0 of next month = last day of current month
  const dt = new Date(Date.UTC(y, m, 0));
  return dt.getUTCDate();
}

/**
 * Returns the next occurrence date for a recurring task after `fromDate` (YYYY-MM-DD).
 */
function nextRecurringDate(task: RecurringTask, fromDate: string): string | null {
  const [fy, fm, fd] = parseDateParts(fromDate);

  if (task.frequency === 'mensal' || !task.frequency) {
    // Next month that has dueDay >= fd in same month or next
    const dueDay = task.dueDay;
    // Try same month first
    const lastDay = lastDayOfMonth(fy, fm);
    const clampedDay = Math.min(dueDay, lastDay);
    if (clampedDay > fd) {
      return formatDate(fy, fm, clampedDay);
    }
    // Next month
    const nm = fm === 12 ? 1 : fm + 1;
    const ny = fm === 12 ? fy + 1 : fy;
    const nextLast = lastDayOfMonth(ny, nm);
    return formatDate(ny, nm, Math.min(dueDay, nextLast));
  }

  if (task.frequency === 'anual') {
    const dueMonth = task.dueMonth ?? 1;
    const dueDay = task.dueDay;
    // Try this year
    const lastDay = lastDayOfMonth(fy, dueMonth);
    const clampedDay = Math.min(dueDay, lastDay);
    const thisYearDate = formatDate(fy, dueMonth, clampedDay);
    if (thisYearDate > fromDate) return thisYearDate;
    // Next year
    const nextLast = lastDayOfMonth(fy + 1, dueMonth);
    return formatDate(fy + 1, dueMonth, Math.min(dueDay, nextLast));
  }

  return null;
}

/**
 * Computes the average income per day over the last 3 months from `today`.
 */
function computeAvgDailyIncomeCents(
  transactions: Transaction[],
  today: string,
  scenario: IncomeScenario,
): number {
  const [ty, tm, td] = parseDateParts(today);
  // 90 days ago
  const cutoffMs = Date.UTC(ty, tm - 1, td - 90);
  const cutoffDt = new Date(cutoffMs);
  const cutoff = formatDate(
    cutoffDt.getUTCFullYear(),
    cutoffDt.getUTCMonth() + 1,
    cutoffDt.getUTCDate(),
  );

  let totalIncomeCents = 0;
  for (const tx of transactions) {
    if (!tx.date || tx.date < cutoff || tx.date > today) continue;
    if (tx.isDeleted || tx.deletedAt) continue;
    if (tx.type === 'transferencia') continue;
    if (tx.type === 'entrada' || tx.type === 'receita') {
      totalIncomeCents += tx.value_cents ?? 0;
    }
  }

  const dailyAvg = totalIncomeCents / 90;

  const scenarioMultiplier: Record<IncomeScenario, number> = {
    pessimistic: 0.75,
    median:      1.00,
    optimistic:  1.25,
  };

  return Math.round(dailyAvg * scenarioMultiplier[scenario]);
}

/**
 * Finds future installment transactions (unpaid, date > today).
 */
function getFutureInstallments(transactions: Transaction[], today: string): Transaction[] {
  return transactions.filter(tx => {
    if (!tx.date || tx.date <= today) return false;
    if (tx.isDeleted || tx.deletedAt) return false;
    if (!tx.installmentGroupId) return false;
    return true;
  });
}

/**
 * Projects balance day-by-day for the next N days.
 * Combines: current balance + recurring tasks + future installments + income projection.
 * Anti-double-counting: installments are excluded from recurring matching by description.
 *
 * @param params.currentBalanceCents  Current account balance in centavos
 * @param params.transactions         Full transaction list for history + future installments
 * @param params.recurringTasks       Active recurring tasks for projection
 * @param params.today                YYYY-MM-DD base date
 * @param params.daysAhead            Number of days to project (default 90)
 * @param params.incomeScenario       Income scenario (default 'median')
 */
export function computeCashflowTimeline(params: {
  currentBalanceCents: Centavos;
  transactions: Transaction[];
  recurringTasks: RecurringTask[];
  today: string;
  daysAhead?: number;
  incomeScenario?: IncomeScenario;
}): DailyBalance[] {
  const {
    currentBalanceCents,
    transactions,
    recurringTasks,
    today,
    daysAhead = 90,
    incomeScenario = 'median',
  } = params;

  // Collect future installment descriptions to avoid double-counting with recurring
  const futureInstallments = getFutureInstallments(transactions, today);
  const installmentDescriptionsLower = new Set(
    futureInstallments.map(tx => tx.description.toLowerCase().trim()),
  );

  // Build a map: date -> TimelineEvent[] for installments
  const installmentsByDate = new Map<string, TimelineEvent[]>();
  for (const tx of futureInstallments) {
    const events = installmentsByDate.get(tx.date) ?? [];
    const isIn = tx.type === 'entrada' || tx.type === 'receita';
    events.push({
      type:        'installment',
      description: tx.description,
      amountCents: (tx.value_cents ?? 0) as Centavos,
      direction:   isIn ? 'in' : 'out',
    });
    installmentsByDate.set(tx.date, events);
  }

  // Filter active recurring tasks, exclude those covered by installments
  const activeTasks = recurringTasks.filter(task => {
    if (task.active === false) return false;
    const descLower = task.description.toLowerCase().trim();
    if (installmentDescriptionsLower.has(descLower)) return false;
    return true;
  });

  // Pre-compute next occurrence dates for each active task starting from today
  // Build map: date -> events
  const recurringEventsByDate = new Map<string, TimelineEvent[]>();

  const endDate = addDays(today, daysAhead);

  for (const task of activeTasks) {
    let cursor = today;
    // Find all occurrences within window
    for (let iter = 0; iter < 15; iter++) { // max 15 occurrences per task (safety)
      const nextDate = nextRecurringDate(task, cursor);
      if (!nextDate || nextDate >= endDate) break;

      const isIn = task.type === 'entrada' || task.type === 'receita';
      const amountCents = (task.value_cents ?? 0) as Centavos;

      const events = recurringEventsByDate.get(nextDate) ?? [];
      events.push({
        type:        'recurring',
        description: task.description,
        amountCents,
        direction:   isIn ? 'in' : 'out',
      });
      recurringEventsByDate.set(nextDate, events);

      cursor = nextDate;
    }
  }

  // Compute daily income projection (divided equally per day)
  const dailyIncomeCents = computeAvgDailyIncomeCents(transactions, today, incomeScenario);

  // Build the timeline
  const result: DailyBalance[] = [];
  let runningBalance = currentBalanceCents;

  for (let i = 1; i <= daysAhead; i++) {
    const date = addDays(today, i);
    const dayEvents: TimelineEvent[] = [];

    // Add installment events
    const instEvents = installmentsByDate.get(date) ?? [];
    dayEvents.push(...instEvents);

    // Add recurring events
    const recEvents = recurringEventsByDate.get(date) ?? [];
    dayEvents.push(...recEvents);

    // Add income projection event only if there's projected income
    if (dailyIncomeCents > 0) {
      dayEvents.push({
        type:        'projection',
        description: 'Renda projetada',
        amountCents: dailyIncomeCents as Centavos,
        direction:   'in',
      });
    }

    // Compute balance delta for this day
    let delta = 0;
    for (const ev of dayEvents) {
      if (ev.direction === 'in') {
        delta += ev.amountCents;
      } else {
        delta -= ev.amountCents;
      }
    }

    runningBalance = (runningBalance + delta) as Centavos;

    result.push({
      date,
      balanceCents: runningBalance as Centavos,
      events:       dayEvents,
    });
  }

  return result;
}

/**
 * Returns the first date in the timeline where balanceCents < 0, or null if never.
 */
export function firstNegativeDate(timeline: DailyBalance[]): string | null {
  for (const day of timeline) {
    if (day.balanceCents < 0) return day.date;
  }
  return null;
}
