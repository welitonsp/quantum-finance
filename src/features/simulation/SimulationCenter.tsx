/**
 * SimulationCenter.tsx — Centro de Simulação Monte Carlo
 */
import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import {
  Loader2, FlaskConical, TrendingUp, TrendingDown,
  AlertTriangle, ShieldCheck, RefreshCw, Info, Sliders,
} from 'lucide-react';
import CountUp from 'react-countup';

import MonteCarloWorker from './workers/monteCarloWorker?worker';
import { usePrivacy } from '../../contexts/PrivacyContext';
import { useNavigation } from '../../contexts/NavigationContext';
import type { Transaction } from '../../shared/types/transaction';
import type { ModuleBalances } from '../../shared/types/transaction';
import { isIncome } from '../../utils/transactionUtils';
interface RechartsTooltipPayloadEntry {
  dataKey?: string | number | ((obj: unknown) => unknown);
  name?: string | number;
  value?: number | string | readonly (string | number)[];
  color?: string;
  payload?: unknown;
}
interface RechartsTooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: ReadonlyArray<RechartsTooltipPayloadEntry>;
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface SimStats {
  receitaMensalCents:   number;
  despesaFixaCents:     number;
  mediaVariavelCents:   number;
  desvioVariavelCents:  number;
}

interface MonteCarloResult {
  success:                    boolean;
  error?:                     string;
  probabilidadeSobrevivencia: number;
  p10Final:                   number;
  p50Final:                   number;
  p90Final:                   number;
  chartData: Array<{
    month:      number;
    p10:        number;
    p50:        number;
    p90:        number;
    coneBase:   number;
    coneHeight: number;
  }>;
}

interface ChartDataPoint {
  label:      string;
  p10:        number;
  p50:        number;
  p90:        number;
  coneBase:   number;
  coneHeight: number;
}

interface Props {
  transactions: Transaction[];
  balances:     Partial<ModuleBalances> | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const MONTH_NAMES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'] as const;
const DEFAULTS    = { inflacao: 5, corteDespesas: 0, aumentoSalario: 0, meses: 24 };
const DEFAULT_STATS: SimStats = {
  receitaMensalCents:  500000,
  despesaFixaCents:    300000,
  mediaVariavelCents:  120000,
  desvioVariavelCents:  40000,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtBRL = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

const fmtBRLShort = (val: number): string => {
  const abs = Math.abs(val);
  if (abs >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000)     return `${(val / 1_000).toFixed(0)}K`;
  return String(val);
};

// ─── MacroSlider ──────────────────────────────────────────────────────────────
interface MacroSliderProps {
  label:    string;
  value:    number;
  min:      number;
  max:      number;
  step?:    number;
  unit:     string;
  hint?:    string;
  onChange: (v: number) => void;
}
function MacroSlider({ label, value, min, max, step = 1, unit, hint, onChange }: MacroSliderProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-quantum-fg flex items-center gap-1.5">
          {label}
          {hint && <span title={hint}><Info className="w-3 h-3 text-quantum-fgMuted cursor-help" /></span>}
        </span>
        <span className="text-xs font-mono font-black text-cyan-400 tabular-nums">{value}{unit}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-1.5 appearance-none rounded-full bg-slate-700 cursor-pointer
                   [&::-webkit-slider-thumb]:appearance-none
                   [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                   [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-400
                   [&::-webkit-slider-thumb]:shadow-[0_0_8px_rgba(0,230,138,0.6)]
                   [&::-webkit-slider-thumb]:cursor-pointer"
      />
      <div className="flex justify-between text-[9px] text-slate-600">
        <span>{min}{unit}</span><span>{max}{unit}</span>
      </div>
    </div>
  );
}

// ─── ChartTooltip ─────────────────────────────────────────────────────────────
interface ChartTooltipProps extends RechartsTooltipProps {
  isPrivacyMode: boolean;
}
function ChartTooltip({ active, payload, label, isPrivacyMode }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  const mask = '•••••';
  const p10  = payload.find((p) => p.dataKey === 'p10')?.value as number | undefined;
  const p50  = payload.find((p) => p.dataKey === 'p50')?.value as number | undefined;
  const p90  = payload.find((p) => p.dataKey === 'p90')?.value as number | undefined;

  return (
    <div className="bg-quantum-card/95 border border-white/15 backdrop-blur-xl rounded-xl px-4 py-3 shadow-2xl text-xs">
      <p className="font-bold text-quantum-fg mb-2">{label as string}</p>
      <div className="space-y-1.5">
        {[
          { color: 'bg-cyan-400',   label: 'Otimista (P90):',   val: p90, cls: 'text-cyan-400'   },
          { color: 'bg-yellow-400', label: 'Provável (P50):',   val: p50, cls: 'text-yellow-400' },
          { color: 'bg-rose-400',   label: 'Pessimista (P10):', val: p10, cls: 'text-rose-400'   },
        ].map(({ color, label: lbl, val, cls }) => (
          <div key={lbl} className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${color}`} />
            <span className="text-quantum-fgMuted">{lbl}</span>
            <span className={`font-mono font-bold ml-auto pl-3 ${cls}`}>
              {isPrivacyMode ? mask : val != null ? fmtBRLShort(val) : '—'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Componente Principal ─────────────────────────────────────────────────────
export default function SimulationCenter({ transactions, balances }: Props) {
  const { isPrivacyMode }             = usePrivacy();
  const { currentMonth, currentYear } = useNavigation();

  const [inflacao,       setInflacao]       = useState(DEFAULTS.inflacao);
  const [corteDespesas,  setCorteDespesas]  = useState(DEFAULTS.corteDespesas);
  const [aumentoSalario, setAumentoSalario] = useState(DEFAULTS.aumentoSalario);
  const [meses,          setMeses]          = useState(DEFAULTS.meses);

  const [result,        setResult]        = useState<MonteCarloResult | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);

  const workerRef   = useRef<Worker | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stats = useMemo<SimStats>(() => {
    if (!transactions || transactions.length === 0) return DEFAULT_STATS;

    const byMonth: Record<string, { r: number; d: number }> = {};
    transactions.forEach(tx => {
      const d   = new Date(tx.date ?? (tx as Transaction & { createdAt?: string }).createdAt ?? '');
      const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
      if (!byMonth[key]) byMonth[key] = { r: 0, d: 0 };
      const valCents = Math.round(Math.abs(Number(tx.value ?? 0)) * 100);
      if (isIncome(tx.type)) byMonth[key]!.r += valCents;
      else byMonth[key]!.d += valCents;
    });

    const months = Object.values(byMonth);
    const n = Math.max(months.length, 1);
    const avgReceita = Math.round(months.reduce((s, m) => s + m.r, 0) / n);
    const avgDespesa = Math.round(months.reduce((s, m) => s + m.d, 0) / n);
    const variance   = months.reduce((s, m) => s + Math.pow(m.d - avgDespesa, 2), 0) / n;
    const stddev     = Math.round(Math.sqrt(variance));

    return {
      receitaMensalCents:  Math.max(avgReceita, 100000),
      despesaFixaCents:    Math.round(Math.max(avgDespesa, 50000) * 0.65),
      mediaVariavelCents:  Math.round(Math.max(avgDespesa, 50000) * 0.35),
      desvioVariavelCents: Math.max(stddev, Math.round(avgDespesa * 0.08), 5000),
    };
  }, [transactions]);

  const saldoCents = Math.round((balances?.geral?.saldo ?? 0) * 100);

  useEffect(() => {
    const worker = new MonteCarloWorker() as Worker;
    worker.onmessage = (e: MessageEvent<MonteCarloResult>) => {
      setIsCalculating(false);
      if (e.data.success) setResult(e.data);
      else console.error('[MonteCarloWorker]', e.data.error);
    };
    worker.onerror = (e: ErrorEvent) => {
      setIsCalculating(false);
      console.error('[MonteCarloWorker] crash:', e.message);
    };
    workerRef.current = worker;
    return () => { worker.terminate(); workerRef.current = null; };
  }, []);

  const runSimulation = useCallback(() => {
    if (!workerRef.current) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setIsCalculating(true);
      workerRef.current!.postMessage({
        saldoCents,
        receitaMensalCents:  stats.receitaMensalCents,
        despesaFixaCents:    stats.despesaFixaCents,
        mediaVariavelCents:  stats.mediaVariavelCents,
        desvioVariavelCents: stats.desvioVariavelCents,
        inflacaoBps:         inflacao       * 100,
        corteDespesasBps:    corteDespesas  * 100,
        aumentoSalarialBps:  aumentoSalario * 100,
        meses,
        iteracoes: 1000,
      });
    }, 350);
  }, [saldoCents, stats, inflacao, corteDespesas, aumentoSalario, meses]);

  useEffect(() => { runSimulation(); }, [runSimulation]);

  const chartData = useMemo<ChartDataPoint[]>(() => {
    if (!result?.chartData) return [];
    return result.chartData.map(d => {
      const offsetMonth = (currentMonth - 1 + d.month) % 12;
      const extraYears  = Math.floor((currentMonth - 1 + d.month) / 12);
      const label = d.month === 0
        ? 'Hoje'
        : `${MONTH_NAMES[offsetMonth]}/${String(currentYear + extraYears).slice(2)}`;
      return {
        label,
        p10:        Math.round(d.p10        / 100),
        p50:        Math.round(d.p50        / 100),
        p90:        Math.round(d.p90        / 100),
        coneBase:   Math.round(d.coneBase   / 100),
        coneHeight: Math.round(d.coneHeight / 100),
      };
    });
  }, [result, currentMonth, currentYear]);

  const prob = result?.probabilidadeSobrevivencia ?? null;
  const probColor = prob === null
    ? { text: 'text-quantum-fgMuted', glow: 'transparent', label: '–' }
    : prob >= 80 ? { text: 'text-cyan-400',   glow: 'rgba(0,230,138,0.5)',  label: 'Excelente'   }
    : prob >= 60 ? { text: 'text-yellow-400', glow: 'rgba(255,184,0,0.5)',  label: 'Moderado'    }
    : prob >= 40 ? { text: 'text-orange-400', glow: 'rgba(255,100,0,0.5)',  label: 'Em Risco'    }
    :              { text: 'text-rose-400',   glow: 'rgba(255,71,87,0.5)',  label: 'Crítico'     };

  const ProbIcon = prob === null ? FlaskConical : prob >= 60 ? ShieldCheck : AlertTriangle;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
      className="max-w-[1800px] mx-auto px-4 md:px-6 py-8 space-y-6"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
            <FlaskConical className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black text-quantum-fg tracking-tight">Centro de Simulação</h1>
            <p className="text-xs text-quantum-fgMuted uppercase tracking-wider font-medium">Monte Carlo · 1.000 iterações · Box-Muller</p>
          </div>
        </div>
        <button
          onClick={runSimulation}
          disabled={isCalculating}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 text-cyan-400 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
        >
          {isCalculating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {isCalculating ? 'Calculando…' : 'Reexecutar'}
        </button>
      </div>

      <div className="flex flex-col xl:flex-row gap-5">
        {/* Sidebar */}
        <div className="xl:w-72 shrink-0 space-y-4">
          <div className="bg-quantum-bg/90 backdrop-blur-2xl border border-white/8 rounded-2xl p-5 space-y-5">
            <div className="flex items-center gap-2 pb-3 border-b border-quantum-border">
              <Sliders className="w-4 h-4 text-cyan-400" />
              <h3 className="text-xs font-black text-quantum-fg uppercase tracking-widest">Ajustes Macro</h3>
            </div>
            <MacroSlider label="Inflação Anual"   value={inflacao}      min={0}  max={20} unit="%"      hint="Inflação aplicada às despesas mês a mês" onChange={setInflacao} />
            <MacroSlider label="Corte de Despesas" value={corteDespesas} min={0}  max={40} unit="%"      hint="Redução percentual sobre todas as despesas" onChange={setCorteDespesas} />
            <MacroSlider label="Aumento Salarial" value={aumentoSalario} min={0} max={30} unit="%"      hint="Aumento aplicado à receita mensal" onChange={setAumentoSalario} />
            <MacroSlider label="Horizonte"        value={meses}         min={6}  max={60} step={6} unit=" meses" hint="Número de meses simulados" onChange={setMeses} />
            <button
              onClick={() => { setInflacao(DEFAULTS.inflacao); setCorteDespesas(DEFAULTS.corteDespesas); setAumentoSalario(DEFAULTS.aumentoSalario); setMeses(DEFAULTS.meses); }}
              className="w-full py-2 text-[11px] font-bold text-quantum-fgMuted hover:text-quantum-fg border border-quantum-border hover:border-quantum-border rounded-xl transition-colors uppercase tracking-wider"
            >
              Restaurar Padrões
            </button>
          </div>

          <div className="bg-quantum-bg/90 backdrop-blur-2xl border border-white/8 rounded-2xl p-5 space-y-3">
            <h3 className="text-[10px] font-black text-quantum-fgMuted uppercase tracking-widest pb-2 border-b border-quantum-border">Base de Cálculo</h3>
            {([
              { label: 'Receita Mensal Média', value: stats.receitaMensalCents,  color: 'text-emerald-400' },
              { label: 'Despesa Fixa Mensal',  value: stats.despesaFixaCents,    color: 'text-red-400'     },
              { label: 'Desp. Variável Média', value: stats.mediaVariavelCents,  color: 'text-yellow-400'  },
              { label: 'Desvio-Padrão',        value: stats.desvioVariavelCents, color: 'text-quantum-fgMuted'   },
            ] as const).map(({ label, value, color }) => (
              <div key={label} className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-quantum-fgMuted truncate">{label}</span>
                <span className={`text-[11px] font-mono font-bold ${color} shrink-0`}>
                  {isPrivacyMode ? '•••••' : fmtBRL(value)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Main area */}
        <div className="flex-1 space-y-4 min-w-0">
          {/* KPI */}
          <div className="bg-quantum-bg/90 backdrop-blur-2xl border border-white/8 rounded-2xl p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
              <div className="flex items-center gap-5">
                <motion.div
                  animate={{ boxShadow: prob !== null ? [`0 0 20px ${probColor.glow}`, `0 0 40px ${probColor.glow}`, `0 0 20px ${probColor.glow}`] : 'none' }}
                  transition={{ repeat: Infinity, duration: 2.5 }}
                  className={`p-4 rounded-2xl bg-quantum-card/60 border border-white/8 ${probColor.text}`}
                >
                  <ProbIcon className="w-8 h-8" />
                </motion.div>
                <div>
                  <p className="text-[10px] font-black text-quantum-fgMuted uppercase tracking-widest mb-1">Probabilidade de Sobrevivência</p>
                  <AnimatePresence mode="wait">
                    {isCalculating ? (
                      <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <Loader2 className={`w-12 h-12 animate-spin ${probColor.text}`} />
                      </motion.div>
                    ) : (
                      <motion.div key={prob} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 350, damping: 25 }} className="flex items-baseline gap-2">
                        <span className={`text-6xl font-black font-mono tabular-nums ${probColor.text}`} style={{ textShadow: `0 0 30px ${probColor.glow}` }}>
                          {prob !== null ? <CountUp end={prob} duration={1.2} suffix="%" /> : '–'}
                        </span>
                        <span className={`text-lg font-bold ${probColor.text} opacity-70`}>{probColor.label}</span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              <div className="flex flex-wrap gap-3 sm:ml-auto">
                {([
                  { label: 'Pessimista P10', value: result?.p10Final, color: 'text-rose-400',   border: 'border-rose-500/20',   icon: TrendingDown },
                  { label: 'Provável P50',   value: result?.p50Final, color: 'text-yellow-400', border: 'border-yellow-500/20', icon: TrendingUp   },
                  { label: 'Otimista P90',   value: result?.p90Final, color: 'text-cyan-400',   border: 'border-cyan-500/20',   icon: TrendingUp   },
                ] as const).map(({ label, value, color, border, icon: Icon }) => (
                  <div key={label} className={`bg-quantum-card/60 border ${border} rounded-xl px-4 py-3 min-w-[130px]`}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <Icon className={`w-3.5 h-3.5 ${color}`} />
                      <span className="text-[9px] font-black text-quantum-fgMuted uppercase tracking-wider">{label}</span>
                    </div>
                    <p className={`text-sm font-black font-mono ${color}`}>
                      {isCalculating ? '…' : value == null ? '–' : isPrivacyMode ? '•••••' : fmtBRL(value)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Chart */}
          <div className="bg-quantum-bg/90 backdrop-blur-2xl border border-white/8 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-sm font-bold text-quantum-fg">Cone de Incerteza</h3>
                <p className="text-[10px] text-quantum-fgMuted uppercase tracking-wider">{meses} meses · Distribuição P10 / P50 / P90</p>
              </div>
              <div className="hidden sm:flex items-center gap-4 text-[10px] text-quantum-fgMuted">
                {([
                  { color: 'bg-cyan-400',   label: 'P90 Otimista'   },
                  { color: 'bg-yellow-400', label: 'P50 Provável'   },
                  { color: 'bg-rose-400',   label: 'P10 Pessimista' },
                ] as const).map(({ color, label }) => (
                  <div key={label} className="flex items-center gap-1.5">
                    <div className={`w-3 h-1.5 rounded-full ${color}`} />
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            </div>

            <AnimatePresence mode="wait">
              {isCalculating || chartData.length === 0 ? (
                <motion.div key="chart-loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-72 flex flex-col items-center justify-center gap-3 text-quantum-fgMuted">
                  <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
                  <span className="text-xs uppercase tracking-widest animate-pulse">A correr {(1000).toLocaleString('pt-BR')} iterações…</span>
                </motion.div>
              ) : (
                <motion.div key="chart-ready" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                      <defs>
                        <linearGradient id="coneGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%"   stopColor="rgba(148,163,184,0.15)" />
                          <stop offset="100%" stopColor="rgba(148,163,184,0.03)" />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.04)" />
                      <XAxis dataKey="label" tick={{ fill: '#475569', fontSize: 10, fontFamily: 'monospace' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                      <YAxis
                        tickFormatter={isPrivacyMode ? () => '••••' : (v: number) => fmtBRLShort(v)}
                        tick={{ fill: '#475569', fontSize: 10, fontFamily: 'monospace' }}
                        axisLine={false} tickLine={false} width={55}
                      />
                      <ReferenceLine y={0} stroke="rgba(255,71,87,0.3)" strokeDasharray="4 4" strokeWidth={1} />
                      <Area type="monotone" dataKey="coneBase"   stackId="cone" fill="transparent"           stroke="none" legendType="none" isAnimationActive={false} />
                      <Area type="monotone" dataKey="coneHeight" stackId="cone" fill="url(#coneGradient)"   stroke="none" legendType="none" isAnimationActive={false} />
                      <Line type="monotone" dataKey="p90" stroke="#22d3ee" strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive animationDuration={800} />
                      <Line type="monotone" dataKey="p50" stroke="#facc15" strokeWidth={2.5}                  dot={false} isAnimationActive animationDuration={900} />
                      <Line type="monotone" dataKey="p10" stroke="#fb7185" strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive animationDuration={800} />
                      <Tooltip
                        content={(props) => <ChartTooltip {...props} isPrivacyMode={isPrivacyMode} />}
                        cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1 }}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <p className="text-[10px] text-slate-600 text-center px-4 leading-relaxed">
            Simulação estocástica via transformação Box-Muller · 1.000 iterações independentes ·
            P10/P50/P90 representam os percentis 10%, 50% e 90% das trajetórias simuladas.
            Não constitui aconselhamento financeiro.
          </p>
        </div>
      </div>
    </motion.div>
  );
}
