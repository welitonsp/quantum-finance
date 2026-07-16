import CountUp from 'react-countup';
import { formatBRL } from '../../shared/types/money';
import type { Centavos } from '../../shared/types/money';
import type { SpendingPower } from '../../hooks/useSpendingPower';

interface Props {
  power: SpendingPower;
}

const ZONE_CONFIG = {
  safe:    { bg: 'bg-emerald-500/10', border: 'border-emerald-500/25', text: 'text-emerald-400', label: 'Zona segura'  },
  caution: { bg: 'bg-amber-500/10',   border: 'border-amber-500/25',   text: 'text-amber-400',   label: 'Atenção'      },
  danger:  { bg: 'bg-red-500/10',     border: 'border-red-500/25',     text: 'text-red-400',     label: 'Comprometido' },
} as const;

export function SpendingPowerBadge({ power }: Props) {
  const cfg = ZONE_CONFIG[power.zone];
  const isNegative = power.availableCents < 0;
  const absCents = Math.abs(power.availableCents) as Centavos;
  const displayBRL = absCents / 100;

  return (
    <div className={`rounded-2xl border p-4 ${cfg.bg} ${cfg.border}`}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] font-bold text-quantum-fgMuted uppercase tracking-wider">Posso gastar hoje?</p>
        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${cfg.border} ${cfg.bg} ${cfg.text}`}>
          {cfg.label}
        </span>
      </div>
      <p className={`text-3xl font-black font-mono ${cfg.text}`}>
        {isNegative && <span className="mr-0.5">−</span>}
        <CountUp
          end={displayBRL}
          duration={1.5}
          separator="."
          decimal=","
          decimals={2}
          prefix="R$ "
        />
      </p>
      <div className="flex items-center gap-3 mt-2.5">
        <span className="text-[10px] text-quantum-fgMuted">
          Saldo <span className="font-bold text-quantum-fg">{formatBRL(power.saldoCents)}</span>
        </span>
        {power.pendingCommitmentsCents > 0 && (
          <span className="text-[10px] text-quantum-fgMuted">
            Fixos <span className="font-bold text-red-400">−{formatBRL(power.pendingCommitmentsCents)}</span>
          </span>
        )}
        {power.cardInvoiceCents > 0 && (
          <span className="text-[10px] text-quantum-fgMuted">
            Fatura <span className="font-bold text-red-400">−{formatBRL(power.cardInvoiceCents)}</span>
          </span>
        )}
      </div>
    </div>
  );
}
