import { TrendingUp, TrendingDown } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface Props {
  label: string;
  /** Valor já formatado para exibição (string) ou número simples. NÃO use para moeda — use FinancialCard. */
  value: string | number;
  /** Variação percentual; o sinal define cor/ícone */
  deltaPct?: number;
  /** Inverte a semântica de cor (ex.: subir despesa é ruim) */
  invertDelta?: boolean;
  icon?: LucideIcon;
  hint?: string;
  className?: string;
}

/** Card de KPI genérico padronizado (PR 2 — design system). Para valores monetários, use FinancialCard. */
export function MetricCard({ label, value, deltaPct, invertDelta = false, icon: Icon, hint, className = '' }: Props) {
  const hasDelta = typeof deltaPct === 'number' && Number.isFinite(deltaPct);
  const positive = hasDelta ? (invertDelta ? (deltaPct as number) < 0 : (deltaPct as number) >= 0) : true;

  return (
    <div className={`bg-quantum-card/50 backdrop-blur-sm border border-quantum-border rounded-2xl p-4 flex flex-col gap-1 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold text-quantum-fgMuted uppercase tracking-widest truncate">{label}</span>
        {Icon && <Icon className="w-4 h-4 text-quantum-fgMuted shrink-0" />}
      </div>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-xl font-black text-quantum-fg font-mono tabular-nums">{value}</span>
        {hasDelta && (
          <span className={`inline-flex items-center gap-0.5 text-xs font-bold ${positive ? 'text-quantum-accent' : 'text-red-400'}`}>
            {positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {Math.abs(deltaPct as number).toFixed(1)}%
          </span>
        )}
      </div>
      {hint && <span className="text-[10px] text-quantum-fgMuted">{hint}</span>}
    </div>
  );
}
