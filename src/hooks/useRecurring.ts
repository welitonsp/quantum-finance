// src/hooks/useRecurring.ts
import { useState, useEffect, useCallback } from 'react';
import { query, where, onSnapshot } from 'firebase/firestore';
import { toCentavos, fromCentavos } from '../shared/schemas/financialSchemas';
import { FirestoreService } from '../shared/services/FirestoreService';

type AnyRecord = Record<string, unknown>;

interface RecurringTask extends AnyRecord {
  id: string;
  value?: number;
}

export function useRecurring(uid: string | null | undefined) {
  const [recurringTasks, setRecurringTasks] = useState<RecurringTask[]>([]);
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState<string | null>(null);

  useEffect(() => {
    if (!uid) {
      setRecurringTasks([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    // Filter by uid — getRecurringCollection() returns the global 'recurring' collection.
    const q = query(FirestoreService.getRecurringCollection(), where('uid', '==', uid));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data: RecurringTask[] = snapshot.docs.map(docSnap => ({
          ...docSnap.data(),
          value: docSnap.data()['value'] !== undefined
            ? fromCentavos(docSnap.data()['value'] as number)
            : 0,
          id: docSnap.id,
        }));
        setRecurringTasks(data);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error('Erro no Radar de Recorrentes:', err);
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [uid]);

  const addRecurring = useCallback(async (data: AnyRecord): Promise<string | undefined> => {
    if (!uid) return;
    const finalData = { ...data, value: toCentavos(data['value'] as string | number) };
    return await FirestoreService.saveRecurringTransaction(uid, finalData);
  }, [uid]);

  const updateRecurring = useCallback(async (id: string, data: AnyRecord): Promise<void> => {
    if (!uid || !id) return;
    const finalData: AnyRecord = { ...data };
    if (data['value'] !== undefined) {
      finalData['value'] = toCentavos(data['value'] as string | number);
    }
    await FirestoreService.updateRecurringTransaction(id, finalData);
  }, [uid]);

  const removeRecurring = useCallback(async (id: string): Promise<void> => {
    if (!uid || !id) return;
    await FirestoreService.deleteRecurringTransaction(id);
  }, [uid]);

  return { recurringTasks, loading, error, addRecurring, updateRecurring, removeRecurring };
}
