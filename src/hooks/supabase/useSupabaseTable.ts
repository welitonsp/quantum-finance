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
  /** Falha da última leitura (null quando a leitura funcionou). */
  error: Error | null;
  refresh: () => Promise<void>;
}

type Loaded<T> = { uid: string; items: T[] };

export function useSupabaseTable<TRow, T>(
  uid: string,
  { table, columns, orderBy, ascending = true, map, loadOp }: SupabaseTableOptions<TRow, T>,
): SupabaseTableState<T> {
  // Os itens guardam de qual usuário vieram: na troca de usuário, nada do
  // anterior é exposto, nem no primeiro render antes do efeito limpar.
  const [loaded, setLoaded]   = useState<Loaded<T>>({ uid: '', items: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<Error | null>(null);
  const uidRef = useRef(uid);
  uidRef.current = uid;

  // Só a resposta da consulta mais recente vale (troca de usuário/ordem de chegada).
  const latestRequest = useRef(0);

  const refresh = useCallback(async (): Promise<void> => {
    const request = ++latestRequest.current;
    const requestUid = uidRef.current;
    const { data, error } = await getSupabase()
      .from(table)
      .select(columns)
      .order(orderBy, { ascending });
    if (request !== latestRequest.current) return;
    if (error) {
      logSanitizedFirebaseError(loadOp, error);
      setError(new Error('Não foi possível carregar os dados.'));
      return;
    }
    setError(null);
    setLoaded({ uid: requestUid, items: ((data ?? []) as TRow[]).map(map) });
  }, [table, columns, orderBy, ascending, map, loadOp]);

  useEffect(() => {
    if (!uid) { latestRequest.current += 1; setLoaded({ uid: '', items: [] }); setError(null); setLoading(false); return; }
    let active = true;
    setLoaded({ uid, items: [] });
    setError(null);
    setLoading(true);
    void refresh().finally(() => { if (active) setLoading(false); });

    const channel = getSupabase()
      .channel(`${table}:${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table, filter: `user_id=eq.${uid}` },
        () => { void refresh(); })
      // Recarrega quando o canal entra: cobre mudanças entre a consulta inicial e a assinatura.
      .subscribe((status: string) => { if (status === 'SUBSCRIBED') void refresh(); });

    return () => {
      active = false;
      void getSupabase().removeChannel(channel);
    };
  }, [uid, table, refresh]);

  const current = loaded.uid === uid;
  return {
    items: (current ? loaded.items : EMPTY) as T[],
    // troca de usuário ainda não processada pelo efeito conta como carregando
    loading: loading || (!!uid && !current),
    error,
    refresh,
  };
}

const EMPTY: never[] = [];

/** timestamptz ISO → epoch ms (o tipo legado aceita number). */
export function millisOrNull(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}
