// src/components/SparkLine.tsx
import React, { useMemo, memo } from 'react';

type AnyRecord = Record<string, unknown>;

interface SparkLineProps {
  transactions?: AnyRecord[];
  months?: number;
}

export const SparkLine = memo(({ transactions, months = 6 }: SparkLineProps) => {
  const pts = useMemo(() => {
    const now = new Date();
    const buckets = Array.from({ length: months }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1);
      return { m: d.getMonth(), y: d.getFullYear(), net: 0 };
    });
    (transactions || []).forEach(t => {
      const d = new Date((t['date'] || t['createdAt']) as string);
      const b = buckets.find(bkt => bkt.m === d.getMonth() && bkt.y === d.getFullYear());
      if (b) {
        const val = Math.abs((t['value'] as number) || (t['amount'] as number) || 0);
        const isIncome = t['type'] === 'receita' || t['type'] === 'entrada' || (t['amount'] as number) > 0;
        b.net += isIncome ? val : -val;
      }
    });
    return buckets.map(b => b.net);
  }, [transactions, months]);

  if (pts.every(v => v === 0)) {
    return <div className="h-9 w-[140px] flex items-center text-slate-500 text-[10px]">Sem histórico</div>;
  }

  const W = 140, H = 36;
  const mn = Math.min(...pts), mx = Math.max(...pts), rng = mx - mn || 1;
  const points = pts.map((v, i) => {
    const x = (i / (pts.length - 1)) * W;
    const y = H - 4 - ((v - mn) / rng) * (H - 8);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const lx = W;
  const ly = H - 4 - ((pts[pts.length - 1] - mn) / rng) * (H - 8);
  const rising = pts.length > 1 ? pts[pts.length - 1] >= pts[pts.length - 2] : true;
  const C = rising ? '#10b981' : '#f87171';

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="overflow-visible">
      <polyline points={points} fill="none" stroke={C} strokeWidth="1.5"
        strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly.toFixed(1)} r="3.5" fill={C} />
    </svg>
  );
});
