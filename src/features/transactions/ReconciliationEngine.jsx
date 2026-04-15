/**
 * ReconciliationEngine.jsx — Motor de Reconciliação "Tinder Financeiro"
 * ──────────────────────────────────────────────────────────────────────────────
 * Modal full-screen que apresenta cada transação importada uma a uma.
 * O utilizador decide o destino via teclado ou botões:
 *
 * AÇÕES:
 *  ←  Seta Esquerda   → Aprovar como Nova    (swipe left)
 *  →  Seta Direita    → Merge / Conciliar    (swipe right)
 *  Del / Backspace    → Ignorar / Descartar  (fade down)
 *
 * MERGE: Varre existingTransactions buscando valor ±1% + data ±3 dias.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  ArrowLeft, ArrowRight, Trash2, CheckCircle2, GitMerge,
  Zap, ShieldCheck, ChevronRight
} from 'lucide-react';
import { usePrivacy } from '../../contexts/PrivacyContext';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtBRL = (v) =>
  `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (iso) => {
  if (!iso) return '–';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

const CAT_COLORS = {
  'Alimentação':   'text-amber-400  bg-amber-400/10  border-amber-400/25',
  'Transporte':    'text-blue-400   bg-blue-400/10   border-blue-400/25',
  'Assinaturas':   'text-cyan-400   bg-cyan-400/10   border-cyan-400/25',
  'Saúde':         'text-rose-400   bg-rose-400/10   border-rose-400/25',
  'Moradia':       'text-orange-400 bg-orange-400/10 border-orange-400/25',
  'Educação':      'text-indigo-400 bg-indigo-400/10 border-indigo-400/25',
  'Lazer':         'text-pink-400   bg-pink-400/10   border-pink-400/25',
  'Salário':       'text-emerald-400 bg-emerald-400/10 border-emerald-400/25',
  'Investimento':  'text-emerald-400 bg-emerald-400/10 border-emerald-400/25',
};
const catClass = (cat) => CAT_COLORS[cat] || 'text-slate-400 bg-white/5 border-white/15';

// ─── Lógica de Merge ──────────────────────────────────────────────────────────
function findMergeCandidate(tx, existingTransactions) {
  if (!existingTransactions?.length) return null;
  const txDate  = new Date(tx.date);
  const txValue = Math.abs(Number(tx.value));
  if (!txValue) return null;

  for (const ex of existingTransactions) {
    const exDate  = new Date(ex.date);
    const exValue = Math.abs(Number(ex.value));

    // ±3 dias
    const dayDiff = Math.abs((txDate - exDate) / 86_400_000);
    if (dayDiff > 3) continue;

    // ±1% de valor
    const pctDiff = Math.abs(txValue - exValue) / Math.max(txValue, 0.01);
    if (pctDiff <= 0.01) return ex;
  }
  return null;
}

// ─── Variantes de Animação ────────────────────────────────────────────────────
const CARD_ENTER = { opacity: 0, scale: 0.88, y: 40 };
const CARD_CENTER = {
  opacity: 1, scale: 1, y: 0,
  transition: { type: 'spring', stiffness: 340, damping: 28 },
};
const exitVariant = (dir) =>
  dir === 'right' ? { x: 720, opacity: 0, rotate: 22,  transition: { type: 'spring', stiffness: 320, damping: 26 } } :
  dir === 'down'  ? { y: 200, opacity: 0, scale: 0.75, transition: { type: 'spring', stiffness: 320, damping: 26 } } :
                    { x: -720, opacity: 0, rotate: -22, transition: { type: 'spring', stiffness: 320, damping: 26 } };

// ─── Componente "Done" ────────────────────────────────────────────────────────
function DoneScreen({ stats, onConfirm, onCancel }) {
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
        <h2 className="text-2xl font-black text-white mb-2">Reconciliação Concluída</h2>
        <p className="text-sm text-slate-400">Todas as transações foram classificadas.</p>
      </div>

      <div className="grid grid-cols-3 gap-3 w-full">
        {[
          { label: 'Aprovadas',   value: stats.approved, color: 'text-emerald-400 border-emerald-500/25 bg-emerald-500/8' },
          { label: 'Conciliadas', value: stats.merged,   color: 'text-cyan-400    border-cyan-500/25    bg-cyan-500/8'    },
          { label: 'Descartadas', value: stats.discarded,color: 'text-slate-400   border-white/10       bg-white/4'       },
        ].map(({ label, value, color }) => (
          <div key={label} className={`rounded-2xl border p-4 ${color}`}>
            <p className="text-2xl font-black font-mono">{value}</p>
            <p className="text-[10px] uppercase tracking-wider mt-1 opacity-80">{label}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 w-full">
        <motion.button
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
          className="text-xs text-slate-500 hover:text-slate-300 transition-colors py-2"
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
}) {
  const { isPrivacyMode } = usePrivacy();

  const [queue,    setQueue]    = useState(() => [...(initialQueue || [])]);
  const [resolved, setResolved] = useState([]);   // aprovadas + conciliadas
  const [stats,    setStats]    = useState({ approved: 0, merged: 0, discarded: 0 });
  const [isDone,   setIsDone]   = useState(false);
  const [hint,     setHint]     = useState(null);  // 'left' | 'right' | 'down' — hover hint

  const exitDirRef   = useRef('left');
  const total        = useRef(initialQueue?.length || 0);

  // ── Avançar fila com direcção de saída ──────────────────────────────────
  const advance = useCallback((dir, txToResolve, replacement = null) => {
    exitDirRef.current = dir;

    setResolved(prev => replacement ? [...prev, replacement] : prev);
    setQueue(prev => {
      const next = prev.slice(1);
      if (next.length === 0) {
        // Pequeno delay para a animação de saída terminar
        setTimeout(() => setIsDone(true), 350);
      }
      return next;
    });
  }, []);

  // ── AÇÃO: Aprovar como Novo (← esquerda) ────────────────────────────────
  const handleApprove = useCallback(() => {
    const tx = queue[0];
    if (!tx) return;
    setStats(s => ({ ...s, approved: s.approved + 1 }));
    advance('left', tx, tx);
  }, [queue, advance]);

  // ── AÇÃO: Merge / Conciliar (→ direita) ─────────────────────────────────
  const handleMerge = useCallback(() => {
    const tx = queue[0];
    if (!tx) return;

    const match = findMergeCandidate(tx, existingTransactions);
    if (match) {
      // Enriquecer o registo existente com dados do importado (sem duplicar)
      const merged = {
        ...match,
        description: match.description || tx.description,
        category:    match.category    || tx.category,
        _reconciled: true,
        _mergedWith: tx.id,
      };
      setStats(s => ({ ...s, merged: s.merged + 1 }));
      toast.success(`Conciliado: ${match.description?.substring(0, 30)}`, { icon: '🔗', duration: 2500 });
      advance('right', tx, merged);
    } else {
      // Sem correspondência → aprovar como novo, notificar
      toast(`Sem correspondência — aprovado como novo.`, { icon: '➕', duration: 2500 });
      setStats(s => ({ ...s, approved: s.approved + 1 }));
      advance('right', tx, tx);
    }
  }, [queue, existingTransactions, advance]);

  // ── AÇÃO: Descartar (Del / Backspace) ───────────────────────────────────
  const handleDiscard = useCallback(() => {
    const tx = queue[0];
    if (!tx) return;
    setStats(s => ({ ...s, discarded: s.discarded + 1 }));
    advance('down', tx, null);
  }, [queue, advance]);

  // ── Listener de teclado global ───────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if (isDone) return;
      if (e.key === 'ArrowLeft')                       { e.preventDefault(); handleApprove(); }
      else if (e.key === 'ArrowRight')                 { e.preventDefault(); handleMerge();   }
      else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); handleDiscard(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isDone, handleApprove, handleMerge, handleDiscard]);

  // ── Card actual (topo da fila) ────────────────────────────────────────────
  const card = queue[0] ?? null;
  const remaining = queue.length;
  const done      = total.current - remaining;
  const progress  = total.current > 0 ? (done / total.current) * 100 : 0;
  const isIncome  = card?.type === 'entrada' || card?.type === 'receita';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[60] bg-slate-950/90 backdrop-blur-2xl flex flex-col items-center justify-center p-4 overflow-hidden"
    >
      {/* ── Partículas de fundo (decorativas) ── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/5 rounded-full blur-[100px]" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-violet-500/5 rounded-full blur-[100px]" />
      </div>

      <div className="relative z-10 w-full max-w-sm flex flex-col items-center gap-6">

        {/* ── Cabeçalho: título + progresso ─────────────────────────────── */}
        <div className="w-full space-y-2">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-cyan-400" />
              <span className="font-black text-white uppercase tracking-widest text-[10px]">
                Reconciliação
              </span>
            </div>
            <span className="font-mono text-slate-400">
              <span className="text-white font-bold">{done}</span> / {total.current}
            </span>
          </div>

          {/* Barra de progresso */}
          <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-cyan-500 to-cyan-400 rounded-full"
              animate={{ width: `${progress}%` }}
              transition={{ type: 'spring', stiffness: 200, damping: 28 }}
            />
          </div>
        </div>

        {/* ── Área do Card ───────────────────────────────────────────────── */}
        <div className="relative w-full" style={{ minHeight: 280 }}>

          {/* Sombra de profundidade (card "debaixo") */}
          {remaining > 1 && (
            <div
              className="absolute inset-x-4 -bottom-3 h-full rounded-3xl bg-slate-800/40 border border-white/5"
              style={{ zIndex: 0 }}
              aria-hidden
            />
          )}

          {/* Hint de swipe (fundo reactivo ao hover dos botões) */}
          <AnimatePresence>
            {hint === 'left' && (
              <motion.div
                key="hint-left"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="absolute inset-0 rounded-3xl border-2 border-emerald-400/60 bg-emerald-500/5 pointer-events-none z-20"
              />
            )}
            {hint === 'right' && (
              <motion.div
                key="hint-right"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="absolute inset-0 rounded-3xl border-2 border-cyan-400/60 bg-cyan-500/5 pointer-events-none z-20"
              />
            )}
            {hint === 'down' && (
              <motion.div
                key="hint-down"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="absolute inset-0 rounded-3xl border-2 border-red-400/60 bg-red-500/5 pointer-events-none z-20"
              />
            )}
          </AnimatePresence>

          {/* Card animado */}
          <AnimatePresence
            mode="wait"
            custom={exitDirRef}
          >
            {card && !isDone && (
              <motion.div
                key={card.id}
                initial={CARD_ENTER}
                animate={CARD_CENTER}
                exit={exitVariant(exitDirRef.current)}
                className="relative z-10 w-full bg-slate-900/80 border border-white/10 backdrop-blur-xl rounded-3xl p-6 shadow-2xl shadow-black/60 select-none"
              >
                {/* Categoria */}
                <div className="flex items-center justify-between mb-5">
                  <span className={`inline-flex items-center px-3 py-1 rounded-xl border text-[11px] font-black uppercase tracking-wider ${catClass(card.category)}`}>
                    {card.category || 'Diversos'}
                  </span>
                  <span className="text-[10px] font-mono text-slate-500 uppercase">
                    {card.source?.toUpperCase() || 'IMPORT'}
                  </span>
                </div>

                {/* Descrição */}
                <div className="mb-6">
                  <p className="text-xl font-black text-white leading-tight line-clamp-3" title={card.description}>
                    {card.description}
                  </p>
                </div>

                {/* Rodapé: data + valor */}
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Data</p>
                    <p className="text-sm font-mono font-bold text-slate-300">
                      {fmtDate(card.date)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Valor</p>
                    <p className={`text-2xl font-black font-mono ${isIncome ? 'text-emerald-400' : 'text-rose-400'}`}
                       style={{ textShadow: isIncome ? '0 0 20px rgba(52,211,153,0.5)' : '0 0 20px rgba(251,113,133,0.5)' }}
                    >
                      {isPrivacyMode ? '••••••' : `${isIncome ? '+' : '-'}${fmtBRL(card.value)}`}
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Empty state */}
          {queue.length === 0 && !isDone && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-8 h-8 border-2 border-cyan-500/40 border-t-cyan-400 rounded-full animate-spin" />
            </div>
          )}
        </div>

        {/* ── Done Screen ────────────────────────────────────────────────── */}
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

        {/* ── Botões de acção (visíveis apenas quando há cards) ──────────── */}
        {!isDone && card && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="flex items-center gap-4 w-full"
          >
            {/* ← Aprovar */}
            <motion.button
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.94 }}
              onClick={handleApprove}
              onMouseEnter={() => setHint('left')}
              onMouseLeave={() => setHint(null)}
              className="flex-1 flex flex-col items-center gap-1.5 py-3.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 rounded-2xl text-emerald-400 transition-all group"
              title="Aprovar como Nova (←)"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="text-[10px] font-black uppercase tracking-wider">Aprovar</span>
              <kbd className="text-[9px] text-emerald-600 font-mono">←</kbd>
            </motion.button>

            {/* Del Descartar */}
            <motion.button
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.94 }}
              onClick={handleDiscard}
              onMouseEnter={() => setHint('down')}
              onMouseLeave={() => setHint(null)}
              className="flex flex-col items-center gap-1.5 py-3.5 px-5 bg-slate-800/60 hover:bg-red-500/10 border border-white/8 hover:border-red-500/25 rounded-2xl text-slate-400 hover:text-red-400 transition-all"
              title="Ignorar / Descartar (Del)"
            >
              <Trash2 className="w-4 h-4" />
              <span className="text-[10px] font-black uppercase tracking-wider">Ignorar</span>
              <kbd className="text-[9px] font-mono opacity-50">Del</kbd>
            </motion.button>

            {/* → Merge */}
            <motion.button
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.94 }}
              onClick={handleMerge}
              onMouseEnter={() => setHint('right')}
              onMouseLeave={() => setHint(null)}
              className="flex-1 flex flex-col items-center gap-1.5 py-3.5 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/25 rounded-2xl text-cyan-400 transition-all"
              title="Merge / Conciliar (→)"
            >
              <GitMerge className="w-5 h-5" />
              <span className="text-[10px] font-black uppercase tracking-wider">Conciliar</span>
              <kbd className="text-[9px] text-cyan-600 font-mono">→</kbd>
            </motion.button>
          </motion.div>
        )}

        {/* ── Botão cancelar (canto inferior) ────────────────────────────── */}
        {!isDone && (
          <button
            onClick={onCancel}
            className="text-[11px] text-slate-600 hover:text-slate-400 transition-colors"
          >
            Cancelar importação
          </button>
        )}
      </div>
    </motion.div>
  );
}
