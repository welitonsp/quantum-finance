import { useMemo, memo } from 'react';
import type { Transaction } from '../shared/types/transaction';
import { getTransactionAbsCentavos, isIncome } from '../utils/transactionUtils';
import { fromCentavos } from '../shared/types/money';

interface Props {
  transactions: Transaction[];
  months?: number;
}

export const SparkLine = memo(({ transactions, months = 6 }: Props) => {
  const pts = useMemo(() => {
    const now = new Date();
    const buckets = Array.from({ length: months }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1);
      return { m: d.getMonth(), y: d.getFullYear(), net: 0 };
    });
    (transactions || []).forEach(t => {
      const d = new Date(String(t.date || t.createdAt));
      const b = buckets.find(b => b.m === d.getMonth() && b.y === d.getFullYear());
      if (b) {
        const value = fromCentavos(getTransactionAbsCentavos(t));
        b.net += isIncome(t.type) ? value : -value;
      }
    });
    return buckets.map(b => b.net);
  }, [transactions, months]);

  if (pts.every(v => v === 0)) return <div className="h-9 w-[140px] flex items-center text-quantum-fgMuted text-[10px]">Sem histórico</div>;

  const W = 140, H = 36;
  const mn = Math.min(...pts), mx = Math.max(...pts), rng = mx - mn || 1;
  const points = pts.map((v, i) => {
    const x = (i / (pts.length - 1)) * W;
    const y = H - 4 - ((v - mn) / rng) * (H - 8);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  const lx = W;
  const last = pts[pts.length - 1] ?? 0;
  const prev = pts[pts.length - 2] ?? last;
  const ly = H - 4 - ((last - mn) / rng) * (H - 8);
  const rising = pts.length > 1 ? last >= prev : true;
  const C = rising ? '#10b981' : '#f87171';

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="overflow-visible">
      <polyline points={points} fill="none" stroke={C} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly.toFixed(1)} r="3.5" fill={C} />
    </svg>
  );
});
