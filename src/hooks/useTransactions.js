// src/hooks/useTransactions.js
import { useState, useEffect, useCallback } from "react";
import { query, onSnapshot, orderBy, limit } from "firebase/firestore";
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

    // ✅ TETO DE SEGURANÇA: limit(500) para performance e economia de leituras
    const q = query(
      FirestoreService.getTransactionsCollection(uid),
      orderBy("date", "desc"),
      limit(500)
    );

    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        const data = snapshot.docs.map(docSnap => {
          const raw = docSnap.data();
          return {
            ...raw,
            id: docSnap.id,
            // 🪙 CONVERSÃO: Centavos -> Decimal.js no Frontend
            value: raw.value !== undefined ? fromCentavos(raw.value) : 0,
            // Fallback de data para garantir ordenação visual
            displayDate: raw.date || raw.createdAt?.toDate()?.toISOString().split('T')[0]
          };
        });
        setTransactions(data);
        setLoading(false);
        setError(null);
      }, 
      (err) => {
        console.error("❌ Erro fatal no listener Firestore:", err);
        setError("Não foi possível sincronizar os dados. Verifique a sua ligação.");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [uid]);
  
  // Encapsulamento de métodos para simplicidade no componente
  const add = useCallback((data) => FirestoreService.addTransaction(uid, data), [uid]);
  const update = useCallback((id, data) => FirestoreService.updateTransaction(uid, id, data), [uid]);
  const remove = useCallback((id) => FirestoreService.deleteTransaction(uid, id), [uid]);
  const removeBatch = useCallback((ids) => FirestoreService.deleteTransactionsBatch(uid, ids), [uid]);

  return { transactions, loading, error, add, update, remove, removeBatch };
}