import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  collection, query, orderBy, onSnapshot,
  addDoc, deleteDoc, updateDoc, doc,
  serverTimestamp,
  type Timestamp,
} from 'firebase/firestore';
import { db } from '../shared/api/firebase/index';
import type { Transaction } from '../shared/types/transaction';
import { absCentavos, addCentavos, fromCentavos, toCentavos, type Centavos } from '../shared/types/money';
import { isExpense as checkExpense } from '../utils/transactionUtils';

// ─── Public Types ─────────────────────────────────────────────────────────────

export interface Budget {
  id:                string;
  category:          string;
  targetAmount:      number;
  targetAmountCents: Centavos;
  period:            'monthly';
  month:             string; // YYYY-MM
  createdAt:         number;
}

export interface BudgetInsight extends Budget {
  spent:               number;
  spentCents:          Centavos;
  remaining:           number;
  remainingCents:      Centavos;
  progress:            number; // clamped [0, 1] — never NaN, never > 1
  projectedSpend:      number;
  projectedSpendCents: Centavos;
  status:              'success' | 'warning' | 'danger';
}

export type BudgetWriteData = Omit<Budget, 'id' | 'createdAt' | 'targetAmountCents'>;

export interface UseBudgetsReturn {
  budgets:      Budget[];
  insights:     BudgetInsight[];
  loading:      boolean;
  addBudget:    (data: BudgetWriteData) => Promise<void>;
  removeBudget: (id: string) => Promise<void>;
  updateBudget: (id: string, data: Partial<BudgetWriteData>) => Promise<void>;
}

// ─── Module-level helpers (pure, deterministic) ───────────────────────────────

export function currentMonthStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function normCat(cat: string | undefined): string {
  return (cat ?? '').trim().toLowerCase();
}

/** Project current-month spend to end-of-month. Returns spent as-is for past months. */
function calcProjected(spent: number, month: string): number {
  if (month !== currentMonthStr()) return spent;
  const now         = new Date();
  const dayOfMonth  = now.getDate();
  if (dayOfMonth <= 0) return spent; // defensive: should never happen
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return (spent / dayOfMonth) * daysInMonth;
}

/** Deterministic status: danger ≥ 100%, warning ≥ 80%, success < 80%.
 *  Projected spend is also factored in so warnings appear early in the month. */
function calcStatus(progress: number, projProgress: number): BudgetInsight['status'] {
  if (progress >= 1.0 || projProgress >= 1.0) return 'danger';
  if (progress >= 0.8 || projProgress >= 0.8) return 'warning';
  return 'success';
}

const STATUS_RANK: Record<BudgetInsight['status'], number> = { danger: 0, warning: 1, success: 2 };

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useBudgets(uid: string, transactions: Transaction[]): UseBudgetsReturn {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) { setLoading(false); return; }

    const col   = collection(db, 'users', uid, 'budgets');
    const q     = query(col, orderBy('createdAt', 'desc'));

    const unsub = onSnapshot(
      q,
      snap => {
        setBudgets(snap.docs.map(d => {
          const r  = d.data();
          const ts = r['createdAt'] as number | Timestamp | undefined;
          return {
            id:           d.id,
            category:     String(r['category'] ?? ''),
            targetAmountCents: typeof r['targetAmount'] === 'number' && Number.isSafeInteger(r['targetAmount'])
              ? r['targetAmount'] as Centavos
              : 0 as Centavos,
            targetAmount: typeof r['targetAmount'] === 'number' && Number.isSafeInteger(r['targetAmount'])
              ? fromCentavos(r['targetAmount'])
              : 0,
            period:       'monthly' as const,
            month:        String(r['month'] ?? currentMonthStr()),
            createdAt:    typeof ts === 'number'
              ? ts
              : (ts as Timestamp | undefined)?.toMillis?.() ?? Date.now(),
          };
        }));
        setLoading(false);
      },
      () => setLoading(false), // silent error — keep previous state
    );

    return unsub;
  }, [uid]);

  // ── Compute insights (pure derivation — no extra Firestore calls) ─────────
  const insights = useMemo<BudgetInsight[]>(() => {
    return budgets
      .map(budget => {
        const normKey = normCat(budget.category);

        // Sum expenses matching category + month (case-insensitive category)
        const spentCents = transactions.reduce((sum, tx) => {
          const isExpense = checkExpense(tx.type);
          const txMonth   = (tx.date ?? '').slice(0, 7);
          if (!isExpense || txMonth !== budget.month || normCat(tx.category) !== normKey) return sum;
          if (tx.value_cents === undefined) return sum;
          return addCentavos(sum, absCentavos(tx.value_cents));
        }, 0 as Centavos);
        const spent = fromCentavos(spentCents);

        // Zero-division guard: if targetAmount is 0, treat as 1 for ratio calc only
        const safeTarget     = budget.targetAmountCents > 0 ? budget.targetAmountCents : 1;
        const progress       = Math.min(Math.max(spentCents / safeTarget, 0), 1);
        const projected      = calcProjected(spent, budget.month);
        const projectedCents = toCentavos(projected);
        const projProgress   = Math.min(Math.max(projectedCents / safeTarget, 0), 1);
        const remainingCents = addCentavos(budget.targetAmountCents, -spentCents);

        return {
          ...budget,
          spent,
          spentCents,
          remaining:      fromCentavos(remainingCents),
          remainingCents,
          progress,
          projectedSpend: projected,
          projectedSpendCents: projectedCents,
          status:         calcStatus(progress, projProgress),
        };
      })
      // Deterministic sort: severity DESC (danger first), then progress DESC within tier
      .sort((a, b) => {
        const tier = STATUS_RANK[a.status] - STATUS_RANK[b.status];
        return tier !== 0 ? tier : b.progress - a.progress;
      });
  }, [budgets, transactions]);

  // ── CRUD ──────────────────────────────────────────────────────────────────
  const addBudget = useCallback(async (data: BudgetWriteData) => {
    if (!uid) return;
    await addDoc(collection(db, 'users', uid, 'budgets'), {
      ...data,
      targetAmount: toCentavos(data.targetAmount),
      schemaVersion: 2,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }, [uid]);

  const removeBudget = useCallback(async (id: string) => {
    if (!uid) return;
    await deleteDoc(doc(db, 'users', uid, 'budgets', id));
  }, [uid]);

  const updateBudget = useCallback(async (id: string, data: Partial<BudgetWriteData>) => {
    if (!uid) return;
    const payload: Record<string, unknown> = { ...data, updatedAt: serverTimestamp() };
    if (data.targetAmount !== undefined) payload['targetAmount'] = toCentavos(data.targetAmount);
    await updateDoc(doc(db, 'users', uid, 'budgets', id), payload);
  }, [uid]);

  return { budgets, insights, loading, addBudget, removeBudget, updateBudget };
}
