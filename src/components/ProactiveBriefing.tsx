import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BrainCircuit, ChevronDown, ChevronUp, RefreshCw,
  AlertTriangle, ShieldCheck, AlertCircle, X, type LucideIcon,
} from 'lucide-react';
import { GeminiService } from '../features/ai-chat/GeminiService';
import type { DashboardKPIs, CategoryChartPoint, TimeRange } from '../hooks/useFinancialData';
import type { ForecastResult } from '../hooks/useForecast';
import type { BudgetInsight } from '../hooks/useBudgets';

// Safe numeric coercion — returns 0 for NaN, Infinity, null, undefined, non-numeric strings
const safe = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

// ─── Types ────────────────────────────────────────────────────────────────────

type Severity = 'critical' | 'warning' | 'ok';

interface SeverityConfig {
  icon:       LucideIcon;
  iconClass:  string;
  badgeClass: string;
  barClass:   string;
  label:      string;
}

const SEVERITY_CONFIG: Record<Severity, SeverityConfig> = {
  critical: {
    icon:       AlertTriangle,
    iconClass:  'text-red-400',
    badgeClass: 'bg-red-500/10 border-red-500/30 text-red-400',
    barClass:   'from-red-600 to-red-400',
    label:      'Alerta Crítico',
  },
  warning: {
    icon:       AlertCircle,
    iconClass:  'text-amber-400',
    badgeClass: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
    barClass:   'from-amber-500 to-yellow-400',
    label:      'Atenção Necessária',
  },
  ok: {
    icon:       ShieldCheck,
    iconClass:  'text-emerald-400',
    badgeClass: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
    barClass:   'from-emerald-500 to-teal-400',
    label:      'Finanças Estáveis',
  },
};

function calcSeverity(forecast: ForecastResult | undefined): Severity {
  if (forecast?.minBalance !== undefined && forecast.minBalance < 0) return 'critical';
  if (forecast?.health === 'warning') return 'warning';
  return 'ok';
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  uid:          string;
  kpis:         DashboardKPIs;
  categoryData: CategoryChartPoint[];
  timeRange:    TimeRange;
  dataLoading:  boolean;
  forecast?:    ForecastResult;
  budgets?:     BudgetInsight[];
  className?:   string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ProactiveBriefing({
  uid, kpis, categoryData, timeRange, dataLoading, forecast, budgets, className = '',
}: Props) {
  const [briefing,  setBriefing]  = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [expanded,  setExpanded]  = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const [errored,   setErrored]   = useState(false);

  // Anti-spam: only call AI when data key actually changes
  const lastCallKey = useRef<string>('');
  const abortedRef  = useRef<boolean>(false);

  // Budget hash: only non-success items sorted deterministically by category name.
  // Changes only when a budget crosses a status threshold — keeps anti-spam intact.
  const budgetHash = (budgets ?? [])
    .filter(b => b.status !== 'success')
    .sort((a, b) => a.category.localeCompare(b.category))
    .map(b => `${b.category}:${b.status}`)
    .join('|');

  // Stable key: timeRange + balance + forecast health + budget alert states
  const dataKey = `${timeRange}|${Math.round(kpis.totalBalance)}|${Math.round(forecast?.minBalance ?? 0)}|${forecast?.health ?? ''}|${budgetHash}`;

  const fetchBriefing = useCallback(async (forced = false) => {
    if (!uid) return;

    const hasData = kpis.totalIncome > 0 || kpis.totalExpense > 0;
    if (!hasData && !forced) return;

    abortedRef.current = false;
    setAiLoading(true);
    setErrored(false);
    if (forced) {
      setBriefing(null);
      setExpanded(true);
    }

    try {
      const forecastPayload = forecast
        ? { projectedBalance: forecast.finalBalance, minBalance: forecast.minBalance, health: forecast.health }
        : undefined;

      // ── Budget context: dedup → filter → sort → top-3 → clamp 500 chars ──
      const rawBudgets = budgets ?? [];
      const dedupedBudgets = Array.from(
        new Map(rawBudgets.map(b => [b.category, b])).values(),
      );
      const alertingBudgets = dedupedBudgets
        .filter(b => b.status !== 'success')
        .sort((a, b) => (a.status === 'danger' ? -1 : b.status === 'danger' ? 1 : 0))
        .slice(0, 3);

      const rawBudgetContext = alertingBudgets
        .map(b =>
          `${b.category.trim()}: ${b.status.toUpperCase()}, ` +
          `gasto ${safe(b.spent).toFixed(2)} de ${safe(b.targetAmount).toFixed(2)}, ` +
          `proj. ${safe(b.projectedSpend).toFixed(2)}`,
        )
        .join('\n')
        .slice(0, 500); // absolute token guard

      const budgetContext = rawBudgetContext.trim() || undefined; // undefined → omit block from prompt

      const text = await GeminiService.generateProactiveBriefing(
        kpis, categoryData, timeRange, forecastPayload, budgetContext,
      );
      if (abortedRef.current) return;
      setBriefing(text);
      setExpanded(true);
      setDismissed(false);
    } catch {
      if (abortedRef.current) return;
      setErrored(true);
      setBriefing(null);
    } finally {
      if (!abortedRef.current) setAiLoading(false);
    }
  }, [uid, kpis, categoryData, timeRange]);

  // Fire when data key changes (timeRange or KPI values) — only after loading finishes
  useEffect(() => {
    if (dataLoading) return;
    if (dataKey === lastCallKey.current) return;

    lastCallKey.current = dataKey;
    void fetchBriefing(false);

    return () => { abortedRef.current = true; };
    // fetchBriefing captured via dataKey dependency chain — stable via useCallback
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey, dataLoading]);

  // ── Render guards ─────────────────────────────────────────────────────────
  if (dismissed) return null;
  if (errored)   return null;  // silent failure — don't break UX
  if (!aiLoading && !briefing) return null;

  const severity = calcSeverity(forecast);
  const cfg      = SEVERITY_CONFIG[severity];
  const SevIcon  = cfg.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ type: 'spring', stiffness: 220, damping: 24 }}
      className={`relative rounded-2xl border overflow-hidden ${className} ${
        severity === 'critical'
          ? 'border-red-500/20 bg-red-950/20'
          : severity === 'warning'
          ? 'border-amber-500/20 bg-amber-950/15'
          : 'border-emerald-500/15 bg-emerald-950/10'
      }`}
      style={{ backdropFilter: 'blur(12px)' }}
    >
      {/* Accent bar */}
      <div className={`h-[2px] w-full bg-gradient-to-r ${aiLoading ? 'from-quantum-accent/60 to-cyan-400/60 animate-pulse' : cfg.barClass} opacity-70`} />

      {/* Header row */}
      <div
        className="flex items-center gap-3 px-5 py-3.5 cursor-pointer select-none"
        onClick={() => setExpanded(e => !e)}
        role="button"
        aria-expanded={expanded}
      >
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
          aiLoading ? 'bg-quantum-accentDim animate-pulse' : cfg.badgeClass.split(' ')[0]
        }`}>
          <BrainCircuit className="w-4 h-4 text-quantum-accent" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-black text-quantum-fg">Briefing IA</span>
            {!aiLoading && briefing && (
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${cfg.badgeClass}`}>
                <SevIcon className="inline w-3 h-3 mr-1 -mt-0.5" />
                {cfg.label}
              </span>
            )}
          </div>
          {aiLoading && (
            <p className="text-[10px] text-quantum-accent animate-pulse mt-0.5">
              Quantum AI a analisar padrões…
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!aiLoading && (
            <button
              onClick={e => { e.stopPropagation(); void fetchBriefing(true); }}
              title="Regenerar briefing"
              className="p-1.5 rounded-lg text-quantum-fgMuted hover:text-quantum-accent hover:bg-quantum-accentDim transition-all"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={e => { e.stopPropagation(); setDismissed(true); }}
            title="Dispensar"
            className="p-1.5 rounded-lg text-quantum-fgMuted hover:text-quantum-fg hover:bg-white/10 transition-all"
          >
            <X className="w-3.5 h-3.5" />
          </button>
          {expanded
            ? <ChevronUp   className="w-4 h-4 text-quantum-fgMuted" />
            : <ChevronDown className="w-4 h-4 text-quantum-fgMuted" />
          }
        </div>
      </div>

      {/* Body */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 pt-1 border-t border-quantum-border">
              {aiLoading ? (
                /* Skeleton shimmer */
                <div className="py-4 space-y-3">
                  <div className="h-3.5 bg-quantum-border/60 rounded-full animate-pulse w-full" />
                  <div className="h-3.5 bg-quantum-border/60 rounded-full animate-pulse w-5/6" />
                  <div className="h-3.5 bg-quantum-border/60 rounded-full animate-pulse w-4/6" />
                </div>
              ) : (
                <p className="text-sm text-quantum-fg leading-relaxed pt-2">
                  {briefing}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
