import { useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { History, X, Clock, RotateCcw, Tag } from 'lucide-react';
import { useAuditLogs } from '../hooks/useAuditLogs';
import type { AuditView } from '../hooks/useAuditLogs';

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  uid:     string;
  open:    boolean;
  onClose: () => void;
}

// ─── Item ─────────────────────────────────────────────────────────────────────

function TimelineItem({ log, index }: { log: AuditView; index: number }) {
  const isUndo = log.title === 'Desfazer alterações';

  return (
    <motion.li
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.04, duration: 0.2 }}
      className="relative flex gap-4 pb-5 last:pb-0"
    >
      {/* Indicador lateral */}
      <div className={`relative z-10 shrink-0 w-5 h-5 rounded-full border-2 mt-0.5 flex items-center justify-center ${
        isUndo
          ? 'bg-quantum-bg border-quantum-fgMuted/40'
          : 'bg-quantum-bg border-quantum-accent/50'
      }`}>
        {isUndo
          ? <RotateCcw className="w-2.5 h-2.5 text-quantum-fgMuted" />
          : <Tag        className="w-2.5 h-2.5 text-quantum-accent/70" />
        }
      </div>

      {/* Card */}
      <div className="flex-1 min-w-0 bg-quantum-bgSecondary/60 border border-quantum-border rounded-xl p-3 hover:border-quantum-accent/20 transition-colors">
        <p className="text-xs font-bold text-quantum-fg leading-tight">{log.title}</p>
        <p className="text-[11px] text-quantum-fgMuted mt-1 leading-relaxed">{log.subtitle}</p>
        <p className="text-[10px] text-quantum-fgMuted/50 font-mono mt-2">
          {new Date(log.timestamp).toLocaleString('pt-BR')}
        </p>
      </div>
    </motion.li>
  );
}

// ─── Drawer ───────────────────────────────────────────────────────────────────

function Drawer({ uid, onClose }: { uid: string; onClose: () => void }) {
  const { logs, loading, error } = useAuditLogs(uid);

  const containerRef  = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const triggerRef    = useRef<Element | null>(null);

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
      ).filter((el) => !el.hasAttribute('disabled'));
      const first = focusable[0];
      const last  = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last?.focus(); }
      } else {
        if (document.activeElement === last)  { e.preventDefault(); first?.focus(); }
      }
    }
  }, [onClose]);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 flex items-stretch justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="Histórico de ações"
      onKeyDown={handleKeyDown}
    >
      {/* Backdrop */}
      <motion.div
        key="audit-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Painel lateral */}
      <motion.aside
        key="audit-panel"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 280 }}
        className="relative z-10 flex flex-col w-full max-w-sm h-full bg-quantum-bg border-l border-quantum-border shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-quantum-border shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-quantum-accent/10 flex items-center justify-center">
              <History className="w-4 h-4 text-quantum-accent" />
            </div>
            <div>
              <h2 className="text-sm font-black text-quantum-fg">Histórico de Ações</h2>
              <p className="text-[10px] text-quantum-fgMuted">Últimas 50 operações registradas</p>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="p-2 text-quantum-fgMuted hover:text-quantum-fg hover:bg-quantum-bgSecondary rounded-lg transition-all"
            aria-label="Fechar histórico"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Corpo */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">

          {/* Loading */}
          {loading && (
            <div role="status" className="flex flex-col items-center justify-center py-16 gap-3 text-quantum-fgMuted">
              <div className="w-6 h-6 border-2 border-quantum-accent/30 border-t-quantum-accent rounded-full animate-spin" />
              <span className="text-xs">Carregando histórico...</span>
            </div>
          )}

          {/* Erro */}
          {error && !loading && (
            <div role="alert" className="mx-4 mt-6 p-4 bg-quantum-redDim border border-quantum-red/30 rounded-xl">
              <p className="text-xs text-quantum-fg">{error}</p>
            </div>
          )}

          {/* Empty state */}
          {!loading && !error && logs.length === 0 && (
            <div role="status" className="flex flex-col items-center justify-center py-16 gap-4 text-center px-6">
              <div className="p-4 bg-quantum-card rounded-2xl border border-quantum-border">
                <Clock className="w-8 h-8 text-quantum-fgMuted" />
              </div>
              <p className="text-sm text-quantum-fgMuted">Nenhuma ação registrada recentemente</p>
            </div>
          )}

          {/* Timeline */}
          {!loading && !error && logs.length > 0 && (
            <ol className="relative px-5 py-5">
              {/* Trilha vertical */}
              <div className="absolute left-[2.1rem] top-5 bottom-5 w-px bg-quantum-border pointer-events-none" />

              <AnimatePresence initial={false}>
                {logs.map((log, i) => (
                  <TimelineItem key={log.id} log={log} index={i} />
                ))}
              </AnimatePresence>
            </ol>
          )}
        </div>

        {/* Rodapé */}
        {!loading && logs.length > 0 && (
          <div className="px-5 py-3 border-t border-quantum-border shrink-0">
            <p className="text-[10px] text-quantum-fgMuted/50 text-center">
              {logs.length} registro{logs.length !== 1 ? 's' : ''} carregado{logs.length !== 1 ? 's' : ''}
            </p>
          </div>
        )}
      </motion.aside>
    </div>
  );
}

// ─── Componente exportado (com portal) ────────────────────────────────────────

export default function AuditTimeline({ uid, open, onClose }: Props) {
  return createPortal(
    <AnimatePresence>
      {open && <Drawer uid={uid} onClose={onClose} />}
    </AnimatePresence>,
    document.body
  );
}
