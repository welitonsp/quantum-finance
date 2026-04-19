// src/components/PortfolioChart.tsx
import { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface Period {
  label: string;
  days: number;
  points: number;
}

interface ChartPoint {
  name: number;
  value: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: number;
}

const periods: Period[] = [
  { label: '1D', days: 1,   points: 24 },
  { label: '1S', days: 7,   points: 7  },
  { label: '1M', days: 30,  points: 30 },
  { label: '3M', days: 90,  points: 90 },
  { label: '1A', days: 365, points: 52 },
];

function generateData(points: number, baseValue = 250000): ChartPoint[] {
  const data: ChartPoint[] = [];
  let value = baseValue;
  const step = 0.005;
  for (let i = 0; i < points; i++) {
    const change = (Math.random() - 0.45) * step;
    value = value * (1 + change);
    data.push({ name: i, value: Math.round(value * 100) / 100 });
  }
  return data;
}

function formatDateLabel(index: number, period: Period): string {
  if (period.days === 1) return `${index % 24}h`;
  if (period.days <= 7)  return `D${index + 1}`;
  return `D${index + 1}`;
}

export default function PortfolioChart() {
  const [activePeriod, setActivePeriod] = useState<Period>(periods[2]);
  const [chartData, setChartData]       = useState<ChartPoint[]>(() => generateData(activePeriod.points));

  const handlePeriodChange = (period: Period) => {
    setActivePeriod(period);
    setChartData(generateData(period.points));
  };

  const firstValue   = chartData[0]?.value || 0;
  const lastValue    = chartData[chartData.length - 1]?.value || 0;
  const isPositive   = lastValue >= firstValue;
  const changePercent = ((lastValue - firstValue) / firstValue * 100).toFixed(2);

  function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
    if (active && payload && payload.length) {
      return (
        <div className="bg-quantum-card border border-quantum-border rounded-xl p-3 shadow-xl">
          <p className="text-quantum-fgMuted text-xs mb-1">{label !== undefined ? formatDateLabel(label, activePeriod) : ''}</p>
          <p className="text-white font-mono text-lg font-bold">
            R$ {payload[0].value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
        </div>
      );
    }
    return null;
  }

  return (
    <div className="glass-card-quantum p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h3 className="text-lg font-bold text-white">Desempenho do Portfólio</h3>
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-sm font-mono font-bold ${isPositive ? 'text-quantum-accent' : 'text-quantum-red'}`}>
              {isPositive ? '+' : ''}{changePercent}%
            </span>
            <span className="text-quantum-fgMuted text-xs">últimos {activePeriod.label}</span>
          </div>
        </div>
        <div className="flex gap-1 bg-quantum-bg p-1 rounded-xl border border-quantum-border">
          {periods.map((p) => (
            <button
              key={p.label}
              onClick={() => handlePeriodChange(p)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                activePeriod.label === p.label
                  ? 'bg-quantum-accent text-quantum-bg shadow-md'
                  : 'text-quantum-fgMuted hover:text-white'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="h-72 w-full min-h-[288px]">
        <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={288}>
          <LineChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
            <defs>
              <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#00E68A" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#00E68A" stopOpacity={0}   />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1E2A3F" vertical={false} />
            <XAxis
              dataKey="name"
              tickFormatter={(val: number) => formatDateLabel(val, activePeriod)}
              stroke="#6B7A94"
              tick={{ fontSize: 10, fill: '#6B7A94' }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tickFormatter={(val: number) => `R$ ${(val / 1000).toFixed(0)}k`}
              stroke="#6B7A94"
              tick={{ fontSize: 10, fill: '#6B7A94' }}
              tickLine={false}
              axisLine={false}
              domain={['auto', 'auto']}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend verticalAlign="top" height={36} iconType="circle" />
            <Line
              type="monotone"
              dataKey="value"
              name="Capital Total"
              stroke="#00E68A"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 6, strokeWidth: 2, stroke: '#0A0E17', fill: '#00E68A' }}
              fill="url(#chartGradient)"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
