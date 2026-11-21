// Contas no Supabase (tabela public.accounts, RLS por auth.uid()).
// O histórico append-only (account_history) é gravado por trigger no banco,
// na mesma transação do INSERT/UPDATE/DELETE — o cliente não escreve histórico.
import { useState, useEffect, useCallback, useRef } from 'react';
import { getSupabase } from '../../shared/api/supabase/client';
import { logSanitizedFirebaseError } from '../../shared/lib/firebaseErrorHandling';
import { toCentavos } from '../../shared/schemas/financialSchemas';
import type { Account } from '../../shared/types/transaction';
import type { Centavos } from '../../shared/types/money';
import type { AddAccountInput, UpdateAccountInput, UseAccountsReturn } from '../useAccounts';

const ACCOUNT_TYPES: ReadonlySet<Account['type']> = new Set([
  'corrente', 'poupanca', 'investimento', 'cartao', 'divida',
]);

const ACCOUNT_COLUMNS = 'id, name, type, balance_cents, created_at, updated_at';

export interface AccountRow {
  id: string;
  name: string | null;
  type: string | null;
  balance_cents: number | string | null;
  created_at: string | null;
  updated_at: string | null;
}

/** bigint do Postgres chega como number ou string de dígitos — nunca float. */
export function centsFromBigint(value: unknown): Centavos {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value as Centavos;
  if (typeof value === 'string' && /^-?\d+$/.test(value)) {
    const n = Number.parseInt(value, 10);
    if (Number.isSafeInteger(n)) return n as Centavos;
  }
  return 0 as Centavos;
}

function millisOrNull(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

export function mapAccountRow(row: AccountRow): Account {
  const type = ACCOUNT_TYPES.has(row.type as Account['type']) ? (row.type as Account['type']) : 'corrente';
  return {
    id: row.id,
    name: row.name ?? '',
    type,
    balance: centsFromBigint(row.balance_cents),
    schemaVersion: 2,
    createdAt: millisOrNull(row.created_at),
    updatedAt: millisOrNull(row.updated_at),
  };
}

export function useAccountsSupabase(uid: string): UseAccountsReturn {
  const [accounts, setAccounts]               = useState<Account[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);

  // Só a resposta da consulta mais recente vale: evita que uma resposta atrasada
  // (ex.: de outro usuário, após troca de sessão) sobrescreva a lista atual.
  const latestRequest = useRef(0);

  const refresh = useCallback(async (): Promise<void> => {
    const request = ++latestRequest.current;
    const { data, error } = await getSupabase()
      .from('accounts')
      .select(ACCOUNT_COLUMNS)
      .order('name', { ascending: true });
    if (request !== latestRequest.current) return;
    if (error) {
      logSanitizedFirebaseError('accounts_load', error);
      return;
    }
    setAccounts((data ?? []).map(r => mapAccountRow(r as AccountRow)));
  }, []);

  useEffect(() => {
    if (!uid) { latestRequest.current += 1; setAccounts([]); setLoadingAccounts(false); return; }
    let active = true;
    setAccounts([]);
    setLoadingAccounts(true);
    void refresh().finally(() => { if (active) setLoadingAccounts(false); });

    // Tempo real: qualquer mudança nas contas do usuário recarrega a lista.
    const channel = getSupabase()
      .channel(`accounts:${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'accounts', filter: `user_id=eq.${uid}` },
        () => { void refresh(); })
      // Recarrega quando o canal entra: cobre mudanças entre a consulta inicial e a assinatura.
      .subscribe((status: string) => { if (status === 'SUBSCRIBED') void refresh(); });

    return () => {
      active = false;
      void getSupabase().removeChannel(channel);
    };
  }, [uid, refresh]);

  const addAccount = useCallback(async (data: AddAccountInput): Promise<string> => {
    if (!uid) throw new Error('Utilizador não autenticado.');
    const { data: row, error } = await getSupabase()
      .from('accounts')
      .insert({ name: data.name, type: data.type, balance_cents: toCentavos(data.balance) })
      .select('id')
      .single();
    if (error || !row) {
      logSanitizedFirebaseError('account_create', error);
      throw new Error('Não foi possível criar a conta.');
    }
    await refresh();
    return (row as { id: string }).id;
  }, [uid, refresh]);

  const updateAccount = useCallback(async (id: string, data: UpdateAccountInput): Promise<void> => {
    if (!uid || !id) return;
    const patch: Record<string, unknown> = {};
    if (typeof data.name === 'string')    patch['name'] = data.name;
    if (typeof data.type === 'string')    patch['type'] = data.type;
    if (typeof data.balance === 'number') patch['balance_cents'] = toCentavos(data.balance);
    if (Object.keys(patch).length === 0) return;
    const { error } = await getSupabase().from('accounts').update(patch).eq('id', id);
    if (error) {
      logSanitizedFirebaseError('account_update', error);
      throw new Error('Não foi possível atualizar a conta.');
    }
    await refresh();
  }, [uid, refresh]);

  const removeAccount = useCallback(async (id: string): Promise<void> => {
    if (!uid || !id) return;
    const { error } = await getSupabase().from('accounts').delete().eq('id', id);
    if (error) {
      logSanitizedFirebaseError('account_delete', error);
      throw new Error('Não foi possível excluir a conta.');
    }
    await refresh();
  }, [uid, refresh]);

  return { accounts, loadingAccounts, addAccount, updateAccount, removeAccount };
}
