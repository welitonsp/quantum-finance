// src/hooks/useTransactions.ts
import { useState, useEffect, useCallback } from 'react';
import { collection, query, where, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../shared/api/firebase/index.js';
import { FirestoreService } from '../shared/services/FirestoreService';

type AnyRecord = Record<string, unknown>;

interface FirestoreTimestamp { seconds: number; nanoseconds: number; }

interface Transaction extends AnyRecord {
  id: string;
  createdAt?: FirestoreTimestamp | number | string | null;
}

// Previne explosão de leitura no Firestore e poupa RAM.
//
// ⚠️ Sem orderBy(), o Firestore retorna documentos em ordem arbitrária.
// Se o utilizador tiver >3000 transações, registos recentes podem não ser
// incluídos. Ordenação local apenas ordena o que chegou — trade-off intencional
// para evitar índice composto pago (uid + createdAt).
const QUERY_LIMIT = 3000;

export function useTransactions(uid: string | null | undefined) {
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

    // Reseta ao trocar de utilizador — evita flash de dados da sessão anterior.
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
          ...doc.data(),
        }));

        // Ordenação local — evita índice composto pago no Firebase.
        // Suporta Timestamp do Firestore (.seconds) e Unix timestamp numérico.
        txs.sort((a, b) => {
          const ca = a.createdAt;
          const cb = b.createdAt;
          const timeA = (ca as FirestoreTimestamp | null)?.seconds ?? (typeof ca === 'number' ? ca : 0);
          const timeB = (cb as FirestoreTimestamp | null)?.seconds ?? (typeof cb === 'number' ? cb : 0);
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

  const add = useCallback(async (data: AnyRecord): Promise<string> => {
    return await FirestoreService.saveTransaction(uid!, data);
  }, [uid]);

  // remove, removeBatch e update não dependem de uid — deps vazia é intencional.
  const remove = useCallback(async (id: string): Promise<void> => {
    return await FirestoreService.deleteTransaction(id);
  }, []);

  const removeBatch = useCallback(async (ids: string[]): Promise<void> => {
    return await FirestoreService.deleteBatchTransactions(ids);
  }, []);

  const update = useCallback(async (id: string, data: AnyRecord): Promise<void> => {
    return await FirestoreService.updateTransaction(id, data);
  }, []);

  return { transactions, loading, error, add, remove, removeBatch, update };
}
