// src/features/reports/CategoryPieChart.tsx
import { Pie } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import Decimal from 'decimal.js';
import type { Transaction } from '../../shared/types/transaction';
import { getTransactionAbsCentavos } from '../../utils/transactionUtils';
import { fromCentavos } from '../../shared/types/money';

ChartJS.register(ArcElement, Tooltip, Legend);

interface Props {
  transactions: Transaction[];
}

export default function CategoryPieChart({ transactions }: Props) {
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

  const data = {
    labels: Object.keys(categoryTotals),
    datasets: [
      {
        data:            Object.values(categoryTotals),
        backgroundColor: ['#6366f1', '#22c55e', '#f97316', '#ef4444', '#14b8a6', '#eab308'],
      },
    ],
  };

  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-4">
      <h2 className="text-lg font-semibold mb-4 text-center">Distribuição por Categoria</h2>
      <Pie data={data} />
    </div>
  );
}
