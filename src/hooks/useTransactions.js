// src/hooks/useTransactions.js
import { useState, useEffect } from "react";
import { collection, query, where, onSnapshot, addDoc, deleteDoc, doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase"; 

export function useTransactions(uid) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) return;

    // Busca segura apenas pelo UID. Isso evita bugs de "Invalid Date"
    const q = query(
      collection(db, "transactions"),
      where("uid", "==", uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Ordenação Quântica em Memória: 
      // Mais rápido e mais seguro do que forçar o Firebase a criar índices.
      data.sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
        return dateB - dateA; // Decrescente (do mais recente para o mais antigo)
      });

      setTransactions(data);
      setLoading(false);
    }, (error) => {
      console.error("Erro Crítico no motor do Firebase:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [uid]);

  const add = async (transaction) => {
    await addDoc(collection(db, "transactions"), {
      ...transaction,
      uid
    });
  };

  const remove = async (id) => {
    await deleteDoc(doc(db, "transactions", id));
  };

  const update = async (id, data) => {
    await updateDoc(doc(db, "transactions", id), data);
  };

  return { transactions, loading, add, remove, update };
}