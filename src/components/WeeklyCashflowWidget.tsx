import { motion } from 'framer-motion';
import { BarChart2, CalendarClock, TrendingDown, TrendingUp } from 'lucide-react';
import type { WeekBucket, FutureEvent } from '../hooks/useWeeklyCashflow';
import { formatCents } from '../hooks/useWeeklyCashflow';

interface Props {
  weeks:        WeekBucket[];
  futureEvents: FutureEvent[];
  loading?:     boolean;
}

// ─── SVG bar chart ────────────────────────────────────────────────────────────

function CashflowBars({ weeks }: { weeks: WeekBucket[] }) {
  const W = 560, H = 120, PAD_X = 0, PAD_Y = 8, LABEL_H = 18;
  const chartH = H - LABEL_H - PAD_Y;

  const allValues = weeks.flatMap(w => [w.incomeCents, w.expenseCents]);
  const maxVal    = Math.max(...allValues, 1);

  const barW     = (W - PAD_X * 2) / weeks.length;
  const gap      = barW * 0.15;
  const singleW  = (barW - gap * 3) / 2;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full overflow-visible"
      aria-label="Fluxo de caixa semanal"
    >
      {weeks.map((w, i) => {
        const bx      = PAD_X + i * barW + gap;
        const incH    = Math.max(2, (w.incomeCents  / maxVal) * chartH);
        const expH    = Math.max(2, (w.expenseCents / maxVal) * chartH);
        const incY    = PAD_Y + chartH - incH;
        const expY    = PAD_Y + chartH - expH;
        const opacity = w.isForecast ? 0.45 : 1;

        return (
          <g key={i} opacity={opacity}>
            {/* Income bar */}
            <rect
              x={bx}
              y={incY}
              width={singleW}
              height={incH}
              rx={3}
              fill={w.isForecast ? '#00E68A66' : '#00E68A'}
              stroke={w.isForecast ? '#00E68A' : 'none'}
              strokeWidth={w.isForecast ? 1 : 0}
              strokeDasharray={w.isForecast ? '3 2' : 'none'}
            />
            {/* Expense bar */}
            <rect
              x={bx + singleW + gap}
              y={expY}
              width={singleW}
              height={expH}
              rx={3}
              fill={w.isForecast ? '#FF475766' : '#FF4757'}
              stroke={w.isForecast ? '#FF4757' : 'none'}
              strokeWidth={w.isForecast ? 1 : 0}
              strokeDasharray={w.isForecast ? '3 2' : 'none'}
            />
            {/* Label */}
            <text
              x={bx + singleW}
              y={H - 2}
              textAnchor="middle"
              fontSize={w.isForecast ? 8 : 9}
              fill={w.isForecast ? '#4A6080' : '#8899AA'}
              fontFamily="monospace"
            >
              {w.isForecast ? `${w.label}*` : w.label}
            </text>
          </g>
        );
      })}

      {/* Divider between real and forecast */}
      {(() => {
        const firstForecast = weeks.findIndex(w => w.isForecast);
        if (firstForecast < 0) return null;
        const divX = PAD_X + firstForecast * barW;
        return (
          <line
            x1={divX} y1={PAD_Y}
            x2={divX} y2={PAD_Y + chartH + 2}
            stroke="#2A3A54"
            strokeWidth={1}
            strokeDasharray="4 3"
          />
        );
      })()}
    </svg>
  );
}

// ─── Future events list ───────────────────────────────────────────────────────

function formatEventDate(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

function EventsCallout({ events }: { events: FutureEvent[] }) {
  if (events.length === 0) return null;

  const totalCents = events.reduce((s, e) => s + e.amountCents, 0);
  const expenseEvents = events.filter(e => e.amountCents < 0);
  const netLabel      = totalCents >= 0 ? `+${formatCents(totalCents)}` : formatCents(totalCents);
  const netColor      = totalCents >= 0 ? 'text-emerald-400' : 'text-red-400';

  return (
    <div className="bg-quantum-bgSecondary/60 border border-quantum-border rounded-2xl p-4 mt-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-amber-400" />
          <p className="text-xs font-bold text-quantum-fg">Próximos vencimentos</p>
        </div>
        <span className={`text-xs font-black font-mono ${netColor}`}>{netLabel}</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {expenseEvents.slice(0, 5).map((ev, i) => (
          <div key={i} className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[10px] font-mono text-quantum-fgMuted shrink-0">{formatEventDate(ev.date)}</span>
              <span className="text-[11px] text-quantum-fg truncate">{ev.description}</span>
            </div>
            <span className="text-[11px] font-bold font-mono text-red-400 shrink-0">
              -{formatCents(Math.abs(ev.amountCents))}
            </span>
          </div>
        ))}
        {expenseEvents.length > 5 && (
          <p className="text-[10px] text-quantum-fgMuted mt-1">
            +{expenseEvents.length - 5} outros vencimentos
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Main widget ──────────────────────────────────────────────────────────────

export default function WeeklyCashflowWidget({ weeks, futureEvents, loading = false }: Props) {
  const realWeeks     = weeks.filter(w => !w.isForecast);
  const forecastWeeks = weeks.filter(w => w.isForecast);

  const totalIncomeForecast  = forecastWeeks.reduce((s, w) => s + w.incomeCents,  0);
  const totalExpenseForecast = forecastWeeks.reduce((s, w) => s + w.expenseCents, 0);
  const netForecast          = totalIncomeForecast - totalExpenseForecast;

  const lastRealWeek         = realWeeks[realWeeks.length - 1];
  const prevRealWeek         = realWeeks[realWeeks.length - 2];
  const weekDelta            = lastRealWeek && prevRealWeek
    ? (lastRealWeek.expenseCents - prevRealWeek.expenseCents)
    : 0;
  const weekDeltaSign        = weekDelta > 0 ? '+' : '';

  if (loading) {
    return (
      <div className="bg-quantum-card border border-quantum-border rounded-3xl p-6 animate-pulse">
        <div className="h-5 w-48 bg-quantum-bgSecondary rounded mb-4" />
        <div className="h-28 w-full bg-quantum-bgSecondary rounded" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-quantum-card border border-quantum-border rounded-3xl p-6 shadow-lg"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-500/15 flex items-center justify-center border border-violet-500/25">
            <BarChart2 className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h3 className="text-base font-black text-quantum-fg">Fluxo de Caixa Semanal</h3>
            <p className="text-[11px] text-quantum-fgMuted">Últimas 4 semanas · previsão 2 semanas</p>
          </div>
        </div>

        {/* Forecast net */}
        {forecastWeeks.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-quantum-border bg-quantum-bgSecondary/60">
            {netForecast >= 0
              ? <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
              : <TrendingDown className="w-3.5 h-3.5 text-red-400" />}
            <span className={`text-xs font-bold font-mono ${netForecast >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {netForecast >= 0 ? '+' : ''}{formatCents(netForecast)}
            </span>
            <span className="text-[10px] text-quantum-fgMuted">previsão 2s</span>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mb-3">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-emerald-500" />
          <span className="text-[10px] text-quantum-fgMuted">Entradas</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-red-500" />
          <span className="text-[10px] text-quantum-fgMuted">Saídas</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-quantum-bgSecondary border border-dashed border-quantum-fgMuted opacity-60" />
          <span className="text-[10px] text-quantum-fgMuted">Previsão*</span>
        </div>
        {weekDelta !== 0 && (
          <span className={`ml-auto text-[10px] font-mono ${weekDelta > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
            Gastos semana passada: {weekDeltaSign}{formatCents(weekDelta)} vs anterior
          </span>
        )}
      </div>

      {/* Bar chart */}
      <div className="px-1">
        <CashflowBars weeks={weeks} />
      </div>

      {/* Future events callout */}
      <EventsCallout events={futureEvents} />
    </motion.div>
  );
}
