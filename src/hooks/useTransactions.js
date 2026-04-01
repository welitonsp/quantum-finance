// src/hooks/useTransactions.js
import { useState, useEffect, useCallback } from "react";
import { 
  collection, query, onSnapshot, addDoc, deleteDoc, doc, updateDoc, orderBy, writeBatch, serverTimestamp 
} from "firebase/firestore";
// ✅ CORREÇÃO: Adicionado o /index
import { db } from "../shared/api/firebase/index"; 

export function useTransactions(uid) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // 1. O MOTOR DE LEITURA (Tempo Real)
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
        const data = snapshot.docs.map(doc => ({
          ...doc.data(), // 1. Primeiro trazemos os dados do PDF/CSV
          id: doc.id     // ✅ 2. O ID DO FIREBASE VEM POR ÚLTIMO (Assim nunca é sobrescrito!)
        }));
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

  // 2. FUNÇÕES DE ESCRITA 
  const add = useCallback(async (transactionData) => {
    if (!uid) throw new Error("Utilizador não autenticado.");
    try {
      const transactionsRef = collection(db, "users", uid, "transactions");
      const docRef = await addDoc(transactionsRef, {
        ...transactionData,
        createdAt: transactionData.createdAt || new Date().toISOString(),
        atualizadoEm: serverTimestamp() 
      });
      return docRef.id;
    } catch (err) {
      console.error("❌ Falha ao adicionar:", err);
      throw err;
    }
  }, [uid]);

  const remove = useCallback(async (id) => {
    if (!uid || !id) return;
    try {
      const docRef = doc(db, "users", uid, "transactions", id);
      await deleteDoc(docRef);
    } catch (err) {
      console.error(`❌ Falha ao remover transação:`, err);
      throw err;
    }
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
      console.log("✅ removeBatch: Operação concluída com sucesso!");
    } catch (err) {
      console.error("❌ Falha crítica no batch delete:", err);
      throw err;
    }
  }, [uid]);

  const update = useCallback(async (id, data) => {
    if (!uid || !id) return;
    try {
      const docRef = doc(db, "users", uid, "transactions", id);
      await updateDoc(docRef, {
        ...data,
        atualizadoEm: serverTimestamp() 
      });
    } catch (err) {
      console.error(`❌ Falha ao atualizar:`, err);
      throw err;
    }
  }, [uid]);

  return { transactions, loading, error, add, remove, removeBatch, update };
}