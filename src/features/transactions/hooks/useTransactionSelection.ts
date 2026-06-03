// src/features/transactions/hooks/useTransactionSelection.ts
// Estado e callbacks de seleção em lote extraídos de TransactionsManager.
import { useState, useCallback } from 'react';
import type { Transaction } from '../../../shared/types/transaction';
import {
  isIncome as checkIncome,
  isExpense as checkExpense,
} from '../../../utils/transactionUtils';
import { ALLOWED_CATEGORIES } from '../../../shared/schemas/financialSchemas';

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useTransactionSelection(
  transactions: Transaction[],
  filtered:     Transaction[],
  categoryOptions: string[],
) {
  const [selected,      setSelected]      = useState<Set<string>>(new Set());
  const [batchAction,   setBatchAction]   = useState<'delete' | 'recategorize' | null>(null);
  const [newCat,        setNewCat]        = useState<string>(ALLOWED_CATEGORIES[0] ?? 'Outros');
  const [confirmDelete, setConfirmDelete] = useState(false);

  // categoryOptions: usado para inicializar newCat; sincronização feita no consumidor
  void categoryOptions;

  // ── Callbacks de seleção ──────────────────────────────────────────────────
  const toggleOne = useCallback((id: string) =>
    setSelected(s => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    }),
  []);

  const selectAll = useCallback(
    () => setSelected(new Set(filtered.map(t => t.id))),
    [filtered],
  );

  /** Limpa seleção + fecha painel de batch (ex: após ação ou clique em "Limpar"). */
  const clearSelected = useCallback(() => {
    setSelected(new Set());
    setBatchAction(null);
    setConfirmDelete(false);
  }, []);

  /** Fecha o painel de batch sem limpar os IDs selecionados (Escape). */
  const cancelBatch = useCallback(() => {
    setBatchAction(null);
    setConfirmDelete(false);
  }, []);

  const selectByType = useCallback(
    (type: 'entrada' | 'saida') => setSelected(new Set(
      filtered
        .filter(tx => type === 'entrada' ? checkIncome(tx.type) : checkExpense(tx.type))
        .map(t => t.id)
    )),
    [filtered],
  );

  const selectByCategory = useCallback(
    (cat: string) => setSelected(new Set(filtered.filter(tx => tx.category === cat).map(t => t.id))),
    [filtered],
  );

  const selectAllTransactions = useCallback(
    () => setSelected(new Set(transactions.map(t => t.id))),
    [transactions],
  );

  // ── Derivados ─────────────────────────────────────────────────────────────
  const allFilteredSelected     = filtered.length > 0 && filtered.every(t => selected.has(t.id));
  const allTransactionsSelected = transactions.length > 0 && transactions.every(t => selected.has(t.id));
  const someSelected            = selected.size > 0 && !allFilteredSelected;

  return {
    selected,      setSelected,
    batchAction,   setBatchAction,
    newCat,        setNewCat,
    confirmDelete, setConfirmDelete,
    toggleOne,
    selectAll,
    clearSelected,
    cancelBatch,
    selectByType,
    selectByCategory,
    selectAllTransactions,
    allFilteredSelected,
    allTransactionsSelected,
    someSelected,
  };
}
