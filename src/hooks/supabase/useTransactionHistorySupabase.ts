// Histórico de uma transação no Supabase (tabela transaction_history, append-only,
// gravada por trigger). Os snapshots do banco usam nomes de coluna (snake_case);
// aqui viram os nomes de campo do app e passam pelo mesmo mapeador do Firebase.
import { useEffect, useState } from 'react';
import { getSupabase } from '../../shared/api/supabase/client';
import { logSanitizedFirebaseError } from '../../shared/lib/firebaseErrorHandling';
import { TRANSACTION_FIELD_TO_COLUMN } from '../../shared/services/supabase/transactionRepoSupabase';
import {
  mapTransactionHistoryDoc,
  type TransactionHistoryView,
  type UseTransactionHistoryReturn,
} from '../useTransactionHistory';

const HISTORY_LIMIT = 50;

const COLUMN_TO_FIELD: Record<string, string> = {
  ...Object.fromEntries(Object.entries(TRANSACTION_FIELD_TO_COLUMN).map(([field, column]) => [column, field])),
  deleted_at: 'deletedAt',
  reconciled_at: 'reconciledAt',
  from_account_id: 'fromAccountId',
  to_account_id: 'toAccountId',
};

export interface TransactionHistoryRow {
  id: number | string;
  transaction_id: string;
  action: string;
  origin: string;
  changed_fields: string[] | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  created_at: string;
}

function camelize(snapshot: Record<string, unknown> | null): Record<string, unknown> | undefined {
  if (!snapshot) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(snapshot)) out[COLUMN_TO_FIELD[key] ?? key] = value;
  return out;
}

export function mapTransactionHistoryRow(row: TransactionHistoryRow): TransactionHistoryView {
  const before = camelize(row.before);
  const after = camelize(row.after);
  const cents = after?.['value_cents'] ?? before?.['value_cents'];
  const category = after?.['category'] ?? before?.['category'];
  const data: Record<string, unknown> = {
    action: row.action,
    txId: row.transaction_id,
    createdAt: row.created_at,
    origin: row.origin,
    changedFields: (row.changed_fields ?? []).map(c => COLUMN_TO_FIELD[c] ?? c),
  };
  if (before) data['before'] = before;
  if (after) data['after'] = after;
  if (typeof cents === 'number' && Number.isSafeInteger(cents)) data['amount_cents'] = cents;
  if (typeof category === 'string') data['category'] = category;
  return mapTransactionHistoryDoc({ id: String(row.id), data: () => data });
}

export function useTransactionHistorySupabase(
  uid: string | undefined,
  transactionId: string | undefined,
): UseTransactionHistoryReturn {
  const [events, setEvents] = useState<TransactionHistoryView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uid || !transactionId) {
      setEvents([]);
      setLoading(false);
      setError(null);
      return undefined;
    }
    let active = true;
    setEvents([]);
    setLoading(true);
    setError(null);
    void (async () => {
      const { data, error: dbError } = await getSupabase()
        .from('transaction_history')
        .select('id, transaction_id, action, origin, changed_fields, before, after, created_at')
        .eq('transaction_id', transactionId)
        .order('created_at', { ascending: false })
        .limit(HISTORY_LIMIT);
      if (!active) return;
      if (dbError) {
        logSanitizedFirebaseError('audit_transaction_history', dbError);
        setEvents([]);
        setError('Falha ao carregar histórico da movimentação.');
      } else {
        setEvents(((data ?? []) as TransactionHistoryRow[]).map(mapTransactionHistoryRow));
      }
      setLoading(false);
    })();
    return () => { active = false; };
  }, [uid, transactionId]);

  return { events, loading, error };
}
