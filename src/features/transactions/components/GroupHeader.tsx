// src/features/transactions/components/GroupHeader.tsx
import { formatCurrency } from '../../../utils/formatters';

interface GroupHeaderProps {
  label:         string;
  count:         number;
  totalInCents:  number;
  totalOutCents: number;
  netCents:      number;
}

export function GroupHeader({ label, count, totalInCents, totalOutCents, netCents }: GroupHeaderProps) {
  return (
    <div className="flex items-center gap-3 py-2 px-1">
      <span className="text-xs font-black text-quantum-fg uppercase tracking-wider whitespace-nowrap">{label}</span>
      <div className="flex-1 h-px bg-quantum-border" />
      <span className="text-[10px] text-quantum-fgMuted font-mono">{count} reg.</span>
      {totalInCents > 0 && (
        <span className="text-[10px] text-quantum-accent font-mono font-bold">
          +{formatCurrency(totalInCents, { cents: true })}
        </span>
      )}
      {totalOutCents > 0 && (
        <span className="text-[10px] text-quantum-red font-mono font-bold">
          -{formatCurrency(totalOutCents, { cents: true })}
        </span>
      )}
      <span className={`text-[10px] font-mono font-black ${netCents >= 0 ? 'text-quantum-accent' : 'text-quantum-red'}`}>
        {netCents >= 0 ? '+' : ''}{formatCurrency(netCents, { cents: true })}
      </span>
    </div>
  );
}
