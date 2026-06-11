import { useState, useEffect, useCallback } from 'react';
import {
  collection, doc, setDoc, getDocs,
  query, orderBy, limit,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../shared/api/firebase/index';
import { logSanitizedFirebaseError } from '../shared/lib/firebaseErrorHandling';
import type { FinancialMetrics } from './useFinancialMetrics';

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

function computeScore(m: FinancialMetrics): number {
  const s1 = m.taxaPoupanca >= 30 ? 25 : m.taxaPoupanca >= 20 ? 20 : m.taxaPoupanca >= 10 ? 12 : m.taxaPoupanca >= 5 ? 6 : 0;
  const s2 = m.endividamento <= 10 ? 25 : m.endividamento <= 30 ? 20 : m.endividamento <= 50 ? 12 : m.endividamento <= 70 ? 6 : 0;
  const s3 = m.reservaMeses >= 6 ? 25 : m.reservaMeses >= 3 ? 18 : m.reservaMeses >= 1 ? 8 : 0;
  const s4 = m.comprometimento <= 20 ? 25 : m.comprometimento <= 35 ? 18 : m.comprometimento <= 50 ? 8 : 0;
  return s1 + s2 + s3 + s4;
}

export function useScoreHistory(uid: string, metrics: FinancialMetrics | null) {
  const [history, setHistory] = useState<ScoreHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Persist current month score when metrics change
  const persistScore = useCallback(async () => {
    if (!uid || !metrics) return;
    const month = currentMonthKey();
    const score = computeScore(metrics);
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
