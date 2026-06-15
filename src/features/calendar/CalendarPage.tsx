import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays, Repeat, CreditCard, Target } from 'lucide-react';
import { useRecurring } from '../../hooks/useRecurring';
import { useCreditCards } from '../../hooks/useCreditCards';
import { useGoals } from '../../hooks/useGoals';
import { MoneyDisplay } from '../../shared/components/ui';
import type { Centavos } from '../../shared/types/money';
import type { LucideIcon } from 'lucide-react';

interface Props { uid: string }

type EventKind = 'expense' | 'income' | 'bill-due' | 'bill-closing' | 'goal';

interface CalEvent {
  id:          string;
  kind:        EventKind;
  label:       string;
  amountCents: Centavos;
}

type DayEvents = Map<number, CalEvent[]>;

const KIND_CFG: Record<EventKind, {
  dot:   string;
  badge: string;
  text:  string;
  icon:  LucideIcon;
  name:  string;
}> = {
  expense:      { dot: 'bg-red-400',     badge: 'bg-red-500/10 border-red-500/25 text-red-400',          text: 'text-red-400',     icon: Repeat,     name: 'Despesa Fixa'    },
  income:       { dot: 'bg-emerald-400', badge: 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400', text: 'text-emerald-400', icon: Repeat,     name: 'Receita Fixa'    },
  'bill-due':   { dot: 'bg-blue-400',    badge: 'bg-blue-500/10 border-blue-500/25 text-blue-400',        text: 'text-blue-400',    icon: CreditCard, name: 'Venc. Fatura'    },
  'bill-closing': { dot: 'bg-amber-400', badge: 'bg-amber-500/10 border-amber-500/25 text-amber-400',     text: 'text-amber-400',   icon: CreditCard, name: 'Fechamento'      },
  goal:         { dot: 'bg-purple-400',  badge: 'bg-purple-500/10 border-purple-500/25 text-purple-400',  text: 'text-purple-400',  icon: Target,     name: 'Prazo de Meta'   },
};

const MESES = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
] as const;

const DIAS_SEMANA = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'] as const;

export default function CalendarPage({ uid }: Props) {
  const today = new Date();
  const [year,        setYear]        = useState(today.getFullYear());
  const [month,       setMonth]       = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(today.getDate());

  const { recurringTasks } = useRecurring(uid);
  const { cards }          = useCreditCards(uid);
  const { goals }          = useGoals(uid);

  const daysInMonth    = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const totalCells     = Math.ceil((firstDayOfWeek + daysInMonth) / 7) * 7;

  const dayEvents = useMemo<DayEvents>(() => {
    const map = new Map<number, CalEvent[]>();

    const push = (day: number, evt: CalEvent) => {
      if (day < 1 || day > daysInMonth) return;
      const list = map.get(day) ?? [];
      list.push(evt);
      map.set(day, list);
    };

    for (const task of recurringTasks) {
      if (!task.active) continue;
      const isAnnual = task.frequency === 'anual';
      const inMonth  = !isAnnual || (task.dueMonth ?? 0) === month + 1;
      if (!inMonth) continue;
      push(task.dueDay, {
        id:          `rec-${task.id}`,
        kind:        (task.type === 'entrada' || task.type === 'receita') ? 'income' : 'expense',
        label:       task.description,
        amountCents: task.value_cents ?? (0 as Centavos),
      });
    }

    for (const card of cards) {
      if (!card.active) continue;
      push(card.dueDay, {
        id:          `bill-${card.id}`,
        kind:        'bill-due',
        label:       `Fatura ${card.name}`,
        amountCents: 0 as Centavos,
      });
      push(card.closingDay, {
        id:          `close-${card.id}`,
        kind:        'bill-closing',
        label:       `Fechamento ${card.name}`,
        amountCents: 0 as Centavos,
      });
    }

    for (const goal of goals) {
      if (!goal.deadline) continue;
      const parts = goal.deadline.split('-').map(Number);
      const [gy, gm, gd] = parts as [number, number, number];
      if (gy === year && gm === month + 1) {
        push(gd, {
          id:          `goal-${goal.id}`,
          kind:        'goal',
          label:       goal.name,
          amountCents: goal.targetCents,
        });
      }
    }

    return map;
  }, [year, month, daysInMonth, recurringTasks, cards, goals]);

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else               setMonth(m => m - 1);
    setSelectedDay(null);
  };
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else                setMonth(m => m + 1);
    setSelectedDay(null);
  };

  const isToday = (day: number) =>
    day === today.getDate() && month === today.getMonth() && year === today.getFullYear();

  const selectedEvents = selectedDay !== null ? (dayEvents.get(selectedDay) ?? []) : [];

  return (
    <div className="max-w-5xl mx-auto space-y-6 py-4">
      {/* Cabeçalho */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-quantum-accent/10 border border-quantum-accent/25 flex items-center justify-center">
          <CalendarDays className="w-5 h-5 text-quantum-accent" />
        </div>
        <div>
          <h1 className="text-xl font-black text-quantum-fg">Calendário Financeiro</h1>
          <p className="text-xs text-quantum-fgMuted">Vencimentos, fechamentos de cartão e prazos de metas</p>
        </div>
      </div>

      {/* Navegação */}
      <div className="flex items-center justify-between">
        <button
          onClick={prevMonth}
          aria-label="Mês anterior"
          className="p-2 rounded-xl bg-quantum-card border border-quantum-border hover:border-quantum-accent/40 text-quantum-fgMuted hover:text-quantum-fg transition-all"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h2 className="text-lg font-black text-quantum-fg">{MESES[month]} {year}</h2>
        <button
          onClick={nextMonth}
          aria-label="Próximo mês"
          className="p-2 rounded-xl bg-quantum-card border border-quantum-border hover:border-quantum-accent/40 text-quantum-fgMuted hover:text-quantum-fg transition-all"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Legenda */}
      <div className="flex flex-wrap gap-4">
        {(Object.entries(KIND_CFG) as [EventKind, (typeof KIND_CFG)[EventKind]][]).map(([kind, cfg]) => (
          <div key={kind} className="flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-full ${cfg.dot}`} />
            <span className="text-[10px] text-quantum-fgMuted font-medium">{cfg.name}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
        {/* Grade do calendário */}
        <div className="bg-quantum-card/40 border border-quantum-border rounded-2xl overflow-hidden">
          {/* Cabeçalho dos dias da semana */}
          <div className="grid grid-cols-7 border-b border-quantum-border">
            {DIAS_SEMANA.map(d => (
              <div key={d} className="py-2.5 text-center text-[10px] font-bold text-quantum-fgMuted uppercase tracking-wider">
                {d}
              </div>
            ))}
          </div>

          {/* Células dos dias */}
          <div className="grid grid-cols-7">
            {Array.from({ length: totalCells }, (_, i) => {
              const day      = i - firstDayOfWeek + 1;
              const isValid  = day >= 1 && day <= daysInMonth;
              const events   = isValid ? (dayEvents.get(day) ?? []) : [];
              const isSelected = isValid && selectedDay === day;
              const todayDay = isValid && isToday(day);

              return (
                <button
                  key={i}
                  onClick={() => isValid && setSelectedDay(prev => prev === day ? null : day)}
                  disabled={!isValid}
                  className={[
                    'relative min-h-[72px] p-1.5 border-b border-r border-quantum-border/30 flex flex-col items-start transition-all',
                    !isValid    ? 'cursor-default' : 'cursor-pointer hover:bg-quantum-bgSecondary/50',
                    isSelected  ? 'bg-quantum-accent/5 border-l-2 border-l-quantum-accent' : '',
                  ].join(' ')}
                >
                  {isValid && (
                    <>
                      <span className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full mb-1 ${
                        todayDay
                          ? 'bg-quantum-accent text-quantum-bg'
                          : isSelected
                            ? 'text-quantum-accent'
                            : 'text-quantum-fgMuted'
                      }`}>
                        {day}
                      </span>
                      <div className="flex flex-wrap gap-0.5">
                        {events.slice(0, 3).map(evt => (
                          <div key={evt.id} className={`w-1.5 h-1.5 rounded-full ${KIND_CFG[evt.kind].dot}`} />
                        ))}
                        {events.length > 3 && (
                          <span className="text-[8px] text-quantum-fgMuted font-bold">+{events.length - 3}</span>
                        )}
                      </div>
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Painel do dia selecionado */}
        <div className="bg-quantum-card/40 border border-quantum-border rounded-2xl p-4 h-fit">
          {selectedDay !== null ? (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm font-black ${
                  isToday(selectedDay)
                    ? 'bg-quantum-accent text-quantum-bg'
                    : 'bg-quantum-bgSecondary text-quantum-fg'
                }`}>
                  {selectedDay}
                </div>
                <div>
                  <p className="text-sm font-black text-quantum-fg">
                    {String(selectedDay).padStart(2, '0')}/{String(month + 1).padStart(2, '0')}/{year}
                  </p>
                  <p className="text-[10px] text-quantum-fgMuted">
                    {selectedEvents.length} evento{selectedEvents.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>

              {selectedEvents.length === 0 ? (
                <p className="text-xs text-quantum-fgMuted text-center py-6">Nenhum evento neste dia.</p>
              ) : (
                <div className="space-y-2">
                  {selectedEvents.map(evt => {
                    const cfg  = KIND_CFG[evt.kind];
                    const Icon = cfg.icon;
                    return (
                      <div key={evt.id} className={`flex items-center gap-3 p-3 rounded-xl border ${cfg.badge}`}>
                        <Icon className="w-4 h-4 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold truncate">{evt.label}</p>
                          {evt.amountCents > 0 && (
                            <MoneyDisplay
                              cents={evt.amountCents}
                              size="sm"
                              className={`mt-0.5 ${cfg.text}`}
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <CalendarDays className="w-10 h-10 text-quantum-fgMuted/40 mb-3" />
              <p className="text-xs text-quantum-fgMuted">Clique em um dia para ver os eventos</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
