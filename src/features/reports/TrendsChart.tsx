// src/features/reports/TrendsChart.tsx
import { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import Decimal from 'decimal.js';
import type { Transaction } from '../../shared/types/transaction';

interface Props {
  transactions: Transaction[];
}

interface MonthData {
  name:      string;
  receitas:  number;
  despesas:  number;
}

export default function TrendsChart({ transactions }: Props) {
  const chartData = useMemo<MonthData[]>(() => {
    if (!transactions || transactions.length === 0) return [];

    const monthlyData: Record<string, MonthData> = {};
    const today = new Date();

    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const monthKey = d.toLocaleString('pt-BR', { month: 'short', year: 'numeric' });
      monthlyData[monthKey] = { name: monthKey, receitas: 0, despesas: 0 };
    }

    transactions.forEach(tx => {
      const rawDate = tx.date ?? (tx as Transaction & { createdAt?: unknown }).createdAt;
      const maybeFirestore = rawDate as unknown as { toDate?: () => Date };
      const txDate = typeof maybeFirestore?.toDate === 'function'
        ? maybeFirestore.toDate()
        : new Date(
            typeof rawDate === 'string' && !rawDate.includes('T')
              ? `${rawDate}T12:00:00`
              : String(rawDate ?? '')
          );

      const monthKey = txDate.toLocaleString('pt-BR', { month: 'short', year: 'numeric' });
      if (monthlyData[monthKey]) {
        const val = new Decimal(tx.value ?? 0);
        if (tx.type === 'entrada' || tx.type === 'receita') {
          monthlyData[monthKey].receitas = new Decimal(monthlyData[monthKey].receitas).plus(val).toNumber();
        } else {
          monthlyData[monthKey].despesas = new Decimal(monthlyData[monthKey].despesas).plus(val).toNumber();
        }
      }
    });

    return Object.values(monthlyData);
  }, [transactions]);

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 bg-quantum-bgSecondary/30 rounded-2xl border border-quantum-border border-dashed">
        <p className="text-quantum-fgMuted">Sem dados suficientes para gerar tendências.</p>
      </div>
    );
  }

  return (
    <div className="bg-quantum-card p-4 md:p-6 rounded-3xl border border-quantum-border shadow-lg">
      <h3 className="text-lg font-bold text-quantum-fg mb-6 tracking-wide">Tendência Histórica (6 Meses)</h3>
      <div className="h-72 w-full min-h-[288px]">
        <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={288}>
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="colorReceitas" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0}   />
              </linearGradient>
              <linearGradient id="colorDespesas" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0}   />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2d3e" vertical={false} />
            <XAxis dataKey="name" stroke="#8b949e" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis
              stroke="#8b949e" fontSize={12} tickLine={false} axisLine={false}
              tickFormatter={(value: number) => `R$${value >= 1000 ? (value / 1000).toFixed(1) + 'k' : value}`}
            />
            <Tooltip
              contentStyle={{ backgroundColor: '#1e1e2d', borderColor: '#30363d', borderRadius: '12px', color: '#fff' }}
              itemStyle={{ fontWeight: 'bold' }}
              formatter={(value) => [`R$ ${Number(value ?? 0).toFixed(2)}`, '']}
            />
            <Area type="monotone" dataKey="receitas" name="Receitas" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorReceitas)" />
            <Area type="monotone" dataKey="despesas" name="Despesas" stroke="#ef4444" strokeWidth={3} fillOpacity={1} fill="url(#colorDespesas)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
