// src/hooks/useAccounts.js
import { useState, useEffect, useCallback } from "react";
import { 
  collection, query, onSnapshot, addDoc, deleteDoc, doc, updateDoc, serverTimestamp 
} from "firebase/firestore";
import { db } from "../firebase"; 

export function useAccounts(uid) {
  const [accounts, setAccounts] = useState([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);

  // 1. LER CONTAS EM TEMPO REAL
  useEffect(() => {
    if (!uid) {
      setAccounts([]);
      setLoadingAccounts(false);
      return;
    }

    setLoadingAccounts(true);
    const accountsRef = collection(db, "users", uid, "accounts");
    // Aqui não precisamos de ordenar por data, a ordem padrão ou por nome serve
    const q = query(accountsRef);

    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        const data = snapshot.docs.map(doc => ({
          ...doc.data(),
          id: doc.id 
        }));
        
        // Ordenar alfabeticamente pelo nome da conta
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

  // 2. ADICIONAR NOVA CONTA
  const addAccount = useCallback(async (accountData) => {
    if (!uid) throw new Error("Utilizador não autenticado.");
    try {
      const accountsRef = collection(db, "users", uid, "accounts");
      const docRef = await addDoc(accountsRef, {
        ...accountData,
        // Tipos possíveis: 'corrente', 'poupanca', 'investimento', 'cartao', 'divida'
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

  // 3. ATUALIZAR CONTA (Ex: Mudar o saldo manualmente)
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

  // 4. APAGAR CONTA
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