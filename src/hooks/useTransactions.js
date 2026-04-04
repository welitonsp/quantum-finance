// src/hooks/useTransactions.js
import { useState, useEffect, useCallback } from "react";
import { collection, query, onSnapshot, orderBy, limit } from "firebase/firestore";
import { db } from "../shared/api/firebase/index"; 
import { FirestoreService } from "../shared/services/FirestoreService"; 
import { fromCentavos } from "../shared/schemas/financialSchemas"; 

export function useTransactions(uid) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!uid) {
      setTransactions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    // ✅ TETO DE SEGURANÇA: limit(300) impede leituras infinitas e gastos desnecessários!
    const q = query(
      collection(db, "users", uid, "transactions"), 
      orderBy("createdAt", "desc"),
      limit(300) 
    );

    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        const data = snapshot.docs.map(docSnap => {
          const raw = docSnap.data();
          return {
            ...raw,
            // Converte os centavos do banco para o formato visual
            value: raw.value !== undefined ? fromCentavos(raw.value) : 0, 
            id: docSnap.id
          };
        });
        setTransactions(data);
        setLoading(false);
      }, 
      (err) => {
        console.error("❌ Erro no listener:", err);
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [uid]);
  
  const add = useCallback(async (transactionData) => {
    return await FirestoreService.addTransaction(uid, transactionData);
  }, [uid]);

  const update = useCallback(async (id, data) => {
    if (!uid || !id) return;
    return await FirestoreService.updateTransaction(uid, id, data);
  }, [uid]);

  const remove = useCallback(async (id) => {
    if (!uid || !id) return;
    return await FirestoreService.deleteTransaction(uid, id);
  }, [uid]);

  // ✅ ATUALIZADO: Agora usa o Lote Atômico Real do FirestoreService
  const removeBatch = useCallback(async (ids) => {
    if (!uid || !Array.isArray(ids) || ids.length === 0) return;
    return await FirestoreService.deleteTransactionsBatch(uid, ids);
  }, [uid]);

  return { transactions, loading, error, add, update, remove, removeBatch };
}