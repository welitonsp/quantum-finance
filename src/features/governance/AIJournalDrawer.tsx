import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, BrainCircuit } from 'lucide-react';
import { getOutcomeCfg, getKindLabel } from './decisionHelpers';
import type { AIDecision, DecisionStats } from '../../hooks/useDecisions';

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  uid: string;
  decisions: AIDecision[];
  stats: DecisionStats;
  loading: boolean;
  open: boolean;
  onClose: () => void;
}

type FilterTab = 'all' | 'confirmed' | 'reverted' | 'other';

const TABS: { id: FilterTab; label: string }[] = [
  { id: 'all',       label: 'Todas'      },
  { id: 'confirmed', label: 'Aplicadas'  },
  { id: 'reverted',  label: 'Revertidas' },
  { id: 'other',     label: 'Pendentes'  },
];

// ─── Row ──────────────────────────────────────────────────────────────────────

function JournalRow({ decision, index }: { decision: AIDecision; index: number }) {
  const cfg = getOutcomeCfg(decision.outcomeStatus);
  const Icon = cfg.icon;
  const label = getKindLabel(decision.proposedAction.kind, decision.intent);

  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.03, duration: 0.2 }}
      className="py-3 border-t border-quantum-border/30"
    >
      <div className="flex items-start gap-3">
        <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${cfg.cls}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="text-xs font-bold text-quantum-fg">{label}</p>
            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${
              decision.outcomeStatus === 'applied'
                ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400'
                : decision.outcomeStatus === 'reverted'
                  ? 'border-amber-500/25 bg-amber-500/10 text-amber-400'
                  : 'border-quantum-border bg-quantum-bg/60 text-quantum-fgMuted'
            }`}>{cfg.label}</span>
          </div>
          <p className="text-[10px] text-quantum-fgMuted truncate">{decision.question || decision.intent}</p>
        </div>
        <span className="text-[10px] text-quantum-fgMuted font-mono shrink-0">
          {decision.createdAt?.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) ?? '—'}
        </span>
      </div>
    </motion.div>
  );
}

// ─── Panel ────────────────────────────────────────────────────────────────────

function JournalPanel({ decisions, stats, loading, onClose }: Omit<Props, 'uid' | 'open'>) {
  const [filter, setFilter] = useState<FilterTab>('all');

  const containerRef   = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const triggerRef     = useRef<Element | null>(null);

  useEffect(() => {
    triggerRef.current = document.activeElement;
    const id = setTimeout(() => closeButtonRef.current?.focus(), 0);
    return () => {
      clearTimeout(id);
      (triggerRef.current as HTMLElement | null)?.focus();
    };
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === 'Tab' && containerRef.current) {
      const focusable = Array.from(
        containerRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => !el.hasAttribute('disabled') && !el.closest('[aria-hidden="true"]'));
      const first = focusable[0];
      const last  = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last?.focus(); }
      } else {
        if (document.activeElement === last)  { e.preventDefault(); first?.focus(); }
      }
    }
  }, [onClose]);

  const filtered = useMemo(() => {
    if (filter === 'all') return decisions;
    if (filter === 'confirmed') return decisions.filter(d => d.userDecision === 'confirmed' && d.outcomeStatus === 'applied');
    if (filter === 'reverted') return decisions.filter(d => d.outcomeStatus === 'reverted');
    return decisions.filter(d => d.outcomeStatus === 'pending' || d.userDecision === 'rejected');
  }, [decisions, filter]);

  const fulfillmentRate = stats.total > 0
    ? Math.round((stats.confirmed / stats.total) * 100)
    : 0;

  return (
    // Focus-trap (Tab/Escape) do modal — keydown em role="dialog" é o padrão
    // WAI-ARIA de diálogo; falso-positivo do jsx-a11y neste caso legítimo.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 flex items-stretch justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="Diário de Decisões do Copiloto"
      onKeyDown={handleKeyDown}
    >
      {/* Backdrop */}
      <motion.div
        key="journal-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Painel lateral */}
      <motion.aside
        key="journal-panel"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="relative z-10 flex flex-col w-full max-w-md h-full bg-quantum-bg border-l border-quantum-border shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-quantum-border shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-quantum-accent/10 flex items-center justify-center">
              <BrainCircuit className="w-4 h-4 text-quantum-accent" />
            </div>
            <div>
              <p className="text-[10px] text-quantum-accent font-bold uppercase tracking-wide">Copiloto que Cumpre</p>
              <h2 className="text-sm font-black text-quantum-fg">Diário de Decisões</h2>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="p-2 text-quantum-fgMuted hover:text-quantum-fg hover:bg-quantum-bgSecondary rounded-lg transition-all"
            aria-label="Fechar diário"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Stats */}
        <div className="px-5 py-4 border-b border-quantum-border shrink-0">
          <div className="grid grid-cols-4 gap-2">
            <div className="bg-quantum-bgSecondary border border-quantum-border rounded-xl p-3 text-center">
              <p className="text-2xl font-black text-quantum-fg">{stats.total}</p>
              <p className="text-[10px] text-quantum-fgMuted uppercase tracking-wide mt-0.5">Total</p>
            </div>
            <div className="bg-quantum-bgSecondary border border-quantum-border rounded-xl p-3 text-center">
              <p className="text-2xl font-black text-emerald-400">{stats.confirmed}</p>
              <p className="text-[10px] text-quantum-fgMuted uppercase tracking-wide mt-0.5">Confirm.</p>
            </div>
            <div className="bg-quantum-bgSecondary border border-quantum-border rounded-xl p-3 text-center">
              <p className="text-2xl font-black text-amber-400">{stats.reverted}</p>
              <p className="text-[10px] text-quantum-fgMuted uppercase tracking-wide mt-0.5">Revert.</p>
            </div>
            <div className="bg-quantum-bgSecondary border border-quantum-border rounded-xl p-3 text-center">
              <p className="text-2xl font-black text-quantum-accent">{fulfillmentRate}%</p>
              <p className="text-[10px] text-quantum-fgMuted uppercase tracking-wide mt-0.5">Taxa</p>
            </div>
          </div>
          <p className="text-[10px] text-quantum-fgMuted text-center mt-2.5">
            Taxa de cumprimento: <span className="font-bold text-quantum-fg">{fulfillmentRate}%</span> das decisões confirmadas
          </p>
        </div>

        {/* Filtros */}
        <div className="px-5 py-3 border-b border-quantum-border shrink-0">
          <div className="flex items-center gap-1.5">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setFilter(tab.id)}
                className={`flex-1 text-[11px] font-bold px-2.5 py-1.5 rounded-lg border transition-all ${
                  filter === tab.id
                    ? 'bg-quantum-accent/10 border-quantum-accent/40 text-quantum-accent'
                    : 'bg-quantum-bgSecondary border-quantum-border text-quantum-fgMuted hover:text-quantum-fg'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Corpo */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-5">
          {loading && (
            <div role="status" className="flex flex-col items-center justify-center py-16 gap-3 text-quantum-fgMuted">
              <div className="w-6 h-6 border-2 border-quantum-accent/30 border-t-quantum-accent rounded-full animate-spin" />
              <span className="text-xs">Carregando diário...</span>
            </div>
          )}

          {!loading && filtered.length > 0 && (
            <AnimatePresence initial={false}>
              {filtered.map((decision, i) => (
                <JournalRow key={decision.id} decision={decision} index={i} />
              ))}
            </AnimatePresence>
          )}

          {!loading && filtered.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <BrainCircuit className="w-10 h-10 text-quantum-fgMuted/40" />
              <p className="text-sm font-bold text-quantum-fgMuted">
                {filter === 'all' ? 'Nenhuma decisão ainda' : 'Nenhuma nesta categoria'}
              </p>
              <p className="text-xs text-quantum-fgMuted/70 max-w-[280px]">
                {filter === 'all'
                  ? 'Quando você confirmar uma ação do Copiloto, ela aparecerá aqui com rastreamento completo.'
                  : 'Mude o filtro para ver outras decisões.'}
              </p>
            </div>
          )}
        </div>
      </motion.aside>
    </div>
  );
}

// ─── Componente exportado (com portal) ────────────────────────────────────────

export default function AIJournalDrawer(props: Props) {
  const { decisions, stats, loading, open, onClose } = props;
  return createPortal(
    <AnimatePresence>
      {open && (
        <JournalPanel
          decisions={decisions}
          stats={stats}
          loading={loading}
          onClose={onClose}
        />
      )}
    </AnimatePresence>,
    document.body
  );
}
