import type { ComponentType, JSX } from 'react';
import { AlertTriangle, Target, TrendingDown, Scissors } from 'lucide-react';

import { formatBRL, type Centavos } from '../../shared/types/money';

interface Props {
  availableCents: Centavos;
  onNavigate?: (page: string) => void;
}

const ACTIONS: ReadonlyArray<{
  id: string;
  Icon: ComponentType<{ className?: string }>;
  label: string;
  page: string;
}> = [
  { id: 'budget', Icon: Target, label: 'Revise seus orçamentos', page: 'planning' },
  { id: 'debts', Icon: TrendingDown, label: 'Veja estratégia de quitação', page: 'debts' },
  { id: 'cuts', Icon: Scissors, label: 'Identifique gastos cortáveis', page: 'reports' },
] as const;

export function CrisisModeCard({ availableCents, onNavigate }: Props): JSX.Element {
  const isNegative = availableCents < 0;
  return (
    <div className="rounded-2xl border border-red-500/40 bg-red-500/5 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
        <div>
          <p className="text-xs font-bold text-red-400">
            {isNegative ? 'Saldo comprometido' : 'Atenção: limite crítico'}
          </p>
          <p className="text-[10px] text-quantum-fgMuted">
            {isNegative
              ? `Gastos fixos superam o saldo em ${formatBRL(Math.abs(availableCents) as Centavos)}`
              : 'Disponível abaixo do limite seguro — tome uma ação agora'}
          </p>
        </div>
      </div>
      <div className="space-y-1.5">
        {ACTIONS.map(({ id, Icon, label, page }) => (
          <button
            key={id}
            onClick={() => onNavigate?.(page)}
            disabled={!onNavigate}
            className="w-full flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2 text-left hover:border-red-500/40 transition-colors disabled:opacity-50 disabled:cursor-default"
          >
            <Icon className="h-3.5 w-3.5 text-red-400 shrink-0" />
            <span className="text-xs text-quantum-fg">{label}</span>
            {onNavigate && <span className="ml-auto text-[10px] text-red-400">→</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
