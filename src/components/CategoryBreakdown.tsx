import { useMemo, memo } from 'react';
import { BarChart2, Info } from 'lucide-react';
import { formatCurrency } from '../utils/formatters';
import type { Transaction } from '../shared/types/transaction';
import { getTransactionAbsCentavos, isIncome as checkIncome } from '../utils/transactionUtils';
import { fromCentavos } from '../shared/types/money';
import { normalizeCategoryName, type UserCategory } from '../shared/schemas/categorySchemas';

interface Props {
  transactions: Transaction[];
  categories?: UserCategory[];
}

interface CategoryEntry {
  name: string;
  value: number;
  pct: number;
  color: string;
  icon: string;
}

function categoryMeta(name: string, categories: UserCategory[], fallbackColor: string): { color: string; icon: string } {
  const normalizedName = normalizeCategoryName(name);
  const meta = categories.find(category => category.normalizedName === normalizedName);
  return {
    color: meta?.color ?? fallbackColor,
    icon: meta?.icon ?? '•',
  };
}

export const CategoryBreakdown = memo(({ transactions, categories = [] }: Props) => {
  const { incomeCategories, expenseCategories } = useMemo(() => {
    const incomeMap: Record<string, number> = {};
    const expenseMap: Record<string, number> = {};

    (transactions || []).forEach(t => {
      const isIncome = checkIncome(t.type);
      const cat = t.category || 'Outros';
      const amount = fromCentavos(getTransactionAbsCentavos(t));
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
        .map(([name, value], i) => {
          const fallbackColor = colors[i % colors.length] ?? colors[0]!;
          const meta = categoryMeta(name, categories, fallbackColor);
          return { name, value, pct: (value / total) * 100, color: meta.color, icon: meta.icon };
        });

    return { incomeCategories: process(incomeMap, incomeTotal), expenseCategories: process(expenseMap, expenseTotal) };
  }, [categories, transactions]);

  const renderCategoryList = (categories: CategoryEntry[], title: string, type: 'income' | 'expense') => (
    <div className="flex-1">
      <h3 className={`text-sm font-bold mb-4 ${type === 'income' ? 'text-emerald-400' : 'text-red-400'} uppercase tracking-wider`}>{title}</h3>
      {categories.length === 0 ? (
        <p className="text-quantum-fgMuted text-sm text-center py-4">Nenhuma {type === 'income' ? 'receita' : 'despesa'} registrada</p>
      ) : (
        <div className="flex flex-col gap-4">
          {categories.map((cat, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: cat.color }} />
                  <span className="text-xs text-quantum-fgMuted w-4 text-center">{cat.icon}</span>
                  <span className="text-quantum-fg">{cat.name}</span>
                </div>
                <div className="flex gap-3 items-baseline">
                  <span className="text-xs text-quantum-fgMuted font-mono">{formatCurrency(cat.value)}</span>
                  <span className="text-sm font-bold text-quantum-fg font-mono">{cat.pct.toFixed(0)}%</span>
                </div>
              </div>
              <div className="h-2 bg-quantum-bgSecondary rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${cat.pct}%`, background: cat.color }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="bg-quantum-card/40 backdrop-blur-sm rounded-2xl p-6 border border-quantum-border">
      <div className="flex items-center gap-2 mb-5">
        <BarChart2 className="w-5 h-5 text-cyan-400" />
        <h2 className="text-sm font-bold text-quantum-fg uppercase tracking-widest">Distribuição por Categoria</h2>
        <span title="Divisão de receitas e despesas por categoria."><Info className="w-4 h-4 text-quantum-fgMuted cursor-help" /></span>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {renderCategoryList(incomeCategories, '💰 Receitas', 'income')}
        {renderCategoryList(expenseCategories, '📉 Despesas', 'expense')}
      </div>
    </div>
  );
});
