// src/components/GoalsPanel.tsx
// Painel de metas de poupança: listagem, criação e progresso.
import { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Target, Plus, Trash2, X, Check, AlertCircle, Calendar, Pencil, TrendingUp } from 'lucide-react';
import { useGoals } from '../hooks/useGoals';
import type { EnrichedGoal } from '../hooks/useGoals';
import { formatBRL, fromCentavos, toCentavos } from '../shared/types/money';
import type { Centavos } from '../shared/types/money';
import { logSanitizedFirebaseError } from '../shared/lib/firebaseErrorHandling';
import EmergencyFundCalculator from '../features/goals/EmergencyFundCalculator';

interface Props {
  uid: string;
  /** Ativos totais em centavos (de useFinancialMetrics), usado como base de progresso. */
  ativosCents?: number;
  /** Despesas mensais médias em centavos — alimenta EmergencyFundCalculator. */
  monthlyExpensesCents?: Centavos;
}

const GOAL_EMOJIS = ['🎯', '🏠', '✈️', '🚗', '📱', '🎓', '💍', '🏖️', '💰', '🏋️'];

function daysLeft(deadline: string | null | undefined): number | null {
  if (!deadline) return null;
  const diff = new Date(deadline).getTime() - Date.now();
  return Math.ceil(diff / 86400000);
}

function GoalCard({
  goal, onDelete, onUpdateProgress,
}: {
  goal: EnrichedGoal;
  onDelete: (id: string) => void;
  onUpdateProgress: (id: string, cents: Centavos) => Promise<void>;
}) {
  const pct       = goal.targetCents > 0
    ? Math.min((goal.currentCents / goal.targetCents) * 100, 100)
    : 0;
  const remaining = Math.max(goal.targetCents - goal.currentCents, 0) as Centavos;
  const days      = daysLeft(goal.deadline);
  const done      = pct >= 100;
  const barColor  = done ? 'bg-emerald-500' : pct >= 66 ? 'bg-blue-500' : pct >= 33 ? 'bg-amber-500' : 'bg-purple-500';

  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState('');
  const [saving,  setSaving]  = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const openEdit = () => {
    setEditVal(fromCentavos(goal.currentCents).toFixed(2).replace('.', ','));
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 60);
  };

  const saveEdit = async () => {
    let cents: Centavos;
    try {
      cents = toCentavos(editVal);
    } catch { setEditing(false); return; }
    setSaving(true);
    try { await onUpdateProgress(goal.id, cents); }
    finally { setSaving(false); setEditing(false); }
  };

  return (
    <div className={`bg-quantum-bgSecondary/60 border rounded-2xl p-4 transition-colors ${done ? 'border-emerald-500/30' : 'border-quantum-border'}`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">{goal.emoji ?? '🎯'}</span>
          <div>
            <p className="text-sm font-bold text-quantum-fg leading-tight">{goal.name}</p>
            {days !== null && (
              <p className={`text-[10px] flex items-center gap-1 mt-0.5 ${days < 30 ? 'text-red-400' : 'text-quantum-fgMuted'}`}>
                <Calendar className="w-2.5 h-2.5" />
                {days > 0 ? `${days} dias restantes` : days === 0 ? 'Prazo hoje!' : 'Prazo expirado'}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {done && <Check className="w-4 h-4 text-emerald-400 mr-1" />}
          <button onClick={openEdit} title="Atualizar progresso" className="p-1 rounded-lg text-quantum-fgMuted hover:text-purple-400 hover:bg-purple-500/10 transition-colors">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => onDelete(goal.id)} className="p-1 rounded-lg text-quantum-fgMuted hover:text-red-400 hover:bg-red-500/10 transition-colors" aria-label={`Remover meta ${goal.name}`}>
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="h-2 rounded-full bg-quantum-card mb-2 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
          className={`h-full rounded-full ${barColor}`}
        />
      </div>

      <AnimatePresence initial={false}>
        {editing ? (
          <motion.div key="edit" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden mt-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-quantum-fgMuted shrink-0">Guardado:</span>
              <div className="relative flex-1">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-quantum-fgMuted">R$</span>
                <input
                  ref={inputRef}
                  type="text" inputMode="decimal"
                  value={editVal}
                  onChange={e => setEditVal(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') void saveEdit(); if (e.key === 'Escape') setEditing(false); }}
                  className="input-quantum w-full pl-7 text-sm py-1.5"
                />
              </div>
              <button onClick={() => void saveEdit()} disabled={saving} className="p-1.5 rounded-lg bg-purple-500/20 border border-purple-500/40 text-purple-300 hover:bg-purple-500/30 transition-colors disabled:opacity-50">
                {saving ? <span className="w-3.5 h-3.5 border-2 border-purple-400/40 border-t-purple-400 rounded-full animate-spin block" /> : <Check className="w-3.5 h-3.5" />}
              </button>
              <button onClick={() => setEditing(false)} className="p-1.5 rounded-lg text-quantum-fgMuted hover:text-quantum-fg bg-white/5 border border-quantum-border transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div key="info" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-1">
            <div className="flex items-center justify-between text-[10px] text-quantum-fgMuted">
              <span>
                <span className="font-bold text-quantum-fg">{formatBRL(fromCentavos(goal.currentCents))}</span>
                {' / '}
                {formatBRL(fromCentavos(goal.targetCents))}
              </span>
              <span className={`font-bold ${done ? 'text-emerald-400' : ''}`}>
                {done ? '✓ Concluída' : `Faltam ${formatBRL(fromCentavos(remaining))}`}
              </span>
              <span className="font-mono font-bold">{pct.toFixed(0)}%</span>
            </div>
            {!done && goal.monthlyContributionNeeded > 0 && (
              <div className="flex items-center gap-1 text-[10px] text-quantum-fgMuted">
                <TrendingUp className="w-3 h-3 shrink-0 text-blue-400" />
                <span>
                  Guardar{' '}
                  <span className="font-bold text-blue-400">
                    {formatBRL(fromCentavos(goal.monthlyContributionNeeded))}
                  </span>
                  /mês para atingir a meta
                </span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface NewGoalFormProps {
  onSave:  (name: string, targetCents: Centavos, emoji: string, deadline: string) => Promise<void>;
  onCancel: () => void;
}
function NewGoalForm({ onSave, onCancel }: NewGoalFormProps) {
  const [name,     setName]     = useState('');
  const [value,    setValue]    = useState('');
  const [emoji,    setEmoji]    = useState('🎯');
  const [deadline, setDeadline] = useState('');
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');

  const handleSave = async () => {
    if (!name.trim()) { setError('Nome obrigatório.'); return; }
    let cents: Centavos;
    try {
      cents = toCentavos(value);
      if (cents <= 0) throw new Error();
    } catch {
      setError('Insira um valor válido maior que zero.');
      return;
    }
    setSaving(true);
    try {
      await onSave(name.trim(), cents, emoji, deadline);
    } catch (err) {
      logSanitizedFirebaseError('goal_create', err);
      setError('Erro ao criar meta.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-quantum-bgSecondary/80 border border-purple-500/30 rounded-2xl p-4 space-y-3">
      {error && (
        <div className="flex items-center gap-2 text-red-400 text-xs">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />{error}
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {GOAL_EMOJIS.map(e => (
          <button
            key={e} type="button" onClick={() => setEmoji(e)}
            className={`text-xl p-1.5 rounded-lg transition-colors ${emoji === e ? 'bg-purple-500/20 ring-1 ring-purple-500/50' : 'hover:bg-white/5'}`}
          >
            {e}
          </button>
        ))}
      </div>

      <input
        type="text" placeholder="Nome da meta" maxLength={60}
        value={name} onChange={e => { setName(e.target.value); setError(''); }}
        className="input-quantum w-full text-sm"
      />

      <div className="grid grid-cols-2 gap-2">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-quantum-fgMuted text-sm font-semibold">R$</span>
          <input
            type="text" inputMode="decimal" placeholder="0,00"
            value={value} onChange={e => { setValue(e.target.value); setError(''); }}
            className="input-quantum w-full pl-9 text-sm"
          />
        </div>
        <input
          type="date" value={deadline} onChange={e => setDeadline(e.target.value)}
          title="Prazo (opcional)"
          className="input-quantum w-full text-sm"
        />
      </div>

      <div className="flex gap-2">
        <button
          type="button" onClick={() => void handleSave()} disabled={saving}
          className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-bold bg-purple-500/20 border border-purple-500/40 text-purple-300 hover:bg-purple-500/30 transition-colors disabled:opacity-50"
        >
          {saving ? <span className="w-4 h-4 border-2 border-purple-400/40 border-t-purple-400 rounded-full animate-spin" /> : <Check className="w-4 h-4" />}
          Criar Meta
        </button>
        <button type="button" onClick={onCancel} className="px-3 py-2 rounded-xl text-sm text-quantum-fgMuted hover:text-quantum-fg bg-white/5 border border-quantum-border transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default function GoalsPanel({ uid, ativosCents, monthlyExpensesCents }: Props) {
  const { goals, loading, addGoal, removeGoal, setProgress } = useGoals(uid);
  const [adding, setAdding] = useState(false);

  const handleSave = useCallback(async (
    name: string, targetCents: Centavos, emoji: string, deadline: string,
  ) => {
    await addGoal({
      name,
      targetCents,
      currentCents: Math.min(ativosCents ?? 0, targetCents) as Centavos,
      emoji,
      deadline: deadline || null,
    });
    setAdding(false);
  }, [addGoal, ativosCents]);

  const handleDelete = useCallback(async (id: string) => {
    try { await removeGoal(id); }
    catch (err) { logSanitizedFirebaseError('goal_delete', err); }
  }, [removeGoal]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-quantum-card border border-quantum-border rounded-3xl p-6 shadow-lg"
    >
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/15 flex items-center justify-center border border-purple-500/25">
            <Target className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h3 className="text-base font-black text-quantum-fg">Metas de Poupança</h3>
            <p className="text-[11px] text-quantum-fgMuted">
              {goals.length === 0 ? 'Nenhuma meta definida' : `${goals.length} meta${goals.length > 1 ? 's' : ''}`}
              {ativosCents !== undefined && ativosCents > 0 && (
                <> · Base: {formatBRL(fromCentavos(ativosCents))}</>
              )}
            </p>
          </div>
        </div>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border border-purple-500/40 text-purple-300 hover:bg-purple-500/10 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Nova meta
          </button>
        )}
      </div>

      {/* Emergency Fund Calculator */}
      {monthlyExpensesCents !== undefined && (
        <div className="mb-5">
          <EmergencyFundCalculator
            monthlyExpensesCents={monthlyExpensesCents}
            currentSavingsCents={(ativosCents ?? 0) as Centavos}
            onCreateGoal={addGoal}
          />
        </div>
      )}

      <AnimatePresence initial={false}>
        {adding && (
          <motion.div key="form" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden mb-4">
            <NewGoalForm onSave={handleSave} onCancel={() => setAdding(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <div className="py-8 text-center text-quantum-fgMuted text-sm">Carregando metas…</div>
      ) : goals.length === 0 && !adding ? (
        <div className="py-8 text-center space-y-2">
          <p className="text-quantum-fgMuted text-sm">Defina uma meta para acompanhar seu progresso.</p>
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-purple-500/15 border border-purple-500/30 text-purple-300 hover:bg-purple-500/25 transition-colors"
          >
            <Plus className="w-4 h-4" /> Criar primeira meta
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence>
            {goals.map(g => (
              <motion.div key={g.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}>
                <GoalCard
                  goal={g}
                  onDelete={id => void handleDelete(id)}
                  onUpdateProgress={setProgress}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
}
