import { useMemo, type JSX } from 'react';
import { CalendarClock, CreditCard, Wallet } from 'lucide-react';

import { formatBRL, toCentavos, type Centavos } from '../../shared/types/money';
import type { RecurringTask, CreditCardWithMetrics } from '../../shared/types/transaction';

interface Props {
  recurringTasks: RecurringTask[];
  creditCards: CreditCardWithMetrics[];
  currentMonth: number; // 1–12
  currentYear: number;
  /** YYYY-MM-DD, injected for testability; defaults to real today */
  today?: string;
}

type EventKind = 'recurring' | 'card-closing' | 'card-due';

interface UpcomingEvent {
  id: string;
  kind: EventKind;
  label: string;
  valueCents: Centavos;
  daysFromNow: number; // 0..7
}

const KIND_CFG = {
  recurring: { Icon: CalendarClock, border: 'border-amber-500/30', bg: 'bg-amber-500/5', icon: 'text-amber-400', label: 'Recorrente' },
  'card-closing': { Icon: CreditCard, border: 'border-violet-500/30', bg: 'bg-violet-500/5', icon: 'text-violet-400', label: 'Fechamento' },
  'card-due': { Icon: Wallet, border: 'border-red-500/30', bg: 'bg-red-500/5', icon: 'text-red-400', label: 'Vencimento' },
} as const;

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function dateForDay(year: number, monthOneBased: number, day: number): Date {
  return new Date(year, monthOneBased - 1, Math.min(day, daysInMonth(year, monthOneBased)));
}

function nextMonthlyOccurrence(todayDate: Date, dueDay: number): Date {
  const thisMonth = todayDate.getMonth() + 1;
  const candidate = dateForDay(todayDate.getFullYear(), thisMonth, dueDay);
  if (candidate >= todayDate) return candidate;
  return dateForDay(todayDate.getFullYear(), thisMonth + 1, dueDay);
}

function nextAnnualOccurrence(todayDate: Date, dueMonth: number, dueDay: number): Date {
  const candidate = dateForDay(todayDate.getFullYear(), dueMonth, dueDay);
  if (candidate >= todayDate) return candidate;
  return dateForDay(todayDate.getFullYear() + 1, dueMonth, dueDay);
}

function relLabel(d: number): string {
  if (d === 0) return 'Hoje';
  if (d === 1) return 'Amanhã';
  return `em ${d} dias`;
}

export function UpcomingEventsStrip({
  recurringTasks,
  creditCards,
  today,
}: Props): JSX.Element | null {
  const events = useMemo<UpcomingEvent[]>(() => {
    const todayDate = today
      ? (() => {
          const [y = 0, m = 0, d = 0] = today.split('-').map(Number) as [number, number, number];
          return new Date(y, m - 1, d);
        })()
      : (() => {
          const n = new Date();
          return new Date(n.getFullYear(), n.getMonth(), n.getDate());
        })();

    const daysDiff = (target: Date): number =>
      Math.round((target.getTime() - todayDate.getTime()) / 86_400_000);

    const result: UpcomingEvent[] = [];

    // ── Recurring tasks ──────────────────────────────────────────────────────
    for (const t of recurringTasks) {
      if (!t.active) continue;
      if (t.type === 'entrada') continue;

      const dueDate = t.frequency === 'anual'
        ? nextAnnualOccurrence(todayDate, t.dueMonth ?? todayDate.getMonth() + 1, t.dueDay)
        : nextMonthlyOccurrence(todayDate, t.dueDay);
      if (t.lastExecutedMonth === monthKey(dueDate)) continue;

      const days = daysDiff(dueDate);
      if (days < 0 || days > 7) continue;

      const valueCents = t.value_cents ?? toCentavos(t.value);
      result.push({
        id: `rec-${t.id}`,
        kind: 'recurring',
        label: t.description,
        valueCents,
        daysFromNow: days,
      });
    }

    // ── Credit cards ─────────────────────────────────────────────────────────
    for (const card of creditCards) {
      if (!card.active) continue;
      const faturaCents = card.metrics.faturaCents;

      // Closing day
      const closingDate = nextMonthlyOccurrence(todayDate, card.closingDay);
      const closingDays = daysDiff(closingDate);
      if (faturaCents !== 0 && closingDays >= 0 && closingDays <= 7) {
        result.push({
          id: `close-${card.id}`,
          kind: 'card-closing',
          label: card.name,
          valueCents: faturaCents,
          daysFromNow: closingDays,
        });
      }

      // Due day
      const dueDate = nextMonthlyOccurrence(todayDate, card.dueDay);
      const dueDays = daysDiff(dueDate);
      if (faturaCents !== 0 && dueDays >= 0 && dueDays <= 7) {
        result.push({
          id: `due-${card.id}`,
          kind: 'card-due',
          label: card.name,
          valueCents: faturaCents,
          daysFromNow: dueDays,
        });
      }
    }

    result.sort((a, b) => a.daysFromNow - b.daysFromNow);
    return result;
  }, [recurringTasks, creditCards, today]);

  if (events.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-wider text-quantum-fgMuted px-0.5">
        Próximos 7 dias
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-0.5 px-0.5">
        {events.map(ev => {
          const cfg = KIND_CFG[ev.kind];
          return (
            <div
              key={ev.id}
              className={`flex-none rounded-xl border px-3 py-2 min-w-[140px] ${cfg.border} ${cfg.bg}`}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <cfg.Icon className={`h-3 w-3 ${cfg.icon}`} />
                <span className={`text-[9px] font-bold uppercase tracking-wide ${cfg.icon}`}>{cfg.label}</span>
                <span className="ml-auto text-[9px] text-quantum-fgMuted font-medium">{relLabel(ev.daysFromNow)}</span>
              </div>
              <p className="text-xs font-bold text-quantum-fg truncate">{ev.label}</p>
              {ev.valueCents > 0 && (
                <p className={`text-[10px] font-bold ${cfg.icon}`}>{formatBRL(ev.valueCents)}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
