import { type ReactNode, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  className?: string;
}

/**
 * Bottom Sheet acessível (PR 2 — design system). Desliza de baixo no mobile e
 * centraliza no desktop. `role="dialog"`/`aria-modal`, fecha por Escape e por clique
 * no backdrop, devolve foco ao painel. Base para filtros móveis e respostas
 * contextuais da IA (consumido pelos PRs 6 e 7). Animação via framer-motion (já dep).
 */
export function BottomSheet({ open, onClose, title, children, className = '' }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    panelRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[120] flex items-end sm:items-center sm:justify-center">
          <motion.div
            className="absolute inset-0 bg-quantum-bg/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={title ?? 'Painel'}
            tabIndex={-1}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 360, damping: 34 }}
            className={`relative w-full sm:max-w-lg bg-quantum-card border-t sm:border border-quantum-border rounded-t-3xl sm:rounded-3xl p-5 max-h-[85vh] overflow-y-auto focus:outline-none ${className}`}
          >
            <div className="flex items-center justify-between gap-3 mb-3">
              {title ? <h2 className="text-base font-bold text-quantum-fg">{title}</h2> : <span />}
              <button
                type="button"
                onClick={onClose}
                aria-label="Fechar"
                className="p-1.5 rounded-lg text-quantum-fgMuted hover:text-quantum-fg hover:bg-white/5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-quantum-accent/50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
