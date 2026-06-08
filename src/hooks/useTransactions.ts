import { useState, useEffect, useCallback, useRef } from 'react';
import {
  collection, query, orderBy, onSnapshot, limit, where,
  doc, getDoc,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useTransactionsPagination } from './useTransactionsPagination';
import { db, functions } from '../shared/api/firebase/index';
import { FirestoreService } from '../shared/services/FirestoreService';
import { AuditService } from '../shared/services/AuditService';
import type { Transaction } from '../shared/types/transaction';
import { fromCentavos, type Centavos } from '../shared/types/money';
import { categorizeTransaction } from '../utils/aiCategorize';
import { categorizeWithAI } from '../services/AICategorizationService';
import { PAGE_SIZE, mergeTransactionPages } from '../utils/transactionPagination';
import {
  getFirebaseErrorCode,
  getUserFriendlyErrorMessage,
  logSanitizedFirebaseError,
  type FirebaseErrorOperation,
} from '../shared/lib/firebaseErrorHandling';
import { generateSafeOperationId } from '../shared/lib/operationTrace';
import toast from 'react-hot-toast';
import {
  normalizeTransaction,
  normalizeWriteData,
  buildUpdateWriteData,
  sanitizeForHistory,
  computeChangedFields,
  toMillis,
} from './transactionNormalizer';
// Re-export public API para compatibilidade com callers externos
export { normalizeTransaction, sanitizeForHistory } from './transactionNormalizer';

// ─── Bulk Update — tipo restrito (não expõe Partial<Transaction> livre) ────────
export type BulkUpdate = {
  category?: string;
};

// ─── SnapshotWindow — filtro server-side por intervalo de datas ───────────────
export type SnapshotWindow = {
  /** ISO date string YYYY-MM-DD — inclusive. */
  dateFrom: string;
  /** ISO date string YYYY-MM-DD — inclusive. */
  dateTo: string;
};

// ─── ServerSearchParams — busca server-side por prefixo de descrição ou categoria ─
export type ServerSearchParams = {
  /** Minimum 2 characters. Triggers prefix search on descriptionLower field. */
  term?: string;
  /** Exact category filter. Applied server-side when term is absent. */
  category?: string;
};

// ─── addBatchStreamed result ───────────────────────────────────────────────────
export type StreamedBatchResult = {
  succeeded: string[];
  failed: Array<{ item: Partial<Transaction>; error: Error }>;
};

// ─── Dead Letter Queue — ops descartadas após MAX_RETRIES ─────────────────────
export type DeadLetterOp = {
  type: 'add' | 'update' | 'delete' | 'deleteBatch';
  operation: FirebaseErrorOperation;
  failedAt: number;
};

// ─── Bulk Snapshot — estado anterior para undo em memória ─────────────────────
export type BulkSnapshot = {
  id:          string;
  oldCategory: string;
  before?: Record<string, unknown>;
  /** Categoria aplicada pelo bulk update — necessária para o log de undo (from → to). */
  newCategory?: string;
}[];

// ─── Constantes ───────────────────────────────────────────────────────────────

const MAX_RETRIES       = 5;
const RETRY_INTERVAL_MS = 5_000;

function computeBackoffMs(attempt: number): number {
  const base   = 2_000;
  const cap    = 60_000;
  const jitter = Math.random() * 1_000;
  return Math.min(base * 2 ** (attempt - 1), cap) + jitter;
}

// ─── Op Types (sem any) ───────────────────────────────────────────────────────

interface AddOp {
  type:        'add';
  tempId:      string;
  txId:        string;
  data:        Partial<Transaction>;
  retries:     number;
  nextRetryAt: number;
}
interface UpdateOp {
  type:          'update';
  itemId:        string;
  data:          Partial<Transaction>;
  requestedData: Partial<Transaction>;
  previous:      Transaction | undefined;
  retries:       number;
  nextRetryAt:   number;
}
interface DeleteOp {
  type:        'delete';
  itemId:      string;
  previous:    Transaction | undefined;
  retries:     number;
  nextRetryAt: number;
}
interface DeleteBatchOp {
  type:          'deleteBatch';
  ids:           string[];
  previousBatch: Transaction[];
  retries:       number;
  nextRetryAt:   number;
}
type Op = AddOp | UpdateOp | DeleteOp | DeleteBatchOp;

interface PendingAddResolver {
  resolve: (realId: string) => void;
  reject: (error: Error) => void;
}

// ─── Return Type ──────────────────────────────────────────────────────────────

interface UseTransactionsReturn {
  transactions:           Transaction[];
  loading:                boolean;
  error:                  Error | null;
  isBulkUpdating:         boolean;
  isUndoing:              boolean;
  hasUndoSnapshot:        boolean;
  // ── Paginação ────────────────────────────────────────────────────────────
  hasMoreTransactions:    boolean;
  isLoadingMore:          boolean;
  loadedCount:            number;
  loadMoreTransactions:   () => Promise<void>;
  // ── Operações ────────────────────────────────────────────────────────────
  add:                    (data: Partial<Transaction>) => Promise<string>;
  addBatch:               (items: Partial<Transaction>[]) => Promise<string[]>;
  addBatchStreamed:        (items: Partial<Transaction>[], onProgress?: (done: number, total: number) => void) => Promise<StreamedBatchResult>;
  remove:                 (id: string) => Promise<void>;
  removeBatch:            (ids: string[]) => Promise<void>;
  update:                 (id: string, data: Partial<Transaction>) => Promise<void>;
  bulkUpdateTransactions: (ids: string[], updates: BulkUpdate) => Promise<void>;
  undoLastBulkUpdate:     () => Promise<void>;
  clearBulkSnapshot:      () => void;
  deadLetterOps:          DeadLetterOp[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTempId(): string {
  return `__temp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function makeManualTransactionId(uid: string): string {
  return doc(collection(db, 'users', uid, 'transactions')).id;
}

function isTemp(id: string): boolean {
  return id.startsWith('__temp_');
}

function getTxCentavos(tx: Partial<Transaction>): Centavos | undefined {
  const c = tx.value_cents;
  if (typeof c === 'number' && Number.isSafeInteger(c) && c >= 0) return c as Centavos;
  return undefined;
}


async function fetchTransactionForHistory(uid: string, id: string): Promise<Transaction | undefined> {
  const txRef = doc(db, 'users', uid, 'transactions', id);
  const snap = await getDoc(txRef);
  if (!snap.exists()) return undefined;

  return normalizeTransaction({
    id,
    ...(snap.data() as Omit<Transaction, 'id'>),
  } as Transaction);
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function shouldRetrySyncError(err: unknown): boolean {
  const code = getFirebaseErrorCode(err);
  const message = getErrorMessage(err).toLowerCase();
  if (code === 'failed-precondition') return false;
  if (code === 'permission-denied' || message.includes('permission')) return false;
  if (code === 'invalid-argument' || code === 'unauthenticated') return false;
  if (message.includes('transação inválida') || message.includes('atualização inválida')) return false;
  if (message.includes('invalid') || message.includes('inválid')) return false;
  return true;
}

function userFacingSyncError(
  err: unknown,
  operation: FirebaseErrorOperation = 'transaction_sync',
): Error {
  return new Error(getUserFriendlyErrorMessage(err, operation));
}

function debugSync(message: string, operation: FirebaseErrorOperation): void {
  if (!import.meta.env.DEV) return;
  console.warn('[useTransactions]', { operation, message });
}

function operationFromQueueOp(type: Op['type']): FirebaseErrorOperation {
  switch (type) {
    case 'add':
      return 'transaction_add';
    case 'update':
      return 'transaction_update';
    case 'delete':
      return 'transaction_delete';
    case 'deleteBatch':
      return 'transaction_delete_batch';
  }
}



// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useTransactions(
  uid: string,
  userRules: import('./useCategoryRules').UserCategoryRule[] = [],
  snapshotWindow?: SnapshotWindow,
  serverSearch?: ServerSearchParams,
): UseTransactionsReturn {
  const [transactions,      setTransactions]      = useState<Transaction[]>([]);
  const [loading,           setLoading]           = useState(true);
  const [error,             setError]             = useState<Error | null>(null);
  const [isBulkUpdating,    setIsBulkUpdating]    = useState(false);
  const [isUndoing,         setIsUndoing]         = useState(false);
  const [hasUndoSnapshot,   setHasUndoSnapshot]   = useState(false);
  // ── Refs para guards sem recrear callbacks ────────────────────────────────
  const isBulkUpdatingRef  = useRef(false);
  const isUndoingRef       = useRef(false);
  const snapshotRef        = useRef<BulkSnapshot | null>(null);
  /** Espelho síncrono de `transactions` para leitura dentro de callbacks. */
  const transactionsRef    = useRef<Transaction[]>([]);

  // ── Paginação — delegada ao hook extraído ─────────────────────────────────
  const {
    hasMoreTransactions,
    isLoadingMore,
    loadMoreTransactions,
    lastPageDocRef,
    olderPagesRef,
    setHasMoreTransactions,
    resetPagination,
  } = useTransactionsPagination(uid, transactionsRef, setTransactions);

  // ── Fila de sync ──────────────────────────────────────────────────────────
  const queueRef    = useRef<Op[]>([]);
  const processing  = useRef(false);
  const dlqRef      = useRef<DeadLetterOp[]>([]);
  const [deadLetterOps, setDeadLetterOps] = useState<DeadLetterOp[]>([]);

  /**
   * tempId → item optimista ainda não confirmado.
   * Guard de órfãos e merge do snapshot.
   */
  const pendingAdds = useRef(new Map<string, Transaction>());

  /**
   * tempId → callback disparado pelo processQueue quando o docId real está disponível.
   * Usado para aplicar a categoria da IA após o write no Firestore.
   */
  const postAddCallbacks = useRef(new Map<string, (realId: string) => void>());
  const pendingAddResolvers = useRef(new Map<string, PendingAddResolver>());

  /**
   * IDs de itens com operação em voo (update / delete).
   * O snapshot ignora estes IDs enquanto a op não terminar.
   */
  const pendingIds  = useRef(new Set<string>());

  // ── onSnapshot (realtime + last-write-wins) ────────────────────────────────
  useEffect(() => {
    if (!uid) {
      setTransactions([]);
      setLoading(false);
      setError(null);
      return;
    }

    // Limpa estado de fila ao trocar de utilizador
    queueRef.current              = [];
    processing.current            = false;
    pendingAdds.current           = new Map();
    pendingIds.current            = new Set();
    postAddCallbacks.current      = new Map();
    pendingAddResolvers.current   = new Map();
    // Limpa paginação ao trocar de utilizador
    resetPagination();

    setLoading(true);
    setError(null);

    const searchTerm = (serverSearch?.term ?? '').trim().toLowerCase();
    const isTermSearch = searchTerm.length >= 2;
    const categoryFilter = serverSearch?.category?.trim() ?? '';
    const isCategorySearch = !isTermSearch && categoryFilter.length > 0;

    const q = isTermSearch
      ? query(
          collection(db, 'users', uid, 'transactions'),
          where('descriptionLower', '>=', searchTerm),
          where('descriptionLower', '<=', searchTerm + ''),
          orderBy('descriptionLower', 'asc'),
          limit(PAGE_SIZE),
        )
      : isCategorySearch
        ? query(
            collection(db, 'users', uid, 'transactions'),
            where('category', '==', categoryFilter),
            orderBy('date', 'desc'),
            limit(PAGE_SIZE),
          )
        : snapshotWindow
          ? query(
              collection(db, 'users', uid, 'transactions'),
              where('date', '>=', snapshotWindow.dateFrom),
              where('date', '<=', snapshotWindow.dateTo),
              orderBy('date', 'desc'),
              limit(PAGE_SIZE),
            )
          : query(
              collection(db, 'users', uid, 'transactions'),
              orderBy('createdAt', 'desc'),
              limit(PAGE_SIZE),
            );

    const unsub = onSnapshot(
      q,
      snap => {
        // ── Atualiza cursor e estado de "há mais" ────────────────────────────
        const snapLastDoc  = snap.docs.length > 0 ? (snap.docs[snap.docs.length - 1] ?? null) : null;
        const snapIsFull   = snap.docs.length >= PAGE_SIZE;

        if (!snapIsFull) {
          // Snapshot não cheio → ALL transações cabem na janela realtime.
          // Quaisquer páginas antigas carregadas estão cobertas (ou foram eliminadas).
          olderPagesRef.current  = [];
          lastPageDocRef.current = snapLastDoc;
          setHasMoreTransactions(false);
        } else if (olderPagesRef.current.length === 0) {
          // Snapshot cheio, ainda não carregámos páginas adicionais.
          lastPageDocRef.current = snapLastDoc;
          setHasMoreTransactions(true);
        }
        // Se snapIsFull && olderPagesRef não vazio: o cursor e hasMore foram
        // definidos pelo último loadMoreTransactions — não regredir.

        const remote: Transaction[] = snap.docs.map(d => normalizeTransaction({
          id: d.id,
          ...(d.data() as Omit<Transaction, 'id'>),
        })).filter(tx => tx.isDeleted !== true && !tx.deletedAt);

        setTransactions(prev => {
          // Índice do estado local para O(1) lookup
          const localById = new Map(prev.map(tx => [tx.id, tx]));

          // ── Merge com last-write-wins ──────────────────────────────────────
          const merged: Transaction[] = remote.map(remoteTx => {
            // Nunca substituir itens com operação pendente (update/delete em voo)
            if (pendingIds.current.has(remoteTx.id)) {
              return localById.get(remoteTx.id) ?? remoteTx;
            }

            const localTx = localById.get(remoteTx.id);
            if (!localTx) return remoteTx; // novo item remoto

            // Last-write-wins: quem tem updatedAt mais recente vence
            const remoteMs = toMillis(remoteTx.updatedAt);
            const localMs  = toMillis(localTx.updatedAt);
            return remoteMs > localMs ? remoteTx : localTx;
          });

          // Preserva itens optimistas (tempId) não presentes no remoto
          const remoteIds    = new Set(remote.map(tx => tx.id));
          const stillPending = Array.from(pendingAdds.current.values())
            .filter(tx => !remoteIds.has(tx.id));

          // Funde páginas antigas, deduplicando contra a página realtime
          const uniqueOlder = mergeTransactionPages(
            [...stillPending, ...merged],
            olderPagesRef.current,
          ).slice([...stillPending, ...merged].length);

          return [...stillPending, ...merged, ...uniqueOlder];
        });

        setLoading(false);
      },
      err => {
        logSanitizedFirebaseError('transaction_snapshot', err);
        setError(new Error(getUserFriendlyErrorMessage(err, 'transaction_snapshot')));
        setLoading(false);
      }
    );

    return () => unsub();
  // snapshotWindow strings are primitives — safe as direct deps
  }, [uid, snapshotWindow?.dateFrom, snapshotWindow?.dateTo]);

  // ── Mantém transactionsRef sincronizado para leitura nos callbacks ─────────
  useEffect(() => { transactionsRef.current = transactions; }, [transactions]);

  // ── processQueue ───────────────────────────────────────────────────────────
  const processQueue = useCallback(async (): Promise<void> => {
    if (processing.current || !uid) return;
    processing.current = true;

    while (queueRef.current.length > 0) {
      const op = queueRef.current[0]!;

      // Aguarda janela de backoff antes de retentar
      if (op.nextRetryAt > Date.now()) break;

      // Descarta ops de add órfãos
      if (op.type === 'add' && !pendingAdds.current.has(op.tempId)) {
        pendingAddResolvers.current.get(op.tempId)?.reject(new Error('Movimentação otimista cancelada antes da confirmação.'));
        pendingAddResolvers.current.delete(op.tempId);
        queueRef.current.shift();
        continue;
      }

      try {
        switch (op.type) {
          case 'add': {
            // Modo Blaze: callable server-trusted com App Check + audit atômico via Admin SDK.
            debugSync('iniciando criação via callable server-trusted', 'transaction_add');
            const callCreateTransaction = httpsCallable<Record<string, unknown>, { id: string }>(
              functions, 'createTransaction'
            );
            const callPayload: Record<string, unknown> = {
              description: op.data.description ?? '',
              value_cents:  op.data.value_cents,
              type:         op.data.type ?? 'saida',
              category:     op.data.category ?? 'Outros',
              date:         op.data.date ?? new Date().toISOString().slice(0, 10),
              source:       'manual',
              isRecurring:  op.data.isRecurring ?? false,
            };
            if (op.data.account   !== undefined) callPayload['account']   = op.data.account;
            if (op.data.accountId !== undefined) callPayload['accountId'] = op.data.accountId;
            if (op.data.cardId    !== undefined) callPayload['cardId']    = op.data.cardId;
            if (op.data.fitId     !== undefined) callPayload['fitId']     = op.data.fitId;
            if (Array.isArray(op.data.tags) && op.data.tags.length > 0) callPayload['tags'] = op.data.tags;
            const result = await callCreateTransaction(callPayload);
            const realId = result.data.id;
            debugSync('callable confirmado', 'transaction_add');
            // O batch já escreveu transação + history de forma atômica — sem log CREATE separado
            const aiCb = postAddCallbacks.current.get(op.tempId);
            if (aiCb) {
              postAddCallbacks.current.delete(op.tempId);
              aiCb(realId);
            }
            // Remove item temporário; snapshot traz o item real com timestamps do servidor
            pendingAdds.current.delete(op.tempId);
            pendingAddResolvers.current.get(op.tempId)?.resolve(realId);
            pendingAddResolvers.current.delete(op.tempId);
            setTransactions(prev => prev.filter(tx => tx.id !== op.tempId));
            break;
          }
          case 'update':
            // updatedAt: serverTimestamp() sempre enviado pelo FirestoreService
            debugSync('iniciando atualização de movimentação', 'transaction_update');

            {
              const canonicalPrevious = await fetchTransactionForHistory(uid, op.itemId);
              const historySource = canonicalPrevious ?? op.previous;

              if (!historySource) {
                pendingIds.current.delete(op.itemId);
                break;
              }

              const writeData = buildUpdateWriteData(historySource, op.requestedData);
              const before = sanitizeForHistory(historySource);
              const after  = sanitizeForHistory({ ...historySource, ...writeData });
              await FirestoreService.updateTransactionWithHistory(uid, op.itemId, writeData, {
                before,
                after,
                changedFields: computeChangedFields(before, after),
                ...(typeof after['value_cents'] === 'number' ? { amount_cents: after['value_cents'] } : {}),
                ...(typeof after['category']   === 'string'  ? { category:     after['category']   } : {}),
              });
            }

            pendingIds.current.delete(op.itemId);
            break;
          case 'delete':
            if (op.previous) {
              const before = sanitizeForHistory(op.previous);
              await FirestoreService.softDeleteTransactionWithHistory(uid, op.itemId, {
                before,
                ...(typeof before['value_cents'] === 'number' ? { amount_cents: before['value_cents'] } : {}),
                ...(typeof before['category']   === 'string'  ? { category:     before['category']   } : {}),
              });
            } else {
              // Modelo A: fetch current state to build history when not in memory
              const txRef = doc(db, 'users', uid, 'transactions', op.itemId);
              const snap = await getDoc(txRef);
              if (snap.exists()) {
                const fetched = snap.data() as Transaction;
                const before = sanitizeForHistory(fetched);
                await FirestoreService.softDeleteTransactionWithHistory(uid, op.itemId, {
                  before,
                  ...(typeof before['value_cents'] === 'number' ? { amount_cents: before['value_cents'] } : {}),
                  ...(typeof before['category']   === 'string'  ? { category:     before['category']   } : {}),
                });
              }
            }
            pendingIds.current.delete(op.itemId);
            break;
          case 'deleteBatch': {
            // Modelo A: always use WithHistory. Fetch orphan docs not in previousBatch.
            const snapIds = new Set(op.previousBatch.map(tx => tx.id));
            const orphanIds = op.ids.filter(id => !snapIds.has(id));
            let allTx: Transaction[] = [...op.previousBatch];
            if (orphanIds.length > 0) {
              const fetched = await Promise.all(
                orphanIds.map(async id => {
                  const txRef = doc(db, 'users', uid, 'transactions', id);
                  const s = await getDoc(txRef);
                  return s.exists() ? (s.data() as Transaction) : null;
                })
              );
              allTx = [...allTx, ...(fetched.filter(Boolean) as Transaction[])];
            }
            if (allTx.length > 0) {
              await FirestoreService.deleteBatchTransactionsWithHistory(uid, allTx);
            }
            op.ids.forEach(id => pendingIds.current.delete(id));
            break;
          }
        }
        queueRef.current.shift();

      } catch (err) {
        op.retries++;
        const operation = operationFromQueueOp(op.type);
        logSanitizedFirebaseError(operation, err);

        if (op.retries >= MAX_RETRIES || !shouldRetrySyncError(err)) {
          console.warn('[SyncQueue] operação descartada após tentativas', { operation });
          const dlqEntry: DeadLetterOp = { type: op.type, operation, failedAt: Date.now() };
          dlqRef.current = [...dlqRef.current, dlqEntry];
          setDeadLetterOps([...dlqRef.current]);
          const finalError = userFacingSyncError(err, operation);
          const hasAwaiter = op.type === 'add' && pendingAddResolvers.current.has(op.tempId);
          if (!hasAwaiter) toast.error(finalError.message);

          // Rollback + limpa pendingIds
          if (op.type === 'add') {
            postAddCallbacks.current.delete(op.tempId);
            pendingAddResolvers.current.get(op.tempId)?.reject(finalError);
            pendingAddResolvers.current.delete(op.tempId);
            pendingAdds.current.delete(op.tempId);
            setTransactions(prev => prev.filter(tx => tx.id !== op.tempId));

          } else if (op.type === 'update' && op.previous !== undefined) {
            const restored = op.previous;
            pendingIds.current.delete(op.itemId);
            setTransactions(prev =>
              prev.map(tx => tx.id === op.itemId ? restored : tx)
            );

          } else if (op.type === 'delete' && op.previous !== undefined) {
            const restored = op.previous;
            pendingIds.current.delete(op.itemId);
            setTransactions(prev => [restored, ...prev]);

          } else if (op.type === 'deleteBatch') {
            op.ids.forEach(id => pendingIds.current.delete(id));
            if (op.previousBatch.length > 0) {
              const restoredBatch = op.previousBatch;
              setTransactions(prev => [...restoredBatch, ...prev]);
            }
          }

          queueRef.current.shift();
        } else {
          op.nextRetryAt = Date.now() + computeBackoffMs(op.retries);
          break; // retry após janela de backoff
        }
      }
    }

    processing.current = false;
  }, [uid]);

  // ── Ref estável para event listeners ──────────────────────────────────────
  const processQueueRef = useRef(processQueue);
  useEffect(() => { processQueueRef.current = processQueue; }, [processQueue]);

  // ── Retry: online event + polling ─────────────────────────────────────────
  useEffect(() => {
    const trigger = (): void => { void processQueueRef.current(); };
    const onOnline = (): void => {
      // Rede voltou — reseta backoff de todas as ops pendentes para retomada imediata
      queueRef.current.forEach(op => { op.nextRetryAt = 0; });
      void processQueueRef.current();
    };
    window.addEventListener('online', onOnline);
    const timer = setInterval(trigger, RETRY_INTERVAL_MS);
    return () => {
      window.removeEventListener('online', onOnline);
      clearInterval(timer);
    };
  }, []);

  // ── enqueue ────────────────────────────────────────────────────────────────
  const enqueue = useCallback((op: Op): void => {
    queueRef.current.push(op);
    void processQueue();
  }, [processQueue]);

  // ── ADD — Optimistic + enqueue ────────────────────────────────────────────
  const add = useCallback(async (data: Partial<Transaction>): Promise<string> => {
    if (!uid) throw new Error('[useTransactions][add] UID ausente.');

    // 1. Deterministic categorization — never overwrite a set value
    const enriched: Partial<Transaction> = normalizeWriteData(data);
    if (!enriched.category && enriched.description) {
      // FIX P0.1: regras do usuário aplicadas antes do histórico/dicionário
      const suggested = categorizeTransaction(enriched.description, transactionsRef.current, userRules);
      if (suggested) enriched.category = suggested;
    }

    const now    = Date.now();
    const tempId = makeTempId();
    const txId   = makeManualTransactionId(uid);
    const optimisticCentavos = getTxCentavos(enriched) ?? (0 as Centavos);
    const optimistic: Transaction = {
      description: '',
      value:       fromCentavos(optimisticCentavos),
      value_cents: optimisticCentavos,
      type:        'saida',
      category:    'Outros',
      date:        new Date().toISOString().slice(0, 10),
      ...enriched,
      id:        tempId,
      uid,
      // Timestamps locais para LWW até serverTimestamp() chegar via snapshot
      createdAt: now,
      updatedAt: now,
    } as Transaction;

    // 2. AI fallback — only when deterministic returned nothing; fire-and-forget after Firestore write
    if (!enriched.category && enriched.description) {
      const desc            = enriched.description;
      const capturedUid     = uid;
      const initialCategory = optimistic.category;
      postAddCallbacks.current.set(tempId, (realId: string) => {
        void categorizeWithAI(desc, capturedUid).then(aiCat => {
          // Guard: only update when AI returned something meaningful
          if (aiCat && aiCat !== 'Outros') {
            void FirestoreService.updateTransactionWithHistory(capturedUid, realId, { category: aiCat }, {
              before:        { category: initialCategory },
              after:         { category: aiCat },
              changedFields: ['category'],
              origin:        'ai',
              category:      aiCat,
              amount_cents:  Number(optimisticCentavos),
            }).catch(error => {
              logSanitizedFirebaseError('ai_category', error);
            });
          }
        });
      });
    }

    pendingAdds.current.set(tempId, optimistic);
    setTransactions(prev => [optimistic, ...prev]);

    return new Promise<string>((resolve, reject) => {
      pendingAddResolvers.current.set(tempId, { resolve, reject });
      enqueue({ type: 'add', tempId, txId, data: enriched, retries: 0, nextRetryAt: 0 });
    });
  }, [uid, enqueue]);

  // ── UPDATE — Optimistic + enqueue ─────────────────────────────────────────
  const update = useCallback(async (id: string, data: Partial<Transaction>): Promise<void> => {
    if (!uid || !id) throw new Error('[useTransactions][update] UID ou ID ausente.');
    if (isTemp(id)) return; // aguarda confirmação do add

    const current = transactionsRef.current.find(tx => tx.id === id);
    const previous = current;
    const requestedData = normalizeWriteData(data);
    const normalizedData = buildUpdateWriteData(current, data);

    // Regista como pendente antes do optimistic update
    pendingIds.current.add(id);

    setTransactions(prev => {
      return prev.map(tx =>
        tx.id === id
          // updatedAt local em ms; será substituído por serverTimestamp() no snapshot
          ? { ...tx, ...normalizedData, updatedAt: Date.now() } as Transaction
          : tx
      );
    });

    enqueue({ type: 'update', itemId: id, data: normalizedData, requestedData, previous, retries: 0, nextRetryAt: 0 });
  }, [uid, enqueue]);

  // ── REMOVE — Optimistic + enqueue ─────────────────────────────────────────
  const remove = useCallback(async (id: string): Promise<void> => {
    if (!uid || !id) throw new Error('[useTransactions][remove] UID ou ID ausente.');

    if (isTemp(id)) {
      // Cancela add pendente sem enfileirar delete
      pendingAdds.current.delete(id);
      setTransactions(prev => prev.filter(tx => tx.id !== id));
      return;
    }

    pendingIds.current.add(id);

    const previous = transactionsRef.current.find(tx => tx.id === id);
    setTransactions(prev => {
      return prev.filter(tx => tx.id !== id);
    });

    enqueue({ type: 'delete', itemId: id, previous, retries: 0, nextRetryAt: 0 });
  }, [uid, enqueue]);

  // ── ADD BATCH — Optimistic UI + enqueue (1 processQueue trigger) ──────────
  const addBatch = useCallback(async (items: Partial<Transaction>[]): Promise<string[]> => {
    if (!uid) throw new Error('[useTransactions][addBatch] UID ausente.');
    if (!items.length) return [];

    const now       = Date.now();
    const tempIds:     string[]      = [];
    const optimistics: Transaction[] = [];

    items.forEach(data => {
      // 1. Deterministic categorization — never overwrite a set value
      const enriched: Partial<Transaction> = normalizeWriteData(data);
      if (!enriched.category && enriched.description) {
        // FIX P0.1: regras do usuário aplicadas antes do histórico/dicionário
      const suggested = categorizeTransaction(enriched.description, transactionsRef.current, userRules);
        if (suggested) enriched.category = suggested;
      }

      const tempId: string = makeTempId();
      const txId:   string = makeManualTransactionId(uid);
      const optimisticCentavos = getTxCentavos(enriched) ?? (0 as Centavos);
      const optimistic: Transaction = {
        description: '',
        value:       fromCentavos(optimisticCentavos),
        value_cents: optimisticCentavos,
        type:        'saida',
        category:    'Outros',
        date:        new Date().toISOString().slice(0, 10),
        ...enriched,
        id:        tempId,
        uid,
        createdAt: now,
        updatedAt: now,
      } as Transaction;

      // 2. AI fallback per item — concurrency controlled by AICategorizationService
      if (!enriched.category && enriched.description) {
        const desc            = enriched.description;
        const capturedUid     = uid;
        const initialCategory = optimistic.category;
        postAddCallbacks.current.set(tempId, (realId: string) => {
          void categorizeWithAI(desc, capturedUid).then(aiCat => {
            if (aiCat && aiCat !== 'Outros') {
              void FirestoreService.updateTransactionWithHistory(capturedUid, realId, { category: aiCat }, {
                before:        { category: initialCategory },
                after:         { category: aiCat },
                changedFields: ['category'],
                origin:        'ai',
                category:      aiCat,
                amount_cents:  Number(optimisticCentavos),
              }).catch(error => {
                logSanitizedFirebaseError('ai_category', error);
              });
            }
          });
        });
      }

      pendingAdds.current.set(tempId, optimistic);
      optimistics.push(optimistic);
      tempIds.push(tempId);
      // Push directly to avoid N processQueue triggers; one call below handles all
      queueRef.current.push({ type: 'add', tempId, txId, data: enriched, retries: 0, nextRetryAt: 0 });
    });

    setTransactions(prev => [...optimistics, ...prev]);
    void processQueue();

    return tempIds;
  }, [uid, processQueue]);

  // ── ADD BATCH STREAMED — Chunked async import com progress callback ────────
  const addBatchStreamed = useCallback(async (
    items: Partial<Transaction>[],
    onProgress?: (done: number, total: number) => void,
  ): Promise<StreamedBatchResult> => {
    if (!uid) throw new Error('[useTransactions][addBatchStreamed] UID ausente.');
    if (!items.length) return { succeeded: [], failed: [] };

    const CHUNK_SIZE = 10;
    const succeeded: string[]                                    = [];
    const failed: StreamedBatchResult['failed']                  = [];

    for (let i = 0; i < items.length; i += CHUNK_SIZE) {
      const chunk = items.slice(i, i + CHUNK_SIZE);

      const results = await Promise.allSettled(
        chunk.map(item => add(item))
      );

      results.forEach((result, j) => {
        const item = chunk[j]!;
        if (result.status === 'fulfilled') {
          succeeded.push(result.value);
        } else {
          failed.push({ item, error: result.reason instanceof Error ? result.reason : new Error(String(result.reason)) });
        }
      });

      onProgress?.(Math.min(i + CHUNK_SIZE, items.length), items.length);

      // Cede ao event loop entre chunks para não bloquear a UI
      await new Promise<void>(resolve => { queueMicrotask(resolve); });
    }

    return { succeeded, failed };
  }, [uid, add]);

  // ── REMOVE BATCH — Optimistic + enqueue ───────────────────────────────────
  const removeBatch = useCallback(async (ids: string[]): Promise<void> => {
    if (!uid || !ids.length) return;

    const idSet   = new Set(ids);
    const tempIds = ids.filter(id => isTemp(id));
    const realIds = ids.filter(id => !isTemp(id));

    // Cancela adds pendentes sem enfileirar
    tempIds.forEach(tid => pendingAdds.current.delete(tid));

    // Marca IDs reais como pendentes
    realIds.forEach(id => pendingIds.current.add(id));

    const previousBatch = transactionsRef.current.filter(tx => idSet.has(tx.id) && !isTemp(tx.id));

    setTransactions(prev => {
      return prev.filter(tx => !idSet.has(tx.id));
    });

    if (realIds.length > 0) {
      enqueue({ type: 'deleteBatch', ids: realIds, previousBatch, retries: 0, nextRetryAt: 0 });
    }
  }, [uid, enqueue]);

  // ── clearBulkSnapshot — exposto para o timer de 10s do toast ─────────────
  const clearBulkSnapshot = useCallback((): void => {
    if (!snapshotRef.current) return;
    snapshotRef.current = null;
    setHasUndoSnapshot(false);
  }, []);

  // ── BULK UPDATE — Snapshot → Chunking 500 → loading guard ─────────────────
  const bulkUpdateTransactions = useCallback(async (
    ids: string[],
    updates: BulkUpdate
  ): Promise<void> => {
    if (!uid || !ids.length) return;

    // Captura snapshot ANTES do update (lê ref síncrono para evitar stale closure)
    // newCategory registada para permitir log replayable no undo (from → to)
    const snap: BulkSnapshot = ids.reduce<BulkSnapshot>((acc, id) => {
      const tx = transactionsRef.current.find(t => t.id === id);
      if (tx) {
        const before = sanitizeForHistory(tx);
        before['category'] = tx.category ?? 'Outros';
        if (typeof tx.value_cents !== 'number') delete before['value_cents'];

        const item: BulkSnapshot[number] = { id, oldCategory: tx.category ?? 'Outros', before };
        if (updates.category !== undefined) item.newCategory = updates.category;
        acc.push(item);
      }
      return acc;
    }, []);

    snapshotRef.current = snap;
    setHasUndoSnapshot(snap.length > 0);

    isBulkUpdatingRef.current = true;
    setIsBulkUpdating(true);
    try {
      const bulkCorrId = generateSafeOperationId('bulk');

      // Modelo A: always use WithHistory. Fetch orphan docs not in memory snap.
      const snapIds = new Set(snap.map(s => s.id));
      const orphanIds = ids.filter(id => !snapIds.has(id));
      let fullSnap: BulkSnapshot = [...snap];
      if (orphanIds.length > 0) {
        const fetched = await Promise.all(
          orphanIds.map(async id => {
            const txRef = doc(db, 'users', uid, 'transactions', id);
            const s = await getDoc(txRef);
            if (!s.exists()) return null;
            const tx = s.data() as Transaction;
            const before = sanitizeForHistory(tx);
            before['category'] = tx.category ?? 'Outros';
            if (typeof tx.value_cents !== 'number') delete before['value_cents'];
            const item: BulkSnapshot[number] = { id, oldCategory: tx.category ?? 'Outros', before };
            if (updates.category !== undefined) item.newCategory = updates.category;
            return item;
          })
        );
        fullSnap = [...fullSnap, ...(fetched.filter(Boolean) as BulkSnapshot)];
      }
      if (fullSnap.length > 0) {
        await FirestoreService.batchUpdateTransactionsWithHistory(uid, fullSnap, updates, bulkCorrId);
      }

      // Auditoria global — fire-and-forget após todos os commits (nunca bloqueia UI)
      void AuditService.logAction({
        userId:  uid,
        action:  'BULK_UPDATE',
        entity:  'TRANSACTION',
        details: `Alterou ${ids.length} transações para '${updates.category ?? ''}'`,
        metadata: {
          count:   ids.length,
          changes: snap.map(s => ({ id: s.id, from: s.oldCategory, to: updates.category ?? 'Outros' })),
        },
      });
    } catch (err) {
      // Update falhou — snapshot inválido, descarta
      snapshotRef.current = null;
      setHasUndoSnapshot(false);
      throw err;
    } finally {
      isBulkUpdatingRef.current = false;
      setIsBulkUpdating(false);
    }
  }, [uid]);

  // ── UNDO — Reverte categorias via snapshot em memória ─────────────────────
  const undoLastBulkUpdate = useCallback(async (): Promise<void> => {
    // Guards via refs (sem recriação de callback)
    if (!snapshotRef.current || isBulkUpdatingRef.current || isUndoingRef.current) return;
    if (!uid) return;

    const snap = snapshotRef.current;

    isUndoingRef.current = true;
    setIsUndoing(true);

    try {
      const undoCorrId = generateSafeOperationId('undo');
      await FirestoreService.batchUndoBulkUpdateTransactionsWithHistory(uid, snap, undoCorrId);

      // Auditoria global — fire-and-forget após todos os commits (nunca bloqueia UI)
      void AuditService.logAction({
        userId:  uid,
        action:  'UNDO_BULK_UPDATE',
        entity:  'TRANSACTION',
        details: `Desfez ${snap.length} transações`,
        metadata: {
          count:   snap.length,
          // from = categoria aplicada pelo bulk update; to = categoria original restaurada
          changes: snap.map(s => ({ id: s.id, from: s.newCategory ?? 'unknown', to: s.oldCategory })),
        },
      });

      snapshotRef.current = null;
      setHasUndoSnapshot(false);
    } finally {
      isUndoingRef.current = false;
      setIsUndoing(false);
    }
  }, [uid]);

  return {
    transactions,
    loading,
    error,
    isBulkUpdating,
    isUndoing,
    hasUndoSnapshot,
    // When snapshotWindow is active, pagination is incompatible (snapshot uses
    // orderBy('date') while loadMoreTransactions cursor uses orderBy('createdAt')).
    // Block loadMore to prevent invalid cross-index cursor reads.
    hasMoreTransactions: snapshotWindow ? false : hasMoreTransactions,
    isLoadingMore: snapshotWindow ? false : isLoadingMore,
    loadedCount: transactions.filter(tx => !isTemp(tx.id)).length,
    loadMoreTransactions: snapshotWindow ? (async () => Promise.resolve()) : loadMoreTransactions,
    add,
    addBatch,
    addBatchStreamed,
    remove,
    removeBatch,
    update,
    bulkUpdateTransactions,
    undoLastBulkUpdate,
    clearBulkSnapshot,
    deadLetterOps,
  };
}
