// src/features/reports/ReportsDashboard.tsx
import { useMemo } from 'react';
import {
  PieChart, Pie, Cell, ResponsiveContainer,
  Tooltip as RechartsTooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
} from 'recharts';
import { TrendingUp, TrendingDown, Target, BrainCircuit, AlertTriangle } from 'lucide-react';
import Decimal from 'decimal.js';
import type { Transaction } from '../../shared/types/transaction';

interface RechartsTooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: Array<{ name?: string; value?: number | string; color?: string; payload?: unknown }>;
}

interface Balances {
  entradas?: number;
  saidas?:   number;
}

interface Props {
  transactions: Transaction[];
  balances:     Balances;
}

interface CategoryEntry {
  name:  string;
  value: number;
  color: string;
}

// ─── CustomTooltip ────────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }: RechartsTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-quantum-card/95 border border-quantum-border p-3 rounded-xl shadow-2xl backdrop-blur-xl z-50">
      <p className="text-quantum-fg text-xs font-bold mb-2 uppercase">{label as string}</p>
      {payload.map((entry, index: number) => (
        <div key={index} className="flex items-center gap-2 text-sm font-mono">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: (entry.color ?? (entry.payload as { fill?: string })?.fill) as string }} />
          <span className="text-quantum-fg">R$ {Number(entry.value ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
        </div>
      ))}
    </div>
  );
}

export default function ReportsDashboard({ transactions, balances }: Props) {
  const rec  = new Decimal(balances.entradas ?? 0);
  const desp = new Decimal(balances.saidas   ?? 0);
  const saldoDecimal = rec.minus(desp);

  const savingsRate = rec.greaterThan(0)
    ? saldoDecimal.dividedBy(rec).times(100).toDecimalPlaces(1).toNumber()
    : 0;

  const receitas = rec.toNumber();
  const despesas = desp.toNumber();

  const categoryData = useMemo<CategoryEntry[]>(() => {
    const map: Record<string, number> = {};
    transactions.forEach(tx => {
      if (tx.type === 'saida') {
        const cat = tx.category ?? 'Diversos';
        const val = new Decimal(Math.abs(Number(tx.value)));
        map[cat] = map[cat] ? new Decimal(map[cat]).plus(val).toNumber() : val.toNumber();
      }
    });
    const COLORS = ['#ef4444', '#06b6d4', '#a855f7', '#f59e0b', '#10b981', '#3b82f6'];
    return Object.keys(map).map((key, index) => ({
      name:  key,
      value: map[key]!,
      color: COLORS[index % COLORS.length]!,
    })).sort((a, b) => b.value - a.value);
  }, [transactions]);

  const cashflowData = [{ name: 'Fluxo Mensal', Receitas: receitas, Despesas: despesas }];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">

        <div className="glass-card-quantum p-6 gradient-border-indigo flex flex-col justify-center">
          <div className="flex items-center gap-2 mb-2">
            <Target className="w-5 h-5 text-indigo-400" />
            <h3 className="text-xs font-bold text-quantum-fgMuted uppercase tracking-widest">Taxa de Poupança</h3>
          </div>
          <p className={`text-3xl font-black font-mono ${savingsRate >= 20 ? 'text-emerald-400' : savingsRate > 0 ? 'text-amber-400' : 'text-red-400'}`}>
            {savingsRate.toFixed(1)}%
          </p>
          <p className="text-[10px] text-quantum-fgMuted uppercase mt-2">
            {savingsRate >= 20 ? 'Excelente capacidade de retenção' : 'Atenção aos gastos excessivos'}
          </p>
        </div>

        <div className="glass-card-quantum p-6 border-t-4 border-quantum-border flex flex-col justify-center">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="w-5 h-5 text-quantum-fgMuted" />
            <h3 className="text-xs font-bold text-quantum-fgMuted uppercase tracking-widest">Custo de Vida</h3>
          </div>
          <p className="text-3xl font-black font-mono text-quantum-fg">
            R$ {despesas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-[10px] text-quantum-fgMuted uppercase mt-2">Total queimado neste mês</p>
        </div>

        <div className="glass-card-quantum p-6 lg:col-span-2 bg-indigo-500/5 border border-indigo-500/20">
          <div className="flex items-center gap-2 mb-3">
            <BrainCircuit className="w-5 h-5 text-indigo-400" />
            <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-widest">Quantum Insights</h3>
          </div>
          <div className="space-y-2">
            {savingsRate < 10 && (
              <p className="text-sm text-quantum-fg flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                A sua taxa de poupança está abaixo de 10%. Recomendamos reduzir despesas na categoria: <strong className="text-quantum-fg">{categoryData[0]?.name ?? 'Diversos'}</strong>.
              </p>
            )}
            {savingsRate >= 10 && (
              <p className="text-sm text-quantum-fg flex items-start gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                Ótima performance! Com uma retenção de {savingsRate.toFixed(1)}%, tem margem para focar em Investimentos.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-card-quantum p-6 h-[400px] flex flex-col">
          <h2 className="text-sm font-bold uppercase tracking-widest text-quantum-fg mb-6">Receitas vs Despesas</h2>
          <div className="flex-1 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={cashflowData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="name" stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <YAxis stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 12 }} tickFormatter={(val: number) => `R$ ${val}`} />
                <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: '#1e293b', opacity: 0.4 }} />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '20px' }} />
                <Bar dataKey="Receitas" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={60} />
                <Bar dataKey="Despesas" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={60} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-card-quantum p-6 h-[400px] flex flex-col">
          <h2 className="text-sm font-bold uppercase tracking-widest text-quantum-fg mb-6">Distribuição de Gastos</h2>
          {categoryData.length > 0 ? (
            <div className="flex-1 w-full relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <RechartsTooltip content={<CustomTooltip />} />
                  <Pie data={categoryData} innerRadius={80} outerRadius={110} paddingAngle={5} dataKey="value" stroke="none">
                    {categoryData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                  </Pie>
                  <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '12px', color: '#94a3b8' }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-10">
                <span className="text-[10px] text-quantum-fgMuted uppercase tracking-widest">Total Gasto</span>
                <span className="text-xl font-bold font-mono text-quantum-fg">R$ {despesas.toLocaleString('pt-BR')}</span>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-quantum-fgMuted">
              <p className="text-2xl mb-2">📊</p>
              <p className="text-sm">Sem despesas para analisar.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
