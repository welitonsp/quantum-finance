// Linha do tempo de auditoria no Supabase (view public.audit_timeline).
// A view junta os históricos gravados pelos gatilhos do banco; a RLS de cada
// tabela vale para a leitura (security_invoker). Views não entram no Realtime,
// então recarregamos ao montar e quando a aba volta a ficar visível.
import { useState, useEffect, useCallback, useRef } from 'react';
import { getSupabase } from '../../shared/api/supabase/client';
import { logSanitizedFirebaseError } from '../../shared/lib/firebaseErrorHandling';
import type { AuditView, UseAuditLogsReturn } from '../useAuditLogs';
import { reloadWhenVisible } from './useSupabaseTable';

export const AUDIT_TIMELINE_PAGE_SIZE = 50;

export interface AuditTimelineRow {
  id: string;
  entity: string | null;
  action: string | null;
  origin: string | null;
  label: string | null;
  created_at: string | null;
}

const ENTITY_LABELS: Record<string, string> = {
  transactions: 'Transação',
  accounts: 'Conta',
  categories: 'Categoria',
  category_rules: 'Regra de categoria',
  budgets: 'Orçamento',
  goals: 'Meta',
  debts: 'Dívida',
  recurring_tasks: 'Recorrente',
};

const ACTION_LABELS: Record<string, string> = {
  CREATE: 'criação',
  UPDATE: 'edição',
  DELETE: 'exclusão',
  SOFT_DELETE: 'exclusão',
  RESTORE: 'restauração',
  BULK_UPDATE: 'recategorização em lote',
  UNDO_BULK_UPDATE: 'desfazer lote',
  TRANSFER: 'transferência',
};

const ORIGIN_LABELS: Record<string, string> = {
  ai: 'pelo Agente',
  import: 'por importação',
  bulk: 'em lote',
  reconcile: 'na conciliação',
  system: 'pelo sistema',
};

export function mapAuditTimelineRow(row: AuditTimelineRow): AuditView {
  const entity = ENTITY_LABELS[row.entity ?? ''] ?? 'Registro';
  const action = ACTION_LABELS[row.action ?? ''] ?? 'alteração';
  const origin = ORIGIN_LABELS[row.origin ?? ''];
  const label = row.label?.trim();
  const subtitle = [label || 'Sem descrição', origin].filter(Boolean).join(' • ');
  const ms = row.created_at ? Date.parse(row.created_at) : Number.NaN;
  return {
    id: row.id,
    title: `${entity}: ${action}`,
    subtitle,
    timestamp: Number.isNaN(ms) ? 0 : ms,
  };
}

const COLUMNS = 'id, entity, action, origin, label, created_at';

export function useAuditLogsSupabase(uid: string): UseAuditLogsReturn {
  const [logs, setLogs] = useState<AuditView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMoreLogs, setHasMoreLogs] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const loadedRef = useRef(0);
  const isLoadingMoreRef = useRef(false);
  const latestRequest = useRef(0);

  const fetchRange = useCallback(async (from: number, to: number) => {
    return getSupabase()
      .from('audit_timeline')
      .select(COLUMNS)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to);
  }, []);

  /** Recarrega tudo o que já estava carregado (pelo menos uma página). */
  const reload = useCallback(async () => {
    const request = ++latestRequest.current;
    const size = Math.max(loadedRef.current, AUDIT_TIMELINE_PAGE_SIZE);
    const { data, error: err } = await fetchRange(0, size - 1);
    if (request !== latestRequest.current) return;
    if (err) {
      logSanitizedFirebaseError('audit_logs_load', err);
      setError('Não foi possível carregar o histórico.');
    } else {
      const rows = (data ?? []) as AuditTimelineRow[];
      loadedRef.current = rows.length;
      setError(null);
      setLogs(rows.map(mapAuditTimelineRow));
      setHasMoreLogs(rows.length >= size);
    }
    setLoading(false);
  }, [fetchRange]);

  useEffect(() => {
    latestRequest.current += 1;
    loadedRef.current = 0;
    isLoadingMoreRef.current = false;
    setLogs([]);
    setHasMoreLogs(false);
    setIsLoadingMore(false);
    setError(null);
    if (!uid) { setLoading(false); return; }
    setLoading(true);
    void reload();
    return reloadWhenVisible(() => { void reload(); });
  }, [uid, reload]);

  const loadMoreLogs = useCallback(async (): Promise<void> => {
    if (!uid || isLoadingMoreRef.current || !hasMoreLogs) return;
    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);
    const request = latestRequest.current;
    try {
      const from = loadedRef.current;
      const { data, error: err } = await fetchRange(from, from + AUDIT_TIMELINE_PAGE_SIZE - 1);
      if (request !== latestRequest.current) return;
      if (err) {
        logSanitizedFirebaseError('audit_logs_load_more', err);
        setError('Não foi possível carregar mais histórico.');
        return;
      }
      const rows = (data ?? []) as AuditTimelineRow[];
      loadedRef.current = from + rows.length;
      setLogs((prev) => {
        const seen = new Set(prev.map((l) => l.id));
        return [...prev, ...rows.map(mapAuditTimelineRow).filter((l) => !seen.has(l.id))];
      });
      setHasMoreLogs(rows.length >= AUDIT_TIMELINE_PAGE_SIZE);
    } finally {
      isLoadingMoreRef.current = false;
      setIsLoadingMore(false);
    }
  }, [uid, hasMoreLogs, fetchRange]);

  return { logs, loading, error, hasMoreLogs, isLoadingMore, loadMoreLogs };
}
