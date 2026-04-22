import { useState, useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Sector } from 'recharts';

interface RechartsTooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: Array<{ name?: string; value?: number | string; color?: string; payload?: unknown }>;
}
import { TrendingUp, TrendingDown, Wallet } from 'lucide-react';
import type { CategoryDataPoint } from '../shared/types/transaction';

interface Props {
  categoryData: CategoryDataPoint[];
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

interface TooltipPayloadItem {
  name: string;
  value: number;
  total: number;
  color: string;
}

const CustomTooltip = ({ active, payload }: RechartsTooltipProps) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload as TooltipPayloadItem;
    return (
      <div className="bg-white/95 dark:bg-quantum-card/95 backdrop-blur-md p-3 rounded-xl border border-slate-200 dark:border-quantum-border shadow-2xl transition-colors">
        <p className="text-slate-800 dark:text-quantum-fg font-bold text-sm">{data.name}</p>
        <p className="text-cyan-600 dark:text-cyan-400 text-lg font-black">{formatCurrency(data.value)}</p>
        <p className="text-quantum-fgMuted dark:text-quantum-fgMuted text-xs">{((data.value / data.total) * 100).toFixed(1)}% do total</p>
      </div>
    );
  }
  return null;
};

const DonutCenter = ({ totalExpenses }: { totalExpenses: number }) => (
  <div className="text-center pointer-events-none transition-colors">
    <p className="text-quantum-fgMuted dark:text-quantum-fgMuted text-xs uppercase tracking-wider">Total gasto</p>
    <p className="text-slate-800 dark:text-quantum-fg text-2xl font-black">{formatCurrency(totalExpenses)}</p>
  </div>
);

export default function DashboardCharts({ categoryData }: Props) {
  const [activeIndex,       setActiveIndex]       = useState<number | null>(null);
  const [hiddenCategories,  setHiddenCategories]  = useState<Record<string, boolean>>({});

  const totalExpenses = useMemo(
    () => categoryData.reduce((sum, item) => sum + item.value, 0),
    [categoryData],
  );

  const visibleData = useMemo(
    () => categoryData.filter((item) => !hiddenCategories[item.name]),
    [categoryData, hiddenCategories],
  );

  const toggleCategory = (name: string) => {
    setHiddenCategories((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  if (!categoryData.length) {
    return (
      <div className="glass-card-quantum p-8 text-center">
        <Wallet className="w-12 h-12 mx-auto text-quantum-fgMuted dark:text-slate-600 mb-3" />
        <p className="text-quantum-fgMuted dark:text-quantum-fgMuted">Nenhuma despesa registrada neste mês.</p>
        <p className="text-quantum-fgMuted dark:text-quantum-fgMuted text-sm">Adicione transações para ver seus hábitos.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
      <div className="glass-card-quantum p-6 transition-all hover:border-cyan-500/30 flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-800 dark:text-quantum-fg uppercase tracking-wider flex items-center gap-2 transition-colors">
            <TrendingDown className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
            Distribuição de Gastos
          </h3>
          <p className="text-xs text-quantum-fgMuted">Clique na legenda para filtrar</p>
        </div>

        <div className="relative h-80 w-full min-h-[320px] flex-1">
          <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={320}>
            <PieChart>
              <Pie
                data={visibleData}
                cx="50%"
                cy="50%"
                innerRadius={70}
                outerRadius={100}
                paddingAngle={2}
                dataKey="value"
                onMouseEnter={(_: unknown, index: number) => setActiveIndex(index)}
                onMouseLeave={() => setActiveIndex(null)}
              >
                {visibleData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} stroke="rgba(0,0,0,0.1)" strokeWidth={1} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>

          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <DonutCenter totalExpenses={totalExpenses} />
          </div>
        </div>
      </div>

      <div className="glass-card-quantum p-6 transition-all hover:border-indigo-500/30 flex flex-col">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          <h3 className="text-lg font-bold text-slate-800 dark:text-quantum-fg uppercase tracking-wider transition-colors">Categorias</h3>
        </div>
        <div className="space-y-3 max-h-80 overflow-y-auto custom-scrollbar pr-2 flex-1">
          {categoryData.map((item) => (
            <button
              key={item.name}
              onClick={() => toggleCategory(item.name)}
              className={`w-full flex items-center justify-between p-3 rounded-xl transition-all border border-transparent ${
                hiddenCategories[item.name]
                  ? 'bg-slate-100 dark:bg-quantum-bgSecondary/50 opacity-50'
                  : 'bg-slate-50 dark:bg-quantum-card/50 hover:bg-slate-100 dark:hover:bg-quantum-bgSecondary/70 border-slate-200 dark:border-transparent hover:border-slate-300 dark:hover:border-quantum-border shadow-sm dark:shadow-none'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded-full shadow-sm" style={{ backgroundColor: hiddenCategories[item.name] ? '#94a3b8' : item.color }} />
                <span className="text-sm font-bold text-slate-700 dark:text-quantum-fg transition-colors">{item.name}</span>
              </div>
              <div className="text-right">
                <span className="text-slate-800 dark:text-quantum-fg text-sm font-black transition-colors">{formatCurrency(item.value)}</span>
                <p className="text-[10px] text-quantum-fgMuted font-bold">{((item.value / totalExpenses) * 100).toFixed(1)}%</p>
              </div>
            </button>
          ))}
        </div>
        {Object.keys(hiddenCategories).some((k) => hiddenCategories[k]) && (
          <button onClick={() => setHiddenCategories({})} className="mt-4 text-xs font-bold text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 transition-colors w-full text-center py-2 border-t border-slate-200 dark:border-quantum-border pt-4">
            Resetar filtros
          </button>
        )}
      </div>
    </div>
  );
}
