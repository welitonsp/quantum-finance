import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import Decimal from 'decimal.js';
import type { Transaction } from '../../shared/types/transaction';
import { getTransactionAbsCentavos } from '../../utils/transactionUtils';
import { fromCentavos } from '../../shared/types/money';
import { normalizeCategoryName, type UserCategory } from '../../shared/schemas/categorySchemas';

interface Props {
  transactions: Transaction[];
  categories?: UserCategory[];
}

const CATEGORY_COLORS = ['#6366f1', '#22c55e', '#f97316', '#ef4444', '#14b8a6', '#eab308'];

function categoryColor(name: string, categories: UserCategory[], index: number): string {
  const normalizedName = normalizeCategoryName(name);
  return categories.find(category => category.normalizedName === normalizedName)?.color
    ?? CATEGORY_COLORS[index % CATEGORY_COLORS.length]
    ?? CATEGORY_COLORS[0]!;
}

export default function CategoryPieChart({ transactions, categories = [] }: Props) {
  if (!transactions || transactions.length === 0) {
    return (
      <div className="text-center text-zinc-400 text-sm">
        Sem dados para gráfico
      </div>
    );
  }

  const categoryTotals: Record<string, number> = {};
  transactions.forEach(t => {
    const category = t.category ?? 'Sem categoria';
    const current  = categoryTotals[category] ? new Decimal(categoryTotals[category]) : new Decimal(0);
    categoryTotals[category] = current.plus(new Decimal(fromCentavos(getTransactionAbsCentavos(t)))).toNumber();
  });

  const chartData = Object.entries(categoryTotals).map(([name, value], index) => ({
    name,
    value,
    color: categoryColor(name, categories, index),
  }));

  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-4">
      <h2 className="text-lg font-semibold mb-4 text-center">Distribuição por Categoria</h2>
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90}>
            {chartData.map((entry, index) => (
              <Cell key={index} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip formatter={(value) => typeof value === 'number' ? value.toFixed(2) : value} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
