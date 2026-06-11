// src/features/transactions/components/TransactionBulkActions.tsx
// Barra de ações em lote: seleção múltipla, bulk update (re-categorizar), confirmação de exclusão
import { motion, AnimatePresence } from 'framer-motion';
import {
  Trash2, CheckSquare, Tag, X, Check,
  ShieldAlert, AlertTriangle,
} from 'lucide-react';
import type { Transaction } from '../../../shared/types/transaction';

interface TransactionBulkActionsProps {
  selected: Set<string>;
  transactions: Transaction[];
  filtered: Transaction[];
  categoryOptions: string[];
  allFilteredSelected: boolean;
  allTransactionsSelected: boolean;
  batchAction: 'delete' | 'recategorize' | null;
  setBatchAction: (a: 'delete' | 'recategorize' | null | ((prev: 'delete' | 'recategorize' | null) => 'delete' | 'recategorize' | null)) => void;
  confirmDelete: boolean;
  setConfirmDelete: (v: boolean) => void;
  newCat: string;
  setNewCat: (v: string) => void;
  isBulkUpdating: boolean;
  isUndoing: boolean;
  hasOnBulkUpdate: boolean;
  onBatchDelete: () => Promise<void>;
  onClearSelected: () => void;
  onSelectAllTransactions: () => void;
  onApplyRecategorize: () => void;
}

export function TransactionBulkActions({
  selected,
  transactions,
  filtered,
  categoryOptions,
  allFilteredSelected,
  allTransactionsSelected,
  batchAction,
  setBatchAction,
  confirmDelete,
  setConfirmDelete,
  newCat,
  setNewCat,
  isBulkUpdating,
  isUndoing,
  hasOnBulkUpdate,
  onBatchDelete,
  onClearSelected,
  onSelectAllTransactions,
  onApplyRecategorize,
}: TransactionBulkActionsProps) {
  return (
    <AnimatePresence>
      {selected.size > 0 && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="overflow-hidden border-b border-quantum-accent/20 bg-quantum-accentDim/50"
        >
          <div className="px-4 py-3 space-y-3 select-none">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2">
                <CheckSquare className="w-4 h-4 text-quantum-accent" />
                <span aria-live="polite" aria-atomic="true" className="text-sm font-black text-quantum-fg">
                  {selected.size} selecionada{selected.size > 1 ? 's' : ''}
                </span>
                {allTransactionsSelected && (
                  <span className="text-[10px] px-2 py-0.5 bg-quantum-accent/20 border border-quantum-accent/30 text-quantum-accent rounded-full font-bold">
                    TODOS os {transactions.length}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-2 ml-2">
                <button
                  onClick={() => { setBatchAction('delete'); setConfirmDelete(true); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-quantum-redDim border border-quantum-red/30 text-quantum-red rounded-xl text-xs font-bold hover:bg-quantum-red/20 transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Apagar {selected.size}
                </button>

                <button
                  onClick={() => setBatchAction(a => a === 'recategorize' ? null : 'recategorize')}
                  disabled={isBulkUpdating || isUndoing}
                  className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-xl text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                    batchAction === 'recategorize'
                      ? 'bg-quantum-goldDim border-quantum-gold/30 text-quantum-gold'
                      : 'bg-quantum-bgSecondary border-quantum-border text-quantum-fgMuted hover:text-quantum-fg hover:border-quantum-accent/30'
                  }`}
                >
                  <Tag className="w-3.5 h-3.5" /> Re-categorizar
                </button>

                <button
                  onClick={onClearSelected}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-quantum-bgSecondary border border-quantum-border text-quantum-fgMuted rounded-xl text-xs font-bold hover:text-quantum-fg transition-all"
                >
                  <X className="w-3.5 h-3.5" /> Limpar
                </button>
              </div>
            </div>

            {/* Select all banner */}
            <AnimatePresence>
              {allFilteredSelected && !allTransactionsSelected && transactions.length > filtered.length && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="flex flex-wrap items-center gap-3 px-3 py-2.5 bg-quantum-bg/60 border border-quantum-accent/15 rounded-xl">
                    <ShieldAlert className="w-4 h-4 text-quantum-accent shrink-0" />
                    <span className="text-xs text-quantum-fgMuted flex-1">
                      Todos os <strong className="text-quantum-fg">{filtered.length}</strong> lançamentos visíveis estão selecionados.
                    </span>
                    <button
                      onClick={onSelectAllTransactions}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-quantum-accentDim border border-quantum-accent/30 text-quantum-accent rounded-lg text-xs font-black hover:bg-quantum-accent/20 transition-all shrink-0"
                    >
                      <CheckSquare className="w-3.5 h-3.5" />
                      Selecionar todos os {transactions.length} lançamentos
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Delete confirmation */}
            <AnimatePresence>
              {batchAction === 'delete' && confirmDelete && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className={`p-3 border rounded-xl space-y-2.5 ${
                    allTransactionsSelected
                      ? 'bg-red-950/40 border-red-500/50'
                      : 'bg-quantum-redDim border-quantum-red/30'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${allTransactionsSelected ? 'text-red-400' : 'text-quantum-red'}`} />
                    <div className="flex-1 min-w-0">
                      {allTransactionsSelected ? (
                        <p className="text-xs text-red-300 font-bold leading-relaxed">
                          ⚠️ Atenção! Vai apagar <strong className="text-red-200">TODOS os {selected.size} lançamentos</strong> da sua conta permanentemente.
                        </p>
                      ) : (
                        <p className="text-xs text-quantum-fg leading-relaxed">
                          Tem a certeza? Vai apagar <strong>{selected.size} movimentações</strong> permanentemente.
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => { setBatchAction(null); setConfirmDelete(false); }}
                      className="px-3 py-1.5 bg-quantum-bgSecondary border border-quantum-border rounded-lg text-xs text-quantum-fgMuted hover:text-quantum-fg font-bold"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => void onBatchDelete()}
                      className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-black transition-colors ${
                        allTransactionsSelected
                          ? 'bg-red-600 hover:bg-red-500 text-white'
                          : 'bg-quantum-red hover:bg-red-600 text-white'
                      }`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      {allTransactionsSelected ? 'Apagar TUDO' : `Confirmar Apagar ${selected.size}`}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Recategorize panel */}
            <AnimatePresence>
              {batchAction === 'recategorize' && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="flex flex-wrap items-center gap-3 p-3 bg-quantum-goldDim border border-quantum-gold/30 rounded-xl"
                >
                  <Tag className="w-4 h-4 text-quantum-gold shrink-0" />
                  <span className="text-xs text-quantum-fg">
                    Mover <strong>{selected.size}</strong> transações para:
                  </span>
                  <select
                    value={newCat}
                    onChange={e => setNewCat(e.target.value)}
                    aria-label="Selecionar nova categoria"
                    className="input-quantum py-1.5 text-xs flex-1 min-w-[160px]"
                  >
                    {categoryOptions.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => setBatchAction(null)} className="px-3 py-1.5 bg-quantum-bgSecondary border border-quantum-border rounded-lg text-xs text-quantum-fgMuted font-bold hover:text-quantum-fg">
                      Cancelar
                    </button>
                    <button
                      onClick={onApplyRecategorize}
                      disabled={isBulkUpdating || isUndoing || !hasOnBulkUpdate}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-quantum-gold text-quantum-bg rounded-lg text-xs font-black hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {(isBulkUpdating || isUndoing)
                        ? <><span className="w-3.5 h-3.5 border-2 border-quantum-bg/40 border-t-quantum-bg rounded-full animate-spin inline-block" /> A processar...</>
                        : <><Check className="w-3.5 h-3.5" /> Aplicar</>
                      }
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
