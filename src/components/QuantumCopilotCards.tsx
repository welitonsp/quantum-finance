import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, TrendingDown, Zap, Info, AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { CopilotInsight, InsightSeverity } from '../hooks/useQuantumCopilot';

interface Props {
  insights: CopilotInsight[];
  loading:  boolean;
}

const SEVERITY_STYLES: Record<InsightSeverity, { border: string; bg: string; badge: string; icon: string }> = {
  critical: {
    border: 'border-red-500/30',
    bg:     'bg-red-500/8',
    badge:  'bg-red-500/15 text-red-400 border-red-500/30',
    icon:   'text-red-400',
  },
  warning: {
    border: 'border-amber-500/30',
    bg:     'bg-amber-500/8',
    badge:  'bg-amber-500/15 text-amber-400 border-amber-500/30',
    icon:   'text-amber-400',
  },
  info: {
    border: 'border-quantum-border',
    bg:     'bg-quantum-bgSecondary/40',
    badge:  'bg-quantum-accent/10 text-quantum-accent border-quantum-accent/20',
    icon:   'text-quantum-accent',
  },
  positive: {
    border: 'border-emerald-500/30',
    bg:     'bg-emerald-500/8',
    badge:  'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    icon:   'text-emerald-400',
  },
};

function SeverityIcon({ severity, className }: { severity: InsightSeverity; className?: string }) {
  switch (severity) {
    case 'critical': return <AlertTriangle className={className} />;
    case 'warning':  return <TrendingUp    className={className} />;
    case 'info':     return <Info          className={className} />;
    case 'positive': return <CheckCircle2  className={className} />;
    default:         return <Zap           className={className} />;
  }
}

function InsightCard({ insight, index }: { insight: CopilotInsight; index: number }) {
  const s = SEVERITY_STYLES[insight.severity];

  return (
    <motion.article
      key={insight.id}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07, type: 'spring', stiffness: 200, damping: 20 }}
      className={`rounded-2xl border p-4 ${s.border} ${s.bg} flex flex-col gap-2`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xl leading-none" aria-hidden="true">{insight.emoji}</span>
          <p className="text-sm font-black text-quantum-fg leading-tight">{insight.title}</p>
        </div>
        {insight.metric && (
          <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border ${s.badge}`}>
            {insight.metric}
          </span>
        )}
      </div>

      <p className="text-xs text-quantum-fgMuted leading-relaxed">{insight.body}</p>

      <div className="flex items-center gap-1.5 mt-auto pt-1">
        <SeverityIcon severity={insight.severity} className={`w-3 h-3 shrink-0 ${s.icon}`} />
        <span className={`text-[10px] font-bold uppercase tracking-wide ${s.icon}`}>
          {insight.severity === 'critical' ? 'Alerta Crítico'
            : insight.severity === 'warning' ? 'Atenção'
            : insight.severity === 'positive' ? 'Positivo'
            : 'Info'}
        </span>
      </div>
    </motion.article>
  );
}

function SkeletonCard({ i }: { i: number }) {
  return (
    <div key={i} className="rounded-2xl border border-quantum-border bg-quantum-bgSecondary/30 p-4 space-y-3 animate-pulse">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded bg-quantum-border/60" />
        <div className="h-3.5 bg-quantum-border/60 rounded-full w-2/3" />
      </div>
      <div className="h-3 bg-quantum-border/40 rounded-full w-full" />
      <div className="h-3 bg-quantum-border/40 rounded-full w-4/5" />
    </div>
  );
}

export default function QuantumCopilotCards({ insights, loading }: Props) {
  if (!loading && insights.length === 0) return null;

  const hasNegative = insights.some(i => i.severity === 'critical' || i.severity === 'warning');
  const TrendIcon   = hasNegative ? TrendingDown : TrendingUp;
  const headerTone  = hasNegative ? 'text-amber-400' : 'text-quantum-accent';

  return (
    <section className="bg-quantum-card/40 border border-quantum-border backdrop-blur-sm rounded-3xl overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-quantum-border">
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${hasNegative ? 'bg-amber-500/10 border border-amber-500/25' : 'bg-quantum-accent/10 border border-quantum-accent/20'}`}>
          <Zap className={`w-4 h-4 ${headerTone}`} />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-black text-quantum-fg">Quantum Copilot</h2>
          <p className="text-[10px] text-quantum-fgMuted">
            {loading ? 'Analisando padrões…' : `${insights.length} insight${insights.length !== 1 ? 's' : ''} proativo${insights.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <TrendIcon className={`w-4 h-4 ${headerTone} shrink-0`} />
      </div>

      <div className="p-5">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {[0, 1, 2].map(i => <SkeletonCard key={i} i={i} />)}
          </div>
        ) : (
          <AnimatePresence initial={false}>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {insights.map((insight, i) => (
                <InsightCard key={insight.id} insight={insight} index={i} />
              ))}
            </div>
          </AnimatePresence>
        )}
      </div>
    </section>
  );
}
