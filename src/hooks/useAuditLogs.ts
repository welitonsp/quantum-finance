import { useState, useEffect, useCallback, useRef } from 'react';
import {
  collection, query, orderBy, limit, onSnapshot, getDocs, startAfter,
  type DocumentData, type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from '../shared/api/firebase/index';
import { logSanitizedFirebaseError } from '../shared/lib/firebaseErrorHandling';
import type { AuditLog } from '../shared/services/AuditService';
import { fromCentavos } from '../shared/types/money';

// ─── ViewModel ────────────────────────────────────────────────────────────────

export type AuditView = {
  id:        string;
  title:     string;
  subtitle:  string;
  timestamp: number;
};

const AUDIT_LOG_PAGE_SIZE = 50;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const safeTimestamp = (ts: unknown): number => {
  if (!ts) return Date.now();
  if (typeof (ts as { toMillis?: unknown })?.toMillis === 'function') {
    return (ts as { toMillis: () => number }).toMillis();
  }
  const n = Number(ts);
  return Number.isFinite(n) ? n : Date.now();
};

type ImportAuditLog = AuditLog & {
  source?: unknown;
  amount_cents?: unknown;
  amount_display?: unknown;
  fileName?: unknown;
  description?: unknown;
  category?: unknown;
};

const formatMoney = (value: number): string =>
  `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const getImportSubtitle = (log: ImportAuditLog): string => {
  const parts: string[] = [];

  if (typeof log.source === 'string' && log.source.trim() !== '') {
    parts.push(`Origem: ${log.source.toUpperCase()}`);
  }

  if (typeof log.fileName === 'string' && log.fileName.trim() !== '') {
    parts.push(log.fileName);
  }

  if (typeof log.amount_cents === 'number' && Number.isFinite(log.amount_cents)) {
    parts.push(`Valor: ${formatMoney(fromCentavos(log.amount_cents))}`);
  } else if (typeof log.amount_display === 'number' && Number.isFinite(log.amount_display)) {
    parts.push(`Valor: ${formatMoney(log.amount_display)}`);
  }

  if (typeof log.category === 'string' && log.category.trim() !== '') {
    parts.push(`Categoria: ${log.category}`);
  }

  return parts.length > 0 ? parts.join(' • ') : 'Importação registrada';
};

export const mapLog = (log: AuditLog): AuditView => {
  const count = log.metadata?.count ?? 0;
  const action = log.action as string;

  const categories = new Set(
    (log.metadata?.changes ?? [])
      .map((c) => c?.to)
      .filter((v): v is string => typeof v === 'string' && v.trim() !== '')
  );

  const categoryLabel =
    categories.size === 0
      ? 'categoria desconhecida'
      : categories.size === 1
        ? `'${Array.from(categories)[0]}'`
        : `${categories.size} categorias diferentes`;

  if (action === 'BULK_UPDATE') {
    return {
      id:        log.id!,
      title:     'Recategorização em lote',
      subtitle:  `${count} transações movidas para ${categoryLabel}`,
      timestamp: safeTimestamp(log.createdAt ?? log.timestamp),
    };
  }

  if (action === 'UNDO_BULK_UPDATE') {
    return {
      id:        log.id!,
      title:     'Desfazer alterações',
      subtitle:  `${count} transações restauradas`,
      timestamp: safeTimestamp(log.createdAt ?? log.timestamp),
    };
  }

  if (action === 'IMPORT_TRANSACTION') {
    return {
      id:        log.id!,
      title:     'Movimentação importada',
      subtitle:  getImportSubtitle(log as ImportAuditLog),
      timestamp: safeTimestamp(log.createdAt ?? log.timestamp),
    };
  }

  return {
    id:        log.id!,
    title:     'Ação do sistema',
    subtitle:  `${count} itens afetados`,
    timestamp: safeTimestamp(log.createdAt ?? log.timestamp),
  };
};

// ─── Return Type ──────────────────────────────────────────────────────────────

interface UseAuditLogsReturn {
  logs:          AuditView[];
  loading:       boolean;
  error:         string | null;
  hasMoreLogs:   boolean;
  isLoadingMore: boolean;
  loadMoreLogs:  () => Promise<void>;
}

function mergeAuditViews(primary: AuditView[], secondary: AuditView[]): AuditView[] {
  const byId = new Map<string, AuditView>();
  [...primary, ...secondary].forEach((log) => {
    if (!byId.has(log.id)) byId.set(log.id, log);
  });
  return Array.from(byId.values()).sort((a, b) => b.timestamp - a.timestamp);
}

function mapSnapshotDocs(docs: QueryDocumentSnapshot<DocumentData>[]): AuditView[] {
  const raw = docs.map(doc => ({
    id: doc.id,
    ...(doc.data() as Omit<AuditLog, 'id'>),
  })) as AuditLog[];

  return raw.map(mapLog);
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuditLogs(uid: string): UseAuditLogsReturn {
  const [realtimeLogs,  setRealtimeLogs]  = useState<AuditView[]>([]);
  const [olderLogs,     setOlderLogs]     = useState<AuditView[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState<string | null>(null);
  const [hasMoreLogs,   setHasMoreLogs]   = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const lastDocRef        = useRef<QueryDocumentSnapshot<DocumentData> | null>(null);
  const olderLogsRef      = useRef<AuditView[]>([]);
  const isLoadingMoreRef  = useRef(false);

  useEffect(() => {
    if (!uid) {
      setRealtimeLogs([]);
      setOlderLogs([]);
      olderLogsRef.current = [];
      lastDocRef.current = null;
      setHasMoreLogs(false);
      setIsLoadingMore(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setRealtimeLogs([]);
    setOlderLogs([]);
    olderLogsRef.current = [];
    lastDocRef.current = null;
    isLoadingMoreRef.current = false;
    setHasMoreLogs(false);
    setIsLoadingMore(false);

    const ref = collection(db, 'users', uid, 'audit_logs');
    const q   = query(ref, orderBy('createdAt', 'desc'), limit(AUDIT_LOG_PAGE_SIZE));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const snapLastDoc = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] ?? null : null;
        const snapIsFull = snap.docs.length >= AUDIT_LOG_PAGE_SIZE;

        if (!snapIsFull) {
          olderLogsRef.current = [];
          setOlderLogs([]);
          lastDocRef.current = snapLastDoc;
          setHasMoreLogs(false);
        } else if (olderLogsRef.current.length === 0) {
          lastDocRef.current = snapLastDoc;
          setHasMoreLogs(true);
        }

        setRealtimeLogs(mapSnapshotDocs(snap.docs));
        setLoading(false);
      },
      (err) => {
        logSanitizedFirebaseError('audit_logs_load', err);
        setError('Não foi possível carregar o histórico.');
        setLoading(false);
      }
    );

    return unsub;
  }, [uid]);

  const loadMoreLogs = useCallback(async (): Promise<void> => {
    if (!uid || isLoadingMoreRef.current || !lastDocRef.current) return;

    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);

    try {
      const ref = collection(db, 'users', uid, 'audit_logs');
      const q = query(
        ref,
        orderBy('createdAt', 'desc'),
        startAfter(lastDocRef.current),
        limit(AUDIT_LOG_PAGE_SIZE),
      );

      const snap = await getDocs(q);
      if (snap.docs.length > 0) {
        lastDocRef.current = snap.docs[snap.docs.length - 1] ?? null;
      }

      const mapped = mapSnapshotDocs(snap.docs);
      setOlderLogs((prev) => {
        const next = mergeAuditViews(prev, mapped);
        olderLogsRef.current = next;
        return next;
      });
      setHasMoreLogs(snap.docs.length >= AUDIT_LOG_PAGE_SIZE);
    } catch (err) {
      logSanitizedFirebaseError('audit_logs_load_more', err);
      setError('Não foi possível carregar mais histórico.');
    } finally {
      isLoadingMoreRef.current = false;
      setIsLoadingMore(false);
    }
  }, [uid]);

  return {
    logs: mergeAuditViews(realtimeLogs, olderLogs),
    loading,
    error,
    hasMoreLogs,
    isLoadingMore,
    loadMoreLogs,
  };
}
