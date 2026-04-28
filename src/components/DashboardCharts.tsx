import { useMemo } from 'react';
import {
  LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts';
import { TrendingUp, Wallet } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { formatCurrency } from '../utils/formatters';
import type { TimelineDataPoint, CategoryChartPoint } from '../hooks/useFinancialData';

interface Props {
  timelineData: TimelineDataPoint[];
  categoryData: CategoryChartPoint[];
}

function getCssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

const PIE_FALLBACK_COLORS = [
  '#00E68A', '#FF4757', '#A855F7', '#F59E0B',
  '#3B82F6', '#06B6D4', '#F43F5E', '#10B981',
];

export default function DashboardCharts({ timelineData, categoryData }: Props) {
  const { theme } = useTheme();

  const colors = useMemo(() => ({
    success: getCssVar('--q-success') || '#00E68A',
    danger:  getCssVar('--q-danger')  || '#FF4757',
    fgMuted: getCssVar('--q-fg-muted') || '#6B7A94',
    card:    getCssVar('--q-card')    || '#131A2A',
    border:  getCssVar('--q-border')  || '#1E2A3F',
  }), [theme]);

  const pieColors = useMemo(
    () => [colors.success, colors.danger, ...PIE_FALLBACK_COLORS.slice(2)],
    [colors],
  );

  const hasTimeline   = timelineData.length > 0;
  const hasCategories = categoryData.length > 0;

  if (!hasTimeline && !hasCategories) {
    return (
      <div className="glass-card-quantum p-10 flex flex-col items-center gap-3 text-center">
        <Wallet className="w-12 h-12 text-quantum-fgMuted" />
        <p className="text-quantum-fgMuted font-medium">
          Nenhuma transação no período selecionado.
        </p>
        <p className="text-quantum-fgMuted text-sm">
          Ajuste o filtro ou adicione transações.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      {/* ── Evolução (LineChart) ────────────────────────────── */}
      <div className="glass-card-quantum p-6 flex flex-col">
        <div className="flex items-center gap-2 mb-5">
          <TrendingUp className="w-5 h-5 text-quantum-fgMuted" />
          <h3 className="text-sm font-bold text-quantum-fg uppercase tracking-wider">
            Evolução do Período
          </h3>
        </div>

        {hasTimeline ? (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={timelineData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={colors.border} />
              <XAxis
                dataKey="date"
                tick={{ fill: colors.fgMuted, fontSize: 11 }}
                tickFormatter={(d: string) => d.slice(5)}
              />
              <YAxis
                tick={{ fill: colors.fgMuted, fontSize: 11 }}
                tickFormatter={(v: number) => formatCurrency(v)}
                width={90}
              />
              <Tooltip
                contentStyle={{
                  background:   colors.card,
                  border:       `1px solid ${colors.border}`,
                  borderRadius: 12,
                  color:        colors.fgMuted,
                }}
                formatter={(value) => formatCurrency(Number(value ?? 0))}
              />
              <Legend wrapperStyle={{ fontSize: 12, color: colors.fgMuted }} />
              <Line
                type="monotone"
                dataKey="income"
                name="Receitas"
                stroke={colors.success}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="expense"
                name="Despesas"
                stroke={colors.danger}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex-1 flex items-center justify-center text-quantum-fgMuted text-sm">
            Sem dados de evolução neste período.
          </div>
        )}
      </div>

      {/* ── Categorias (PieChart) ───────────────────────────── */}
      <div className="glass-card-quantum p-6 flex flex-col">
        <div className="flex items-center gap-2 mb-5">
          <Wallet className="w-5 h-5 text-quantum-fgMuted" />
          <h3 className="text-sm font-bold text-quantum-fg uppercase tracking-wider">
            Distribuição por Categoria
          </h3>
        </div>

        {hasCategories ? (
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={categoryData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={105}
                paddingAngle={2}
                isAnimationActive
              >
                {categoryData.map((entry, idx) => (
                  <Cell
                    key={`cell-${idx}`}
                    fill={entry.color ?? pieColors[idx % pieColors.length] ?? colors.success}
                    stroke={colors.card}
                    strokeWidth={2}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background:   colors.card,
                  border:       `1px solid ${colors.border}`,
                  borderRadius: 12,
                  color:        colors.fgMuted,
                }}
                formatter={(value) => formatCurrency(Number(value ?? 0))}
              />
              <Legend wrapperStyle={{ fontSize: 12, color: colors.fgMuted }} />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex-1 flex items-center justify-center text-quantum-fgMuted text-sm">
            Sem despesas no período selecionado.
          </div>
        )}
      </div>
    </div>
  );
}
