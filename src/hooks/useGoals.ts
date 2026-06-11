// src/hooks/useGoals.ts
// CRUD de metas de poupança em users/{uid}/goals
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  collection, query, orderBy, onSnapshot,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp,
} from 'firebase/firestore';
import Decimal from 'decimal.js';
import { db } from '../shared/api/firebase/index';
import { logSanitizedFirebaseError } from '../shared/lib/firebaseErrorHandling';
import type { SavingsGoal } from '../shared/types/transaction';
import type { Centavos } from '../shared/types/money';

export type GoalCreateInput = Omit<SavingsGoal, 'id' | 'createdAt' | 'updatedAt'>;
export type GoalUpdateInput = Partial<GoalCreateInput>;

/** SavingsGoal enriquecida com campos computados derivados. */
export interface EnrichedGoal extends SavingsGoal {
  /** Contribuição mensal necessária para atingir a meta até targetDate (centavos inteiros). 0 se sem prazo ou prazo expirado. */
  monthlyContributionNeeded: Centavos;
  /** Dias restantes até o prazo. null se sem prazo. Negativo se expirado. */
  daysRemaining: number | null;
}

interface UseGoalsReturn {
  goals:      EnrichedGoal[];
  loading:    boolean;
  addGoal:    (data: GoalCreateInput) => Promise<string>;
  updateGoal: (id: string, data: GoalUpdateInput) => Promise<void>;
  removeGoal: (id: string) => Promise<void>;
  /** Atualiza currentCents de uma meta (ex: após cálculo de saldo). */
  setProgress:(id: string, currentCents: Centavos) => Promise<void>;
}

/** Pure function: compute derived fields for a single goal. Exported for testing. */
export function enrichGoal(goal: SavingsGoal, todayMs: number = Date.now()): EnrichedGoal {
  let daysRemaining: number | null = null;
  let monthlyContributionNeeded: Centavos = 0 as Centavos;

  if (goal.deadline) {
    const deadlineMs = new Date(goal.deadline).getTime();
    const diffMs     = deadlineMs - todayMs;
    daysRemaining    = Math.ceil(diffMs / 86_400_000);

    const shortfallCents = new Decimal(goal.targetCents).minus(goal.currentCents);
    if (shortfallCents.greaterThan(0) && daysRemaining > 0) {
      // months remaining = days / 30.4375 (average Gregorian month)
      const monthsLeft = new Decimal(daysRemaining).div('30.4375');
      if (monthsLeft.greaterThan(0)) {
        const perMonth = shortfallCents.div(monthsLeft).toDecimalPlaces(0, Decimal.ROUND_CEIL);
        monthlyContributionNeeded = perMonth.toNumber() as Centavos;
      }
    }
  }

  return { ...goal, daysRemaining, monthlyContributionNeeded };
}

export function useGoals(uid: string): UseGoalsReturn {
  const [rawGoals, setRawGoals] = useState<SavingsGoal[]>([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    if (!uid) { setRawGoals([]); setLoading(false); return; }
    setLoading(true);

    const ref = collection(db, 'users', uid, 'goals');
    const q   = query(ref, orderBy('createdAt', 'asc'));

    const unsub = onSnapshot(
      q,
      snap => {
        setRawGoals(snap.docs.map(d => ({
          ...(d.data() as Omit<SavingsGoal, 'id'>),
          id: d.id,
        })));
        setLoading(false);
      },
      err => { logSanitizedFirebaseError('goals_load', err); setLoading(false); },
    );
    return () => unsub();
  }, [uid]);

  const goals = useMemo<EnrichedGoal[]>(
    () => rawGoals.map(g => enrichGoal(g)),
    [rawGoals],
  );

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

