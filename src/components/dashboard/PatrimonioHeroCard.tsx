import type { JSX } from 'react';
import { Landmark } from 'lucide-react';
import { formatBRL, toCentavos } from '../../shared/types/money';
import type { FinancialMetrics } from '../../hooks/useFinancialMetrics';
import { formatNumber } from '../../utils/formatters';

interface Props {
  metrics: FinancialMetrics | null;
  loading: boolean;
}

/** "1 mês", "2,5 meses" — "m" sozinho era lido como "milhões" ao lado de valores em R$. */
export function formatReservaMeses(meses: number): string {
  const shown = formatNumber(meses, 1);
  return `${shown} ${shown === '1' || shown === '1,0' ? 'mês' : 'meses'}`;
}

export function PatrimonioHeroCard({ metrics, loading }: Props): JSX.Element | null {
  if (loading && !metrics) return <div className="rounded-2xl border border-quantum-border bg-quantum-card p-4 h-20 animate-pulse" />;
  if (!metrics) return null;

  const isPositive = metrics.patrimonioLiquido >= 0;
  const plCents = toCentavos(Math.abs(metrics.patrimonioLiquido));

  return (
    <div className="rounded-2xl border border-quantum-border bg-quantum-card p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-quantum-fgMuted">Patrimônio Líquido</p>
        <Landmark className="h-4 w-4 text-quantum-fgMuted" />
      </div>
      <p className={`text-2xl font-black font-mono ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
        {!isPositive && <span className="mr-0.5">−</span>}
        {formatBRL(plCents)}
      </p>
      <div className="flex items-center gap-4 mt-2.5">
        <span className="text-[10px] text-quantum-fgMuted">
          Ativos <span className="font-bold text-emerald-400">{formatBRL(toCentavos(metrics.ativos))}</span>
        </span>
        {metrics.passivos > 0 && (
          <span className="text-[10px] text-quantum-fgMuted">
            Passivos <span className="font-bold text-red-400">−{formatBRL(toCentavos(metrics.passivos))}</span>
          </span>
        )}
        {metrics.reservaMeses > 0 && (
          <span className="text-[10px] text-quantum-fgMuted">
            Reserva <span className="font-bold text-quantum-fg">{formatReservaMeses(metrics.reservaMeses)}</span>
          </span>
        )}
      </div>
    </div>
  );
}
