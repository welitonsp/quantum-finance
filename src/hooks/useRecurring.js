// src/hooks/useRecurring.js
import { useState, useEffect, useCallback } from "react";
import { 
  collection, query, onSnapshot, addDoc, deleteDoc, doc, updateDoc, serverTimestamp 
} from "firebase/firestore";
// ✅ CORREÇÃO: Apontando para a nova morada do Firebase
import { db } from "../shared/api/firebase/index.js"; 

export function useRecurring(uid) {
  const [recurring, setRecurring] = useState([]);
  const [loadingRecurring, setLoadingRecurring] = useState(true);

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

  const addRecurring = useCallback(async (data) => {
    if (!uid) throw new Error("Utilizador não autenticado.");
    try {
      const recurringRef = collection(db, "users", uid, "recurring");
      const docRef = await addDoc(recurringRef, {
        ...data,
        value: Number(data.value) || 0,
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp() 
      });
      return docRef.id;
    } catch (err) {
      console.error("❌ Falha ao adicionar despesa recorrente:", err);
      throw err;
    }
  }, [uid]);

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