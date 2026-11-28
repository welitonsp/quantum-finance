// Contas no Supabase (tabela public.accounts, RLS por auth.uid()).
// balance_cents é o saldo de ABERTURA em opening_date. O saldo de hoje de cada
// conta vem da função cash_position (abertura + lançamentos até hoje) e é o que
// o app mostra em `balance`; a abertura fica em `openingBalance`.
// O histórico append-only (account_history) é gravado por trigger no banco,
// na mesma transação do INSERT/UPDATE/DELETE — o cliente não escreve histórico.
import { useState, useEffect, useCallback, useRef } from 'react';
import { getSupabase } from '../../shared/api/supabase/client';
import { subscribeSharedChannel } from '../../shared/api/supabase/sharedChannel';
import { logSanitizedFirebaseError } from '../../shared/lib/firebaseErrorHandling';
import { toCentavos } from '../../shared/schemas/financialSchemas';
import type { Account } from '../../shared/types/transaction';
import type { Centavos } from '../../shared/types/money';
import type { AddAccountInput, UpdateAccountInput, UseAccountsReturn } from '../useAccounts';
import { reloadWhenVisible } from './useSupabaseTable';

const ACCOUNT_TYPES: ReadonlySet<Account['type']> = new Set([
  'corrente', 'poupanca', 'investimento', 'cartao', 'divida',
]);

const ACCOUNT_COLUMNS = 'id, name, type, balance_cents, opening_date, created_at, updated_at';

export interface AccountRow {
  id: string;
  name: string | null;
  type: string | null;
  balance_cents: number | string | null;
  opening_date?: string | null;
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
  const opening = centsFromBigint(row.balance_cents);
  const account: Account = {
    id: row.id,
    name: row.name ?? '',
    type,
    balance: opening,
    openingBalance: opening,
    schemaVersion: 2,
    createdAt: millisOrNull(row.created_at),
    updatedAt: millisOrNull(row.updated_at),
  };
  if (typeof row.opening_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.opening_date)) {
    account.openingDate = row.opening_date;
  }
  return account;
}

export interface CashPosition {
  /** Saldo de hoje por conta, em centavos. */
  byAccount: Map<string, Centavos>;
  /** Líquido de hoje dos lançamentos sem conta, em centavos. */
  unassignedCents: Centavos;
}

/** Converte as linhas de cash_position (uma por conta + uma sem conta). */
export function parseCashPosition(data: unknown): CashPosition {
  const byAccount = new Map<string, Centavos>();
  let unassignedCents = 0 as Centavos;
  for (const raw of Array.isArray(data) ? data : []) {
    const row = raw as { account_id?: unknown; balance_cents?: unknown } | null;
    if (!row) continue;
    const cents = centsFromBigint(row.balance_cents);
    if (typeof row.account_id === 'string') byAccount.set(row.account_id, cents);
    else unassignedCents = cents;
  }
  return { byAccount, unassignedCents };
}

/** Data de hoje (YYYY-MM-DD) no fuso do aparelho. */
function todayISO(): string {
  return new Date().toLocaleDateString('sv-SE');
}

export function useAccountsSupabase(uid: string): UseAccountsReturn {
  const [accounts, setAccounts]               = useState<Account[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [unassignedCashCents, setUnassignedCashCents] = useState<Centavos>(0 as Centavos);

  // Só a resposta da consulta mais recente vale: evita que uma resposta atrasada
  // (ex.: de outro usuário, após troca de sessão) sobrescreva a lista atual.
  const latestRequest = useRef(0);

  const refresh = useCallback(async (): Promise<void> => {
    const request = ++latestRequest.current;
    const supabase = getSupabase();
    const [{ data, error }, position] = await Promise.all([
      supabase.from('accounts').select(ACCOUNT_COLUMNS).order('name', { ascending: true }),
      supabase.rpc('cash_position', { p_today: todayISO() }),
    ]);
    if (request !== latestRequest.current) return;
    if (error) {
      logSanitizedFirebaseError('accounts_load', error);
      return;
    }
    // Sem o saldo do servidor, mostra a abertura (melhor que zero).
    const cash = position.error ? null : parseCashPosition(position.data);
    if (position.error) logSanitizedFirebaseError('accounts_load', position.error);
    setAccounts((data ?? []).map(r => {
      const acc = mapAccountRow(r as AccountRow);
      const today = cash?.byAccount.get(acc.id);
      return today === undefined ? acc : { ...acc, balance: today };
    }));
    setUnassignedCashCents(cash ? cash.unassignedCents : (0 as Centavos));
  }, []);

  useEffect(() => {
    if (!uid) {
      latestRequest.current += 1;
      setAccounts([]);
      setUnassignedCashCents(0 as Centavos);
      setLoadingAccounts(false);
      return;
    }
    let active = true;
    setAccounts([]);
    setLoadingAccounts(true);
    void refresh().finally(() => { if (active) setLoadingAccounts(false); });

    // Tempo real: mudança nas contas ou nos lançamentos recarrega os saldos.
    // Canal compartilhado: várias telas com este hook ao mesmo tempo não quebram o app.
    // Recarrega quando o canal entra: cobre mudanças entre a consulta inicial e a assinatura.
    const leaveChannel = subscribeSharedChannel(
      `accounts:${uid}`,
      [
        { table: 'accounts', filter: `user_id=eq.${uid}` },
        { table: 'transactions', filter: `user_id=eq.${uid}` },
      ],
      () => { void refresh(); },
      () => { void refresh(); },
    );

    // Exclusões em outra aba/aparelho: o Realtime não filtra DELETE (ver reloadWhenVisible).
    const stopVisible = reloadWhenVisible(() => { void refresh(); });

    return () => {
      active = false;
      stopVisible();
      leaveChannel();
    };
  }, [uid, refresh]);

  const addAccount = useCallback(async (data: AddAccountInput): Promise<string> => {
    if (!uid) throw new Error('Utilizador não autenticado.');
    const { data: row, error } = await getSupabase()
      .from('accounts')
      .insert({
        name: data.name,
        type: data.type,
        balance_cents: toCentavos(data.balance),
        ...(data.openingDate ? { opening_date: data.openingDate } : {}),
      })
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
    if (typeof data.openingDate === 'string') patch['opening_date'] = data.openingDate;
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

  return { accounts, loadingAccounts, addAccount, updateAccount, removeAccount, unassignedCashCents };
}
