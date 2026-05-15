import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from 'firebase/firestore';

import { db } from '../../shared/api/firebase/index';
import type { Transaction } from '../../shared/types/transaction';
import { logSanitizedFirebaseError } from '../../shared/lib/firebaseErrorHandling';

const DEFAULT_MAX_CANDIDATES = 300;
const MAX_CANDIDATES_CEILING = 500;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type FindImportCandidateTransactionsParams = {
  uid: string;
  periodStart: string;
  periodEnd: string;
  maxCandidates?: number;
};

function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function resolveMaxCandidates(maxCandidates: number | undefined): number {
  if (maxCandidates === undefined || !Number.isFinite(maxCandidates)) return DEFAULT_MAX_CANDIDATES;
  const requested = Math.floor(maxCandidates);
  if (requested <= 0) return DEFAULT_MAX_CANDIDATES;
  return Math.min(requested, MAX_CANDIDATES_CEILING);
}

export async function findImportCandidateTransactions({
  uid,
  periodStart,
  periodEnd,
  maxCandidates,
}: FindImportCandidateTransactionsParams): Promise<Transaction[]> {
  const safeUid = uid.trim();
  if (!safeUid || !isValidIsoDate(periodStart) || !isValidIsoDate(periodEnd) || periodStart > periodEnd) {
    return [];
  }

  try {
    const candidatesQuery = query(
      collection(db, 'users', safeUid, 'transactions'),
      where('date', '>=', periodStart),
      where('date', '<=', periodEnd),
      orderBy('date', 'asc'),
      limit(resolveMaxCandidates(maxCandidates)),
    );

    const snapshot = await getDocs(candidatesQuery);
    return snapshot.docs
      .map(docSnap => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<Transaction, 'id'>),
      }))
      .filter(tx => tx.isDeleted !== true && !tx.deletedAt);
  } catch (error) {
    logSanitizedFirebaseError('import_candidate_search', error);
    return [];
  }
}
