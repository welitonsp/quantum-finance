import { useMemo, type JSX } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { FinancialMetrics } from '../../hooks/useFinancialMetrics';
import type { ScoreHistoryEntry } from '../../hooks/useScoreHistory';

interface Props {
  metrics: FinancialMetrics | null;
  loading: boolean;
  /** Last months of score history (ordered oldest first for the chart). */
  history: ScoreHistoryEntry[];
  /** Selected dashboard month in YYYY-MM format. */
  selectedMonth: string;
}

function computeScore(m: FinancialMetrics): number {
  const s1 = m.taxaPoupanca >= 30 ? 25 : m.taxaPoupanca >= 20 ? 20 : m.taxaPoupanca >= 10 ? 12 : m.taxaPoupanca >= 5 ? 6 : 0;
  const s2 = m.endividamento <= 10 ? 25 : m.endividamento <= 30 ? 20 : m.endividamento <= 50 ? 12 : m.endividamento <= 70 ? 6 : 0;
  const s3 = m.reservaMeses >= 6 ? 25 : m.reservaMeses >= 3 ? 18 : m.reservaMeses >= 1 ? 8 : 0;
  const s4 = m.comprometimento <= 20 ? 25 : m.comprometimento <= 35 ? 18 : m.comprometimento <= 50 ? 8 : 0;
  return s1 + s2 + s3 + s4;
}

function nextLevelHint(m: FinancialMetrics): string {
  const pillars = [
    { score: m.taxaPoupanca >= 30 ? 25 : m.taxaPoupanca >= 20 ? 20 : m.taxaPoupanca >= 10 ? 12 : m.taxaPoupanca >= 5 ? 6 : 0,    hint: 'Aumente a poupança para 20% da renda' },
    { score: m.endividamento <= 10 ? 25 : m.endividamento <= 30 ? 20 : m.endividamento <= 50 ? 12 : m.endividamento <= 70 ? 6 : 0, hint: 'Reduza dívidas abaixo de 30% do patrimônio' },
    { score: m.reservaMeses >= 6 ? 25 : m.reservaMeses >= 3 ? 18 : m.reservaMeses >= 1 ? 8 : 0,                                   hint: 'Construa 3 meses de reserva de emergência' },
    { score: m.comprometimento <= 20 ? 25 : m.comprometimento <= 35 ? 18 : m.comprometimento <= 50 ? 8 : 0,                       hint: 'Reduza custos fixos abaixo de 35% da renda' },
  ];
  const lowest = pillars.reduce((a, b) => (b.score < a.score ? b : a));
  return lowest.hint;
}

function scoreColor(s: number): { text: string; ring: string; badge: string } {
  if (s >= 75) return { text: 'text-emerald-400', ring: 'stroke-emerald-500', badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25' };
  if (s >= 50) return { text: 'text-amber-400',   ring: 'stroke-amber-500',   badge: 'bg-amber-500/10 text-amber-400 border-amber-500/25'   };
  return         { text: 'text-red-400',     ring: 'stroke-red-500',     badge: 'bg-red-500/10 text-red-400 border-red-500/25'         };
}

function previousScore(history: ScoreHistoryEntry[], selectedMonth: string): number | null {
  const priorEntries = history.filter(entry => entry.month < selectedMonth);
  const previous = priorEntries.length > 0 ? priorEntries[priorEntries.length - 1] : null;
  return previous?.score ?? null;
}

export function ScoreHeroCard({ metrics, loading, history, selectedMonth }: Props): JSX.Element | null {
  const { score, delta, hint, colors } = useMemo(() => {
    if (!metrics) return { score: 0, prevScore: null, delta: null, hint: '', colors: scoreColor(0) };
    const score = computeScore(metrics);
    const prevScore = previousScore(history, selectedMonth);
    const delta = prevScore !== null ? score - prevScore : null;
    const hint = nextLevelHint(metrics);
    return { score, prevScore, delta, hint, colors: scoreColor(score) };
  }, [metrics, history, selectedMonth]);

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
    </div>
  );
}
