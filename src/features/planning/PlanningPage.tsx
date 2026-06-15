import { useMemo } from 'react';
import { Target, BookMarked } from 'lucide-react';
import { useTransactions } from '../../hooks/useTransactions';
import { useFinancialMetrics } from '../../hooks/useFinancialMetrics';
import BudgetWidget from '../../components/BudgetWidget';
import GoalsPanel from '../../components/GoalsPanel';
import { LoadingPage } from '../../shared/components/ui';
import { toCentavos } from '../../shared/types/money';
import type { Centavos } from '../../shared/types/money';

interface Props {
  uid: string;
}

export default function PlanningPage({ uid }: Props) {
  const { transactions, loading } = useTransactions(uid);

  const { metrics } = useFinancialMetrics(uid, transactions);

  const monthlyExpensesCents = useMemo(
    () => (metrics && metrics.despesa > 0 ? toCentavos(metrics.despesa) as Centavos : undefined),
    [metrics],
  );

  if (loading) return <LoadingPage label="Carregando planejamento..." />;

  return (
    <div className="max-w-5xl mx-auto space-y-8 py-4">
      {/* Cabeçalho */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-quantum-accent/10 border border-quantum-accent/25 flex items-center justify-center">
          <Target className="w-5 h-5 text-quantum-accent" />
        </div>
        <div>
          <h1 className="text-xl font-black text-quantum-fg">Planejamento</h1>
          <p className="text-xs text-quantum-fgMuted">Orçamentos por categoria + metas de poupança</p>
        </div>
      </div>

      {/* Orçamentos */}
      <section aria-labelledby="budgets-heading">
        <div className="flex items-center gap-2 mb-4">
          <BookMarked className="w-4 h-4 text-quantum-fgMuted" />
          <h2 id="budgets-heading" className="text-sm font-bold text-quantum-fgMuted uppercase tracking-wider">
            Orçamentos por Categoria
          </h2>
        </div>
        <BudgetWidget uid={uid} transactions={transactions} />
      </section>

      {/* Metas */}
      <section aria-labelledby="goals-heading">
        <div className="flex items-center gap-2 mb-4">
          <Target className="w-4 h-4 text-quantum-fgMuted" />
          <h2 id="goals-heading" className="text-sm font-bold text-quantum-fgMuted uppercase tracking-wider">
            Metas de Poupança
          </h2>
        </div>
        <GoalsPanel
          uid={uid}
          {...(metrics?.ativosCents !== undefined ? { ativosCents: metrics.ativosCents } : {})}
          {...(monthlyExpensesCents !== undefined ? { monthlyExpensesCents } : {})}
        />
      </section>
    </div>
  );
}
