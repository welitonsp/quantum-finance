import { Activity, AlertTriangle, CheckCircle2, Target } from 'lucide-react';

import { formatCurrency } from '../../utils/formatters';
import type { DashboardBudgetAlert } from '../../utils/dashboardUtils';

interface BudgetAlertsPanelProps {
  alerts: DashboardBudgetAlert[];
  budgetsCount: number;
  loading: boolean;
  hasTransactions: boolean;
}

export function BudgetAlertsPanel({
  alerts,
  budgetsCount,
  loading,
  hasTransactions,
}: BudgetAlertsPanelProps) {
  const criticalCount = alerts.filter(alert => alert.status === 'critical').length;
  const attentionCount = alerts.filter(alert => alert.status === 'attention').length;
  const headerTone = criticalCount > 0
    ? 'text-red-400 border-red-500/25 bg-red-500/10'
    : attentionCount > 0
    ? 'text-amber-400 border-amber-500/25 bg-amber-500/10'
    : 'text-quantum-accent border-quantum-accent/20 bg-quantum-accent/10';

  const emptyMessage = budgetsCount === 0
    ? 'Nenhum orçamento cadastrado.'
    : hasTransactions
    ? 'Nenhum orçamento em atenção.'
    : 'Sem gastos registrados para avaliar.';

  return (
    <section className="bg-quantum-card/40 border border-quantum-border backdrop-blur-sm rounded-3xl overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-quantum-border">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`w-8 h-8 rounded-xl border flex items-center justify-center shrink-0 ${headerTone}`}>
            <Target className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-black text-quantum-fg">Alertas de orçamento</h2>
            <p className="text-[10px] text-quantum-fgMuted">
              {criticalCount > 0
                ? `${criticalCount} limite${criticalCount > 1 ? 's' : ''} atingido${criticalCount > 1 ? 's' : ''}`
                : attentionCount > 0
                ? `${attentionCount} em atenção`
                : 'Sem orçamento crítico'}
            </p>
          </div>
        </div>
      </div>

      <div className="p-5">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {[0, 1, 2].map(item => (
              <div key={item} className="h-24 rounded-2xl bg-quantum-bgSecondary animate-pulse" />
            ))}
          </div>
        ) : alerts.length === 0 ? (
          <div className="flex items-center gap-3 rounded-2xl border border-quantum-border bg-quantum-bgSecondary/50 px-4 py-4">
            <CheckCircle2 className="w-5 h-5 text-quantum-accent shrink-0" />
            <div>
              <p className="text-sm font-bold text-quantum-fg">{emptyMessage}</p>
              <p className="text-xs text-quantum-fgMuted">Categorias abaixo de 80% ficam fora deste painel.</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {alerts.map(alert => {
              const isCritical = alert.status === 'critical';
              const pctLabel = `${alert.percentUsed.toFixed(0)}%`;
              const Icon = isCritical ? AlertTriangle : Activity;
              const tone = isCritical
                ? 'border-red-500/25 bg-red-500/8 text-red-400'
                : 'border-amber-500/25 bg-amber-500/8 text-amber-400';

              return (
                <article key={alert.id} className={`rounded-2xl border p-4 ${tone}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-black text-quantum-fg truncate">{alert.category}</p>
                      <p className="mt-0.5 text-[10px] font-mono text-quantum-fgMuted">{alert.month}</p>
                    </div>
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${tone}`}>
                      <Icon className="w-3 h-3" />
                      {isCritical ? 'Limite atingido' : 'Atenção'}
                    </span>
                  </div>

                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-quantum-border/50">
                    <div
                      className={`h-full rounded-full ${isCritical ? 'bg-red-400' : 'bg-amber-400'}`}
                      style={{ width: `${Math.min(alert.percentUsed, 100)}%` }}
                    />
                  </div>

                  <div className="mt-2 flex items-baseline justify-between gap-3 text-[11px]">
                    <span className="font-mono font-bold text-quantum-fg">
                      {formatCurrency(alert.spentCents, { cents: true })}
                    </span>
                    <span className="text-quantum-fgMuted">
                      de {formatCurrency(alert.limitCents, { cents: true })} · {pctLabel}
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
