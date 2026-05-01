import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Clock, History, Tag, X } from 'lucide-react';
import { useTransactionHistory, type TransactionHistoryView } from '../hooks/useTransactionHistory';
import type { Transaction } from '../shared/types/transaction';
import { fromCentavos } from '../shared/types/money';
import { formatCurrency } from '../utils/formatters';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  uid: string;
  transaction: Transaction | null;
}

const ACTION_LABELS: Record<string, string> = {
  CREATE: 'Criada',
  UPDATE: 'Atualizada',
  SOFT_DELETE: 'Enviada para lixeira',
  RESTORE: 'Restaurada',
  BULK_UPDATE: 'Atualização em lote',
  UNDO_BULK_UPDATE: 'Lote desfeito',
  IMPORT: 'Importada',
  DELETEBATCH: 'Exclusão em lote',
};

function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString('pt-BR');
}

const FIELD_LABELS: Record<string, string> = {
  amount_cents: 'Valor',
  category:     'Categoria',
  date:         'Data',
  description:  'Descrição',
  source:       'Origem',
  type:         'Tipo',
  value:        'Valor',
  value_cents:  'Valor',
};

function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

function isMoneyField(field: string): boolean {
  return field === 'value' || field === 'value_cents' || field === 'amount_cents';
}

function formatFieldValue(field: string, value: unknown): string {
  if (value === undefined) return 'vazio';
  if (value === null) return 'vazio';
  if (isMoneyField(field) && typeof value === 'number' && Number.isFinite(value)) {
    return formatCurrency(fromCentavos(value));
  }
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (typeof value === 'string') return value.trim() || 'vazio';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return String(value);
}

function formatChangedFields(event: TransactionHistoryView): string | null {
  if (!event.changedFields?.length) return null;
  return `Campos alterados: ${event.changedFields.join(', ')}`;
}

function formatChangedFieldDeltas(event: TransactionHistoryView): string[] | null {
  if (!event.changedFields?.length || !event.before || !event.after) return null;

  return event.changedFields.map(field => {
    const before = formatFieldValue(field, event.before?.[field]);
    const after = formatFieldValue(field, event.after?.[field]);
    return `${fieldLabel(field)}: ${before} → ${after}`;
  });
}

function eventDetails(event: TransactionHistoryView): string[] {
  const details: string[] = [];
  const changed = formatChangedFieldDeltas(event) ?? [formatChangedFields(event)].filter((detail): detail is string => Boolean(detail));

  if (event.origin) details.push(`Origem: ${event.origin}`);
  details.push(...changed);
  if (event.category) details.push(`Categoria: ${event.category}`);
  if (typeof event.amount_cents === 'number') {
    details.push(`Valor: ${formatCurrency(fromCentavos(event.amount_cents))}`);
  }
  if (event.reason) details.push(event.reason);

  return details;
}

function HistoryItem({ event, index }: { event: TransactionHistoryView; index: number }) {
  const details = eventDetails(event);

  return (
    <motion.li
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.03, duration: 0.18 }}
      className="relative flex gap-4 pb-5 last:pb-0"
    >
      <div className="relative z-10 shrink-0 w-5 h-5 rounded-full border-2 mt-0.5 flex items-center justify-center bg-quantum-bg border-quantum-accent/50">
        <Tag className="w-2.5 h-2.5 text-quantum-accent/70" />
      </div>

      <div className="flex-1 min-w-0 bg-quantum-bgSecondary/60 border border-quantum-border rounded-xl p-3">
        <p className="text-xs font-bold text-quantum-fg leading-tight">{actionLabel(event.action)}</p>
        {details.length > 0 && (
          <div className="mt-1 space-y-0.5">
            {details.map(detail => (
              <p key={detail} className="text-[11px] text-quantum-fgMuted leading-relaxed">{detail}</p>
            ))}
          </div>
        )}
        <p className="text-[10px] text-quantum-fgMuted/50 font-mono mt-2">{formatDate(event.timestamp)}</p>
      </div>
    </motion.li>
  );
}

function Drawer({ uid, transaction, onClose }: Omit<Props, 'isOpen'>) {
  const transactionId = transaction?.id;
  const { events, loading, error } = useTransactionHistory(uid, transactionId);

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="Histórico da movimentação"
    >
      <motion.div
        key="transaction-history-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <motion.aside
        key="transaction-history-panel"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 280 }}
        className="relative z-10 flex flex-col w-full max-w-sm h-full bg-quantum-bg border-l border-quantum-border shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-quantum-border shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-quantum-accent/10 flex items-center justify-center shrink-0">
              <History className="w-4 h-4 text-quantum-accent" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-black text-quantum-fg">Histórico da movimentação</h2>
              <p className="text-[10px] text-quantum-fgMuted truncate">
                {transaction?.description ?? 'Movimentação selecionada'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-quantum-fgMuted hover:text-quantum-fg hover:bg-quantum-bgSecondary rounded-lg transition-all"
            aria-label="Fechar histórico da movimentação"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-quantum-fgMuted">
              <div className="w-6 h-6 border-2 border-quantum-accent/30 border-t-quantum-accent rounded-full animate-spin" />
              <span className="text-xs">Carregando histórico...</span>
            </div>
          )}

          {error && !loading && (
            <div className="mx-4 mt-6 p-4 bg-quantum-redDim border border-quantum-red/30 rounded-xl">
              <p className="text-xs text-quantum-fg">{error}</p>
            </div>
          )}

          {!loading && !error && events.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-4 text-center px-6">
              <div className="p-4 bg-quantum-card rounded-2xl border border-quantum-border">
                <Clock className="w-8 h-8 text-quantum-fgMuted" />
              </div>
              <p className="text-sm text-quantum-fgMuted">Nenhum histórico registrado para esta movimentação</p>
            </div>
          )}

          {!loading && !error && events.length > 0 && (
            <ol className="relative px-5 py-5">
              <div className="absolute left-[2.1rem] top-5 bottom-5 w-px bg-quantum-border pointer-events-none" />
              <AnimatePresence initial={false}>
                {events.map((event, index) => (
                  <HistoryItem key={event.id} event={event} index={index} />
                ))}
              </AnimatePresence>
            </ol>
          )}
        </div>
      </motion.aside>
    </div>
  );
}

export default function TransactionHistoryDrawer({ isOpen, onClose, uid, transaction }: Props) {
  return createPortal(
    <AnimatePresence>
      {isOpen && transaction && (
        <Drawer uid={uid} transaction={transaction} onClose={onClose} />
      )}
    </AnimatePresence>,
    document.body,
  );
}
