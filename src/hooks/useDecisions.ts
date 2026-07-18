// src/hooks/useDecisions.ts
// Leitura em tempo real do Diário de Decisões do Agente em users/{uid}/decisions.
import { useEffect, useState } from 'react';
import { collection, query, orderBy, limit, onSnapshot, type DocumentData } from 'firebase/firestore';
import { db } from '../shared/api/firebase/index';
import { logSanitizedFirebaseError } from '../shared/lib/firebaseErrorHandling';

export interface AIDecision {
  id: string;
  intent: string;
  question: string;
  userDecision: 'confirmed' | 'rejected' | 'expired' | 'none';
  outcomeStatus: 'pending' | 'applied' | 'reverted' | 'n/a';
  createdAt: Date | null;
  proposedAction: { kind: string; payload: Record<string, unknown> };
}

export interface DecisionStats {
  total: number;
  confirmed: number;
  rejected: number;
  applied: number;
  reverted: number;
}

interface UseDecisionsReturn {
  decisions: AIDecision[];
  loading: boolean;
  stats: DecisionStats;
}

function toStringField(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function toDate(value: unknown): Date | null {
  if (value && typeof value === 'object' && 'toDate' in value) {
    const toDateFn = (value as { toDate?: unknown }).toDate;
    if (typeof toDateFn === 'function') {
      const result = (toDateFn as () => unknown).call(value);
      if (result instanceof Date) return result;
    }
  }
  return null;
}

function toProposedAction(value: unknown): { kind: string; payload: Record<string, unknown> } {
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const payload = record['payload'];
    return {
      kind: toStringField(record['kind']),
      payload: payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {},
    };
  }
  return { kind: '', payload: {} };
}

function toUserDecision(value: unknown): AIDecision['userDecision'] {
  return value === 'confirmed' || value === 'rejected' || value === 'expired' || value === 'none'
    ? value
    : 'none';
}

function toOutcomeStatus(value: unknown): AIDecision['outcomeStatus'] {
  return value === 'pending' || value === 'applied' || value === 'reverted' || value === 'n/a'
    ? value
    : 'pending';
}

function mapDecision(id: string, data: DocumentData): AIDecision {
  return {
    id,
    intent: toStringField(data['intent']),
    question: toStringField(data['question']),
    userDecision: toUserDecision(data['userDecision']),
    outcomeStatus: toOutcomeStatus(data['outcomeStatus']),
    createdAt: toDate(data['createdAt']),
    proposedAction: toProposedAction(data['proposedAction']),
  };
}

export function useDecisions(uid: string): UseDecisionsReturn {
  const [decisions, setDecisions] = useState<AIDecision[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) {
      setDecisions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(
      collection(db, 'users', uid, 'decisions'),
      orderBy('createdAt', 'desc'),
      limit(50),
    );

    const unsub = onSnapshot(
      q,
      snap => {
        setDecisions(snap.docs.map(d => mapDecision(d.id, d.data())));
        setLoading(false);
      },
      err => {
        logSanitizedFirebaseError('firestore_query', err);
        setLoading(false);
      },
    );

    return unsub;
  }, [uid]);

  const stats: DecisionStats = {
    total: decisions.length,
    confirmed: decisions.filter(d => d.userDecision === 'confirmed').length,
    rejected: decisions.filter(d => d.userDecision === 'rejected').length,
    applied: decisions.filter(d => d.outcomeStatus === 'applied').length,
    reverted: decisions.filter(d => d.outcomeStatus === 'reverted').length,
  };

  return { decisions, loading, stats };
}
