// LGPD no Supabase: exportação dos dados do usuário, registro de pedidos e
// exclusão da conta (RPC delete_my_account, com login recente, em cascata).
import { getSupabase } from '../../api/supabase/client';
import { logSanitizedFirebaseError } from '../../lib/firebaseErrorHandling';
import { downloadUserExport } from '../DataPrivacyService';
import type { DataProcessingEventType, DataProcessingLogEntry } from '../DataProcessingLog';

/** Tabelas exportadas e a coluna que dá ordem estável para paginar. */
export const EXPORTABLE_TABLES: ReadonlyArray<{ table: string; order: string }> = [
  { table: 'transactions', order: 'id' },
  { table: 'transaction_history', order: 'id' },
  { table: 'accounts', order: 'id' },
  { table: 'account_history', order: 'id' },
  { table: 'credit_cards', order: 'id' },
  { table: 'categories', order: 'id' },
  { table: 'category_rules', order: 'id' },
  { table: 'budgets', order: 'id' },
  { table: 'goals', order: 'id' },
  { table: 'debts', order: 'id' },
  { table: 'recurring_tasks', order: 'id' },
  { table: 'planning_history', order: 'id' },
  { table: 'score_history', order: 'month' },
  { table: 'challenges', order: 'id' },
  { table: 'user_consents', order: 'created_at' },
  { table: 'data_processing_log', order: 'id' },
  { table: 'shopping_lists', order: 'id' },
  { table: 'price_observations', order: 'id' },
  { table: 'push_tokens', order: 'token' },
  { table: 'ai_decisions', order: 'id' },
];

const EXPORT_CHUNK = 1000;

/** O identificador do usuário e o importHash nunca entram no arquivo exportado. */
const OMITTED_COLUMNS = new Set(['user_id', 'import_hash']);

export function sanitizeExportRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (!OMITTED_COLUMNS.has(key)) out[key] = value;
  }
  return out;
}

async function readTable(table: string, order: string): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += EXPORT_CHUNK) {
    const { data, error } = await getSupabase()
      .from(table).select('*').order(order, { ascending: true }).range(from, from + EXPORT_CHUNK - 1);
    if (error) throw error;
    const chunk = (data ?? []) as Record<string, unknown>[];
    rows.push(...chunk.map(sanitizeExportRow));
    if (chunk.length < EXPORT_CHUNK) return rows;
  }
}

export async function exportAllUserDataSupabase(uid: string): Promise<void> {
  const collections: Record<string, unknown[]> = {};
  for (const { table, order } of EXPORTABLE_TABLES) {
    try {
      collections[table] = await readTable(table, order);
    } catch (err) {
      logSanitizedFirebaseError('data_export', err);
      collections[table] = [];
    }
  }
  await downloadUserExport(uid, collections);
}

/**
 * Exporta (cópia para o usuário) e apaga a conta. Sem login recente o banco
 * recusa com QF401 → 'REQUIRES_RECENT_LOGIN', como no fluxo do Firebase.
 */
export async function deleteUserAccountSupabase(uid: string): Promise<void> {
  await exportAllUserDataSupabase(uid);
  const { error } = await getSupabase().rpc('delete_my_account');
  if (error) {
    const code = (error as { code?: unknown }).code;
    if (code === 'QF401' || code === '42501' || code === 'PGRST301') throw new Error('REQUIRES_RECENT_LOGIN');
    logSanitizedFirebaseError('data_delete_account', error);
    throw new Error('Não foi possível excluir a conta.');
  }
  // O usuário não existe mais: encerra a sessão local para o app voltar ao login.
  try {
    await getSupabase().auth.signOut({ scope: 'local' });
  } catch (err) {
    logSanitizedFirebaseError('data_delete_account', err);
  }
}

/** "consent_granted" é gravado pelo gatilho do consentimento no banco, não pelo app. */
export async function logDataProcessingEventSupabase(
  _uid: string,
  eventType: DataProcessingEventType,
  details?: string,
): Promise<void> {
  if (eventType === 'consent_granted') return;
  const { error } = await getSupabase().rpc('log_data_processing_event', {
    p_event_type: eventType,
    p_details: details ? details.slice(0, 200) : null,
  });
  if (error) logSanitizedFirebaseError('data_processing_log', error);
}

interface ProcessingLogRow {
  id: number | string;
  event_type: string;
  details: string | null;
  created_at: string | null;
}

export async function getDataProcessingLogSupabase(
  _uid: string,
  maxEntries = 20,
): Promise<DataProcessingLogEntry[]> {
  const { data, error } = await getSupabase()
    .from('data_processing_log')
    .select('id, event_type, details, created_at')
    .order('created_at', { ascending: false })
    .limit(maxEntries);
  if (error) {
    logSanitizedFirebaseError('data_processing_log_read', error);
    return [];
  }
  return ((data ?? []) as ProcessingLogRow[]).map((row) => {
    const ms = row.created_at ? Date.parse(row.created_at) : Number.NaN;
    const entry: DataProcessingLogEntry = {
      id: String(row.id),
      eventType: row.event_type as DataProcessingEventType,
      createdAt: Number.isNaN(ms) ? null : { toDate: () => new Date(ms) },
    };
    if (row.details) entry.details = row.details;
    return entry;
  });
}
