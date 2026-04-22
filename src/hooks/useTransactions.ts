import { useState, useEffect, useCallback } from 'react';
import { FirestoreService } from '../shared/services/FirestoreService';
import type { Transaction } from '../shared/types/transaction';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface UseTransactionsReturn {
  transactions: Transaction[];
  loading:      boolean;
  error:        Error | null;
  add:          (data: Partial<Transaction>) => Promise<string>;
  remove:       (id: string) => Promise<void>;
  removeBatch:  (ids: string[]) => Promise<void>;
  update:       (id: string, data: Partial<Transaction>) => Promise<void>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useTransactions(uid: string): UseTransactionsReturn {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<Error | null>(null);

  // ── Fetch inicial ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!uid) {
      setTransactions([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    FirestoreService.getTransactions(uid)
      .then(txs => {
        setTransactions(txs);
        setLoading(false);
      })
      .catch((err: unknown) => {
        const e = err instanceof Error ? err : new Error(String(err));
        console.error('[Firestore][getTransactions] error:', e.message);
        setError(e);
        setLoading(false);
      });
  }, [uid]);

  // ── ADD — Optimistic UI ───────────────────────────────────────────────────
  const add = useCallback(async (data: Partial<Transaction>): Promise<string> => {
    if (!uid) throw new Error('[useTransactions][add] UID ausente.');

    const tempId: string = `__temp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const optimistic: Transaction = {
      description: '',
      value:       0,
      type:        'saida',
      category:    'Outros',
      date:        new Date().toISOString().slice(0, 10),
      ...data,
      id:        tempId,
      uid,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // Passo 1 — actualiza UI imediatamente
    setTransactions(prev => [optimistic, ...prev]);

    try {
      // Passo 2 — persiste no Firestore
      const realId = await FirestoreService.addTransaction(uid, data);

      // Substitui ID temporário pelo ID real
      setTransactions(prev =>
        prev.map(tx => (tx.id === tempId ? { ...tx, id: realId } : tx))
      );
      return realId;
    } catch (err) {
      // Passo 3 — rollback
      const e = err instanceof Error ? err : new Error(String(err));
      console.error('[Firestore][add] error:', e.message);
      setTransactions(prev => prev.filter(tx => tx.id !== tempId));
      throw e;
    }
  }, [uid]);

  // ── UPDATE — Optimistic UI ────────────────────────────────────────────────
  const update = useCallback(async (id: string, data: Partial<Transaction>): Promise<void> => {
    if (!uid || !id) throw new Error('[useTransactions][update] UID ou ID ausente.');

    // Guarda snapshot anterior para rollback
    let previous: Transaction | undefined;
    setTransactions(prev => {
      previous = prev.find(tx => tx.id === id);
      return prev.map(tx =>
        tx.id === id ? { ...tx, ...data, updatedAt: Date.now() } : tx
      );
    });

    try {
      await FirestoreService.updateTransaction(uid, id, data);
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      console.error('[Firestore][update] error:', e.message);
      // Rollback para o estado anterior
      if (previous) {
        setTransactions(prev =>
          prev.map(tx => (tx.id === id ? previous! : tx))
        );
      }
      throw e;
    }
  }, [uid]);

  // ── REMOVE — Optimistic UI ────────────────────────────────────────────────
  const remove = useCallback(async (id: string): Promise<void> => {
    if (!uid || !id) throw new Error('[useTransactions][remove] UID ou ID ausente.');

    let removed: Transaction | undefined;
    setTransactions(prev => {
      removed = prev.find(tx => tx.id === id);
      return prev.filter(tx => tx.id !== id);
    });

    try {
      await FirestoreService.deleteTransaction(uid, id);
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      console.error('[Firestore][remove] error:', e.message);
      // Rollback — restaura a transação eliminada
      if (removed) {
        setTransactions(prev => [removed!, ...prev]);
      }
      throw e;
    }
  }, [uid]);

  // ── REMOVE BATCH — Optimistic UI ──────────────────────────────────────────
  const removeBatch = useCallback(async (ids: string[]): Promise<void> => {
    if (!uid || !ids.length) return;

    const idSet = new Set(ids);
    let removedBatch: Transaction[] = [];

    setTransactions(prev => {
      removedBatch = prev.filter(tx => idSet.has(tx.id));
      return prev.filter(tx => !idSet.has(tx.id));
    });

    try {
      await FirestoreService.deleteBatchTransactions(uid, ids);
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      console.error('[Firestore][removeBatch] error:', e.message);
      // Rollback — restaura todas as transações eliminadas
      setTransactions(prev => [...removedBatch, ...prev]);
      throw e;
    }
  }, [uid]);

  return { transactions, loading, error, add, remove, removeBatch, update };
}
