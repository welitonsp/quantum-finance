import { useEffect, useState } from 'react';
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  limit,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from '../shared/api/firebase';
import type { TransactionHistoryAction } from '../shared/services/AuditService';

const DEFAULT_ACTION: TransactionHistoryAction = 'UPDATE';
const HISTORY_LIMIT = 50;

export type TransactionHistoryView = {
  id: string;
  action: TransactionHistoryAction;
  txId: string;
  timestamp: number;

  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  changedFields?: string[];
  origin?: string;
  reason?: string;
  correlationId?: string;
  importHash?: string;
  amount_cents?: number;
  category?: string;
  createdAt?: unknown;
  schemaVersion?: number;
};

type UseTransactionHistoryReturn = {
  events: TransactionHistoryView[];
  loading: boolean;
  error: string | null;
};

type HistoryDoc = {
  id: string;
  data: () => Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function asStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const onlyStrings = value.filter((item): item is string => typeof item === 'string');
  return onlyStrings.length > 0 ? onlyStrings : undefined;
}

function hasToMillis(value: unknown): value is { toMillis: () => number } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'toMillis' in value &&
    typeof (value as { toMillis?: unknown }).toMillis === 'function'
  );
}

function safeTimestamp(value: unknown): number {
  if (hasToMillis(value)) {
    const millis = value.toMillis();
    return Number.isFinite(millis) ? millis : 0;
  }

  if (value instanceof Date) {
    const millis = value.getTime();
    return Number.isFinite(millis) ? millis : 0;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === 'string') {
    const millis = new Date(value).getTime();
    return Number.isFinite(millis) ? millis : 0;
  }

  return 0;
}

export function mapTransactionHistoryDoc(doc: HistoryDoc): TransactionHistoryView {
  const data = doc.data();

  const action = typeof data['action'] === 'string'
    ? data['action'] as TransactionHistoryAction
    : DEFAULT_ACTION;

  const txId = typeof data['txId'] === 'string' ? data['txId'] : '';
  const createdAt = data['createdAt'];

  const event: TransactionHistoryView = {
    id: doc.id,
    action,
    txId,
    timestamp: safeTimestamp(createdAt ?? data['timestamp']),
  };

  const before = asRecord(data['before']);
  if (before !== undefined) {
    event.before = before;
  }

  const after = asRecord(data['after']);
  if (after !== undefined) {
    event.after = after;
  }

  const changedFields = asStringList(data['changedFields']);
  if (changedFields !== undefined) {
    event.changedFields = changedFields;
  }

  if (typeof data['origin'] === 'string') {
    event.origin = data['origin'];
  }

  if (typeof data['reason'] === 'string') {
    event.reason = data['reason'];
  }

  if (typeof data['correlationId'] === 'string') {
    event.correlationId = data['correlationId'];
  }

  if (typeof data['importHash'] === 'string') {
    event.importHash = data['importHash'];
  }

  if (typeof data['amount_cents'] === 'number') {
    event.amount_cents = data['amount_cents'];
  }

  if (typeof data['category'] === 'string') {
    event.category = data['category'];
  }

  if (createdAt !== undefined) {
    event.createdAt = createdAt;
  }

  if (typeof data['schemaVersion'] === 'number') {
    event.schemaVersion = data['schemaVersion'];
  }

  return event;
}

export function useTransactionHistory(
  uid: string | undefined,
  transactionId: string | undefined,
): UseTransactionHistoryReturn {
  const [events, setEvents] = useState<TransactionHistoryView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect((): Unsubscribe | undefined => {
    if (!uid || !transactionId) {
      setEvents([]);
      setLoading(false);
      setError(null);
      return undefined;
    }

    setLoading(true);
    setError(null);

    const historyRef = collection(
      db,
      'users',
      uid,
      'transactions',
      transactionId,
      'history',
    );

    const historyQuery = query(historyRef, orderBy('createdAt', 'desc'), limit(HISTORY_LIMIT));

    const unsubscribe = onSnapshot(
      historyQuery,
      snapshot => {
        const mappedEvents = snapshot.docs
          .map(doc => mapTransactionHistoryDoc(doc))
          .sort((a, b) => b.timestamp - a.timestamp);

        setEvents(mappedEvents);
        setLoading(false);
        setError(null);
      },
      rawError => {
        const message = rawError instanceof Error
          ? rawError.message
          : 'Falha ao carregar histórico da movimentação.';

        setEvents([]);
        setLoading(false);
        setError(message);
      },
    );

    return unsubscribe;
  }, [uid, transactionId]);

  return { events, loading, error };
}

