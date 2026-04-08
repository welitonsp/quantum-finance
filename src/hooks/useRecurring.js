// src/hooks/useRecurring.js
import { useState, useEffect, useCallback } from 'react';
import { doc, updateDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../shared/api/firebase/index.js';
import { toCentavos, fromCentavos } from '../shared/schemas/financialSchemas';
import { FirestoreService } from '../shared/services/FirestoreService';

export function useRecurring(uid) {
  const [recurringTasks, setRecurringTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // 1. Radar em Tempo Real (Substitui o fetchRecurring manual)
  useEffect(() => {
    if (!uid) {
      setRecurringTasks([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    // Usa o cofre blindado do utilizador (users/{uid}/recurringTasks)
    const colRef = FirestoreService.getRecurringCollection(uid);

    const unsubscribe = onSnapshot(colRef,
      (snapshot) => {
        const data = snapshot.docs.map(docSnap => ({
          ...docSnap.data(),
          // Reverte de Centavos para Decimal no Frontend
          value: docSnap.data().value !== undefined ? fromCentavos(docSnap.data().value) : 0,
          id: docSnap.id
        }));
        setRecurringTasks(data);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error("❌ Erro no Radar de Recorrentes:", err);
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [uid]);

  // 2. Operações de Escrita (Ligadas ao FirestoreService)
  const addRecurring = useCallback(async (data) => {
    if (!uid) return;
    const finalData = { 
      ...data, 
      value: toCentavos(data.value) 
    };
    return await FirestoreService.addRecurringTask(uid, finalData);
  }, [uid]);

  const updateRecurring = useCallback(async (id, data) => {
    if (!uid || !id) return;
    const finalData = { ...data };
    if (data.value !== undefined) {
      finalData.value = toCentavos(data.value);
    }
    // Gravação direta na coleção isolada correta
    const docRef = doc(db, "users", uid, "recurringTasks", id);
    await updateDoc(docRef, finalData);
  }, [uid]);

  const removeRecurring = useCallback(async (id) => {
    if (!uid || !id) return;
    return await FirestoreService.deleteRecurringTask(uid, id);
  }, [uid]);

  // Mantemos exatamente o mesmo retorno para não quebrar a sua UI atual
  return {
    recurringTasks,
    loading,
    error,
    addRecurring,
    updateRecurring,
    removeRecurring
  };
}