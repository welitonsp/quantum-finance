// Leitura genérica de uma tabela do Supabase com recarga em tempo real.
// RLS garante que só as linhas do usuário logado voltam; o filtro do canal
// apenas evita eventos de outras linhas.
import { useState, useEffect, useCallback, useRef } from 'react';
import { getSupabase } from '../../shared/api/supabase/client';
import { logSanitizedFirebaseError, type FirebaseErrorOperation } from '../../shared/lib/firebaseErrorHandling';

export interface SupabaseTableOptions<TRow, T> {
  table: string;
  columns: string;
  orderBy: string;
  ascending?: boolean;
  map: (row: TRow) => T;
  loadOp: FirebaseErrorOperation;
}

export interface SupabaseTableState<T> {
  items: T[];
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useSupabaseTable<TRow, T>(
  uid: string,
  { table, columns, orderBy, ascending = true, map, loadOp }: SupabaseTableOptions<TRow, T>,
): SupabaseTableState<T> {
  const [items, setItems]     = useState<T[]>([]);
  const [loading, setLoading] = useState(true);

  // Só a resposta da consulta mais recente vale (troca de usuário/ordem de chegada).
  const latestRequest = useRef(0);

  const refresh = useCallback(async (): Promise<void> => {
    const request = ++latestRequest.current;
    const { data, error } = await getSupabase()
      .from(table)
      .select(columns)
      .order(orderBy, { ascending });
    if (request !== latestRequest.current) return;
    if (error) {
      logSanitizedFirebaseError(loadOp, error);
      return;
    }
    setItems(((data ?? []) as TRow[]).map(map));
  }, [table, columns, orderBy, ascending, map, loadOp]);

  useEffect(() => {
    if (!uid) { latestRequest.current += 1; setItems([]); setLoading(false); return; }
    let active = true;
    setItems([]);
    setLoading(true);
    void refresh().finally(() => { if (active) setLoading(false); });

    const channel = getSupabase()
      .channel(`${table}:${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table, filter: `user_id=eq.${uid}` },
        () => { void refresh(); })
      .subscribe();

    return () => {
      active = false;
      void getSupabase().removeChannel(channel);
    };
  }, [uid, table, refresh]);

  return { items, loading, refresh };
}

/** timestamptz ISO → epoch ms (o tipo legado aceita number). */
export function millisOrNull(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}
