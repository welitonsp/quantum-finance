import { useState, useEffect, useCallback } from 'react';
import { doc, updateDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../shared/api/firebase/index';
import { toCentavos, fromCentavos } from '../shared/schemas/financialSchemas';
import { FirestoreService } from '../shared/services/FirestoreService';
import type { RecurringTask } from '../shared/types/transaction';

interface UseRecurringReturn {
  recurringTasks: RecurringTask[];
  loading: boolean;
  error: string | null;
  addRecurring: (data: Omit<RecurringTask, 'id'>) => Promise<string | undefined>;
  updateRecurring: (id: string, data: Partial<RecurringTask>) => Promise<void>;
  removeRecurring: (id: string) => Promise<void>;
}

export function useRecurring(uid: string): UseRecurringReturn {
  const [recurringTasks, setRecurringTasks] = useState<RecurringTask[]>([]);
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState<string | null>(null);

  useEffect(() => {
    if (!uid) { setRecurringTasks([]); setLoading(false); return; }

    setLoading(true);
    const colRef = FirestoreService.getRecurringCollection(uid);

    const unsubscribe = onSnapshot(colRef,
      (snapshot) => {
        const data: RecurringTask[] = snapshot.docs.map(docSnap => ({
          ...(docSnap.data() as Omit<RecurringTask, 'id' | 'value'>),
          value: docSnap.data()['value'] !== undefined ? fromCentavos(docSnap.data()['value'] as number) : 0,
          id: docSnap.id
        }));
        setRecurringTasks(data);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error('❌ Erro no Radar de Recorrentes:', err);
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [uid]);

  const addRecurring = useCallback(async (data: Omit<RecurringTask, 'id'>) => {
    if (!uid) return;
    const finalData = { ...data, value: toCentavos(data.value) };
    return await FirestoreService.addRecurringTask(uid, finalData as Record<string, unknown>);
  }, [uid]);

  const updateRecurring = useCallback(async (id: string, data: Partial<RecurringTask>): Promise<void> => {
    if (!uid || !id) return;
    const finalData: Record<string, unknown> = { ...data };
    if (data.value !== undefined) finalData['value'] = toCentavos(data.value);
    const docRef = doc(db, 'users', uid, 'recurringTasks', id);
    await updateDoc(docRef, finalData);
  }, [uid]);

  const removeRecurring = useCallback(async (id: string) => {
    if (!uid || !id) return;
    return await FirestoreService.deleteRecurringTask(uid, id);
  }, [uid]);

  return { recurringTasks, loading, error, addRecurring, updateRecurring, removeRecurring };
}
