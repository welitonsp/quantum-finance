import { useState, useEffect, useCallback, useRef } from 'react';
import {
  collection, query, orderBy, onSnapshot, limit,
  doc, getDoc, getDocs, startAfter,
  type QueryDocumentSnapshot, type DocumentData, type Timestamp,
} from 'firebase/firestore';
import { db } from '../shared/api/firebase/index';
import { FirestoreService } from '../shared/services/FirestoreService';
import { AuditService } from '../shared/services/AuditService';
import type { Transaction } from '../shared/types/transaction';
import { fromCentavos, type Centavos } from '../shared/types/money';
import { categorizeTransaction } from '../utils/aiCategorize';
import { categorizeWithAI } from '../services/AICategorizationService';
import { PAGE_SIZE, mergeTransactionPages, hasMorePages } from '../utils/transactionPagination';
import {
  getFirebaseErrorCode,
  getUserFriendlyErrorMessage,
  logSanitizedFirebaseError,
  type FirebaseErrorOperation,
} from '../shared/lib/firebaseErrorHandling';
import { generateSafeOperationId } from '../shared/lib/operationTrace';
import toast from 'react-hot-toast';

// ─── Bulk Update — tipo restrito (não expõe Partial<Transaction> livre) ────────
export type BulkUpdate = {
  category?: string;
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

// ─── Op Types (sem any) ───────────────────────────────────────────────────────

interface AddOp {
  type:    'add';
  tempId:  string;
  txId:    string;
  data:    Partial<Transaction>;
  retries: number;
}
interface UpdateOp {
  type:     'update';
  itemId:   string;
  data:     Partial<Transaction>;
  requestedData: Partial<Transaction>;
  previous: Transaction | undefined;
  retries:  number;
}
interface DeleteOp {
  type:     'delete';
  itemId:   string;
  previous: Transaction | undefined;
  retries:  number;
}
interface DeleteBatchOp {
  type:          'deleteBatch';
  ids:           string[];
  previousBatch: Transaction[];
  retries:       number;
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
  remove:                 (id: string) => Promise<void>;
  removeBatch:            (ids: string[]) => Promise<void>;
  update:                 (id: string, data: Partial<Transaction>) => Promise<void>;
  bulkUpdateTransactions: (ids: string[], updates: BulkUpdate) => Promise<void>;
  undoLastBulkUpdate:     () => Promise<void>;
  clearBulkSnapshot:      () => void;
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

function normalizeTransaction(tx: Transaction): Transaction {
  // FIX: O cliente não deve reconstruir value_cents a partir de value legado nem na leitura.
  // Se estiver ausente, a transação é considerada incompleta (Admin Repair).
  const rawCents = tx.value_cents;
  const value_cents = (typeof rawCents === 'number' && Number.isSafeInteger(rawCents) && rawCents >= 0)
    ? (rawCents as Centavos)
    : (0 as Centavos); // Fallback apenas para exibição UI, mas schemaVersion continua original

  return {
    ...tx,
    value_cents,
    value: fromCentavos(value_cents),
    schemaVersion: tx.schemaVersion ?? 1, // Preserva versão original se não for 2
  };
}

function normalizeWriteData(data: Partial<Transaction>): Partial<Transaction> {
  const {
    id: _id,
    uid: _uid,
    value: _legacyValue,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    deletedAt: _deletedAt,
    importHash: _importHash,
    isDeleted: _isDeleted,
    value_cents: rawCents,
    ...rest
  } = data;
  void _id;
  void _uid;
  void _legacyValue;
  void _createdAt;
  void _updatedAt;
  void _deletedAt;
  void _importHash;
  void _isDeleted;

  const result: Partial<Transaction> = { schemaVersion: 2 };

  // Filtra undefined para garantir que propriedades ausentes não existam no payload
  Object.entries(rest).forEach(([key, val]) => {
    if (val !== undefined) {
      (result as Record<string, unknown>)[key] = val;
    }
  });

  if (typeof rawCents === 'number' && Number.isSafeInteger(rawCents) && rawCents >= 0) {
    result.value_cents = rawCents as Centavos;
  }

  return result;
}

function buildUpdateWriteData(current: Transaction | undefined, data: Partial<Transaction>): Partial<Transaction> {
  const base: Partial<Transaction> = {};
  if (current) {
    // FIX: Somente preservar value_cents se for um inteiro seguro vindo do SNAPSHOT real (schemaVersion 2).
    const currentCents = current.value_cents;
    if (current.schemaVersion === 2 && typeof currentCents === 'number' && Number.isSafeInteger(currentCents) && currentCents >= 0) {
      base.value_cents = currentCents as Centavos;
    }

    base.schemaVersion = 2;

    // Normalização defensiva do snapshot — não "inventar" type se estiver ausente
    if (current.type) {
      const rawType = String(current.type).toLowerCase();
      if (rawType === 'entrada' || rawType === 'receita') {
        base.type = 'entrada';
      } else if (rawType === 'saida' || rawType === 'despesa') {
        base.type = 'saida';
      }
    }

    if (current.source) {
      const rawSource = String(current.source).toLowerCase();
      if (rawSource === 'csv') base.source = 'csv';
      else if (rawSource === 'ofx') base.source = 'ofx';
      else if (rawSource === 'pdf') base.source = 'pdf';
      else if (rawSource === 'manual') base.source = 'manual';
      else base.source = 'manual'; // REPARO de valor inválido presente
    }
  }

  // FIX: Priorizar value_cents vindo de data. Ignorar data.value para integridade financeira.
  const incomingCents = data.value_cents;
  let finalCents: Centavos | undefined = base.value_cents;

  if (typeof incomingCents === 'number' && Number.isSafeInteger(incomingCents) && incomingCents >= 0) {
    finalCents = incomingCents as Centavos;
  }

  const merged: Partial<Transaction> = {
    ...base,
    ...data,
  };

  if (finalCents !== undefined) {
    merged.value_cents = finalCents;
  } else {
    delete merged.value_cents;
  }

  // Normalização final do campo source no payload de escrita
  if (merged.source) {
    const s = String(merged.source).toLowerCase();
    if (s === 'csv') merged.source = 'csv';
    else if (s === 'ofx') merged.source = 'ofx';
    else if (s === 'pdf') merged.source = 'pdf';
    else if (s === 'manual') merged.source = 'manual';
    else merged.source = 'manual';
  }

  return normalizeWriteData(merged);
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

/**
 * Normaliza qualquer forma de timestamp (Firestore Timestamp, number ms, string ISO)
 * para milissegundos (number).  Devolve 0 se não reconhecido.
 */
function toMillis(ts: Transaction['updatedAt'] | Transaction['createdAt']): number {
  if (ts === null || ts === undefined) return 0;
  // Firestore Timestamp — tem o método toMillis()
  if (typeof ts === 'object' && 'toMillis' in ts) {
    return (ts as Timestamp).toMillis();
  }
  if (typeof ts === 'number') return ts;
  if (typeof ts === 'string') {
    const parsed = Date.parse(ts);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

// ─── Helpers de histórico (puros) ─────────────────────────────────────────────

/**
 * Serializa uma transação para o payload de histórico.
 * Exclui id, uid, value (legado) e importHash — campos proibidos ou redundantes com o path.
 * Filtra undefined para garantir escrita válida no Firestore.
 */
export function sanitizeForHistory(tx: Partial<Transaction>): Record<string, unknown> {
  const excluded = new Set<string>(['id', 'uid', 'value', 'importHash', '_lastOpId', 'correlationId']);
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(tx)) {
    if (!excluded.has(k) && v !== undefined) {
      result[k] = v;
    }
  }
  return result;
}

/**
 * Retorna os nomes dos campos que diferem entre before e after.
 * Usa JSON.stringify para comparação — suficiente para tipos primitivos e objetos simples.
 */
function computeChangedFields(
  before: Record<string, unknown>,
  after:  Record<string, unknown>,
): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].filter(k => {
    try {
      return JSON.stringify(before[k]) !== JSON.stringify(after[k]);
    } catch {
      return before[k] !== after[k];
    }
  });
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useTransactions(
  uid: string,
  userRules: import('./useCategoryRules').UserCategoryRule[] = []
): UseTransactionsReturn {
  const [transactions,      setTransactions]      = useState<Transaction[]>([]);
  const [loading,           setLoading]           = useState(true);
  const [error,             setError]             = useState<Error | null>(null);
  const [isBulkUpdating,    setIsBulkUpdating]    = useState(false);
  const [isUndoing,         setIsUndoing]         = useState(false);
  const [hasUndoSnapshot,   setHasUndoSnapshot]   = useState(false);
  // ── Paginação ──────────────────────────────────────────────────────────────
  const [hasMoreTransactions, setHasMoreTransactions] = useState(false);
  const [isLoadingMore,       setIsLoadingMore]       = useState(false);

  // ── Refs para guards sem recrear callbacks ────────────────────────────────
  const isBulkUpdatingRef  = useRef(false);
  const isUndoingRef       = useRef(false);
  const snapshotRef        = useRef<BulkSnapshot | null>(null);
  /** Espelho síncrono de `transactions` para leitura dentro de callbacks. */
  const transactionsRef    = useRef<Transaction[]>([]);

  // ── Refs de paginação ─────────────────────────────────────────────────────
  /** Último documento da página mais recentemente carregada; cursor para startAfter. */
  const lastPageDocRef   = useRef<QueryDocumentSnapshot<DocumentData> | null>(null);
  /** Transações de páginas antigas (getDocs); fundidas com o estado no render. */
  const olderPagesRef    = useRef<Transaction[]>([]);
  /** Guard contra loadMore concorrente. */
  const isLoadingMoreRef = useRef(false);

  // ── Fila de sync ──────────────────────────────────────────────────────────
  const queueRef    = useRef<Op[]>([]);
  const processing  = useRef(false);

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
    olderPagesRef.current         = [];
    lastPageDocRef.current        = null;
    isLoadingMoreRef.current      = false;
    setHasMoreTransactions(false);
    setIsLoadingMore(false);

    setLoading(true);
    setError(null);

    const q = query(
      collection(db, 'users', uid, 'transactions'),
      orderBy('createdAt', 'desc'),
      limit(PAGE_SIZE)
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
  }, [uid]);

  // ── Mantém transactionsRef sincronizado para leitura nos callbacks ─────────
  useEffect(() => { transactionsRef.current = transactions; }, [transactions]);

  // ── processQueue ───────────────────────────────────────────────────────────
  const processQueue = useCallback(async (): Promise<void> => {
    if (processing.current || !uid) return;
    processing.current = true;

    while (queueRef.current.length > 0) {
      const op = queueRef.current[0]!;

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
            // Modo Spark: transação + history gravados atomicamente por writeBatch validado em Rules.
            debugSync('iniciando criação manual via batch Firestore', 'transaction_add');
            const realId = await FirestoreService.createManualTransactionWithHistory(uid, op.data, op.txId);
            debugSync('batch Firestore confirmado', 'transaction_add');
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
          break; // retry no próximo trigger
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
    window.addEventListener('online', trigger);
    const timer = setInterval(trigger, RETRY_INTERVAL_MS);
    return () => {
      window.removeEventListener('online', trigger);
      clearInterval(timer);
    };
  }, []);

  // ── enqueue ────────────────────────────────────────────────────────────────
  const enqueue = useCallback((op: Op): void => {
    queueRef.current.push(op);
    void processQueue();
  }, [processQueue]);

  // ── loadMoreTransactions ───────────────────────────────────────────────────
  const loadMoreTransactions = useCallback(async (): Promise<void> => {
    if (!uid || isLoadingMoreRef.current || !lastPageDocRef.current) return;

    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);

    try {
      const q = query(
        collection(db, 'users', uid, 'transactions'),
        orderBy('createdAt', 'desc'),
        startAfter(lastPageDocRef.current),
        limit(PAGE_SIZE)
      );

      const snap = await getDocs(q);

      const newDocs = snap.docs
        .map(d => normalizeTransaction({
          id: d.id,
          ...(d.data() as Omit<Transaction, 'id'>),
        }))
        .filter(tx => tx.isDeleted !== true && !tx.deletedAt);

      // Atualiza cursor para o último documento desta página
      if (snap.docs.length > 0) {
        lastPageDocRef.current = snap.docs[snap.docs.length - 1] ?? null;
      }

      // Deduplica contra o estado actual (inclui páginas antigas já carregadas)
      const existingIds = new Set(transactionsRef.current.map(tx => tx.id));
      const uniqueNew   = newDocs.filter(tx => !existingIds.has(tx.id));

      olderPagesRef.current = [...olderPagesRef.current, ...uniqueNew];

      setHasMoreTransactions(hasMorePages(PAGE_SIZE, snap.docs.length));

      if (uniqueNew.length > 0) {
        setTransactions(prev => {
          const prevIds  = new Set(prev.map(tx => tx.id));
          const deduped  = uniqueNew.filter(tx => !prevIds.has(tx.id));
          return [...prev, ...deduped];
        });
      }
    } catch (err) {
      logSanitizedFirebaseError('transaction_load_more', err);
      toast.error(getUserFriendlyErrorMessage(err, 'transaction_load_more'));
    } finally {
      isLoadingMoreRef.current = false;
      setIsLoadingMore(false);
    }
  }, [uid]);

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
      enqueue({ type: 'add', tempId, txId, data: enriched, retries: 0 });
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

    enqueue({ type: 'update', itemId: id, data: normalizedData, requestedData, previous, retries: 0 });
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

    enqueue({ type: 'delete', itemId: id, previous, retries: 0 });
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
      queueRef.current.push({ type: 'add', tempId, txId, data: enriched, retries: 0 });
    });

    setTransactions(prev => [...optimistics, ...prev]);
    void processQueue();

    return tempIds;
  }, [uid, processQueue]);

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
      enqueue({ type: 'deleteBatch', ids: realIds, previousBatch, retries: 0 });
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
    hasMoreTransactions,
    isLoadingMore,
    loadedCount: transactions.filter(tx => !isTemp(tx.id)).length,
    loadMoreTransactions,
    add,
    addBatch,
    remove,
    removeBatch,
    update,
    bulkUpdateTransactions,
    undoLastBulkUpdate,
    clearBulkSnapshot,
  };
}
