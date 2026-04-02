// src/hooks/useTransactions.js
import { useState, useEffect, useCallback } from "react";
import { collection, query, onSnapshot, orderBy, writeBatch, doc } from "firebase/firestore";
import { db } from "../shared/api/firebase/index";
// ✅ INJEÇÃO: Serviços blindados e conversor de leitura
import { FirestoreService } from "../shared/services/FirestoreService";
import { fromCentavos } from "../shared/schemas/financialSchemas";

export function useTransactions(uid) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // 1. LEITURA COM DESCODIFICAÇÃO DE CENTAVOS
  useEffect(() => {
    if (!uid) {
      setTransactions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const transactionsRef = collection(db, "users", uid, "transactions");
    const q = query(transactionsRef, orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(q,
      (snapshot) => {
        const data = snapshot.docs.map(docSnap => {
          const docData = docSnap.data();
          return {
            ...docData,
            // ✅ CONVERSÃO INVERSA: Centavos -> Float para a Interface UI
            value: docData.value !== undefined ? fromCentavos(docData.value) : 0,
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

  // 2. ESCRITA ROTEADA PARA O SERVIÇO BLINDADO (COM ZOD)
  const add = useCallback(async (transactionData) => {
    if (!uid) throw new Error("Utilizador não autenticado.");
    // Agora passa pelo Zod e toCentavos automaticamente!
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
    if (!uid) throw new Error("Utilizador não autenticado.");
    if (!Array.isArray(ids) || ids.length === 0) return;

    const batch = writeBatch(db);
    ids.forEach(id => {
      const docRef = doc(db, "users", uid, "transactions", id);
      batch.delete(docRef);
    });

    try {
      await batch.commit();
    } catch (err) {
      console.error("❌ Falha no batch delete:", err);
      throw err;
    }
  }, [uid]);

  return { transactions, loading, error, add, remove, removeBatch, update };
}