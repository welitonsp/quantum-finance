import { useState, useEffect, useCallback, useRef } from 'react';
import {
  collection, query, orderBy, onSnapshot, limit,
  getDocs, startAfter,
  type QueryDocumentSnapshot, type DocumentData, type Timestamp,
} from 'firebase/firestore';
import { db } from '../shared/api/firebase/index';
import { FirestoreService } from '../shared/services/FirestoreService';
import { AuditService } from '../shared/services/AuditService';
import type { Transaction } from '../shared/types/transaction';
import { fromCentavos, toCentavos, type Centavos } from '../shared/types/money';
import { getTransactionCentavos } from '../utils/transactionUtils';
import { categorizeTransaction } from '../utils/aiCategorize';
import { categorizeWithAI } from '../services/AICategorizationService';
import { PAGE_SIZE, mergeTransactionPages, hasMorePages } from '../utils/transactionPagination';
import toast from 'react-hot-toast';

// ─── Bulk Update — tipo restrito (não expõe Partial<Transaction> livre) ────────
export type BulkUpdate = {
  category?: string;
};

// ─── Bulk Snapshot — estado anterior para undo em memória ─────────────────────
export type BulkSnapshot = {
  id:          string;
  oldCategory: string;
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
  data:    Partial<Transaction>;
  retries: number;
}
interface UpdateOp {
  type:     'update';
  itemId:   string;
  data:     Partial<Transaction>;
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

function isTemp(id: string): boolean {
  return id.startsWith('__temp_');
}

function getTxCentavos(tx: Partial<Transaction>): Centavos {
  return getTransactionCentavos(tx) ?? toCentavos(0);
}

function normalizeTransaction(tx: Transaction): Transaction {
  const value_cents = getTxCentavos(tx);
  return {
    ...tx,
    value_cents,
    value: fromCentavos(value_cents),
    schemaVersion: tx.schemaVersion ?? 2,
  };
}

function normalizeWriteData(data: Partial<Transaction>): Partial<Transaction> {
  const value_cents = getTxCentavos(data);
  const {
    id: _id,
    uid: _uid,
    value: _legacyValue,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    deletedAt: _deletedAt,
    importHash: _importHash,
    isDeleted: _isDeleted,
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
  return { ...rest, value_cents, schemaVersion: 2 };
}

function setIfDefined<K extends keyof Transaction>(
  target: Partial<Transaction>,
  key: K,
  value: Transaction[K] | undefined,
): void {
  if (value !== undefined) {
    target[key] = value;
  }
}

function buildUpdateWriteData(current: Transaction | undefined, data: Partial<Transaction>): Partial<Transaction> {
  const base: Partial<Transaction> = {};
  if (current) {
    base.description = current.description;
    base.value_cents = getTxCentavos(current);
    base.schemaVersion = 2;
    base.type = current.type;
    base.category = current.category;
    base.date = current.date;
    base.source = current.source ?? 'manual';
    setIfDefined(base, 'account', current.account);
    setIfDefined(base, 'accountId', current.accountId);
    setIfDefined(base, 'cardId', current.cardId);
    setIfDefined(base, 'fitId', current.fitId);
    setIfDefined(base, 'tags', current.tags);
    setIfDefined(base, 'isRecurring', current.isRecurring);
  }

  const incomingCentavos = data.value !== undefined || data.value_cents !== undefined
    ? getTxCentavos(data)
    : getTxCentavos(base);
  return normalizeWriteData({
    ...base,
    ...data,
    value_cents: incomingCentavos,
    source: data.source ?? base.source ?? 'manual',
  });
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function getErrorCode(err: unknown): string | undefined {
  return typeof err === 'object' && err !== null && 'code' in err
    ? String((err as { code?: unknown }).code ?? '')
    : undefined;
}

function shouldRetrySyncError(err: unknown): boolean {
  const code = getErrorCode(err);
  const message = getErrorMessage(err).toLowerCase();
  if (code?.includes('permission-denied') || message.includes('permission')) return false;
  if (message.includes('transação inválida') || message.includes('atualização inválida')) return false;
  if (message.includes('invalid') || message.includes('inválid')) return false;
  return true;
}

function userFacingSyncError(err: unknown): Error {
  const code = getErrorCode(err);
  const message = getErrorMessage(err);
  const lower = message.toLowerCase();

  if (code?.includes('permission-denied') || lower.includes('permission')) {
    return new Error('A movimentação foi recusada pelas regras do Firebase. Verifique campos proibidos no payload.');
  }
  if (code?.includes('unavailable') || lower.includes('network') || lower.includes('offline')) {
    return new Error('Falha de conexão. A movimentação não foi confirmada.');
  }
  if (lower.includes('transação inválida') || lower.includes('inválid')) {
    return new Error(message);
  }
  return new Error(message || 'Falha ao confirmar a movimentação no Firestore.');
}

function debugSync(message: string, details?: Record<string, unknown>): void {
  if (!import.meta.env.DEV) return;
  console.warn(`[useTransactions] ${message}`, details ?? {});
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
        console.error('[Firestore][onSnapshot] error:', err.message);
        setError(err);
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
            // serverTimestamp() injetado pelo FirestoreService.addTransaction
            debugSync('iniciando gravação de nova movimentação', {
              uid,
              tempId: op.tempId,
              path: `users/${uid}/transactions`,
              payload: {
                type: op.data.type,
                category: op.data.category,
                date: op.data.date,
                source: op.data.source ?? 'manual',
                value_cents: op.data.value_cents,
                schemaVersion: op.data.schemaVersion ?? 2,
                hasDescription: Boolean(op.data.description),
              },
            });
            const realId = await FirestoreService.addTransaction(uid, op.data);
            debugSync('gravação confirmada', { uid, tempId: op.tempId, realId });
            // Dispara callback de IA (se registado) com o docId real — fire-and-forget
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
            debugSync('iniciando atualização de movimentação', {
              uid,
              id: op.itemId,
              operation: 'update',
              removesLegacyFields: true,
              path: `users/${uid}/transactions/${op.itemId}`,
              payload: {
                keys: Object.keys(op.data).sort(),
                type: op.data.type,
                category: op.data.category,
                date: op.data.date,
                source: op.data.source,
                value_cents: op.data.value_cents,
                schemaVersion: op.data.schemaVersion,
                hasDescription: Boolean(op.data.description),
              },
            });
            await FirestoreService.updateTransaction(uid, op.itemId, op.data);
            pendingIds.current.delete(op.itemId);
            break;
          case 'delete':
            await FirestoreService.deleteTransaction(uid, op.itemId);
            pendingIds.current.delete(op.itemId);
            break;
          case 'deleteBatch':
            await FirestoreService.deleteBatchTransactions(uid, op.ids);
            op.ids.forEach(id => pendingIds.current.delete(id));
            break;
        }
        queueRef.current.shift();

      } catch (err) {
        op.retries++;
        const msg = getErrorMessage(err);
        debugSync('erro na gravação/sync', {
          uid,
          opType: op.type,
          attempt: op.retries,
          code: getErrorCode(err),
          message: msg,
        });
        console.error(
          `[SyncQueue][${op.type}] erro (tentativa ${op.retries}/${MAX_RETRIES}): ${msg}`
        );

        if (op.retries >= MAX_RETRIES || !shouldRetrySyncError(err)) {
          console.error(`[SyncQueue][${op.type}] descartado após ${MAX_RETRIES} tentativas.`);
          const finalError = userFacingSyncError(err);
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
      console.error('[loadMoreTransactions] erro:', err);
      toast.error('Falha ao carregar mais movimentações.');
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
    const optimisticCentavos = getTxCentavos(enriched);
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
    };

    // 2. AI fallback — only when deterministic returned nothing; fire-and-forget after Firestore write
    if (!enriched.category && enriched.description) {
      const desc        = enriched.description;
      const capturedUid = uid;
      postAddCallbacks.current.set(tempId, (realId: string) => {
        void categorizeWithAI(desc, capturedUid).then(aiCat => {
          // Guard: only update when AI returned something meaningful
          if (aiCat && aiCat !== 'Outros') {
            void FirestoreService.updateTransaction(capturedUid, realId, { category: aiCat });
          }
        });
      });
    }

    pendingAdds.current.set(tempId, optimistic);
    setTransactions(prev => [optimistic, ...prev]);

    return new Promise<string>((resolve, reject) => {
      pendingAddResolvers.current.set(tempId, { resolve, reject });
      enqueue({ type: 'add', tempId, data: enriched, retries: 0 });
    });
  }, [uid, enqueue]);

  // ── UPDATE — Optimistic + enqueue ─────────────────────────────────────────
  const update = useCallback(async (id: string, data: Partial<Transaction>): Promise<void> => {
    if (!uid || !id) throw new Error('[useTransactions][update] UID ou ID ausente.');
    if (isTemp(id)) return; // aguarda confirmação do add

    const current = transactionsRef.current.find(tx => tx.id === id);
    const normalizedData = buildUpdateWriteData(current, data);

    // Regista como pendente antes do optimistic update
    pendingIds.current.add(id);

    let previous: Transaction | undefined;
    setTransactions(prev => {
      previous = current ?? prev.find(tx => tx.id === id);
      return prev.map(tx =>
        tx.id === id
          // updatedAt local em ms; será substituído por serverTimestamp() no snapshot
          ? { ...tx, ...normalizedData, updatedAt: Date.now() }
          : tx
      );
    });

    enqueue({ type: 'update', itemId: id, data: normalizedData, previous, retries: 0 });
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

    let previous: Transaction | undefined;
    setTransactions(prev => {
      previous = prev.find(tx => tx.id === id);
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
      const optimisticCentavos = getTxCentavos(enriched);
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
      };

      // 2. AI fallback per item — concurrency controlled by AICategorizationService
      if (!enriched.category && enriched.description) {
        const desc        = enriched.description;
        const capturedUid = uid;
        postAddCallbacks.current.set(tempId, (realId: string) => {
          void categorizeWithAI(desc, capturedUid).then(aiCat => {
            if (aiCat && aiCat !== 'Outros') {
              void FirestoreService.updateTransaction(capturedUid, realId, { category: aiCat });
            }
          });
        });
      }

      pendingAdds.current.set(tempId, optimistic);
      optimistics.push(optimistic);
      tempIds.push(tempId);
      // Push directly to avoid N processQueue triggers; one call below handles all
      queueRef.current.push({ type: 'add', tempId, data: enriched, retries: 0 });
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

    let previousBatch: Transaction[] = [];
    setTransactions(prev => {
      previousBatch = prev.filter(tx => idSet.has(tx.id) && !isTemp(tx.id));
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
        const item: BulkSnapshot[number] = { id, oldCategory: tx.category ?? 'Outros' };
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
      const CHUNK_SIZE = 500;
      for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
        const chunk = ids.slice(i, i + CHUNK_SIZE);
        await FirestoreService.batchUpdateTransactions(uid, chunk, updates);
      }

      // Auditoria — fire-and-forget após todos os commits (nunca bloqueia UI)
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

    // Limpa imediatamente → garante execução única (sem race condition)
    snapshotRef.current = null;
    setHasUndoSnapshot(false);

    isUndoingRef.current = true;
    setIsUndoing(true);

    try {
      // Agrupa por oldCategory para minimizar batches
      const groups = new Map<string, string[]>();
      snap.forEach(({ id, oldCategory }) => {
        if (!groups.has(oldCategory)) groups.set(oldCategory, []);
        groups.get(oldCategory)!.push(id);
      });

      // Aplica com chunking por grupo (reutiliza FirestoreService)
      for (const [oldCategory, groupIds] of groups) {
        await FirestoreService.batchUpdateTransactions(uid, groupIds, { category: oldCategory });
      }

      // Auditoria — fire-and-forget após todos os commits (nunca bloqueia UI)
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
