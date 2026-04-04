import { useState, useCallback } from 'react';
import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../shared/api/firebase/index.js';
import { toCentavos, fromCentavos } from '../shared/schemas/financialSchemas';

export function useRecurring(uid) {
  const [recurringTasks, setRecurringTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchRecurring = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    try {
      const q = query(collection(db, 'recurring'), where('userId', '==', uid));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({
        ...doc.data(),
        value: fromCentavos(doc.data().value || 0),
        id: doc.id
      }));
      setRecurringTasks(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [uid]);

  const addRecurring = async (data) => {
    if (!uid) return;
    try {
      const finalData = {
        ...data,
        userId: uid,
        value: toCentavos(data.value),
        createdAt: new Date().toISOString()
      };
      await addDoc(collection(db, 'recurring'), finalData);
      await fetchRecurring();
    } catch (err) {
      throw err;
    }
  };

  const updateRecurring = async (id, data) => {
    try {
      const finalData = {
        ...data,
        value: toCentavos(data.value)
      };
      const docRef = doc(db, 'recurring', id);
      await updateDoc(docRef, finalData);
      await fetchRecurring();
    } catch (err) {
      throw err;
    }
  };

  const removeRecurring = async (id) => {
    try {
      await deleteDoc(doc(db, 'recurring', id));
      await fetchRecurring();
    } catch (err) {
      throw err;
    }
  };

  return {
    recurringTasks,
    loading,
    error,
    fetchRecurring,
    addRecurring,
    updateRecurring,
    removeRecurring
  };
}