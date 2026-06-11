import { useState, useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { AlertTriangle, TrendingDown, TrendingUp, Calendar } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { computeCashflowTimeline, firstNegativeDate } from '../lib/cashflowTimeline';
import type { IncomeScenario } from '../lib/cashflowTimeline';
import { fromCentavos } from '../shared/types/money';
import { formatCurrency } from '../utils/formatters';
import type { Transaction, RecurringTask } from '../shared/types/transaction';
import type { Centavos } from '../shared/types/money';

interface Props {
  transactions: Transaction[];
  recurringTasks: RecurringTask[];
  currentBalanceCents: Centavos;
  today?: string; // YYYY-MM-DD, defaults to actual today
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const SCENARIO_LABELS: Record<IncomeScenario, string> = {
  pessimistic: 'Pessimista',
  median:      'Base',
  optimistic:  'Otimista',
};

const SCENARIO_COLORS: Record<IncomeScenario, string> = {
  pessimistic: '#F87171',
  median:      '#22D3EE',
  optimistic:  '#34D399',
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;

  const balance: number = payload[0]?.value ?? 0;
  const events = payload[0]?.payload?.events ?? [];
  const isNeg = balance < 0;

  return (
    <div className="bg-quantum-card border border-quantum-border rounded-2xl p-3 shadow-2xl min-w-[200px]">
      <p className="text-[10px] font-bold text-quantum-fgMuted uppercase tracking-wider mb-2">{label}</p>
      <p className={`text-sm font-black font-mono mb-2 ${isNeg ? 'text-red-400' : 'text-quantum-fg'}`}>
        {formatCurrency(balance)}
      </p>
      {events.length > 0 && (
        <div className="space-y-1 border-t border-quantum-border/50 pt-2">
          {events.slice(0, 5).map((ev: { direction: string; description: string; amountCents: number }, idx: number) => (
            <div key={idx} className="flex items-center justify-between gap-3 text-[10px]">
              <span className="text-quantum-fgMuted truncate max-w-[120px]">{ev.description}</span>
              <span className={`font-mono font-bold ${ev.direction === 'in' ? 'text-emerald-400' : 'text-red-400'}`}>
                {ev.direction === 'in' ? '+' : '-'}{formatCurrency(fromCentavos(ev.amountCents as Centavos))}
              </span>
            </div>
          ))}
          {events.length > 5 && (
            <p className="text-[9px] text-quantum-fgMuted">+{events.length - 5} mais...</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function TimelineWidget({
  transactions,
  recurringTasks,
  currentBalanceCents,
  today,
}: Props) {
  const { theme } = useTheme();
  void theme; // used for memoization trigger

  const [scenario, setScenario] = useState<IncomeScenario>('median');
  const todayStr = today ?? todayISO();

  const timelines = useMemo(() => {
    const scenarios: IncomeScenario[] = ['pessimistic', 'median', 'optimistic'];
    const result: Record<IncomeScenario, ReturnType<typeof computeCashflowTimeline>> = {
      pessimistic: [],
      median:      [],
      optimistic:  [],
    };
    for (const s of scenarios) {
      result[s] = computeCashflowTimeline({
        currentBalanceCents,
        transactions,
        recurringTasks,
        today: todayStr,
        daysAhead: 90,
        incomeScenario: s,
      });
    }
    return result;
  }, [currentBalanceCents, transactions, recurringTasks, todayStr]);

  const activeTimeline = timelines[scenario];

  const chartData = useMemo(
    () =>
      activeTimeline.map(day => ({
        date:         day.date.slice(5), // MM-DD
        fullDate:     day.date,
        balance:      fromCentavos(day.balanceCents),
        pessimistic:  fromCentavos(timelines.pessimistic.find(d => d.date === day.date)?.balanceCents ?? currentBalanceCents),
        optimistic:   fromCentavos(timelines.optimistic.find(d => d.date === day.date)?.balanceCents ?? currentBalanceCents),
        events:       day.events,
      })),
    [activeTimeline, timelines, currentBalanceCents],
  );

  const negDateBase    = firstNegativeDate(timelines.median);
  const negDateActive  = firstNegativeDate(activeTimeline);
  const hasNegInNext30 = activeTimeline
    .slice(0, 30)
    .some(d => d.balanceCents < 0);

  const finalBalance = activeTimeline[activeTimeline.length - 1]?.balanceCents ?? currentBalanceCents;
  const delta = finalBalance - currentBalanceCents;
  const DeltaIcon = delta >= 0 ? TrendingUp : TrendingDown;

  // Format a negative-alert date
  function formatAlertDate(isoDate: string): string {
    const [, m, d] = isoDate.split('-').map(Number);
    return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
  }

  return (
    <div className="bg-quantum-card/40 backdrop-blur-md border border-quantum-border rounded-3xl overflow-hidden shadow-xl">
      {/* Header */}
      <div className="px-6 py-4 border-b border-quantum-border/50 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl border border-cyan-500/30 bg-cyan-500/10 flex items-center justify-center">
            <Calendar className="w-4 h-4 text-cyan-400" />
          </div>
          <div>
            <h2 className="text-sm font-black text-quantum-fg">Timeline 90 dias</h2>
            <p className="text-[10px] text-quantum-fgMuted">Saldo projetado com recorrentes + parcelas</p>
          </div>
        </div>

        {/* Scenario toggle */}
        <div className="flex items-center gap-1 bg-quantum-bg/60 border border-quantum-border rounded-xl p-1">
          {(Object.keys(SCENARIO_LABELS) as IncomeScenario[]).map(s => (
            <button
              key={s}
              onClick={() => setScenario(s)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                scenario === s
                  ? 'text-white shadow-sm'
                  : 'text-quantum-fgMuted hover:text-quantum-fg'
              }`}
              style={scenario === s ? { backgroundColor: SCENARIO_COLORS[s] } : {}}
            >
              {SCENARIO_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Negative-balance alert banner */}
      {hasNegInNext30 && negDateActive && (
        <div className="mx-6 mt-4 flex items-center gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
          <p className="text-sm font-bold text-red-300">
            Saldo pode ficar negativo em{' '}
            <span className="font-black text-red-200">{formatAlertDate(negDateActive)}</span>
            {negDateBase && negDateBase !== negDateActive && (
              <span className="text-red-400 font-normal">
                {' '}(cenário base: {formatAlertDate(negDateBase)})
              </span>
            )}
            . Revise suas despesas fixas.
          </p>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 px-6 py-4">
        <div>
          <p className="text-[10px] font-bold text-quantum-fgMuted uppercase tracking-wider mb-1">Saldo em 90 dias</p>
          <p className={`text-lg font-black font-mono ${finalBalance < 0 ? 'text-red-400' : 'text-quantum-fg'}`}>
            {formatCurrency(fromCentavos(finalBalance))}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-bold text-quantum-fgMuted uppercase tracking-wider mb-1">Variação</p>
          <div className="flex items-center gap-1.5">
            <DeltaIcon className={`w-4 h-4 ${delta >= 0 ? 'text-emerald-400' : 'text-red-400'}`} />
            <p className={`text-lg font-black font-mono ${delta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {delta >= 0 ? '+' : ''}{formatCurrency(fromCentavos(delta as Centavos))}
            </p>
          </div>
        </div>
        <div>
          <p className="text-[10px] font-bold text-quantum-fgMuted uppercase tracking-wider mb-1">Despesas fixas</p>
          <p className="text-lg font-black font-mono text-quantum-fg">
            {recurringTasks.filter(t => t.active !== false).length} ativas
          </p>
        </div>
      </div>

      {/* Chart */}
      <div className="px-2 pb-6" style={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="timelineGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={SCENARIO_COLORS[scenario]} stopOpacity={0.25} />
                <stop offset="95%" stopColor={SCENARIO_COLORS[scenario]} stopOpacity={0}    />
              </linearGradient>
              <linearGradient id="bandGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#6B7A94" stopOpacity={0.10} />
                <stop offset="95%" stopColor="#6B7A94" stopOpacity={0}    />
              </linearGradient>
            </defs>

            <XAxis
              dataKey="date"
              tick={{ fontSize: 9, fill: '#6B7A94' }}
              tickLine={false}
              axisLine={false}
              interval={13}
            />
            <YAxis
              tick={{ fontSize: 9, fill: '#6B7A94' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`}
              width={52}
            />
            <Tooltip content={<CustomTooltip />} />

            {/* Zero line highlighted in red */}
            <ReferenceLine y={0} stroke="#F87171" strokeDasharray="4 2" strokeWidth={1.5} />

            {/* Scenario band (pessimistic → optimistic) */}
            <Area
              type="monotone"
              dataKey="optimistic"
              stroke="none"
              fill="url(#bandGrad)"
              fillOpacity={1}
              isAnimationActive={false}
              legendType="none"
            />
            <Area
              type="monotone"
              dataKey="pessimistic"
              stroke="none"
              fill="white"
              fillOpacity={0}
              isAnimationActive={false}
              legendType="none"
            />

            {/* Active scenario line */}
            <Area
              type="monotone"
              dataKey="balance"
              stroke={SCENARIO_COLORS[scenario]}
              strokeWidth={2}
              fill="url(#timelineGrad)"
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="px-6 pb-4 flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-1.5 text-[9px] text-quantum-fgMuted">
          <div className="w-3 h-0.5 bg-red-400 rounded" />
          Saldo zero
        </div>
        {(Object.keys(SCENARIO_LABELS) as IncomeScenario[]).map(s => (
          <div key={s} className="flex items-center gap-1.5 text-[9px] text-quantum-fgMuted">
            <div
              className="w-3 h-0.5 rounded"
              style={{ backgroundColor: SCENARIO_COLORS[s], opacity: scenario === s ? 1 : 0.4 }}
            />
            {SCENARIO_LABELS[s]}
          </div>
        ))}
      </div>
    </div>
  );
}
