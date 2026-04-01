// src/hooks/useAccounts.js
import { useState, useEffect, useCallback } from "react";
import { 
  collection, query, onSnapshot, addDoc, deleteDoc, doc, updateDoc, serverTimestamp 
} from "firebase/firestore";
// ✅ CORREÇÃO: Apontando para a nova morada do Firebase
import { db } from "../shared/api/firebase/index.js"; 

export function useAccounts(uid) {
  const [accounts, setAccounts] = useState([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);

  useEffect(() => {
    if (!uid) {
      setAccounts([]);
      setLoadingAccounts(false);
      return;
    }

    setLoadingAccounts(true);
    const accountsRef = collection(db, "users", uid, "accounts");
    const q = query(accountsRef);

    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        const data = snapshot.docs.map(doc => ({
          ...doc.data(),
          id: doc.id 
        }));
        
        data.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        
        setAccounts(data);
        setLoadingAccounts(false);
      }, 
      (err) => {
        console.error("❌ Erro ao ler contas:", err);
        setLoadingAccounts(false);
      }
    );

    return () => unsubscribe();
  }, [uid]);

  const addAccount = useCallback(async (accountData) => {
    if (!uid) throw new Error("Utilizador não autenticado.");
    try {
      const accountsRef = collection(db, "users", uid, "accounts");
      const docRef = await addDoc(accountsRef, {
        ...accountData,
        balance: Number(accountData.balance) || 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp() 
      });
      return docRef.id;
    } catch (err) {
      console.error("❌ Falha ao adicionar conta:", err);
      throw err;
    }
  }, [uid]);

  const updateAccount = useCallback(async (id, data) => {
    if (!uid || !id) return;
    try {
      const docRef = doc(db, "users", uid, "accounts", id);
      await updateDoc(docRef, {
        ...data,
        updatedAt: serverTimestamp() 
      });
    } catch (err) {
      console.error(`❌ Falha ao atualizar conta ${id}:`, err);
      throw err;
    }
  }, [uid]);

  const removeAccount = useCallback(async (id) => {
    if (!uid || !id) return;
    try {
      const docRef = doc(db, "users", uid, "accounts", id);
      await deleteDoc(docRef);
    } catch (err) {
      console.error(`❌ Falha ao remover conta:`, err);
      throw err;
    }
  }, [uid]);

  return { accounts, loadingAccounts, addAccount, updateAccount, removeAccount };
}