import { useState, useEffect, useCallback } from 'react';
import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, orderBy, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../shared/api/firebase/index';
import { logSanitizedFirebaseError } from '../shared/lib/firebaseErrorHandling';

export interface Challenge {
  id:           string;
  category:     string;
  targetPct:    number;  // reduction % target, e.g. 20 = reduce by 20%
  baselineCents: number; // avg monthly spend in that category (baseline)
  deadlineDays: number;  // challenge duration in days from creation
  startDate:    string;  // YYYY-MM-DD
  endDate:      string;  // YYYY-MM-DD
  xp:           number;  // accumulated XP
  status:       'active' | 'won' | 'lost';
  schemaVersion: 1;
  createdAt?:   unknown;
}

export interface CreateChallengeInput {
  category:      string;
  targetPct:     number;
  baselineCents: number;
  deadlineDays:  number;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysToISO(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function useChallenges(uid: string) {
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    if (!uid) { setLoading(false); return; }
    const col = collection(db, 'users', uid, 'challenges');
    const q   = query(col, orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(
      q,
      snap => {
        setChallenges(
          snap.docs.map(d => ({ id: d.id, ...d.data() } as Challenge)),
        );
        setLoading(false);
      },
      err => {
        logSanitizedFirebaseError('challenges_load', err);
        setLoading(false);
      },
    );
    return unsub;
  }, [uid]);

  const createChallenge = useCallback(async (input: CreateChallengeInput) => {
    if (!uid) return;
    const today   = todayISO();
    const endDate = addDaysToISO(today, input.deadlineDays);
    await addDoc(collection(db, 'users', uid, 'challenges'), {
      category:      input.category,
      targetPct:     input.targetPct,
      baselineCents: input.baselineCents,
      deadlineDays:  input.deadlineDays,
      startDate:     today,
      endDate,
      xp:            0,
      status:        'active',
      schemaVersion: 1,
      createdAt:     serverTimestamp(),
    });
  }, [uid]);

  const updateXP = useCallback(async (challengeId: string, newXP: number, status: Challenge['status']) => {
    if (!uid) return;
    await updateDoc(doc(db, 'users', uid, 'challenges', challengeId), { xp: newXP, status });
  }, [uid]);

  const deleteChallenge = useCallback(async (challengeId: string) => {
    if (!uid) return;
    await deleteDoc(doc(db, 'users', uid, 'challenges', challengeId));
  }, [uid]);

  return { challenges, loading, createChallenge, updateXP, deleteChallenge };
}

// ─── XP milestone computation ────────────────────────────────────────────────

export const XP_MILESTONES = [
  { pct: 25, xp: 50,  badge: '🥉', label: '25% concluído' },
  { pct: 50, xp: 100, badge: '🥈', label: 'Metade do caminho' },
  { pct: 75, xp: 200, badge: '🥇', label: '75% concluído' },
  { pct: 100, xp: 500, badge: '🏆', label: 'Desafio conquistado!' },
] as const;

export function computeChallengeProgress(
  challenge: Challenge,
  spentCents: number, // actual spending so far in challenge window
): {
  progressPct: number;   // how close to goal reduction (0–100)
  currentReductionPct: number; // actual reduction vs baseline (can be negative)
  xpEarned: number;
  nextMilestone: typeof XP_MILESTONES[number] | null;
  isExpired: boolean;
} {
  const today = todayISO();
  const isExpired = today > challenge.endDate;

  // Days elapsed / total days ratio
  const totalMs   = new Date(challenge.endDate).getTime() - new Date(challenge.startDate).getTime();
  const elapsedMs = Math.max(0, new Date(today).getTime() - new Date(challenge.startDate).getTime());
  const elapsedRatio = Math.min(1, totalMs > 0 ? elapsedMs / totalMs : 0);

  // Pro-rate baseline to elapsed period
  const proratedBaseline = challenge.baselineCents * elapsedRatio;
  const actualReductionPct = proratedBaseline > 0
    ? Math.round(((proratedBaseline - spentCents) / proratedBaseline) * 100)
    : 0;

  // Progress toward the target reduction %
  const progressPct = challenge.targetPct > 0
    ? Math.min(100, Math.max(0, Math.round((actualReductionPct / challenge.targetPct) * 100)))
    : 0;

  // XP earned based on milestones
  let xpEarned = 0;
  for (const m of XP_MILESTONES) {
    if (progressPct >= m.pct) xpEarned = m.xp;
  }

  const nextMilestone = XP_MILESTONES.find(m => progressPct < m.pct) ?? null;

  return { progressPct, currentReductionPct: actualReductionPct, xpEarned, nextMilestone, isExpired };
}
