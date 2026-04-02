// src/hooks/useTransactions.js
import { useState, useEffect, useCallback } from "react";
import { collection, query, onSnapshot, orderBy } from "firebase/firestore";
import { db } from "../shared/api/firebase/index"; 
import { FirestoreService } from "../shared/services/FirestoreService"; 
import { fromCentavos } from "../shared/schemas/financialSchemas"; 

export function useTransactions(uid) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // 1. O MOTOR DE LEITURA (Descodifica Centavos para a Tela)
  useEffect(() => {
    if (!uid) {
      setTransactions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const q = query(collection(db, "users", uid, "transactions"), orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        const data = snapshot.docs.map(docSnap => {
          const raw = docSnap.data();
          return {
            ...raw,
            // Converte os centavos do banco para o formato visual (ex: 5000 -> 50.00)
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

  // 2. FUNÇÕES DE ESCRITA (Roteadas para o Serviço de Auditoria)
  
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

  const removeBatch = useCallback(async (ids) => {
    if (!uid || !Array.isArray(ids) || ids.length === 0) return;
    // Apaga em lote passando pela auditoria
    for (const id of ids) {
      await FirestoreService.deleteTransaction(uid, id);
    }
  }, [uid]);

  // ✅ Agora todas as funções que a UI precisa estão de volta!
  return { transactions, loading, error, add, update, remove, removeBatch };
}