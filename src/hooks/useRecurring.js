// src/hooks/useRecurring.js
import { useState, useEffect, useCallback } from "react";
import { 
  collection, query, onSnapshot, addDoc, deleteDoc, doc, updateDoc, serverTimestamp 
} from "firebase/firestore";
import { db } from "../firebase"; 

export function useRecurring(uid) {
  const [recurring, setRecurring] = useState([]);
  const [loadingRecurring, setLoadingRecurring] = useState(true);

  // 1. LER DESPESAS RECORRENTES EM TEMPO REAL
  useEffect(() => {
    if (!uid) {
      setRecurring([]);
      setLoadingRecurring(false);
      return;
    }

    setLoadingRecurring(true);
    const recurringRef = collection(db, "users", uid, "recurring");
    const q = query(recurringRef);

    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        const data = snapshot.docs.map(doc => ({
          ...doc.data(),
          id: doc.id 
        }));
        
        // Ordenar as despesas ativas primeiro, depois por valor (maior para menor)
        data.sort((a, b) => {
          if (a.active === b.active) {
            return Number(b.value) - Number(a.value);
          }
          return a.active ? -1 : 1;
        });
        
        setRecurring(data);
        setLoadingRecurring(false);
      }, 
      (err) => {
        console.error("❌ Erro ao ler despesas recorrentes:", err);
        setLoadingRecurring(false);
      }
    );

    return () => unsubscribe();
  }, [uid]);

  // 2. ADICIONAR NOVA DESPESA FIXA
  const addRecurring = useCallback(async (data) => {
    if (!uid) throw new Error("Utilizador não autenticado.");
    try {
      const recurringRef = collection(db, "users", uid, "recurring");
      const docRef = await addDoc(recurringRef, {
        ...data,
        value: Number(data.value) || 0,
        active: true, // Por padrão, uma nova despesa fixa está ativa
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp() 
      });
      return docRef.id;
    } catch (err) {
      console.error("❌ Falha ao adicionar despesa recorrente:", err);
      throw err;
    }
  }, [uid]);

  // 3. ATUALIZAR (Ex: Ligar/Desligar uma assinatura)
  const updateRecurring = useCallback(async (id, data) => {
    if (!uid || !id) return;
    try {
      const docRef = doc(db, "users", uid, "recurring", id);
      await updateDoc(docRef, {
        ...data,
        updatedAt: serverTimestamp() 
      });
    } catch (err) {
      console.error(`❌ Falha ao atualizar despesa recorrente ${id}:`, err);
      throw err;
    }
  }, [uid]);

  // 4. APAGAR DESPESA FIXA
  const removeRecurring = useCallback(async (id) => {
    if (!uid || !id) return;
    try {
      const docRef = doc(db, "users", uid, "recurring", id);
      await deleteDoc(docRef);
    } catch (err) {
      console.error(`❌ Falha ao remover despesa recorrente:`, err);
      throw err;
    }
  }, [uid]);

  return { recurring, loadingRecurring, addRecurring, updateRecurring, removeRecurring };
}