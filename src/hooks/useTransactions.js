import { useState, useEffect, useCallback } from 'react';
import { collection, query, where, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../shared/api/firebase/index.js';
import { FirestoreService } from '../shared/services/FirestoreService';

// ─── Limite tático ─────────────────────────────────────────────────────────────
// Previne explosão de leitura no Firestore e poupa RAM.
//
// ⚠️ AVISO: sem orderBy(), o Firestore retorna 3000 documentos em ordem
// arbitrária. Se o utilizador tiver >3000 transações, registos recentes
// podem não ser incluídos. A ordenação local apenas ordena o que chegou.
// Trade-off intencional para evitar índice composto pago (uid + createdAt).
// Reavalie se a base de utilizadores crescer além desse volume.
const QUERY_LIMIT = 3000;

export function useTransactions(uid) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!uid) {
      setTransactions([]);
      setLoading(false);
      setError(null);
      return;
    }

    // Reseta o estado ao trocar de utilizador — evita flash de dados antigos
    // ou erro de sessão anterior visível na nova sessão.
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
        const txs = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        // Ordenação local — evita índice composto pago no Firebase.
        // Suporta Timestamp do Firestore (.seconds) e Unix timestamp numérico.
        txs.sort((a, b) => {
          const timeA = a.createdAt?.seconds ?? (typeof a.createdAt === 'number' ? a.createdAt : 0);
          const timeB = b.createdAt?.seconds ?? (typeof b.createdAt === 'number' ? b.createdAt : 0);
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

    // Corta a ligação em tempo real ao desmontar ou ao trocar de uid
    return () => unsubscribe();
  }, [uid]);

  // useCallback impede que o React recrie estas funções a cada render,
  // evitando re-renders desnecessários nos componentes filhos que as recebem.

  const add = useCallback(async (data) => {
    return await FirestoreService.saveTransaction(uid, data);
  }, [uid]);

  // remove, removeBatch e update não dependem de uid — deps vazia é intencional.
  const remove = useCallback(async (id) => {
    return await FirestoreService.deleteTransaction(id);
  }, []);

  const removeBatch = useCallback(async (ids) => {
    return await FirestoreService.deleteBatchTransactions(ids);
  }, []);

  const update = useCallback(async (id, data) => {
    return await FirestoreService.updateTransaction(id, data);
  }, []);

  return { transactions, loading, error, add, remove, removeBatch, update };
}