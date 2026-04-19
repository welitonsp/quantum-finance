// src/components/HealthGauge.tsx
import React, { useState, useEffect, memo } from 'react';

type GaugeColor = 'emerald' | 'amber' | 'red';

interface HealthGaugeProps {
  score: number;
  color: GaugeColor;
}

export const HealthGauge = memo(({ score, color }: HealthGaugeProps) => {
  const [animatedFill, setAnimatedFill] = useState(0);
  const r    = 46;
  const circ = 2 * Math.PI * r;
  const arc  = circ * 0.72;
  const fill = (Math.max(0, animatedFill) / 100) * arc;
  const C    = ({ emerald: '#10b981', amber: '#f59e0b', red: '#ef4444' } as Record<GaugeColor, string>)[color] ?? '#10b981';
  const lbl  = color === 'red' ? 'CRÍTICO' : color === 'amber' ? 'ATENÇÃO' : score >= 80 ? 'EXCELENTE' : 'SAUDÁVEL';

  useEffect(() => {
    const timeout = setTimeout(() => setAnimatedFill(score), 200);
    return () => clearTimeout(timeout);
  }, [score]);

  return (
    <div className="relative w-32 h-32 flex-shrink-0">
      <svg viewBox="0 0 120 120" className="w-full h-full -rotate-[230deg]">
        <circle cx="60" cy="60" r={r} fill="none" stroke="#1e293b" strokeWidth="7"
          strokeDasharray={`${arc} ${circ - arc}`} strokeLinecap="round" />
        <circle cx="60" cy="60" r={r} fill="none" stroke={C} strokeWidth="7"
          strokeDasharray={`${fill} ${circ - fill}`} strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 1.6s cubic-bezier(0.4,0,0.2,1)' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
        <span className="font-mono text-3xl font-bold text-slate-100 leading-none">{score}</span>
        <span className="text-[8px] font-bold tracking-[0.12em] uppercase" style={{ color: C }}>{lbl}</span>
      </div>
    </div>
  );
});
