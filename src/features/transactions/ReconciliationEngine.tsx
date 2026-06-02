/**
 * ReconciliationEngine.tsx — Motor de Reconciliação "Tinder Financeiro"
 */
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  ArrowLeft, Trash2, CheckCircle2, GitMerge,
  Zap, ShieldCheck, ChevronRight, Sparkles,
} from 'lucide-react';
import type { Transaction } from '../../shared/types/transaction';
import { getTransactionAbsCentavos, isIncome as checkIncome } from '../../utils/transactionUtils';
import { fromCentavos } from '../../shared/types/money';
import { getCategoryBadgeClass, MUTED_CATEGORY_BADGE_CLASS } from '../../shared/lib/categoryStyles';

// ─── Types ────────────────────────────────────────────────────────────────────
type HintDir = 'left' | 'right' | 'down' | null;
type ExitDir  = 'left' | 'right' | 'down';

interface ImportTransaction extends Transaction {
  _aiCategorized?: boolean;
}

interface ResolvedTransaction extends ImportTransaction {
  _reconciled?: boolean;
  _mergedWith?: string;
}

interface Stats {
  approved:  number;
  merged:    number;
  discarded: number;
}

export type MergeCandidateInfo = {
  transaction:     Transaction;
  dayDiff:         number;
  pctDiff:         number;
  confidenceLabel: 'Exato' | 'Alto' | 'Médio';
  reasons:         string[];
} | null;

interface Props {
  queue:                ImportTransaction[];
  existingTransactions: Transaction[];
  onComplete:           (resolved: ResolvedTransaction[]) => void;
  onCancel:             () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtBRL = (v: number) =>
  `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (iso: string | undefined): string => {
  if (!iso) return '–';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

const catClass = (cat: string | undefined): string =>
  getCategoryBadgeClass(cat, MUTED_CATEGORY_BADGE_CLASS);

// ─── Lógica de Merge ──────────────────────────────────────────────────────────
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function parseISODate(raw: string | undefined): Date | null {
  if (!raw || !ISO_DATE_RE.test(raw)) return null;
  const d = new Date(`${raw}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function findMergeCandidate(tx: Transaction, existing: Transaction[]): MergeCandidateInfo {
  if (!existing?.length) return null;
  const txDate  = parseISODate(tx.date);
  const txValue = getTransactionAbsCentavos(tx);
  if (!txDate || !txValue) return null;

  for (const ex of existing) {
    const exDate  = parseISODate(ex.date);
    if (!exDate) continue;
    const exValue = getTransactionAbsCentavos(ex);
    const dayDiff = Math.abs((txDate.getTime() - exDate.getTime()) / 86_400_000);
    if (dayDiff > 3) continue;
    const pctDiff = Math.abs(txValue - exValue) / Math.max(txValue, 0.01);
    if (pctDiff <= 0.01) {
      const reasons: string[] = [
        pctDiff === 0 ? 'Valor exato' : 'Valor compatível',
        dayDiff === 0 ? 'Data igual'  : `Data próxima: ${Math.round(dayDiff)} dia(s)`,
      ];
      const confidenceLabel: 'Exato' | 'Alto' | 'Médio' =
        dayDiff === 0 && pctDiff === 0 ? 'Exato' :
        dayDiff <= 1                   ? 'Alto'  : 'Médio';
      return { transaction: ex, dayDiff, pctDiff, confidenceLabel, reasons };
    }
  }
  return null;
}

// ─── Animation variants ───────────────────────────────────────────────────────
const CARD_ENTER  = { opacity: 0, scale: 0.88, y: 40 };
const CARD_CENTER = { opacity: 1, scale: 1, y: 0, transition: { type: 'spring' as const, stiffness: 340, damping: 28 } };
const exitVariant = (dir: ExitDir) =>
  dir === 'right' ? { x: 720,  opacity: 0, rotate: 22,  transition: { type: 'spring' as const, stiffness: 320, damping: 26 } } :
  dir === 'down'  ? { y: 200,  opacity: 0, scale: 0.75, transition: { type: 'spring' as const, stiffness: 320, damping: 26 } } :
                    { x: -720, opacity: 0, rotate: -22, transition: { type: 'spring' as const, stiffness: 320, damping: 26 } };

// ─── DoneScreen ───────────────────────────────────────────────────────────────
interface DoneScreenProps {
  stats:     Stats;
  onConfirm: () => void;
  onCancel:  () => void;
}
function DoneScreen({ stats, onConfirm, onCancel }: DoneScreenProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const id = setTimeout(() => confirmRef.current?.focus(), 0);
    return () => clearTimeout(id);
  }, []);
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 340, damping: 28 }}
      className="flex flex-col items-center gap-6 text-center max-w-sm"
    >
      <div className="relative">
        <div className="absolute inset-0 bg-emerald-500/20 rounded-full blur-3xl animate-pulse" />
        <CheckCircle2 className="w-20 h-20 text-emerald-400 relative z-10" />
      </div>
      <div>
        <h2 className="text-2xl font-black text-quantum-fg mb-2">Reconciliação Concluída</h2>
        <p className="text-sm text-quantum-fgMuted">Todas as transações foram classificadas.</p>
      </div>

      <div className="grid grid-cols-3 gap-3 w-full">
        {([
          { label: 'Aprovadas',   value: stats.approved,  color: 'text-emerald-400 border-emerald-500/25 bg-emerald-500/8' },
          { label: 'Conciliadas', value: stats.merged,    color: 'text-cyan-400    border-cyan-500/25    bg-cyan-500/8'    },
          { label: 'Descartadas', value: stats.discarded, color: 'text-quantum-fgMuted   border-quantum-border       bg-white/4'       },
        ] as const).map(({ label, value, color }) => (
          <div key={label} className={`rounded-2xl border p-4 ${color}`}>
            <p className="text-2xl font-black font-mono">{value}</p>
            <p className="text-[10px] uppercase tracking-wider mt-1 opacity-80">{label}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 w-full">
        <motion.button
          ref={confirmRef}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onConfirm}
          className="w-full flex items-center justify-center gap-2 py-3.5 bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 rounded-2xl font-black text-white text-sm shadow-lg shadow-cyan-500/25 transition-all"
        >
          <Zap className="w-4 h-4" />
          Guardar {stats.approved + stats.merged} transações no Cofre
          <ChevronRight className="w-4 h-4" />
        </motion.button>
        <button
          onClick={onCancel}
          className="text-xs text-quantum-fgMuted hover:text-quantum-fg transition-colors py-2"
        >
          Cancelar e descartar tudo
        </button>
      </div>
    </motion.div>
  );
}

// ─── Componente Principal ─────────────────────────────────────────────────────
export default function ReconciliationEngine({
  queue:       initialQueue,
  existingTransactions,
  onComplete,
  onCancel,
}: Props) {
  const [queue,    setQueue]    = useState<ImportTransaction[]>(() => [...(initialQueue ?? [])]);
  const [resolved, setResolved] = useState<ResolvedTransaction[]>([]);
  const [stats,    setStats]    = useState<Stats>({ approved: 0, merged: 0, discarded: 0 });
  const [isDone,   setIsDone]   = useState(false);
  const [hint,     setHint]     = useState<HintDir>(null);

  const exitDirRef   = useRef<ExitDir>('left');
  const total        = useRef(initialQueue?.length ?? 0);
  const containerRef = useRef<HTMLDivElement>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

  const advance = useCallback((dir: ExitDir, _tx: Transaction, replacement: ResolvedTransaction | null = null) => {
    exitDirRef.current = dir;
    setResolved(prev => replacement ? [...prev, replacement] : prev);
    setQueue(prev => {
      const next = prev.slice(1);
      if (next.length === 0) {
        setTimeout(() => setIsDone(true), 350);
      }
      return next;
    });
  }, []);

  const handleApprove = useCallback(() => {
    const tx = queue[0];
    if (!tx) return;
    setStats(s => ({ ...s, approved: s.approved + 1 }));
    advance('left', tx, tx);
  }, [queue, advance]);

  const mergeCandidate = useMemo(
    () => {
      const tx = queue[0] ?? null;
      return tx ? findMergeCandidate(tx, existingTransactions) : null;
    },
    [queue, existingTransactions],
  );

  const handleMerge = useCallback(() => {
    const tx = queue[0];
    if (!tx) return;

    const candidate = mergeCandidate;
    if (candidate) {
      const merged: ResolvedTransaction = {
        ...candidate.transaction,
        description: candidate.transaction.description || tx.description,
        category:    candidate.transaction.category    || tx.category,
        _reconciled: true,
        _mergedWith: tx.id,
      };
      setStats(s => ({ ...s, merged: s.merged + 1 }));
      toast.success(`Conciliado: ${candidate.transaction.description?.substring(0, 30)}`, { icon: '🔗', duration: 2500 });
      advance('right', tx, merged);
    } else {
      toast(`Sem correspondência — aprovado como novo.`, { icon: '➕', duration: 2500 });
      setStats(s => ({ ...s, approved: s.approved + 1 }));
      advance('right', tx, tx);
    }
  }, [queue, mergeCandidate, advance]);

  const handleDiscard = useCallback(() => {
    const tx = queue[0];
    if (!tx) return;
    setStats(s => ({ ...s, discarded: s.discarded + 1 }));
    advance('down', tx, null);
  }, [queue, advance]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') { e.preventDefault(); onCancel(); return; }
    if (e.key === 'Tab') {
      if (!containerRef.current) return;
      const focusable = Array.from(
        containerRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
        )
      ).filter(el => !el.closest('[aria-hidden="true"]'));
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last  = focusable[focusable.length - 1]!;
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last)  { e.preventDefault(); first.focus(); }
      }
      return;
    }
    const target = e.target as HTMLElement;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' ||
      target.isContentEditable
    ) return;
    if (isDone) return;
    if (e.key === 'ArrowLeft')                            { e.preventDefault(); handleApprove(); }
    else if (e.key === 'ArrowRight')                      { e.preventDefault(); handleMerge();   }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); handleDiscard(); }
  }, [isDone, handleApprove, handleMerge, handleDiscard, onCancel]);

  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    return () => { trigger?.focus(); };
  }, []);

  useEffect(() => {
    const id = setTimeout(() => cancelBtnRef.current?.focus(), 0);
    return () => clearTimeout(id);
  }, []);

  const card      = queue[0] ?? null;
  const remaining = queue.length;
  const done      = total.current - remaining;
  const progress    = total.current > 0 ? (done / total.current) * 100 : 0;
  const progressMax = Math.max(total.current, 1);
  const progressNow = Math.min(done, progressMax);
  const isIncome    = checkIncome(card?.type ?? '');

  return (
    <motion.div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="recon-title"
      onKeyDown={handleKeyDown}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[60] bg-quantum-bg/90 backdrop-blur-2xl flex flex-col items-center justify-center p-4 overflow-hidden"
    >
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/5 rounded-full blur-[100px]" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-violet-500/5 rounded-full blur-[100px]" />
      </div>

      <div className="relative z-10 w-full max-w-sm flex flex-col items-center gap-6">
        <div className="w-full space-y-2">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-cyan-400" />
              <span id="recon-title" className="font-black text-quantum-fg uppercase tracking-widest text-[10px]">Reconciliação</span>
            </div>
            <span className="font-mono text-quantum-fgMuted">
              <span className="text-quantum-fg font-bold">{done}</span> / {total.current}
            </span>
          </div>
          <div
            className="w-full h-1 bg-quantum-bgSecondary rounded-full overflow-hidden"
            role="progressbar"
            aria-label="Progresso da reconciliação"
            aria-valuemin={0}
            aria-valuemax={progressMax}
            aria-valuenow={progressNow}
          >
            <motion.div
              className="h-full bg-gradient-to-r from-cyan-500 to-cyan-400 rounded-full"
              animate={{ width: `${progress}%` }}
              transition={{ type: 'spring', stiffness: 200, damping: 28 }}
            />
          </div>
        </div>

        <div className="relative w-full" style={{ minHeight: 280 }}>
          {remaining > 1 && (
            <div
              className="absolute inset-x-4 -bottom-3 h-full rounded-3xl bg-quantum-bgSecondary/40 border border-quantum-border"
              style={{ zIndex: 0 }}
              aria-hidden="true"
            />
          )}

          <AnimatePresence>
            {hint === 'left'  && <motion.div key="hint-left"  aria-hidden="true" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 rounded-3xl border-2 border-emerald-400/60 bg-emerald-500/5 pointer-events-none z-20" />}
            {hint === 'right' && <motion.div key="hint-right" aria-hidden="true" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 rounded-3xl border-2 border-cyan-400/60    bg-cyan-500/5    pointer-events-none z-20" />}
            {hint === 'down'  && <motion.div key="hint-down"  aria-hidden="true" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 rounded-3xl border-2 border-red-400/60     bg-red-500/5     pointer-events-none z-20" />}
          </AnimatePresence>

          <AnimatePresence mode="wait" custom={exitDirRef}>
            {card && !isDone && (
              <motion.div
                key={card.id}
                initial={CARD_ENTER}
                animate={CARD_CENTER}
                exit={exitVariant(exitDirRef.current)}
                className="relative z-10 w-full bg-quantum-card/80 border border-quantum-border backdrop-blur-xl rounded-3xl p-6 shadow-2xl shadow-black/60"
              >
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-xl border text-[11px] font-black uppercase tracking-wider ${catClass(card.category)}`}>
                      {card.category ?? 'Diversos'}
                    </span>
                    {card._aiCategorized && (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-quantum-accent/10 border border-quantum-accent/25 text-quantum-accent text-[9px] font-bold uppercase tracking-wider"
                        title="Categoria sugerida pela IA"
                      >
                        <Sparkles className="w-2.5 h-2.5" />
                        IA
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] font-mono text-quantum-fgMuted uppercase">
                    {(card as ImportTransaction & { source?: string }).source?.toUpperCase() ?? 'IMPORT'}
                  </span>
                </div>
                <div className="mb-3">
                  <p className="text-xl font-black text-quantum-fg leading-tight line-clamp-3" title={card.description}>
                    {card.description}
                  </p>
                </div>

                {mergeCandidate ? (
                  <div
                    className="mb-4 rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-3 space-y-1.5"
                    aria-label={`Correspondência encontrada: ${mergeCandidate.transaction.description}, confiança ${mergeCandidate.confidenceLabel}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider text-cyan-400">
                        Correspondência
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border ${
                        mergeCandidate.confidenceLabel === 'Exato'
                          ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
                          : mergeCandidate.confidenceLabel === 'Alto'
                          ? 'text-cyan-400    border-cyan-500/30    bg-cyan-500/10'
                          : 'text-amber-400   border-amber-500/30   bg-amber-500/10'
                      }`}>
                        {mergeCandidate.confidenceLabel}
                      </span>
                    </div>
                    <p
                      className="text-sm font-semibold text-quantum-fg line-clamp-1"
                      title={mergeCandidate.transaction.description}
                    >
                      {mergeCandidate.transaction.description}
                    </p>
                    <div className="flex items-center justify-between text-xs text-quantum-fgMuted">
                      <span>{fmtDate(mergeCandidate.transaction.date)}</span>
                      <span className="font-mono">
                        {fmtBRL(fromCentavos(getTransactionAbsCentavos(mergeCandidate.transaction)))}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {mergeCandidate.reasons.map(r => (
                        <span
                          key={r}
                          className="text-[9px] px-1.5 py-0.5 rounded-md bg-white/5 border border-white/10 text-quantum-fgMuted"
                        >
                          {r}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div
                    className="mb-4 rounded-2xl border border-white/8 bg-white/3 p-3"
                    aria-label="Sem correspondência encontrada; será importada como nova se aprovada"
                  >
                    <p className="text-[11px] text-quantum-fgMuted leading-relaxed">
                      Sem correspondência provável encontrada. Se aprovada, será importada como nova.
                    </p>
                  </div>
                )}

                <div className="flex flex-wrap items-end justify-between gap-y-3 gap-x-2 mt-2">
                  <div className="shrink-0">
                    <p className="text-[10px] text-quantum-fgMuted uppercase tracking-wider mb-1">Data</p>
                    <p className="text-sm font-mono font-bold text-quantum-fg">{fmtDate(card.date)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-quantum-fgMuted uppercase tracking-wider mb-1">Valor</p>
                    <p
                      className={`text-xl sm:text-2xl font-black font-mono leading-none pb-1 pr-1 ${isIncome ? 'text-emerald-400' : 'text-red-400'}`}
                      style={{ textShadow: isIncome ? '0 0 20px rgba(52,211,153,0.5)' : '0 0 20px rgba(248,113,113,0.5)' }}
                    >
                      {`${isIncome ? '+' : '-'}${fmtBRL(fromCentavos(getTransactionAbsCentavos(card)))}`}
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {queue.length === 0 && !isDone && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-8 h-8 border-2 border-cyan-500/40 border-t-cyan-400 rounded-full animate-spin" />
            </div>
          )}
        </div>

        <AnimatePresence>
          {isDone && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 340, damping: 28, delay: 0.1 }}
              className="w-full"
            >
              <DoneScreen
                stats={stats}
                onConfirm={() => onComplete(resolved)}
                onCancel={onCancel}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {!isDone && card && (
          <div className="sr-only" aria-live="polite" aria-atomic="true">
            {`Transação ${done + 1} de ${total.current}: ${card.description}, ${isIncome ? '+' : '-'}${fmtBRL(fromCentavos(getTransactionAbsCentavos(card)))}`}
          </div>
        )}

        {!isDone && card && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="flex items-center gap-2 sm:gap-4 w-full"
          >
            <motion.button
              whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }}
              onClick={handleApprove}
              onMouseEnter={() => setHint('left')}
              onMouseLeave={() => setHint(null)}
              aria-keyshortcuts="ArrowLeft"
              className="flex-1 min-w-0 flex flex-col items-center gap-1.5 py-3.5 px-2 sm:px-5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 rounded-2xl text-emerald-400 transition-all"
              title="Aprovar como Nova (←)"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="truncate w-full text-center text-[10px] font-black uppercase tracking-wider">Aprovar</span>
              <kbd className="hidden sm:inline text-[9px] text-emerald-600 font-mono">←</kbd>
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }}
              onClick={handleDiscard}
              onMouseEnter={() => setHint('down')}
              onMouseLeave={() => setHint(null)}
              aria-keyshortcuts="Delete Backspace"
              className="flex flex-col items-center gap-1.5 py-3.5 px-3 sm:px-5 bg-quantum-bgSecondary/60 hover:bg-red-500/10 border border-white/8 hover:border-red-500/25 rounded-2xl text-quantum-fgMuted hover:text-red-400 transition-all"
              title="Ignorar / Descartar (Del)"
            >
              <Trash2 className="w-4 h-4" />
              <span className="truncate w-full text-center text-[10px] font-black uppercase tracking-wider">Ignorar</span>
              <kbd className="hidden sm:inline text-[9px] font-mono opacity-50">Del</kbd>
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }}
              onClick={handleMerge}
              onMouseEnter={() => setHint('right')}
              onMouseLeave={() => setHint(null)}
              aria-keyshortcuts="ArrowRight"
              className="flex-1 min-w-0 flex flex-col items-center gap-1.5 py-3.5 px-2 sm:px-5 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/25 rounded-2xl text-cyan-400 transition-all"
              title="Merge / Conciliar (→)"
            >
              <GitMerge className="w-5 h-5" />
              <span className="truncate w-full text-center text-[10px] font-black uppercase tracking-wider">Conciliar</span>
              <kbd className="hidden sm:inline text-[9px] text-cyan-600 font-mono">→</kbd>
            </motion.button>
          </motion.div>
        )}

        {!isDone && (
          <button
            ref={cancelBtnRef}
            onClick={onCancel}
            className="text-[11px] text-slate-600 hover:text-quantum-fgMuted transition-colors"
          >
            Cancelar importação
          </button>
        )}
      </div>
    </motion.div>
  );
}
