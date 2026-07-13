import { useState, useMemo, useEffect, useRef, useId } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Swords, Plus, X, Trophy, ChevronRight, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import type { Transaction } from '../shared/types/transaction';
import { useChallenges, computeChallengeProgress, XP_MILESTONES, type Challenge, type CreateChallengeInput } from '../hooks/useChallenges';
import { isExpense as checkExpense } from '../utils/transactionUtils';
import { getTransactionCentavos } from '../utils/transactionUtils';
import { fromCentavos } from '../shared/types/money';

interface Props {
  uid:          string;
  transactions: Transaction[];
  loading?:     boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysLeft(endDate: string): number {
  const diff = new Date(endDate).getTime() - new Date(isoDate(new Date())).getTime();
  return Math.max(0, Math.ceil(diff / 86_400_000));
}

/** Average monthly spend in a category over last 3 months */
function computeBaseline(transactions: Transaction[], category: string): number {
  const now = new Date();
  const months: Set<string> = new Set();
  let totalCents = 0;
  for (const tx of transactions) {
    if (!checkExpense(tx.type) || tx.category !== category || !tx.date) continue;
    const mk = tx.date.slice(0, 7);
    const txDate = new Date(tx.date);
    const monthsAgo = (now.getFullYear() - txDate.getFullYear()) * 12 + (now.getMonth() - txDate.getMonth());
    if (monthsAgo < 0 || monthsAgo > 3) continue;
    months.add(mk);
    totalCents += Math.abs(getTransactionCentavos(tx) ?? 0);
  }
  const m = months.size || 1;
  return Math.round(totalCents / m);
}

/** Spending in a category between two ISO dates */
function spentInWindow(transactions: Transaction[], category: string, startDate: string, endDate: string): number {
  let total = 0;
  for (const tx of transactions) {
    if (!checkExpense(tx.type) || tx.category !== category || !tx.date) continue;
    if (tx.date < startDate || tx.date > endDate) continue;
    total += Math.abs(getTransactionCentavos(tx) ?? 0);
  }
  return total;
}

/** Unique expense categories from transactions */
function expenseCategories(transactions: Transaction[]): string[] {
  const cats = new Set<string>();
  for (const tx of transactions) {
    if (checkExpense(tx.type) && tx.category) cats.add(tx.category);
  }
  return [...cats].sort();
}

// ─── Create modal ─────────────────────────────────────────────────────────────

interface CreateModalProps {
  transactions: Transaction[];
  onClose:      () => void;
  onCreate:     (input: CreateChallengeInput) => Promise<void>;
}

function CreateModal({ transactions, onClose, onCreate }: CreateModalProps) {
  const fieldId = useId();
  const cats = useMemo(() => expenseCategories(transactions), [transactions]);
  const [category, setCategory]   = useState(cats[0] ?? '');
  const [targetPct, setTargetPct] = useState(20);
  const [days, setDays]           = useState(30);
  const [saving, setSaving]       = useState(false);

  const baseline = useMemo(() => computeBaseline(transactions, category), [transactions, category]);

  async function handleSubmit() {
    if (!category) return;
    setSaving(true);
    try {
      await onCreate({ category, targetPct, baselineCents: baseline, deadlineDays: days });
      toast.success(`Desafio iniciado! Reduza ${targetPct}% em "${category}" em ${days} dias.`);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="bg-quantum-card border border-quantum-border rounded-3xl p-6 w-full max-w-md shadow-2xl"
        role="dialog" aria-modal="true" aria-label="Novo Desafio de Economia"
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-orange-500/15 border border-orange-500/25 flex items-center justify-center">
              <Swords className="w-4 h-4 text-orange-400" />
            </div>
            <h2 className="text-base font-black text-quantum-fg">Novo Desafio</h2>
          </div>
          <button onClick={onClose} className="text-quantum-fgMuted hover:text-quantum-fg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Category */}
          <div>
            <label htmlFor={`${fieldId}-cat`} className="text-xs font-bold text-quantum-fgMuted mb-1.5 block">Categoria</label>
            <select
              id={`${fieldId}-cat`}
              value={category}
              onChange={e => setCategory(e.target.value)}
              className="w-full bg-quantum-bgSecondary border border-quantum-border rounded-xl px-3 py-2.5 text-sm text-quantum-fg focus:outline-none focus:border-quantum-accent"
            >
              {cats.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {baseline > 0 && (
              <p className="text-[10px] text-quantum-fgMuted mt-1">
                Média mensal: R$ {fromCentavos(baseline).toFixed(0)}
              </p>
            )}
          </div>

          {/* Target reduction */}
          <div>
            <label className="text-xs font-bold text-quantum-fgMuted mb-1.5 block">
              Meta de redução: <span className="text-quantum-accent">{targetPct}%</span>
            </label>
            <input
              type="range" min={5} max={80} step={5}
              value={targetPct}
              onChange={e => setTargetPct(Number(e.target.value))}
              className="w-full accent-quantum-accent"
            />
            <div className="flex justify-between text-[9px] text-quantum-fgMuted mt-0.5">
              <span>5%</span><span>80%</span>
            </div>
            {baseline > 0 && (
              <p className="text-[10px] text-emerald-400 mt-1">
                Economia estimada: R$ {fromCentavos(Math.round(baseline * targetPct / 100)).toFixed(0)}/mês
              </p>
            )}
          </div>

          {/* Duration */}
          <div>
            <label className="text-xs font-bold text-quantum-fgMuted mb-1.5 block">
              Duração: <span className="text-quantum-accent">{days} dias</span>
            </label>
            <div className="flex gap-2">
              {[14, 30, 60, 90].map(d => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                    days === d
                      ? 'bg-quantum-accent/20 border-quantum-accent text-quantum-accent'
                      : 'border-quantum-border text-quantum-fgMuted hover:border-quantum-accent/50'
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* XP preview */}
        <div className="mt-4 p-3 rounded-2xl bg-quantum-bgSecondary/60 border border-quantum-border">
          <p className="text-[10px] text-quantum-fgMuted mb-2">Recompensas XP</p>
          <div className="flex gap-3 flex-wrap">
            {XP_MILESTONES.map(m => (
              <div key={m.pct} className="flex items-center gap-1">
                <span className="text-sm">{m.badge}</span>
                <span className="text-[10px] text-quantum-fgMuted">+{m.xp} XP</span>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={handleSubmit}
          disabled={saving || !category}
          className="mt-5 w-full py-3 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 text-white font-black text-sm hover:opacity-90 disabled:opacity-50 transition-all"
        >
          {saving ? 'Criando…' : 'Iniciar Desafio'}
        </button>
      </motion.div>
    </motion.div>
  );
}

// ─── Single challenge card ────────────────────────────────────────────────────

interface ChallengeCardProps {
  challenge:    Challenge;
  transactions: Transaction[];
  onDelete:     () => void;
  onXPUpdate:   (xp: number, status: Challenge['status']) => void;
}

function ChallengeCard({ challenge, transactions, onDelete, onXPUpdate }: ChallengeCardProps) {
  const spentCents = useMemo(
    () => spentInWindow(transactions, challenge.category, challenge.startDate, challenge.endDate),
    [transactions, challenge],
  );

  const { progressPct, currentReductionPct, xpEarned, nextMilestone, isExpired } =
    computeChallengeProgress(challenge, spentCents);

  const prevXPRef = useRef(challenge.xp);

  // Fire XP update when new milestone is reached
  useEffect(() => {
    if (xpEarned > prevXPRef.current) {
      prevXPRef.current = xpEarned;
      const newStatus: Challenge['status'] = progressPct >= 100 ? 'won' : 'active';
      onXPUpdate(xpEarned, newStatus);
      const milestone = XP_MILESTONES.find(m => m.xp === xpEarned);
      if (milestone) toast.success(`${milestone.badge} ${milestone.label} — +${milestone.xp} XP`);
    }
    if (isExpired && challenge.status === 'active') {
      onXPUpdate(challenge.xp, progressPct >= 100 ? 'won' : 'lost');
    }
  }, [xpEarned, isExpired, challenge.status, challenge.xp, progressPct, onXPUpdate]);

  const statusColor =
    challenge.status === 'won'  ? 'text-emerald-400 border-emerald-500/25 bg-emerald-500/10' :
    challenge.status === 'lost' ? 'text-red-400 border-red-500/25 bg-red-500/10' :
    progressPct >= 75            ? 'text-amber-400 border-amber-500/25 bg-amber-500/10' :
                                   'text-orange-400 border-orange-500/25 bg-orange-500/10';

  const barColor =
    challenge.status === 'won'  ? 'bg-emerald-500' :
    challenge.status === 'lost' ? 'bg-red-500' :
    progressPct >= 75            ? 'bg-amber-500' :
                                   'bg-orange-500';

  const remaining = daysLeft(challenge.endDate);

  return (
    <div className="bg-quantum-bgSecondary/60 border border-quantum-border rounded-2xl p-4">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <p className="text-sm font-black text-quantum-fg">{challenge.category}</p>
          <p className="text-[10px] text-quantum-fgMuted">
            {challenge.status === 'active'
              ? `${remaining} dias restantes · meta: -${challenge.targetPct}%`
              : challenge.status === 'won' ? '🏆 Desafio vencido!'
              : '❌ Prazo encerrado'}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${statusColor}`}>
            {challenge.xp} XP
          </span>
          <button
            onClick={onDelete}
            className="text-quantum-fgMuted hover:text-red-400 transition-colors"
            aria-label="Remover desafio"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-2 rounded-full bg-quantum-card mb-2 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${progressPct}%` }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
          className={`h-full rounded-full ${barColor}`}
        />
      </div>

      <div className="flex items-center justify-between text-[10px]">
        <span className="text-quantum-fgMuted">
          Redução atual: <span className={currentReductionPct >= 0 ? 'text-emerald-400' : 'text-red-400'}>
            {currentReductionPct >= 0 ? '+' : ''}{currentReductionPct}%
          </span>
        </span>
        <span className="text-quantum-fgMuted">{progressPct}% do objetivo</span>
      </div>

      {/* Next milestone */}
      {nextMilestone && challenge.status === 'active' && (
        <div className="mt-2 flex items-center gap-1.5 text-[10px] text-quantum-fgMuted">
          <ChevronRight className="w-3 h-3 text-amber-400" />
          <span>Próximo: {nextMilestone.badge} {nextMilestone.label} (+{nextMilestone.xp} XP)</span>
        </div>
      )}

      {/* XP milestone dots */}
      <div className="mt-3 flex gap-2">
        {XP_MILESTONES.map(m => (
          <div key={m.pct} className="flex items-center gap-0.5" title={m.label}>
            <span className={`text-xs ${progressPct >= m.pct ? 'opacity-100' : 'opacity-25'}`}>{m.badge}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main widget ──────────────────────────────────────────────────────────────

export default function EconomyChallengeWidget({ uid, transactions, loading = false }: Props) {
  const { challenges, createChallenge, updateXP, deleteChallenge } = useChallenges(uid);
  const [showModal, setShowModal] = useState(false);

  const active    = challenges.filter(c => c.status === 'active');
  const finished  = challenges.filter(c => c.status !== 'active');
  const totalXP   = challenges.reduce((s, c) => s + (c.xp ?? 0), 0);

  if (loading) {
    return (
      <div className="bg-quantum-card border border-quantum-border rounded-3xl p-6 animate-pulse">
        <div className="h-5 w-48 bg-quantum-bgSecondary rounded mb-4" />
        <div className="h-24 w-full bg-quantum-bgSecondary rounded" />
      </div>
    );
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="bg-quantum-card border border-quantum-border rounded-3xl p-6 shadow-lg"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-500/15 flex items-center justify-center border border-orange-500/25">
              <Swords className="w-5 h-5 text-orange-400" />
            </div>
            <div>
              <h3 className="text-base font-black text-quantum-fg">Desafio de Economia</h3>
              <p className="text-[11px] text-quantum-fgMuted">Reduza gastos e ganhe XP por marco atingido</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {totalXP > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/25">
                <Trophy className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-xs font-black text-amber-400">{totalXP} XP total</span>
              </div>
            )}
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-500/15 border border-orange-500/30 text-orange-400 text-xs font-bold hover:bg-orange-500/25 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              Novo desafio
            </button>
          </div>
        </div>

        {/* Active challenges */}
        {active.length === 0 && finished.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-3 text-center">
            <span className="text-4xl">🎯</span>
            <p className="text-sm font-bold text-quantum-fg">Nenhum desafio ativo</p>
            <p className="text-xs text-quantum-fgMuted max-w-xs">
              Crie um desafio para uma categoria e acompanhe sua evolução com XP por cada marco atingido.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {active.length > 0 && (
              <>
                <p className="text-[10px] font-bold text-quantum-fgMuted uppercase tracking-wider">Ativos</p>
                {active.map(c => (
                  <ChallengeCard
                    key={c.id}
                    challenge={c}
                    transactions={transactions}
                    onDelete={() => void deleteChallenge(c.id)}
                    onXPUpdate={(xp, status) => void updateXP(c.id, xp, status)}
                  />
                ))}
              </>
            )}
            {finished.length > 0 && (
              <>
                <p className="text-[10px] font-bold text-quantum-fgMuted uppercase tracking-wider mt-2">Histórico</p>
                {finished.map(c => (
                  <ChallengeCard
                    key={c.id}
                    challenge={c}
                    transactions={transactions}
                    onDelete={() => void deleteChallenge(c.id)}
                    onXPUpdate={(xp, status) => void updateXP(c.id, xp, status)}
                  />
                ))}
              </>
            )}
          </div>
        )}
      </motion.div>

      <AnimatePresence>
        {showModal && (
          <CreateModal
            transactions={transactions}
            onClose={() => setShowModal(false)}
            onCreate={createChallenge}
          />
        )}
      </AnimatePresence>
    </>
  );
}
