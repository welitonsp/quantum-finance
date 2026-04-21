import { useMemo, memo } from 'react';
import { BarChart2, Info } from 'lucide-react';
import { formatCurrency } from '../utils/formatters';
import type { Transaction } from '../shared/types/transaction';

interface Props {
  transactions: Transaction[];
}

interface CategoryEntry {
  name: string;
  value: number;
  pct: number;
  color: string;
}

export const CategoryBreakdown = memo(({ transactions }: Props) => {
  const { incomeCategories, expenseCategories } = useMemo(() => {
    const incomeMap: Record<string, number> = {};
    const expenseMap: Record<string, number> = {};

    (transactions || []).forEach(t => {
      const isIncome = t.type === 'receita' || t.type === 'entrada';
      const cat = t.category || 'Outros';
      const amount = Math.abs(t.value || 0);
      if (isIncome) incomeMap[cat] = (incomeMap[cat] || 0) + amount;
      else          expenseMap[cat] = (expenseMap[cat] || 0) + amount;
    });

    const incomeTotal  = Object.values(incomeMap).reduce((a, b) => a + b, 0) || 1;
    const expenseTotal = Object.values(expenseMap).reduce((a, b) => a + b, 0) || 1;
    const colors = ['#22d3ee','#818cf8','#f472b6','#34d399','#fbbf24','#f87171','#a78bfa'];

    const process = (map: Record<string, number>, total: number): CategoryEntry[] =>
      Object.entries(map)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, value], i) => ({ name, value, pct: (value / total) * 100, color: colors[i % colors.length] }));

    return { incomeCategories: process(incomeMap, incomeTotal), expenseCategories: process(expenseMap, expenseTotal) };
  }, [transactions]);

  const renderCategoryList = (categories: CategoryEntry[], title: string, type: 'income' | 'expense') => (
    <div className="flex-1">
      <h3 className={`text-sm font-bold mb-4 ${type === 'income' ? 'text-emerald-400' : 'text-red-400'} uppercase tracking-wider`}>{title}</h3>
      {categories.length === 0 ? (
        <p className="text-slate-500 text-sm text-center py-4">Nenhuma {type === 'income' ? 'receita' : 'despesa'} registrada</p>
      ) : (
        <div className="flex flex-col gap-4">
          {categories.map((cat, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: cat.color }} />
                  <span className="text-slate-300">{cat.name}</span>
                </div>
                <div className="flex gap-3 items-baseline">
                  <span className="text-xs text-slate-500 font-mono">{formatCurrency(cat.value)}</span>
                  <span className="text-sm font-bold text-slate-200 font-mono">{cat.pct.toFixed(0)}%</span>
                </div>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${cat.pct}%`, background: cat.color }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="bg-slate-900/40 backdrop-blur-sm rounded-2xl p-6 border border-white/10">
      <div className="flex items-center gap-2 mb-5">
        <BarChart2 className="w-5 h-5 text-cyan-400" />
        <h2 className="text-sm font-bold text-white uppercase tracking-widest">Distribuição por Categoria</h2>
        <span title="Divisão de receitas e despesas por categoria."><Info className="w-4 h-4 text-slate-500 cursor-help" /></span>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {renderCategoryList(incomeCategories, '💰 Receitas', 'income')}
        {renderCategoryList(expenseCategories, '📉 Despesas', 'expense')}
      </div>
    </div>
  );
});
