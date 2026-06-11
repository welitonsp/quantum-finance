import { useState, useEffect, useCallback } from 'react';
import {
  collection, query, orderBy, onSnapshot,
  writeBatch, doc, serverTimestamp,
  type Timestamp,
} from 'firebase/firestore';
import Decimal from 'decimal.js';
import { db } from '../shared/api/firebase/index';
import { logSanitizedFirebaseError } from '../shared/lib/firebaseErrorHandling';
import type { Centavos } from '../shared/types/money';

// ─── Public Types ─────────────────────────────────────────────────────────────

export type DebtCategory =
  | 'emprestimo'
  | 'financiamento'
  | 'cartao'
  | 'cheque_especial'
  | 'outro';

export interface Debt {
  id: string;
  uid: string;
  name: string;
  creditor: string;
  totalCents: Centavos;
  remainingCents: Centavos;
  interestRate: number;        // monthly rate, e.g. 0.0185 = 1.85% a.m.
  installments: number;        // total installments
  paidInstallments: number;
  dueDayOfMonth: number;       // day payment is due (1–31)
  startDate: string;           // YYYY-MM-DD
  category: DebtCategory;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export type DebtCreateDTO = Omit<Debt, 'id' | 'uid' | 'createdAt' | 'updatedAt'>;
export type DebtUpdateDTO = Partial<Omit<Debt, 'id' | 'uid' | 'createdAt'>>;

export interface UseDebtsReturn {
  debts:       Debt[];
  loading:     boolean;
  addDebt:     (data: DebtCreateDTO) => Promise<string>;
  updateDebt:  (id: string, data: DebtUpdateDTO) => Promise<void>;
  deleteDebt:  (id: string) => Promise<void>;
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function tsToIso(ts: unknown): string {
  if (typeof ts === 'string') return ts;
  if (ts && typeof ts === 'object' && 'toDate' in ts) {
    return (ts as Timestamp).toDate().toISOString();
  }
  return new Date().toISOString();
}

function mapDocToDebt(id: string, r: Record<string, unknown>): Debt {
  return {
    id,
    uid:             String(r['uid'] ?? ''),
    name:            String(r['name'] ?? ''),
    creditor:        String(r['creditor'] ?? ''),
    totalCents:      (typeof r['totalCents'] === 'number' ? r['totalCents'] : 0) as Centavos,
    remainingCents:  (typeof r['remainingCents'] === 'number' ? r['remainingCents'] : 0) as Centavos,
    interestRate:    typeof r['interestRate'] === 'number' ? r['interestRate'] : 0,
    installments:    typeof r['installments'] === 'number' ? r['installments'] : 1,
    paidInstallments: typeof r['paidInstallments'] === 'number' ? r['paidInstallments'] : 0,
    dueDayOfMonth:   typeof r['dueDayOfMonth'] === 'number' ? r['dueDayOfMonth'] : 1,
    startDate:       String(r['startDate'] ?? ''),
    category:        (r['category'] as DebtCategory) ?? 'outro',
    active:          r['active'] !== false,
    createdAt:       tsToIso(r['createdAt']),
    updatedAt:       tsToIso(r['updatedAt']),
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useDebts(uid: string): UseDebtsReturn {
  const [debts,   setDebts]   = useState<Debt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) { setLoading(false); return; }

    const col = collection(db, 'users', uid, 'debts');
    const q   = query(col, orderBy('createdAt', 'desc'));

    const unsub = onSnapshot(
      q,
      snap => {
        setDebts(snap.docs.map(d => mapDocToDebt(d.id, d.data() as Record<string, unknown>)));
        setLoading(false);
      },
      err => {
        logSanitizedFirebaseError('debt_load', err);
        setLoading(false);
      },
    );

    return unsub;
  }, [uid]);

  const addDebt = useCallback(async (data: DebtCreateDTO): Promise<string> => {
    const batch   = writeBatch(db);
    const newRef  = doc(collection(db, 'users', uid, 'debts'));
    batch.set(newRef, {
      ...data,
      uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
    return newRef.id;
  }, [uid]);

  const updateDebt = useCallback(async (id: string, data: DebtUpdateDTO): Promise<void> => {
    const batch  = writeBatch(db);
    const docRef = doc(db, 'users', uid, 'debts', id);
    batch.update(docRef, { ...data, updatedAt: serverTimestamp() });
    await batch.commit();
  }, [uid]);

  const deleteDebt = useCallback(async (id: string): Promise<void> => {
    const batch  = writeBatch(db);
    const docRef = doc(db, 'users', uid, 'debts', id);
    batch.delete(docRef);
    await batch.commit();
  }, [uid]);

  return { debts, loading, addDebt, updateDebt, deleteDebt };
}

// ─── Finance helpers (Decimal.js — no float math) ────────────────────────────

/**
 * Compute monthly installment value (PMT formula) using Decimal.js.
 * Returns value in cents as integer.
 *
 * PMT = PV * r / (1 - (1+r)^-n)
 * where PV = remainingCents, r = interestRate, n = remainingInstallments
 */
export function calcMonthlyPaymentCents(
  remainingCents: Centavos,
  interestRate: number,
  remainingInstallments: number,
): Centavos {
  if (remainingInstallments <= 0) return 0 as Centavos;
  if (remainingCents <= 0) return 0 as Centavos;

  const pv = new Decimal(remainingCents);
  const r  = new Decimal(interestRate.toString());

  // if rate is effectively 0, simple division
  if (r.isZero()) {
    return pv.dividedBy(remainingInstallments)
      .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
      .toNumber() as Centavos;
  }

  const onePlusR = r.plus(1);
  // (1+r)^-n = 1 / (1+r)^n
  const factor = new Decimal(1).dividedBy(onePlusR.pow(remainingInstallments));
  const denom  = new Decimal(1).minus(factor);
  const pmt    = pv.times(r).dividedBy(denom);

  return pmt.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber() as Centavos;
}

/**
 * Returns next due date (YYYY-MM-DD) for a debt based on dueDayOfMonth.
 * If that day has already passed this month, returns next month's date.
 */
export function nextDueDateStr(dueDayOfMonth: number): string {
  const today = new Date();
  const day   = today.getDate();
  const month = today.getMonth(); // 0-based
  const year  = today.getFullYear();

  const targetDay = Math.min(dueDayOfMonth, 28); // conservative for short months
  if (day <= targetDay) {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;
  }
  // next month
  const nextMonth = month === 11 ? 0 : month + 1;
  const nextYear  = month === 11 ? year + 1 : year;
  return `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;
}

/**
 * Days until next due date. Negative means overdue.
 */
export function daysUntilDue(dueDayOfMonth: number): number {
  const today   = new Date();
  today.setHours(0, 0, 0, 0);
  const dueStr  = nextDueDateStr(dueDayOfMonth);
  const dueDate = new Date(dueStr + 'T00:00:00');
  return Math.round((dueDate.getTime() - today.getTime()) / 86_400_000);
}
