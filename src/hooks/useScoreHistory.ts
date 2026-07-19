import { useState, useEffect, useCallback } from 'react';
import {
  collection, doc, setDoc, getDocs,
  query, orderBy, limit,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../shared/api/firebase/index';
import { logSanitizedFirebaseError } from '../shared/lib/firebaseErrorHandling';
import type { FinancialMetrics } from './useFinancialMetrics';
import { computeHealthScore } from '../lib/healthScore';

export interface ScoreHistoryEntry {
  month:       string; // YYYY-MM
  score:       number; // 0-100
  taxaPoupanca:    number;
  endividamento:   number;
  reservaMeses:    number;
  comprometimento: number;
}

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function useScoreHistory(uid: string, metrics: FinancialMetrics | null) {
  const [history, setHistory] = useState<ScoreHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Persist current month score when metrics change
  const persistScore = useCallback(async () => {
    if (!uid || !metrics) return;
    const month = currentMonthKey();
    const score = computeHealthScore(metrics);
    const entry: Omit<ScoreHistoryEntry, 'month'> & { updatedAt: unknown; schemaVersion: number } = {
      score,
      taxaPoupanca:    metrics.taxaPoupanca,
      endividamento:   metrics.endividamento,
      reservaMeses:    metrics.reservaMeses,
      comprometimento: metrics.comprometimento,
      updatedAt:       serverTimestamp(),
      schemaVersion:   1,
    };
    try {
      await setDoc(doc(db, 'users', uid, 'scoreHistory', month), entry, { merge: true });
    } catch (err) {
      logSanitizedFirebaseError('score_history_persist', err);
    }
  }, [uid, metrics]);

  // Load last 6 months
  const loadHistory = useCallback(async () => {
    if (!uid) { setLoading(false); return; }
    try {
      const col  = collection(db, 'users', uid, 'scoreHistory');
      const q    = query(col, orderBy('__name__', 'desc'), limit(6));
      const snap = await getDocs(q);
      const entries: ScoreHistoryEntry[] = snap.docs.map(d => {
        const r = d.data();
        return {
          month:           d.id,
          score:           Number(r['score'] ?? 0),
          taxaPoupanca:    Number(r['taxaPoupanca'] ?? 0),
          endividamento:   Number(r['endividamento'] ?? 0),
          reservaMeses:    Number(r['reservaMeses'] ?? 0),
          comprometimento: Number(r['comprometimento'] ?? 0),
        };
      }).sort((a, b) => a.month.localeCompare(b.month)); // oldest first for chart
      setHistory(entries);
    } catch (err) {
      logSanitizedFirebaseError('score_history_load', err);
    } finally {
      setLoading(false);
    }
  }, [uid]);

  // Load on mount
  useEffect(() => { void loadHistory(); }, [loadHistory]);

  // Persist whenever metrics are updated (debounced by metrics reference stability)
  useEffect(() => {
    if (!metrics) return;
    void persistScore();
  }, [persistScore, metrics]);

  return { history, loading };
}
