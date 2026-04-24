import { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../shared/api/firebase/index';
import type { AuditLog } from '../shared/services/AuditService';

// ─── ViewModel ────────────────────────────────────────────────────────────────

export type AuditView = {
  id:        string;
  title:     string;
  subtitle:  string;
  timestamp: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const safeTimestamp = (ts: unknown): number => {
  if (!ts) return Date.now();
  if (typeof (ts as { toMillis?: unknown })?.toMillis === 'function') {
    return (ts as { toMillis: () => number }).toMillis();
  }
  const n = Number(ts);
  return Number.isFinite(n) ? n : Date.now();
};

const mapLog = (log: AuditLog): AuditView => {
  const count = log.metadata?.count ?? 0;

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

  if (log.action === 'BULK_UPDATE') {
    return {
      id:        log.id!,
      title:     'Recategorização em lote',
      subtitle:  `${count} transações movidas para ${categoryLabel}`,
      timestamp: safeTimestamp(log.timestamp),
    };
  }

  if (log.action === 'UNDO_BULK_UPDATE') {
    return {
      id:        log.id!,
      title:     'Desfazer alterações',
      subtitle:  `${count} transações restauradas`,
      timestamp: safeTimestamp(log.timestamp),
    };
  }

  return {
    id:        log.id!,
    title:     'Ação do sistema',
    subtitle:  `${count} itens afetados`,
    timestamp: safeTimestamp(log.timestamp),
  };
};

// ─── Return Type ──────────────────────────────────────────────────────────────

interface UseAuditLogsReturn {
  logs:    AuditView[];
  loading: boolean;
  error:   string | null;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuditLogs(uid: string): UseAuditLogsReturn {
  const [logs,    setLogs]    = useState<AuditView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    if (!uid) {
      setLogs([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const ref = collection(db, 'users', uid, 'audit_logs');
    const q   = query(ref, orderBy('timestamp', 'desc'), limit(50));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const raw = snap.docs.map(doc => ({
          id: doc.id,
          ...(doc.data() as Omit<AuditLog, 'id'>),
        })) as AuditLog[];

        const mapped = raw
          .map(mapLog)
          .sort((a, b) => b.timestamp - a.timestamp); // garantia frontend além do orderBy

        setLogs(mapped);
        setLoading(false);
      },
      (err) => {
        console.error('[useAuditLogs]', err);
        setError('Não foi possível carregar o histórico.');
        setLoading(false);
      }
    );

    return unsub;
  }, [uid]);

  return { logs, loading, error };
}
