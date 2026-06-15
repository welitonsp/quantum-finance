import { useState, useMemo } from 'react';
import {
  CalendarRange, TrendingUp, TrendingDown, Clock, Repeat, CreditCard,
  ChevronDown, ChevronUp, ArrowDown, ArrowUp,
} from 'lucide-react';
import { useTransactions } from '../../hooks/useTransactions';
import { useRecurring } from '../../hooks/useRecurring';
import TimelineWidget from '../../components/TimelineWidget';
import { LoadingPage, EmptyState, Badge } from '../../shared/components/ui';
import { computeCashflowTimeline } from '../../lib/cashflowTimeline';
import { formatBRL } from '../../shared/types/money';
import type { Centavos } from '../../shared/types/money';
import type { DailyBalance, TimelineEvent } from '../../lib/cashflowTimeline';

interface Props {
  uid: string;
  currentBalanceCents: Centavos;
}

type EventFilter = 'todos' | 'recorrentes' | 'parcelas' | 'projecao';

const FILTER_LABELS: Record<EventFilter, string> = {
  todos:       'Todos',
  recorrentes: 'Despesas Fixas',
  parcelas:    'Parcelas',
  projecao:    'Projeção Receita',
};

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDisplayDate(isoDate: string): string {
  const [, m, d] = isoDate.split('-').map(Number);
  const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const dt = new Date(`${isoDate}T12:00:00`);
  return `${weekdays[dt.getDay()]} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}

function EventRow({ event }: { event: TimelineEvent }) {
  const isIn = event.direction === 'in';
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <div className="flex items-center gap-2 min-w-0">
        <div className={`p-1 rounded-md ${isIn ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
          {isIn ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
        </div>
        <span className="text-xs text-quantum-fg truncate">{event.description}</span>
        <Badge
          label={event.type === 'recurring' ? 'Fixo' : event.type === 'installment' ? 'Parcela' : 'Projeção'}
          variant={event.type === 'recurring' ? 'warning' : event.type === 'installment' ? 'info' : 'muted'}
        />
      </div>
      <span className={`text-xs font-bold font-mono shrink-0 ${isIn ? 'text-emerald-400' : 'text-red-400'}`}>
        {isIn ? '+' : '-'}{formatBRL(event.amountCents)}
      </span>
    </div>
  );
}

function DayRow({ day, isToday }: { day: DailyBalance; isToday: boolean }) {
  const [open, setOpen] = useState(isToday);
  const hasEvents = day.events.length > 0;
  const isNeg = day.balanceCents < 0;

  return (
    <div className={`rounded-xl border transition-all ${
      isToday
        ? 'border-cyan-500/40 bg-cyan-500/5'
        : hasEvents
        ? 'border-quantum-border bg-quantum-card/30 hover:border-quantum-border/70'
        : 'border-quantum-border/30 bg-transparent opacity-50'
    }`}>
      <button
        className="w-full flex items-center justify-between gap-3 px-4 py-3"
        onClick={() => hasEvents && setOpen(o => !o)}
        aria-expanded={open}
        disabled={!hasEvents}
      >
        <div className="flex items-center gap-3">
          {isToday && (
            <span className="text-[9px] font-black uppercase text-cyan-400 tracking-widest bg-cyan-500/15 border border-cyan-500/30 px-2 py-0.5 rounded-full">
              Hoje
            </span>
          )}
          <span className="text-xs font-bold text-quantum-fgMuted">{formatDisplayDate(day.date)}</span>
          {hasEvents && (
            <span className="text-[10px] text-quantum-fgMuted">
              {day.events.length} evento{day.events.length > 1 ? 's' : ''}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className={`text-sm font-black font-mono ${isNeg ? 'text-red-400' : 'text-quantum-fg'}`}>
            {formatBRL(day.balanceCents)}
          </span>
          {hasEvents && (
            open ? <ChevronUp className="w-4 h-4 text-quantum-fgMuted" /> : <ChevronDown className="w-4 h-4 text-quantum-fgMuted" />
          )}
        </div>
      </button>

      {open && hasEvents && (
        <div className="px-4 pb-3 border-t border-quantum-border/30 pt-2 space-y-0.5">
          {day.events.map((ev, i) => <EventRow key={i} event={ev} />)}
        </div>
      )}
    </div>
  );
}

export default function TimelinePage({ uid, currentBalanceCents }: Props) {
  const { transactions, loading: loadingTx } = useTransactions(uid);
  const { recurringTasks, loading: loadingRec } = useRecurring(uid);
  const [eventFilter, setEventFilter] = useState<EventFilter>('todos');
  const [showPast, setShowPast] = useState(false);

  const today = todayISO();

  const timeline = useMemo(() =>
    computeCashflowTimeline({
      currentBalanceCents,
      transactions,
      recurringTasks,
      today,
      daysAhead: 90,
      incomeScenario: 'median',
    }),
    [currentBalanceCents, transactions, recurringTasks, today],
  );

  const filteredTimeline = useMemo((): DailyBalance[] => {
    const base = showPast ? timeline : timeline.filter(d => d.date >= today);
    if (eventFilter === 'todos') return base;
    return base.map(d => ({
      ...d,
      events: d.events.filter(ev => ev.type === (
        eventFilter === 'recorrentes' ? 'recurring' :
        eventFilter === 'parcelas'    ? 'installment' : 'projection'
      )),
    })).filter(d => d.events.length > 0);
  }, [timeline, showPast, eventFilter, today]);

  // KPIs
  const totalOutCents = useMemo(() =>
    timeline
      .filter(d => d.date >= today)
      .flatMap(d => d.events)
      .filter(ev => ev.direction === 'out' && ev.type !== 'projection')
      .reduce((acc, ev) => acc + ev.amountCents, 0) as Centavos,
    [timeline, today],
  );

  const totalInCents = useMemo(() =>
    timeline
      .filter(d => d.date >= today)
      .flatMap(d => d.events)
      .filter(ev => ev.direction === 'in')
      .reduce((acc, ev) => acc + ev.amountCents, 0) as Centavos,
    [timeline, today],
  );

  const upcomingCount = timeline
    .filter(d => d.date >= today)
    .reduce((acc, d) => acc + d.events.filter(ev => ev.type !== 'projection').length, 0);

  if (loadingTx || loadingRec) return <LoadingPage label="Carregando timeline..." />;

  return (
    <div className="max-w-5xl mx-auto space-y-6 py-4">
      {/* Cabeçalho */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
          <CalendarRange className="w-5 h-5 text-cyan-400" />
        </div>
        <div>
          <h1 className="text-xl font-black text-quantum-fg">Timeline Financeira</h1>
          <p className="text-xs text-quantum-fgMuted">Passado registrado + futuro projetado em 90 dias</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Saldo atual', value: currentBalanceCents, icon: CreditCard, color: currentBalanceCents >= 0 ? 'text-quantum-fg' : 'text-red-400' },
          { label: 'Saídas previstas', value: totalOutCents, icon: TrendingDown, color: 'text-red-400' },
          { label: 'Entradas previstas', value: totalInCents, icon: TrendingUp, color: 'text-emerald-400' },
          { label: 'Eventos futuros', value: null, icon: Repeat, color: 'text-cyan-400', text: `${upcomingCount} itens` },
        ].map(({ label, value, icon: Icon, color, text }) => (
          <div key={label} className="bg-quantum-card/50 border border-quantum-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Icon className={`w-4 h-4 ${color}`} />
              <span className="text-[10px] text-quantum-fgMuted uppercase tracking-wider">{label}</span>
            </div>
            <p className={`text-lg font-black font-mono ${color}`}>
              {text ?? formatBRL(value!)}
            </p>
          </div>
        ))}
      </div>

      {/* Gráfico */}
      <TimelineWidget
        transactions={transactions}
        recurringTasks={recurringTasks}
        currentBalanceCents={currentBalanceCents}
      />

      {/* Filtros da lista */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 bg-quantum-card/60 border border-quantum-border rounded-xl p-1">
          {(Object.entries(FILTER_LABELS) as [EventFilter, string][]).map(([key, lbl]) => (
            <button
              key={key}
              onClick={() => setEventFilter(key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                eventFilter === key
                  ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                  : 'text-quantum-fgMuted hover:text-quantum-fg'
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>

        <button
          onClick={() => setShowPast(p => !p)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all ${
            showPast
              ? 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30'
              : 'bg-quantum-card/60 text-quantum-fgMuted border-quantum-border hover:text-quantum-fg'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          {showPast ? 'Ocultando passado' : 'Mostrar passado'}
        </button>
      </div>

      {/* Lista de dias */}
      {filteredTimeline.length === 0 ? (
        <EmptyState
          icon={CalendarRange}
          title="Nenhum evento encontrado"
          description="Tente remover os filtros ou adicionar despesas fixas."
        />
      ) : (
        <div className="space-y-2">
          {filteredTimeline.map(day => (
            <DayRow
              key={day.date}
              day={day}
              isToday={day.date === today}
            />
          ))}
        </div>
      )}
    </div>
  );
}
