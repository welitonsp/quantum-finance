// src/components/IntelStrip.tsx
import React, { useMemo, memo } from 'react';
import { TrendingDown, TrendingUp, Minus, AlertTriangle, ShieldCheck, Target, ChevronsUp } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface IntelStripProps {
  savingsRate: number;
  debtRatio: number;
  goalProgress: number;
}

type ColorKey = 'red' | 'amber' | 'emerald';

interface IntelItem {
  c: ColorKey;
  Icon: LucideIcon;
  title: string;
  body: string;
}

const colorClasses: Record<ColorKey, string> = {
  red:     'border-l-red-500 bg-red-500/5 border-red-500/20 text-red-400',
  amber:   'border-l-amber-500 bg-amber-500/5 border-amber-500/20 text-amber-400',
  emerald: 'border-l-emerald-500 bg-emerald-500/5 border-emerald-500/20 text-emerald-400',
};

export const IntelStrip = memo(({ savingsRate, debtRatio, goalProgress }: IntelStripProps) => {
  const items = useMemo((): IntelItem[] => [
    savingsRate < 10
      ? { c: 'red',     Icon: TrendingDown, title: 'Poupança Crítica',     body: `Apenas ${savingsRate.toFixed(1)}% retidos — meta mínima: 20%` }
      : savingsRate >= 20
        ? { c: 'emerald', Icon: TrendingUp,  title: 'Poupança Sólida',      body: `${savingsRate.toFixed(1)}% da renda preservada mensalmente` }
        : { c: 'amber',   Icon: Minus,       title: 'Poupança Moderada',    body: `${savingsRate.toFixed(1)}% retidos — amplie para 20%` },
    debtRatio > 70
      ? { c: 'red',     Icon: AlertTriangle, title: 'Renda Comprometida',   body: `${debtRatio.toFixed(0)}% em despesas — reduza fixos` }
      : { c: 'emerald', Icon: ShieldCheck,   title: 'Despesas Controladas', body: `${debtRatio.toFixed(0)}% de comprometimento de renda` },
    goalProgress < 50
      ? { c: 'amber',   Icon: Target,        title: 'Meta Atrasada',        body: `${goalProgress.toFixed(0)}% concluído — revise cortes` }
      : goalProgress >= 90
        ? { c: 'emerald', Icon: ChevronsUp,  title: 'Meta Quase Batida',    body: `${goalProgress.toFixed(0)}% — no trilho certo` }
        : { c: 'amber',   Icon: Target,      title: 'Progresso Parcial',    body: `${goalProgress.toFixed(0)}% da meta atingido este mês` },
  ], [savingsRate, debtRatio, goalProgress]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {items.map((item, idx) => (
        <div
          key={idx}
          className={`border-l-3 rounded-xl p-4 flex flex-col gap-2 transition-all hover:scale-[1.02] ${colorClasses[item.c]}`}
          style={{ borderLeftWidth: '3px', borderLeftColor: 'currentColor' }}
        >
          <div className="flex items-center gap-2">
            <item.Icon className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-wide">{item.title}</span>
          </div>
          <p className="text-sm text-slate-300 leading-relaxed">{item.body}</p>
        </div>
      ))}
    </div>
  );
});
