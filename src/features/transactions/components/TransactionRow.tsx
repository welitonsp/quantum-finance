// src/features/transactions/components/TransactionRow.tsx
import React from 'react';
import { motion } from 'framer-motion';
import {
  CheckSquare, Square, ArrowUpRight, ArrowDownRight,
  Edit3, Trash2, History, AlertTriangle, Check, ShieldAlert,
} from 'lucide-react';
import type { Transaction } from '../../../shared/types/transaction';
import { fromCentavos, type Centavos } from '../../../shared/types/money';
import {
  getTransactionAbsCentavos,
  getTransactionOriginLabel,
  isIncome as checkIncome,
  isImportedTransaction,
  isReconciledTransaction,
  isImportedUnreconciledTransaction,
} from '../../../utils/transactionUtils';
import { formatCurrency } from '../../../utils/formatters';
import { getCategoryStyle as catStyle } from '../../../shared/lib/categoryStyles';
import { formatDateShort, RUNNING_BALANCE_HELP } from '../transactionGroupUtils';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TransactionRowProps {
  tx:                   Transaction;
  runningBalanceCents?: Centavos | undefined;
  isSelected:           boolean;
  onToggle:             (id: string) => void;
  onEdit:               (tx: Transaction) => void;
  onDelete:             (tx: Transaction) => void;
  onHistory:            (tx: Transaction) => void;
}

// ─── Componente ───────────────────────────────────────────────────────────────

export const TransactionRow = React.memo(function TransactionRow({
  tx,
  runningBalanceCents,
  isSelected,
  onToggle,
  onEdit,
  onDelete,
  onHistory,
}: TransactionRowProps) {
  const isIncome        = checkIncome(tx.type);
  const cs              = catStyle(tx.category ?? 'Diversos');
  const runningIsPositive = (runningBalanceCents ?? 0) >= 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.15 }}
      className={`group flex items-center gap-3 p-3 rounded-xl border transition-all duration-150 ${
        isSelected
          ? 'bg-quantum-accent/5 border-quantum-accent/25'
          : 'bg-quantum-bgSecondary/50 border-quantum-border hover:border-quantum-accent/20 hover:bg-quantum-bgSecondary'
      }`}
    >
      <button
        onClick={() => onToggle(tx.id)}
        aria-label={`${isSelected ? 'Desmarcar' : 'Selecionar'} movimentação ${tx.description || 'sem descrição'}`}
        className="shrink-0 text-quantum-fgMuted hover:text-quantum-accent transition-colors"
      >
        {isSelected
          ? <CheckSquare className="w-4 h-4 text-quantum-accent" />
          : <Square className="w-4 h-4" />}
      </button>

      <div aria-hidden="true" className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
        isIncome ? 'bg-quantum-accentDim text-quantum-accent' : 'bg-quantum-redDim text-quantum-red'
      }`}>
        {isIncome
          ? <ArrowUpRight className="w-4 h-4" />
          : <ArrowDownRight className="w-4 h-4" />}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-quantum-fg truncate leading-tight">{tx.description}</p>
        <div className="flex flex-wrap items-center gap-2 mt-1">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${cs.bg} ${cs.text} ${cs.border}`}>
            {tx.category ?? 'Diversos'}
          </span>

          <div className="flex items-center gap-1.5 border-l border-quantum-border pl-2">
            {isReconciledTransaction(tx) && (
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-[9px] font-black uppercase tracking-wider"
                title="Transação conciliada com extrato"
              >
                <Check className="w-2.5 h-2.5" />
                Conciliada
              </span>
            )}

            {isImportedUnreconciledTransaction(tx) && (
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/25 text-amber-400 text-[9px] font-black uppercase tracking-wider"
                title="Importada do extrato bancário (não conciliada)"
              >
                <AlertTriangle className="w-2.5 h-2.5" />
                Importada
              </span>
            )}

            <span
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[9px] font-bold uppercase tracking-wider ${
                isImportedTransaction(tx)
                  ? 'bg-quantum-accent/10 border-quantum-accent/25 text-quantum-accent'
                  : 'bg-quantum-bgSecondary border-quantum-border text-quantum-fgMuted'
              }`}
              title={`Origem: ${getTransactionOriginLabel(tx)}`}
            >
              {isImportedTransaction(tx)
                ? <ShieldAlert className="w-2.5 h-2.5" />
                : <History className="w-2.5 h-2.5" />}
              {getTransactionOriginLabel(tx)}
            </span>
          </div>

          <span className="text-[10px] text-quantum-fgMuted font-mono border-l border-quantum-border pl-2">
            {formatDateShort(tx.date)}
          </span>
        </div>
      </div>

      <div className="flex flex-col items-end gap-0.5 shrink-0 min-w-[118px]">
        <p className={`font-mono font-black text-sm leading-tight ${
          isIncome ? 'text-quantum-accent' : 'text-quantum-fg'
        }`}>
          {isIncome ? '+' : '-'}{formatCurrency(fromCentavos(getTransactionAbsCentavos(tx)))}
        </p>
        {runningBalanceCents !== undefined && (
          <div
            className="text-right leading-none"
            title={RUNNING_BALANCE_HELP}
            aria-label={`Acumulado visível. ${RUNNING_BALANCE_HELP}`}
          >
            <p className="text-[9px] text-quantum-fgMuted uppercase tracking-wide">Acumulado visível</p>
            <span className="sr-only">{RUNNING_BALANCE_HELP}</span>
            <p className={`text-[10px] font-mono font-bold ${runningIsPositive ? 'text-quantum-accent' : 'text-quantum-red'}`}>
              {runningIsPositive ? '+' : ''}{formatCurrency(runningBalanceCents, { cents: true })}
            </p>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100 md:has-[:focus-visible]:opacity-100 transition-opacity shrink-0">
        <button
          onClick={e => { e.stopPropagation(); onHistory(tx); }}
          className="p-1.5 text-quantum-fgMuted hover:text-quantum-accent hover:bg-quantum-accentDim rounded-lg transition-all"
          title="Histórico"
          aria-label={`Ver histórico da movimentação ${tx.description || 'sem descrição'}`}
        >
          <History className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={e => { e.stopPropagation(); onEdit(tx); }}
          className="p-1.5 text-quantum-fgMuted hover:text-quantum-accent hover:bg-quantum-accentDim rounded-lg transition-all"
          title="Editar (E)"
          aria-label={`Editar movimentação ${tx.description || 'sem descrição'}`}
        >
          <Edit3 className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={e => { e.stopPropagation(); onDelete(tx); }}
          className="p-1.5 text-quantum-fgMuted hover:text-quantum-red hover:bg-quantum-redDim rounded-lg transition-all"
          title="Apagar (Del)"
          aria-label={`Excluir movimentação ${tx.description || 'sem descrição'}`}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </motion.div>
  );
});

TransactionRow.displayName = 'TransactionRow';
