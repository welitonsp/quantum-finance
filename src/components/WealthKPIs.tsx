import { formatCurrency } from '../utils/formatters';
import type { DashboardKPIs } from '../hooks/useFinancialData';

interface Props {
  kpis:    DashboardKPIs;
  loading: boolean;
}

export default function WealthKPIs({ kpis, loading }: Props) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[0, 1, 2].map(i => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-quantum-bgSecondary" />
        ))}
      </div>
    );
  }

  const items = [
    { label: 'Saldo Total', value: kpis.totalBalance, colorClass: 'text-quantum-fg'  },
    { label: 'Receitas',    value: kpis.totalIncome,  colorClass: 'text-emerald-400' },
    { label: 'Despesas',    value: kpis.totalExpense, colorClass: 'text-red-400'     },
  ] as const;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {items.map(item => (
        <div
          key={item.label}
          className="bg-quantum-card border border-quantum-border rounded-2xl p-5 transition-colors"
        >
          <p className="text-[10px] font-bold text-quantum-fgMuted uppercase tracking-wider mb-2">
            {item.label}
          </p>
          <p className={`text-2xl font-black font-mono ${item.colorClass}`}>
            {formatCurrency(item.value)}
          </p>
        </div>
      ))}
    </div>
  );
}
