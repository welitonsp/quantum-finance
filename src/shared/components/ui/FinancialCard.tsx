import { TrendingUp, TrendingDown } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { MoneyDisplay } from './MoneyDisplay';
import type { Centavos } from '../../types/money';

interface Props {
  label: string;
  /** Valor em centavos inteiros — nunca float (regra canônica do projeto) */
  cents: Centavos | number;
  /** Modo privacidade: exibe '••••' */
  hidden?: boolean;
  /** Colore o valor por sinal (verde/vermelho) */
  colorize?: boolean;
  /** Variação percentual; sinal define cor/ícone */
  deltaPct?: number;
  /** Inverte a semântica de cor (ex.: subir passivo é ruim) */
  invertDelta?: boolean;
  icon?: LucideIcon;
  hint?: string;
  className?: string;
}

/**
 * Card financeiro padronizado (PR 2 — design system). Apenas APRESENTAÇÃO:
 * recebe `cents` já calculado pela camada financeira; não faz cálculo monetário.
 */
export function FinancialCard({
  label, cents, hidden = false, colorize = false,
  deltaPct, invertDelta = false, icon: Icon, hint, className = '',
}: Props) {
  const hasDelta = typeof deltaPct === 'number' && Number.isFinite(deltaPct);
  const positive = hasDelta ? (invertDelta ? (deltaPct as number) < 0 : (deltaPct as number) >= 0) : true;

  return (
    <div className={`bg-quantum-card/50 backdrop-blur-sm border border-quantum-border rounded-2xl p-4 flex flex-col gap-1 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold text-quantum-fgMuted uppercase tracking-widest truncate">{label}</span>
        {Icon && <Icon className="w-4 h-4 text-quantum-fgMuted shrink-0" />}
      </div>
      <div className="flex items-baseline gap-2 flex-wrap">
        <MoneyDisplay cents={cents} hidden={hidden} colorize={colorize} size="xl" />
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
