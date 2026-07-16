import { useMemo, type ComponentType, type JSX } from 'react';
import { TrendingUp, TrendingDown, PiggyBank, CalendarDays, Sparkles } from 'lucide-react';

import {
  computeAnomalies,
  computeForecast,
  computeKPIs,
  type InsightContext,
} from '../../lib/insightsEngine';
import { formatBRL, type Centavos } from '../../shared/types/money';
import type { Transaction, Account } from '../../shared/types/transaction';

interface Props {
  transactions: Transaction[];
  accounts: Account[];
  cardOpenInvoicesCents: Centavos;
  currentMonth: string; // YYYY-MM format
}

type BriefingSeverity = 'ok' | 'warn' | 'critical';

interface BriefingItem {
  id: string;
  Icon: ComponentType<{ className?: string }>;
  title: string;
  value: string;
  severity: BriefingSeverity;
}

const SEV: Record<BriefingSeverity, { border: string; icon: string; badge: string; label: string }> = {
  ok:       { border: 'border-l-emerald-500', icon: 'text-emerald-400', badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25', label: 'OK' },
  warn:     { border: 'border-l-amber-500',   icon: 'text-amber-400',   badge: 'bg-amber-500/10 text-amber-400 border-amber-500/25',   label: 'Atenção' },
  critical: { border: 'border-l-red-500',     icon: 'text-red-400',     badge: 'bg-red-500/10 text-red-400 border-red-500/25',         label: 'Alerta' },
};

export function DailyBriefingCard({
  transactions,
  accounts,
  cardOpenInvoicesCents,
  currentMonth,
}: Props): JSX.Element | null {
  const { items, forecast } = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const ctx: InsightContext = { transactions, accounts, today, currentMonth, cardOpenInvoicesCents };

    const anomalies = computeAnomalies(ctx);
    const kpis = computeKPIs(ctx);
    const fc = computeForecast(ctx);

    const built: BriefingItem[] = [];

    // A. Top anomaly
    const topAnomaly = anomalies[0];
    if (topAnomaly && topAnomaly.severity !== 'low') {
      built.push({
        id: 'anomaly-0',
        Icon: topAnomaly.deltaPct > 0 ? TrendingUp : TrendingDown,
        title: `${topAnomaly.category} ${topAnomaly.deltaPct > 0 ? '+' : ''}${topAnomaly.deltaPct}% vs. média`,
        value: formatBRL(Math.abs(topAnomaly.currentCents) as Centavos),
        severity: topAnomaly.severity === 'high' ? 'critical' : 'warn',
      });
    }

    // B. Savings rate
    if (kpis.monthlyIncomeCents > 0) {
      built.push({
        id: 'savings',
        Icon: PiggyBank,
        title: 'Taxa de poupança do mês',
        value: `${kpis.savingsRatePct.toFixed(1)}%`,
        severity: kpis.savingsRatePct >= 20 ? 'ok' : kpis.savingsRatePct >= 5 ? 'warn' : 'critical',
      });
    }

    // C. Forecast
    if (fc.daysRemaining > 0) {
      built.push({
        id: 'forecast',
        Icon: CalendarDays,
        title: `Projeção — ${fc.daysRemaining} dias restantes`,
        value: formatBRL(Math.abs(fc.projectedBalanceCents) as Centavos),
        severity:
          fc.projectedBalanceCents < 0
            ? 'critical'
            : fc.projectedBalanceCents < kpis.monthlyIncomeCents * 0.1
              ? 'warn'
              : 'ok',
      });
    }

    return { items: built.slice(0, 3), forecast: fc };
  }, [transactions, accounts, cardOpenInvoicesCents, currentMonth]);

  if (items.length === 0) return null;

  return (
    <div className="rounded-2xl border border-quantum-border bg-quantum-card p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-quantum-accent" />
        <p className="text-[10px] font-bold uppercase tracking-wider text-quantum-fgMuted">Briefing de Hoje</p>
      </div>
      {/* Items */}
      {items.map(item => {
        const sev = SEV[item.severity];
        return (
          <div key={item.id} className={`flex items-center gap-3 border-l-2 pl-3 ${sev.border}`}>
            <item.Icon className={`h-4 w-4 shrink-0 ${sev.icon}`} />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-quantum-fgMuted truncate">{item.title}</p>
              <p className="text-sm font-bold text-quantum-fg">
                {item.id === 'forecast' && forecast.projectedBalanceCents < 0 && <span className="mr-0.5">−</span>}
                {item.value}
              </p>
            </div>
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border shrink-0 ${sev.badge}`}>
              {sev.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
