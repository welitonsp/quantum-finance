// src/features/goals/EmergencyFundCalculator.tsx
// Calculadora de Reserva de Emergência — mostra cobertura atual e permite criar meta.
import { useState, useMemo, useId } from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, ShieldAlert, ShieldX, Plus } from 'lucide-react';
import Decimal from 'decimal.js';
import { formatBRL, fromCentavos } from '../../shared/types/money';
import type { Centavos } from '../../shared/types/money';
import type { GoalCreateInput } from '../../hooks/useGoals';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Props {
  /** Despesas mensais médias em centavos (fonte canônica). */
  monthlyExpensesCents: Centavos;
  /** Poupança/reserva atual em centavos (ex: ativosCents de useFinancialMetrics). */
  currentSavingsCents: Centavos;
  /** Callback para criar a meta de reserva via useGoals.addGoal. */
  onCreateGoal: (data: GoalCreateInput) => Promise<string>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

type CoverageStatus = 'danger' | 'warning' | 'ok';

function coverageStatus(coverageMonths: number): CoverageStatus {
  if (coverageMonths < 3)  return 'danger';
  if (coverageMonths < 6)  return 'warning';
  return 'ok';
}

const STATUS_CFG: Record<CoverageStatus, {
  icon: typeof ShieldX;
  iconColor: string;
  barColor: string;
  badgeClass: string;
  label: string;
}> = {
  danger: {
    icon:       ShieldX,
    iconColor:  'text-red-400',
    barColor:   'from-red-600 to-red-400',
    badgeClass: 'bg-red-500/10 border-red-500/30 text-red-400',
    label:      'Crítico',
  },
  warning: {
    icon:       ShieldAlert,
    iconColor:  'text-amber-400',
    barColor:   'from-amber-500 to-yellow-400',
    badgeClass: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
    label:      'Insuficiente',
  },
  ok: {
    icon:       ShieldCheck,
    iconColor:  'text-emerald-400',
    barColor:   'from-emerald-500 to-teal-400',
    badgeClass: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
    label:      'Adequada',
  },
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function EmergencyFundCalculator({
  monthlyExpensesCents,
  currentSavingsCents,
  onCreateGoal,
}: Props) {
  const fieldId = useId();
  const [targetMonths, setTargetMonths] = useState(6);
  const [busy,         setBusy]         = useState(false);
  const [created,      setCreated]      = useState(false);

  const { targetCents, shortfallCents, coverageMonths, progress, status } = useMemo(() => {
    const monthly = new Decimal(monthlyExpensesCents);
    const savings = new Decimal(currentSavingsCents);

    // Guard: avoid division by zero
    if (monthly.lte(0)) {
      return {
        targetCents:    (targetMonths * 0) as Centavos,
        shortfallCents: 0 as Centavos,
        coverageMonths: 0,
        progress:       0,
        status:         'danger' as CoverageStatus,
      };
    }

    const target      = monthly.times(targetMonths).toDecimalPlaces(0, Decimal.ROUND_CEIL);
    const shortfall   = Decimal.max(target.minus(savings), 0).toDecimalPlaces(0, Decimal.ROUND_CEIL);
    const coverage    = savings.div(monthly).toDecimalPlaces(2, Decimal.ROUND_FLOOR).toNumber();
    const prog        = Math.min(savings.div(target).toNumber(), 1);
    const st          = coverageStatus(coverage);

    return {
      targetCents:    target.toNumber()    as Centavos,
      shortfallCents: shortfall.toNumber() as Centavos,
      coverageMonths: coverage,
      progress:       prog,
      status:         st,
    };
  }, [monthlyExpensesCents, currentSavingsCents, targetMonths]);

  const cfg = STATUS_CFG[status];
  const Icon = cfg.icon;

  const handleCreateGoal = async () => {
    if (busy) return;
    setBusy(true);
    try {
      // Deadline: targetMonths months from today
      const deadline = new Date();
      deadline.setMonth(deadline.getMonth() + targetMonths);
      const deadlineStr = deadline.toISOString().slice(0, 10);

      await onCreateGoal({
        name:         `Reserva de Emergência (${targetMonths} meses)`,
        targetCents,
        currentCents: currentSavingsCents > targetCents ? targetCents : currentSavingsCents,
        emoji:        '🛡️',
        deadline:     deadlineStr,
      });
      setCreated(true);
    } finally {
      setBusy(false);
    }
  };

  const noData = monthlyExpensesCents <= 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="bg-quantum-bgSecondary/60 border border-quantum-border rounded-2xl p-4 space-y-4"
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center border shrink-0 ${cfg.badgeClass}`}>
          <Icon className={`w-4.5 h-4.5 ${cfg.iconColor}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-quantum-fg">Reserva de Emergência</p>
          <p className="text-[10px] text-quantum-fgMuted">Proteção para imprevistos</p>
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${cfg.badgeClass}`}>
          {cfg.label}
        </span>
      </div>

      {noData ? (
        <p className="text-xs text-quantum-fgMuted py-2 text-center">
          Sem dados de despesas mensais para calcular a reserva.
        </p>
      ) : (
        <>
          {/* Months slider */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor={`${fieldId}-months`} className="text-[10px] font-bold uppercase tracking-wider text-quantum-fgMuted">
                Meses de cobertura desejados
              </label>
              <span className="text-xs font-black text-quantum-accent">{targetMonths} meses</span>
            </div>
            <input
              id={`${fieldId}-months`}
              type="range"
              min={3}
              max={12}
              step={1}
              value={targetMonths}
              onChange={e => { setTargetMonths(Number(e.target.value)); setCreated(false); }}
              className="w-full accent-quantum-accent h-1.5 rounded-full cursor-pointer"
              aria-label="Meses de cobertura"
            />
            <div className="flex justify-between text-[9px] text-quantum-fgMuted font-mono">
              <span>3</span><span>6</span><span>9</span><span>12</span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-quantum-fgMuted">Cobertura atual</span>
              <span className="font-black text-quantum-fg">
                {coverageMonths.toFixed(1)} / {targetMonths} meses
              </span>
            </div>
            <div className="h-2 rounded-full bg-quantum-card overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${progress * 100}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
                className={`h-full rounded-full bg-gradient-to-r ${cfg.barColor}`}
              />
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-quantum-card/60 rounded-xl p-2.5 text-center">
              <p className="text-[9px] text-quantum-fgMuted uppercase tracking-wider mb-0.5">Meta</p>
              <p className="text-xs font-black text-quantum-fg">{formatBRL(fromCentavos(targetCents))}</p>
            </div>
            <div className="bg-quantum-card/60 rounded-xl p-2.5 text-center">
              <p className="text-[9px] text-quantum-fgMuted uppercase tracking-wider mb-0.5">Atual</p>
              <p className="text-xs font-black text-quantum-fg">{formatBRL(fromCentavos(currentSavingsCents))}</p>
            </div>
            <div className={`rounded-xl p-2.5 text-center ${shortfallCents > 0 ? 'bg-red-500/10' : 'bg-emerald-500/10'}`}>
              <p className="text-[9px] text-quantum-fgMuted uppercase tracking-wider mb-0.5">Falta</p>
              <p className={`text-xs font-black ${shortfallCents > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                {shortfallCents > 0 ? formatBRL(fromCentavos(shortfallCents)) : '—'}
              </p>
            </div>
          </div>

          {/* CTA */}
          {!created && shortfallCents > 0 && (
            <button
              onClick={() => void handleCreateGoal()}
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold bg-quantum-accent/15 border border-quantum-accent/30 text-quantum-accent hover:bg-quantum-accent/25 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy
                ? <span className="w-4 h-4 border-2 border-quantum-accent/40 border-t-quantum-accent rounded-full animate-spin" />
                : <Plus className="w-4 h-4" />
              }
              {busy ? 'A criar meta…' : 'Criar meta de reserva'}
            </button>
          )}
          {created && (
            <p className="text-center text-xs text-emerald-400 font-bold py-1">
              ✓ Meta criada com sucesso!
            </p>
          )}
        </>
      )}
    </motion.div>
  );
}
