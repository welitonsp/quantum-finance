import { useState, useEffect, useCallback } from 'react';
import { collection, query, where, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../shared/api/firebase/index';
import { FirestoreService } from '../shared/services/FirestoreService';
import type { Transaction } from '../shared/types/transaction';

const QUERY_LIMIT = 3000;

interface UseTransactionsReturn {
  transactions: Transaction[];
  loading: boolean;
  error: Error | null;
  add: (data: Partial<Transaction>) => Promise<string>;
  remove: (id: string) => Promise<void>;
  removeBatch: (ids: string[]) => Promise<void>;
  update: (id: string, data: Partial<Transaction>) => Promise<void>;
}

export function useTransactions(uid: string): UseTransactionsReturn {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<Error | null>(null);

  useEffect(() => {
    if (!uid) {
      setTransactions([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    const q = query(
      collection(db, 'transactions'),
      where('uid', '==', uid),
      limit(QUERY_LIMIT)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const txs: Transaction[] = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...(doc.data() as Omit<Transaction, 'id'>),
        }));

        txs.sort((a, b) => {
          const timeA = (a.createdAt as { seconds?: number } | null)?.seconds
            ?? (typeof a.createdAt === 'number' ? a.createdAt : 0);
          const timeB = (b.createdAt as { seconds?: number } | null)?.seconds
            ?? (typeof b.createdAt === 'number' ? b.createdAt : 0);
          return timeB - timeA;
        });

        setTransactions(txs);
        setLoading(false);
      },
      (err) => {
        console.error('Aviso Firebase / Falha de Leitura:', err.message);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [uid]);

  const add = useCallback(async (data: Partial<Transaction>) => {
    return await FirestoreService.saveTransaction(uid, data);
  }, [uid]);

  const remove = useCallback(async (id: string) => {
    return await FirestoreService.deleteTransaction(id);
  }, []);

  const removeBatch = useCallback(async (ids: string[]) => {
    return await FirestoreService.deleteBatchTransactions(ids);
  }, []);

  const update = useCallback(async (id: string, data: Partial<Transaction>) => {
    return await FirestoreService.updateTransaction(id, data);
  }, []);

  return { transactions, loading, error, add, remove, removeBatch, update };
}
