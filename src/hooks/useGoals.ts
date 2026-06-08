// src/hooks/useGoals.ts
// CRUD de metas de poupança em users/{uid}/goals
import { useState, useEffect, useCallback } from 'react';
import {
  collection, query, orderBy, onSnapshot,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../shared/api/firebase/index';
import { logSanitizedFirebaseError } from '../shared/lib/firebaseErrorHandling';
import type { SavingsGoal } from '../shared/types/transaction';
import type { Centavos } from '../shared/types/money';

export type GoalCreateInput = Omit<SavingsGoal, 'id' | 'createdAt' | 'updatedAt'>;
export type GoalUpdateInput = Partial<GoalCreateInput>;

interface UseGoalsReturn {
  goals:      SavingsGoal[];
  loading:    boolean;
  addGoal:    (data: GoalCreateInput) => Promise<string>;
  updateGoal: (id: string, data: GoalUpdateInput) => Promise<void>;
  removeGoal: (id: string) => Promise<void>;
  /** Atualiza currentCents de uma meta (ex: após cálculo de saldo). */
  setProgress:(id: string, currentCents: Centavos) => Promise<void>;
}

export function useGoals(uid: string): UseGoalsReturn {
  const [goals,   setGoals]   = useState<SavingsGoal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) { setGoals([]); setLoading(false); return; }
    setLoading(true);

    const ref = collection(db, 'users', uid, 'goals');
    const q   = query(ref, orderBy('createdAt', 'asc'));

    const unsub = onSnapshot(
      q,
      snap => {
        setGoals(snap.docs.map(d => ({
          ...(d.data() as Omit<SavingsGoal, 'id'>),
          id: d.id,
        })));
        setLoading(false);
      },
      err => { logSanitizedFirebaseError('goals_load', err); setLoading(false); },
    );
    return () => unsub();
  }, [uid]);

  const addGoal = useCallback(async (data: GoalCreateInput): Promise<string> => {
    if (!uid) throw new Error('Utilizador não autenticado.');
    const ref = collection(db, 'users', uid, 'goals');
    const docRef = await addDoc(ref, {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  }, [uid]);

  const updateGoal = useCallback(async (id: string, data: GoalUpdateInput): Promise<void> => {
    if (!uid || !id) return;
    await updateDoc(doc(db, 'users', uid, 'goals', id), {
      ...data,
      updatedAt: serverTimestamp(),
    });
  }, [uid]);

  const removeGoal = useCallback(async (id: string): Promise<void> => {
    if (!uid || !id) return;
    await deleteDoc(doc(db, 'users', uid, 'goals', id));
  }, [uid]);

  const setProgress = useCallback(async (id: string, currentCents: Centavos): Promise<void> => {
    if (!uid || !id) return;
    await updateDoc(doc(db, 'users', uid, 'goals', id), {
      currentCents,
      updatedAt: serverTimestamp(),
    });
  }, [uid]);

  return { goals, loading, addGoal, updateGoal, removeGoal, setProgress };
}
