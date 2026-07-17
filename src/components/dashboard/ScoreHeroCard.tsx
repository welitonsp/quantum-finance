import { useMemo, useState, type JSX } from 'react';
import { TrendingUp, TrendingDown, Minus, ChevronDown } from 'lucide-react';
import type { FinancialMetrics } from '../../hooks/useFinancialMetrics';
import type { ScoreHistoryEntry } from '../../hooks/useScoreHistory';
import { computeHealthScore, computePillars, nextLevelHint, type PillarStatus } from '../../lib/healthScore';

interface Props {
  metrics: FinancialMetrics | null;
  loading: boolean;
  /** Last months of score history (ordered newest first). */
  history: ScoreHistoryEntry[];
}

const STATUS_COLORS: Record<PillarStatus, { bar: string; text: string; badge: string }> = {
  great:    { bar: 'bg-emerald-500', text: 'text-emerald-400', badge: 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400' },
  ok:       { bar: 'bg-blue-500',    text: 'text-blue-400',    badge: 'bg-blue-500/10 border-blue-500/25 text-blue-400'         },
  warn:     { bar: 'bg-amber-500',   text: 'text-amber-400',   badge: 'bg-amber-500/10 border-amber-500/25 text-amber-400'      },
  critical: { bar: 'bg-red-500',     text: 'text-red-400',     badge: 'bg-red-500/10 border-red-500/25 text-red-400'           },
};

const STATUS_LABEL: Record<PillarStatus, string> = { great: 'Ótimo', ok: 'Bom', warn: 'Atenção', critical: 'Crítico' };

function scoreColor(s: number): { text: string; ring: string; badge: string } {
  if (s >= 75) return { text: 'text-emerald-400', ring: 'stroke-emerald-500', badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25' };
  if (s >= 50) return { text: 'text-amber-400',   ring: 'stroke-amber-500',   badge: 'bg-amber-500/10 text-amber-400 border-amber-500/25'   };
  return         { text: 'text-red-400',     ring: 'stroke-red-500',     badge: 'bg-red-500/10 text-red-400 border-red-500/25'         };
}

export function ScoreHeroCard({ metrics, loading, history }: Props): JSX.Element | null {
  const [expanded, setExpanded] = useState(false);

  const { score, delta, hint, colors, pillars } = useMemo(() => {
    if (!metrics) return { score: 0, prevScore: null, delta: null, hint: '', colors: scoreColor(0), pillars: [] };
    const score = computeHealthScore(metrics);
    const prevScore = history[0]?.score ?? null;
    const delta = prevScore !== null ? score - prevScore : null;
    const hint = nextLevelHint(metrics);
    return { score, prevScore, delta, hint, colors: scoreColor(score), pillars: computePillars(metrics) };
  }, [metrics, history]);

  if (loading && !metrics) return <div className="rounded-2xl border border-quantum-border bg-quantum-card p-4 h-20 animate-pulse" />;
  if (!metrics) return null;

  return (
    <div className="rounded-2xl border border-quantum-border bg-quantum-card p-4">
      <div className="flex items-center justify-between">
        {/* Left: score number + label */}
        <div className="flex items-center gap-3">
          {/* SVG ring — 48x48 */}
          <div className="relative w-12 h-12 shrink-0">
            <svg viewBox="0 0 48 48" className="w-12 h-12 -rotate-90">
              {/* track */}
              <circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" strokeWidth="4" className="text-quantum-border" />
              {/* fill — strokeDasharray = circumference * (score/100) */}
              <circle
                cx="24" cy="24" r="20" fill="none"
                strokeWidth="4"
                strokeLinecap="round"
                className={colors.ring}
                strokeDasharray={`${(score / 100) * 125.66} 125.66`}
              />
            </svg>
            <span className={`absolute inset-0 flex items-center justify-center text-sm font-black ${colors.text}`}>
              {score}
            </span>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-quantum-fgMuted">Score de Saúde</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              {delta !== null && (
                <span className={`text-xs font-bold flex items-center gap-0.5 ${delta > 0 ? 'text-emerald-400' : delta < 0 ? 'text-red-400' : 'text-quantum-fgMuted'}`}>
                  {delta > 0 ? <TrendingUp className="h-3 w-3" /> : delta < 0 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                  {delta > 0 ? `+${delta}` : delta}
                </span>
              )}
              <span className="text-xs text-quantum-fgMuted">vs mês anterior</span>
            </div>
          </div>
        </div>
        {/* Right: próximo nível badge */}
        <div className="max-w-[160px] text-right">
          <p className="text-[9px] font-bold uppercase tracking-wide text-quantum-fgMuted mb-0.5">Próximo nível</p>
          <p className="text-[10px] text-quantum-fgMuted leading-tight">{hint}</p>
        </div>
      </div>

      {/* Detalhes por pilar — expansível, recolhido por padrão */}
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        aria-expanded={expanded}
        className="mt-3 w-full flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-quantum-fgMuted hover:text-quantum-fg transition-colors"
      >
        {expanded ? 'Ocultar decomposição' : 'Ver decomposição por pilar'}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {pillars.map(p => {
            const c   = STATUS_COLORS[p.status];
            const pct = (p.score / p.maxScore) * 100;
            return (
              <div key={p.label} className="bg-quantum-bgSecondary/60 border border-quantum-border rounded-2xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <p.icon className={`w-4 h-4 ${c.text}`} />
                    <span className="text-xs font-bold text-quantum-fg">{p.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-black uppercase px-1.5 py-0.5 rounded-md border ${c.badge}`}>
                      {STATUS_LABEL[p.status]}
                    </span>
                    <span className={`text-sm font-black font-mono ${c.text}`}>
                      {p.score}<span className="text-quantum-fgMuted font-normal text-[10px]">/{p.maxScore}</span>
                    </span>
                  </div>
                </div>
                <div className="h-1.5 rounded-full bg-quantum-card mb-2 overflow-hidden">
                  <div className={`h-full rounded-full ${c.bar}`} style={{ width: `${pct}%` }} />
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-quantum-fgMuted leading-snug">{p.tip}</p>
                  <span className={`text-[11px] font-bold ml-3 shrink-0 ${c.text}`}>{p.value}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
