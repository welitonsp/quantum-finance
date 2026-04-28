import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { TrendingUp, TrendingDown, AlertTriangle, ShieldCheck, AlertCircle } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { formatCurrency } from '../utils/formatters';
import { useForecast } from '../hooks/useForecast';
import type { Transaction } from '../shared/types/transaction';

interface Props {
  transactions: Transaction[];
  currentBalance: number;
}

function getCssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export default function ForecastWidget({ transactions, currentBalance }: Props) {
  const { theme } = useTheme();
  const {
    points, finalBalance, minBalance, health,
    p10, p50, p90, survivalRate, riskLevel, mcLoading,
  } = useForecast(transactions, currentBalance);

  const colors = useMemo(() => ({
    success: getCssVar('--q-success') || '#00E68A',
    warning: getCssVar('--q-warning') || '#F59E0B',
    danger:  getCssVar('--q-danger')  || '#FF4757',
    fg:      getCssVar('--q-fg')       || '#E8ECF4',
    fgMuted: getCssVar('--q-fg-muted') || '#6B7A94',
    card:    getCssVar('--q-card')    || '#131A2A',
    border:  getCssVar('--q-border')  || '#1E2A3F',
  }), [theme]);

  const lineColor = health === 'good' ? colors.success : health === 'warning' ? colors.warning : colors.danger;

  const chartData = useMemo(
    () => points.map(p => ({
      date:    p.date.slice(5),   // MM-DD
      balance: p.balance,
    })),
    [points],
  );

  const delta    = finalBalance - currentBalance;
  const DeltaIcon = delta >= 0 ? TrendingUp : TrendingDown;
  const deltaColor = delta >= 0 ? colors.success : colors.danger;

  const healthConfig = {
    good:    { icon: ShieldCheck,   label: 'Saudável',     cls: 'text-quantum-success border-quantum-success/30 bg-quantum-success/10' },
    warning: { icon: AlertCircle,   label: 'Atenção',      cls: 'text-quantum-warning border-quantum-warning/30 bg-quantum-warning/10' },
    danger:  { icon: AlertTriangle, label: 'Risco',        cls: 'text-quantum-danger  border-quantum-danger/30  bg-quantum-danger/10'  },
  }[health];

  const HealthIcon = healthConfig.icon;

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* ── Header row ───────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase font-bold text-quantum-fgMuted tracking-wider mb-0.5">Saldo em 30 dias</p>
          <p className="text-2xl font-black font-mono text-quantum-fg">
            {formatCurrency(finalBalance)}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold ${healthConfig.cls}`}
          >
            <HealthIcon className="w-3.5 h-3.5" />
            {healthConfig.label}
          </div>

          <div
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold"
            style={{ color: deltaColor }}
          >
            <DeltaIcon className="w-3.5 h-3.5" />
            {delta >= 0 ? '+' : ''}{formatCurrency(delta)}
          </div>
        </div>
      </div>

      {/* ── Danger alert ─────────────────────────────────────────── */}
      {minBalance < 0 && (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-quantum-danger/30 bg-quantum-danger/10 text-quantum-danger text-xs font-bold animate-pulse">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Saldo mínimo projetado: {formatCurrency(minBalance)} — risco de caixa negativo.
        </div>
      )}

      {/* ── Chart ────────────────────────────────────────────────── */}
      {chartData.length > 0 ? (
        <div className="flex-1 min-h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
              <XAxis
                dataKey="date"
                stroke={colors.fgMuted}
                fontSize={9}
                tickLine={false}
                axisLine={false}
                dy={8}
                interval={Math.floor(chartData.length / 5)}
              />
              <YAxis
                stroke={colors.fgMuted}
                fontSize={9}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  borderRadius: '10px',
                  fontSize: '11px',
                  color: colors.fg,
                }}
                formatter={(value) => [formatCurrency(Number(value ?? 0)), 'Saldo']}
                labelFormatter={(label) => `Dia ${String(label ?? '')}`}
              />
              {minBalance < 0 && (
                <ReferenceLine y={0} stroke={colors.danger} strokeDasharray="4 4" strokeWidth={1} />
              )}
              <Line
                type="monotone"
                dataKey="balance"
                stroke={lineColor}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 5, fill: lineColor, stroke: colors.card, strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-quantum-fgMuted text-sm">
          Dados insuficientes para projeção.
        </div>
      )}

      {/* ── Monte Carlo stats ────────────────────────────────────── */}
      {chartData.length > 0 && (
        mcLoading ? (
          <div className="h-3.5 bg-quantum-border/40 rounded-full animate-pulse w-2/5" />
        ) : (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-quantum-fgMuted border-t border-quantum-border pt-2">
            <span>
              Sobrevivência:{' '}
              <span
                className="font-bold font-mono"
                style={{
                  color: riskLevel === 'safe' ? colors.success
                       : riskLevel === 'attention' ? colors.warning
                       : colors.danger,
                }}
              >
                {survivalRate}%
              </span>
            </span>
            <span>P10 <span className="font-mono">{formatCurrency(p10)}</span></span>
            <span>P50 <span className="font-mono">{formatCurrency(p50)}</span></span>
            <span>P90 <span className="font-mono">{formatCurrency(p90)}</span></span>
          </div>
        )
      )}

      {/* ── Min balance footer ───────────────────────────────────── */}
      {chartData.length > 0 && (
        <div className="flex items-center justify-between text-[10px] text-quantum-fgMuted border-t border-quantum-border pt-2">
          <span>Saldo mínimo projetado</span>
          <span
            className="font-bold font-mono"
            style={{ color: minBalance < 0 ? colors.danger : colors.fgMuted }}
          >
            {formatCurrency(minBalance)}
          </span>
        </div>
      )}
    </div>
  );
}
