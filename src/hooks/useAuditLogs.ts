import { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../shared/api/firebase/index';
import type { AuditLog } from '../shared/services/AuditService';
import { fromCentavos } from '../shared/types/money';

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
    const q   = query(ref, orderBy('createdAt', 'desc'), limit(50));

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
