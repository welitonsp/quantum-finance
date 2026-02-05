// src/hooks/useTransactions.js

import { useEffect, useState, useCallback } from "react";
import { onSnapshot, query, orderBy } from "firebase/firestore";
import { FirestoreService } from "../services/FirestoreService";

export function useTransactions(uid) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ➕ Add continua usando o service
  const add = useCallback(
    async (data) => {
      if (!uid) return;
      setError(null);
      try {
        await FirestoreService.addTransaction(uid, data);
        // ❌ não precisa reload — snapshot cuida disso
      } catch (err) {
        console.error(err);
        setError(err);
      }
    },
    [uid]
  );

  // ❌ Remove continua usando o service
  const remove = useCallback(
    async (id) => {
      if (!uid) return;
      setError(null);
      try {
        await FirestoreService.deleteTransaction(uid, id);
      } catch (err) {
        console.error(err);
        setError(err);
      }
    },
    [uid]
  );

  // 🔁 Listener em tempo real
  useEffect(() => {
    if (!uid) {
      setTransactions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const q = query(
      FirestoreService.getTransactionsCollection(uid),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setTransactions(data);
        setLoading(false);
      },
      (err) => {
        console.error(err);
        setError(err);
        setLoading(false);
      }
    );

    // 🔴 cleanup obrigatório
    return () => unsubscribe();
  }, [uid]);

  return {
    transactions,
    loading,
    error,
    add,
    remove,
  };
}
