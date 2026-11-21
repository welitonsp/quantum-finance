/**
 * transactionRepoSupabase.ts — mesmas operações do transactionRepo (Firebase),
 * sobre a tabela public.transactions do Supabase.
 *
 * - Histórico: gravado por trigger no banco (transaction_history), na mesma
 *   transação SQL da escrita. Por isso não há batch de history aqui.
 * - user_id vem de auth.uid() no banco; o cliente nunca envia.
 * - Validação: reaproveita os builders Zod do Firebase (buildManualCreatePayload /
 *   normalizeUpdatePayload) e só depois traduz para colunas.
 * - Exclusão é sempre lógica (deleted_at).
 */
import { getSupabase } from '../../api/supabase/client';
import { logSanitizedFirebaseError } from '../../lib/firebaseErrorHandling';
import { fromCentavos } from '../../types/money';
import type { ImportResult, Transaction } from '../../types/transaction';
import { centsFromBigint } from '../../../hooks/supabase/useAccountsSupabase';
import {
  buildManualCreatePayload,
  normalizeUpdatePayload,
  type ManualTransactionCreateDTO,
  type TransactionUpdateDTO,
} from '../firestoreCore';
import { PAGE_SIZE } from '../../../utils/transactionPagination';
import type { TransactionGateway, WindowPage, WindowQuery } from '../../../hooks/transactionGateway';
import {
  generateTransactionImportHash,
  normalizeImportTransaction,
  transactionToLedgerInput,
} from '../LedgerService';

export interface TransactionRow {
  id: string;
  description: string | null;
  value_cents: number | string | null;
  type: string | null;
  category: string | null;
  date: string | null;
  account_id: string | null;
  card_id: string | null;
  from_account_id: string | null;
  to_account_id: string | null;
  installment_group_id: string | null;
  installment_index: number | null;
  installment_count: number | null;
  installment_total_cents: number | string | null;
  is_recurring: boolean | null;
  tags: string[] | null;
  source: string | null;
  fit_id: string | null;
  import_hash: string | null;
  competencia: string | null;
  paid_invoice_month: string | null;
  reconciliation_status: string | null;
  reconciled_at: string | null;
  deleted_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export const TRANSACTION_COLUMNS = [
  'id', 'description', 'value_cents', 'type', 'category', 'date', 'account_id', 'card_id',
  'from_account_id', 'to_account_id', 'installment_group_id', 'installment_index',
  'installment_count', 'installment_total_cents', 'is_recurring', 'tags', 'source', 'fit_id',
  'import_hash', 'competencia', 'paid_invoice_month', 'reconciliation_status', 'reconciled_at',
  'deleted_at', 'created_at', 'updated_at',
].join(', ');

const SOURCES = new Set(['csv', 'ofx', 'pdf', 'manual']);

function millis(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

/** Linha do banco → Transaction do app (camelCase, centavos inteiros). */
export function mapTransactionRow(row: TransactionRow): Transaction {
  const cents = centsFromBigint(row.value_cents);
  const tx: Transaction = {
    id: row.id,
    description: row.description ?? '',
    value_cents: cents,
    value: fromCentavos(cents),
    schemaVersion: 2,
    type: row.type === 'entrada' || row.type === 'transferencia' ? row.type : 'saida',
    category: row.category ?? 'Outros',
    date: row.date ?? '',
    isRecurring: row.is_recurring === true,
    tags: row.tags ?? [],
    source: SOURCES.has(row.source ?? '') ? (row.source as NonNullable<Transaction['source']>) : 'manual',
    createdAt: millis(row.created_at),
    updatedAt: millis(row.updated_at),
  };
  if (row.account_id) tx.accountId = row.account_id;
  if (row.card_id) tx.cardId = row.card_id;
  if (row.from_account_id) tx.fromAccountId = row.from_account_id;
  if (row.to_account_id) tx.toAccountId = row.to_account_id;
  if (row.installment_group_id) tx.installmentGroupId = row.installment_group_id;
  if (row.installment_index !== null) tx.installmentIndex = row.installment_index;
  if (row.installment_count !== null) tx.installmentCount = row.installment_count;
  if (row.installment_total_cents !== null) {
    tx.installmentTotalCents = centsFromBigint(row.installment_total_cents);
  }
  if (row.fit_id) tx.fitId = row.fit_id;
  if (row.import_hash) tx.importHash = row.import_hash;
  if (row.competencia) tx.competencia = row.competencia;
  if (row.paid_invoice_month) tx.paidInvoiceMonth = row.paid_invoice_month;
  if (row.reconciliation_status === 'reconciled') tx.reconciliationStatus = 'reconciled';
  if (row.reconciled_at) tx.reconciledAt = millis(row.reconciled_at);
  if (row.deleted_at) {
    tx.isDeleted = true;
    tx.deletedAt = millis(row.deleted_at);
  }
  return tx;
}

const FIELD_TO_COLUMN: Record<string, string> = {
  description: 'description',
  value_cents: 'value_cents',
  type: 'type',
  category: 'category',
  date: 'date',
  accountId: 'account_id',
  cardId: 'card_id',
  fromAccountId: 'from_account_id',
  toAccountId: 'to_account_id',
  installmentGroupId: 'installment_group_id',
  installmentIndex: 'installment_index',
  installmentCount: 'installment_count',
  installmentTotalCents: 'installment_total_cents',
  isRecurring: 'is_recurring',
  tags: 'tags',
  source: 'source',
  fitId: 'fit_id',
  importHash: 'import_hash',
  competencia: 'competencia',
  paidInvoiceMonth: 'paid_invoice_month',
  reconciliationStatus: 'reconciliation_status',
};

/** Referências vazias viram NULL (FKs uuid no banco). */
const NULLABLE_REFS = new Set(['account_id', 'card_id', 'from_account_id', 'to_account_id']);

function toIsoOrNow(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value).toISOString();
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) return new Date(value).toISOString();
  return new Date().toISOString();
}

/**
 * Payload canônico do app (já validado por Zod) → colunas do banco.
 * Campos só do Firestore (descriptionLower, schemaVersion, account, uid…) são descartados.
 */
export function toTransactionColumns(payload: Record<string, unknown>): Record<string, unknown> {
  const cols: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(payload)) {
    const column = FIELD_TO_COLUMN[field];
    if (!column || value === undefined) continue;
    cols[column] = NULLABLE_REFS.has(column) && !value ? null : value;
  }
  if (payload['isDeleted'] === true) cols['deleted_at'] = toIsoOrNow(payload['deletedAt']);
  else if (payload['isDeleted'] === false) cols['deleted_at'] = null;
  if (payload['reconciledAt'] !== undefined) {
    cols['reconciled_at'] = payload['reconciledAt'] === null ? null : toIsoOrNow(payload['reconciledAt']);
  }
  return cols;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UNIQUE_VIOLATION = '23505';

function fail(op: Parameters<typeof logSanitizedFirebaseError>[0], error: unknown, message: string): never {
  logSanitizedFirebaseError(op, error);
  throw new Error(message);
}

type BulkSnapshotItem = {
  id: string;
  oldCategory: string;
  newCategory?: string;
  before?: Record<string, unknown>;
};

const CHUNK = 200;

export const transactionRepoSupabase = {
  async getTransactions(uid: string): Promise<Transaction[]> {
    if (!uid) return [];
    const { data, error } = await getSupabase()
      .from('transactions')
      .select(TRANSACTION_COLUMNS)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (error) fail('firestore_query', error, 'Não foi possível carregar as transações.');
    return ((data ?? []) as unknown as TransactionRow[]).map(mapTransactionRow);
  },

  /**
   * Cria a transação. `txId` (id gerado no cliente, usado pela fila offline)
   * vira o id da linha quando é um uuid, e sempre a chave de idempotência:
   * reenviar a mesma criação devolve a linha já gravada em vez de duplicar.
   */
  async createManualTransactionWithHistory(
    uid: string,
    data: ManualTransactionCreateDTO,
    txId?: string,
  ): Promise<string> {
    if (!uid) throw new Error('Usuário não autenticado.');
    const cols = toTransactionColumns(buildManualCreatePayload(data));
    if (txId !== undefined) {
      if (txId.length < 8 || txId.length > 128) throw new Error('Identificador de transação inválido.');
      cols['idempotency_key'] = txId;
      if (UUID_RE.test(txId)) cols['id'] = txId;
    }
    const { data: row, error } = await getSupabase()
      .from('transactions')
      .insert(cols)
      .select('id')
      .single();
    if (!error && row) return (row as { id: string }).id;

    if (txId !== undefined && (error as { code?: string } | null)?.code === UNIQUE_VIOLATION) {
      const { data: existing } = await getSupabase()
        .from('transactions')
        .select('id')
        .eq('idempotency_key', txId)
        .maybeSingle();
      if (existing) return (existing as { id: string }).id;
    }
    return fail('transaction_add', error, 'Não foi possível salvar a transação.');
  },

  async updateTransactionWithHistory(
    uid: string,
    id: string,
    data: TransactionUpdateDTO,
    _historyEvent?: unknown,
  ): Promise<void> {
    if (!uid || !id) throw new Error('Usuário ou transação ausente.');
    const cols = toTransactionColumns(normalizeUpdatePayload(data));
    if (Object.keys(cols).length === 0) return;
    const { error } = await getSupabase().from('transactions').update(cols).eq('id', id);
    if (error) fail('transaction_update', error, 'Não foi possível atualizar a transação.');
  },

  async softDeleteTransactionWithHistory(uid: string, id: string, _historyEvent?: unknown): Promise<void> {
    if (!uid || !id) throw new Error('Usuário ou transação ausente.');
    const { error } = await getSupabase()
      .from('transactions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .is('deleted_at', null);
    if (error) fail('transaction_delete', error, 'Não foi possível excluir a transação.');
  },

  async deleteBatchTransactionsWithHistory(uid: string, transactions: Transaction[]): Promise<void> {
    if (!uid || !transactions.length) return;
    const now = new Date().toISOString();
    for (let i = 0; i < transactions.length; i += CHUNK) {
      const ids = transactions.slice(i, i + CHUNK).map(tx => tx.id);
      const { error } = await getSupabase()
        .from('transactions')
        .update({ deleted_at: now })
        .in('id', ids)
        .is('deleted_at', null);
      if (error) fail('transaction_delete_batch', error, 'Não foi possível excluir as transações.');
    }
  },

  async batchUpdateTransactionsWithHistory(
    uid: string,
    snapshot: BulkSnapshotItem[],
    updates: TransactionUpdateDTO,
    _correlationId?: string,
  ): Promise<void> {
    if (!uid || !snapshot.length) return;
    const cols = toTransactionColumns(normalizeUpdatePayload(updates));
    if (Object.keys(cols).length === 0) return;
    for (let i = 0; i < snapshot.length; i += CHUNK) {
      const ids = snapshot.slice(i, i + CHUNK).map(item => item.id);
      const { error } = await getSupabase().from('transactions').update(cols).in('id', ids);
      if (error) fail('transaction_bulk_update', error, 'Não foi possível atualizar as transações.');
    }
  },

  /** Desfaz uma edição em lote: cada transação volta para a categoria anterior. */
  async batchUndoBulkUpdateTransactionsWithHistory(
    uid: string,
    snapshot: BulkSnapshotItem[],
    _correlationId?: string,
  ): Promise<void> {
    if (!uid) throw new Error('Usuário não autenticado.');
    if (!snapshot.length) return;
    // Agrupa por categoria de destino: um UPDATE por categoria.
    const byCategory = new Map<string, string[]>();
    for (const item of snapshot) {
      if (!item.id) throw new Error('Transação sem identificador.');
      const category = String(normalizeUpdatePayload({ category: item.oldCategory })['category']);
      byCategory.set(category, [...(byCategory.get(category) ?? []), item.id]);
    }
    for (const [category, ids] of byCategory) {
      for (let i = 0; i < ids.length; i += CHUNK) {
        const { error } = await getSupabase()
          .from('transactions')
          .update({ category })
          .in('id', ids.slice(i, i + CHUNK));
        if (error) fail('transaction_bulk_undo', error, 'Não foi possível desfazer a edição em lote.');
      }
    }
  },

  /**
   * Importação: insere em lotes. Linhas cujo import_hash já existe são contadas
   * como duplicadas (o índice único do banco é a garantia final).
   */
  async saveAllTransactions(uid: string, transactions: Array<Partial<Transaction>>): Promise<ImportResult> {
    if (!uid || !transactions.length) return { added: 0, duplicates: 0, invalid: 0 };
    // Mesma normalização e mesmo hash estável do importador Firebase (LedgerService):
    // reimportar o mesmo arquivo gera os mesmos import_hash e é deduplicado.
    const rows: Record<string, unknown>[] = [];
    let invalid = 0;
    for (const tx of transactions) {
      const payload = normalizeImportTransaction(transactionToLedgerInput(tx));
      if (!payload) { invalid += 1; continue; }
      const cols = toTransactionColumns(payload as unknown as Record<string, unknown>);
      cols['import_hash'] = tx.importHash ?? await generateTransactionImportHash(uid, payload);
      rows.push(cols);
    }

    let added = 0;
    let duplicates = 0;
    const seen = new Set<string>();
    for (let i = 0; i < rows.length; i += CHUNK) {
      let chunk = rows.slice(i, i + CHUNK);

      // Remove duplicadas dentro do próprio arquivo e as já gravadas.
      const hashes = chunk.map(r => r['import_hash']).filter((h): h is string => typeof h === 'string');
      const existing = new Set<string>();
      if (hashes.length) {
        const { data, error } = await getSupabase()
          .from('transactions')
          .select('import_hash')
          .in('import_hash', hashes);
        if (error) fail('transaction_import', error, 'Não foi possível importar as transações.');
        for (const r of (data ?? []) as Array<{ import_hash: string | null }>) {
          if (r.import_hash) existing.add(r.import_hash);
        }
      }
      chunk = chunk.filter(r => {
        const h = r['import_hash'];
        if (typeof h !== 'string') return true;
        if (existing.has(h) || seen.has(h)) { duplicates += 1; return false; }
        seen.add(h);
        return true;
      });
      if (!chunk.length) continue;

      const { data, error } = await getSupabase().from('transactions').insert(chunk).select('id');
      if (!error) { added += (data ?? []).length; continue; }
      if ((error as { code?: string }).code !== UNIQUE_VIOLATION) {
        fail('transaction_import', error, 'Não foi possível importar as transações.');
      }
      // Corrida com outra importação: grava linha a linha e conta as repetidas.
      for (const row of chunk) {
        const { error: rowError } = await getSupabase().from('transactions').insert(row);
        if (!rowError) added += 1;
        else if ((rowError as { code?: string }).code === UNIQUE_VIOLATION) duplicates += 1;
        else fail('transaction_import', rowError, 'Não foi possível importar as transações.');
      }
    }
    return { added, duplicates, invalid };
  },
};


// ─── Leitura em tempo real e criação (usadas pelo useTransactions) ─────────────

/** Escapa curingas do LIKE para a busca por descrição. */
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, ch => `\\${ch}`);
}

/** Cursor da próxima página: a mesma consulta da janela, a partir de `offset`. */
interface SupabaseCursor { q: WindowQuery; offset: number }

/** Monta a consulta da janela com filtro e ordenação estáveis (id desempata). */
function windowQueryBuilder(q: WindowQuery) {
  let builder = getSupabase().from('transactions').select(TRANSACTION_COLUMNS).is('deleted_at', null);
  const term = q.term ?? '';
  if (term.length >= 2) {
    return builder.ilike('description', `%${escapeLike(term)}%`)
      .order('description', { ascending: true }).order('id', { ascending: true });
  }
  if (q.category) {
    builder = builder.eq('category', q.category);
  } else if (q.dateFrom && q.dateTo) {
    builder = builder.gte('date', q.dateFrom).lte('date', q.dateTo);
  } else {
    return builder.order('created_at', { ascending: false }).order('id', { ascending: false });
  }
  return builder.order('date', { ascending: false }).order('id', { ascending: false });
}

function windowPage(rows: TransactionRow[], q: WindowQuery, offset: number): WindowPage {
  const cursor: SupabaseCursor | null = rows.length > 0 ? { q, offset: offset + rows.length } : null;
  return { docs: rows.map(mapTransactionRow), rawCount: rows.length, cursor };
}

let channelSeq = 0;

export const transactionGatewaySupabase: TransactionGateway = {
  subscribeWindow(uid, q, onNext, onError) {
    let active = true;
    let latest = 0;

    const run = async (): Promise<void> => {
      const request = ++latest;
      const { data, error } = await windowQueryBuilder(q).range(0, PAGE_SIZE - 1);
      if (!active || request !== latest) return;
      if (error) { onError(error); return; }
      onNext(windowPage((data ?? []) as unknown as TransactionRow[], q, 0));
    };

    void run();
    const channel = getSupabase()
      .channel(`transactions:${uid}:${++channelSeq}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions', filter: `user_id=eq.${uid}` },
        () => { void run(); })
      // Recarrega quando o canal entra: cobre mudanças entre a consulta inicial e a assinatura.
      .subscribe((status: string) => { if (status === 'SUBSCRIBED') void run(); });

    return () => {
      active = false;
      void getSupabase().removeChannel(channel);
    };
  },

  /**
   * Próxima página com o MESMO filtro e ordem da janela (busca, categoria ou
   * período). Paginação por posição: linhas repetidas por mudança concorrente
   * são descartadas pelo id no hook.
   */
  async loadOlder(_uid, cursor) {
    const c = cursor as SupabaseCursor | null;
    if (!c || typeof c.offset !== 'number') return { docs: [], rawCount: 0, cursor: null };
    const { data, error } = await windowQueryBuilder(c.q).range(c.offset, c.offset + PAGE_SIZE - 1);
    if (error) throw error;
    return windowPage((data ?? []) as unknown as TransactionRow[], c.q, c.offset);
  },

  async fetchOne(_uid, id) {
    const { data, error } = await getSupabase()
      .from('transactions')
      .select(TRANSACTION_COLUMNS)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data ? mapTransactionRow(data as unknown as TransactionRow) : null;
  },

  create(uid, data, idempotencyKey) {
    return transactionRepoSupabase.createManualTransactionWithHistory(uid, data, idempotencyKey);
  },

  newId() {
    return crypto.randomUUID();
  },
};
