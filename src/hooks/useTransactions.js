// src/hooks/useTransactions.js
import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot, doc, deleteDoc, updateDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { generateTransactionHash } from '../utils/hashGenerator';

export function useTransactions(uid, month, year) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) {
      setTransactions([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    const q = query(
      collection(db, 'users', uid, 'transactions'),
      where('createdAt', '>=', startDate),
      where('createdAt', '<=', endDate),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const txs = snapshot.docs.map(doc => {
        const data = doc.data();
        const dataNativa = data.createdAt && typeof data.createdAt.toDate === 'function' 
          ? data.createdAt.toDate() 
          : new Date(data.createdAt || Date.now());

        return {
          id: doc.id,
          ...data,
          createdAt: dataNativa 
        };
      });
      
      setTransactions(txs);
      setLoading(false);
    }, (error) => {
      console.error("Erro ao buscar transações:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [uid, month, year]);

  const add = async (data) => {
    const dataTransacao = data.date ? new Date(`${data.date}T12:00:00`) : new Date();
    const hashUnico = generateTransactionHash(data);

    await setDoc(doc(db, 'users', uid, 'transactions', hashUnico), {
      ...data,
      uniqueHash: hashUnico,
      createdAt: dataTransacao,
      registadoEm: serverTimestamp()
    }, { merge: true });
  };

  const remove = async (id) => {
    await deleteDoc(doc(db, 'users', uid, 'transactions', id));
  };

  const update = async (id, data) => {
    const dataTransacao = data.date ? new Date(`${data.date}T12:00:00`) : new Date();
    
    // 🧠 A MÁGICA DA EDIÇÃO INTELIGENTE
    // Recalculamos o Hash para ver se o utilizador alterou campos sensíveis
    const novoHash = generateTransactionHash(data);

    if (novoHash !== id) {
      // 1. O Hash mudou! Criamos um NOVO documento com o novo Hash
      await setDoc(doc(db, 'users', uid, 'transactions', novoHash), {
        ...data,
        uniqueHash: novoHash,
        createdAt: dataTransacao,
        atualizadoEm: serverTimestamp()
      }, { merge: true });

      // 2. Apagamos o documento antigo silenciosamente
      await deleteDoc(doc(db, 'users', uid, 'transactions', id));
    } else {
      // O Hash é o mesmo (alterou apenas a categoria). Atualizamos normalmente.
      await updateDoc(doc(db, 'users', uid, 'transactions', id), {
        ...data,
        createdAt: dataTransacao,
        atualizadoEm: serverTimestamp()
      });
    }
  };

  return { transactions, loading, add, remove, update };
}