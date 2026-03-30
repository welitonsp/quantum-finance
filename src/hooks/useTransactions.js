// src/hooks/useTransactions.js
import { useState, useEffect } from "react";
import { collection, query, onSnapshot, addDoc, deleteDoc, doc, updateDoc, orderBy, writeBatch } from "firebase/firestore";
import { db } from "../firebase"; 

export function useTransactions(uid) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) return;

    const transactionsRef = collection(db, "users", uid, "transactions");
    const q = query(transactionsRef, orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setTransactions(data);
      setLoading(false);
    }, (error) => {
      console.error("Erro ao carregar transações:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [uid]);

  const add = async (transaction) => {
    if (!uid) return;
    const transactionsRef = collection(db, "users", uid, "transactions");
    await addDoc(transactionsRef, {
      ...transaction,
      createdAt: transaction.createdAt || new Date().toISOString()
    });
  };

  const remove = async (id) => {
    if (!uid) return;
    const docRef = doc(db, "users", uid, "transactions", id);
    await deleteDoc(docRef);
  };

  // ============================================================
  // EXCLUSÃO EM LOTE (CORRIGIDA COM LOGS E TRATAMENTO DE ERROS)
  // ============================================================
  const removeBatch = async (ids) => {
    // Validações iniciais
    if (!uid) {
      console.error("❌ removeBatch: uid não fornecido");
      throw new Error("Utilizador não autenticado.");
    }
    if (!ids || ids.length === 0) {
      console.warn("⚠️ removeBatch: lista de IDs vazia");
      return;
    }

    console.log(`🗑️ removeBatch: a apagar ${ids.length} documento(s)...`);
    console.log("📋 IDs recebidos:", ids);
    console.log("👤 UID:", uid);

    const batch = writeBatch(db);
    ids.forEach(id => {
      const docRef = doc(db, "users", uid, "transactions", id);
      console.log(`📍 Documento a apagar: ${docRef.path}`);
      batch.delete(docRef);
    });

    try {
      await batch.commit();
      console.log("✅ removeBatch: commit realizado com sucesso!");
    } catch (error) {
      console.error("❌ removeBatch: erro ao apagar:", error);
      throw new Error(`Falha no batch delete: ${error.message}`);
    }
  };

  const update = async (id, data) => {
    if (!uid) return;
    const docRef = doc(db, "users", uid, "transactions", id);
    await updateDoc(docRef, data);
  };

  return { transactions, loading, add, remove, removeBatch, update };
}