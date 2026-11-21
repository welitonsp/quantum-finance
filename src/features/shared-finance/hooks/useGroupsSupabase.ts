// Finanças compartilhadas no Supabase (migração 0022_grupos).
// Leitura por RLS (só membros); toda escrita sensível passa pelas funções do
// servidor create_group, create_group_invite, accept/reject_group_invite,
// create_group_expense e settle_group_expense_share.
import { useState, useEffect, useCallback, useRef } from 'react';
import { getSupabase } from '../../../shared/api/supabase/client';
import { subscribeSharedChannel } from '../../../shared/api/supabase/sharedChannel';
import { logSanitizedFirebaseError, type FirebaseErrorOperation } from '../../../shared/lib/firebaseErrorHandling';
import { centsFromBigint } from '../../../hooks/supabase/useAccountsSupabase';
import { reloadWhenVisible } from '../../../hooks/supabase/useSupabaseTable';
import type {
  Group, GroupInvite, InviteStatus, SharedExpense, SharedExpenseCreatePayload, SplitMethod,
} from '../../../shared/types/shared';
import type { UseGroupsReturn, UseGroupInvitesReturn, UseGroupExpensesReturn } from './useGroups';

// ──────────────────────────────────────────────
// Linhas do banco → tipos da tela
// ──────────────────────────────────────────────

export interface GroupRow {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  created_at: string;
  updated_at: string;
  group_members: Array<{ user_id: string; display_name: string; email: string | null }> | null;
}

export interface InviteRow {
  id: string;
  group_id: string;
  group_name: string;
  inviter_id: string;
  inviter_display_name: string;
  invitee_email: string;
  status: string;
  created_at: string;
  expires_at: string;
}

export interface ExpenseRow {
  id: string;
  group_id: string;
  description: string;
  total_cents: number | string;
  category: string;
  date: string;
  payer_id: string;
  payer_display_name: string;
  split_method: string;
  created_at: string;
  updated_at: string;
  group_expense_shares: Array<{
    user_id: string; display_name: string; amount_cents: number | string; paid: boolean; paid_at: string | null;
  }> | null;
}

const GROUP_COLUMNS = 'id, name, description, owner_id, created_at, updated_at, group_members(user_id, display_name, email)';
const INVITE_COLUMNS = 'id, group_id, group_name, inviter_id, inviter_display_name, invitee_email, status, created_at, expires_at';
const EXPENSE_COLUMNS = 'id, group_id, description, total_cents, category, date, payer_id, payer_display_name, split_method, '
  + 'created_at, updated_at, group_expense_shares(user_id, display_name, amount_cents, paid, paid_at)';

const INVITE_STATUSES: ReadonlySet<string> = new Set(['pending', 'accepted', 'rejected']);
const SPLIT_METHODS: ReadonlySet<string> = new Set(['igual', 'proporcional', 'personalizado']);

export function mapGroupRow(row: GroupRow): Group {
  const members = (row.group_members ?? []).map((m) => ({
    uid: m.user_id, displayName: m.display_name, email: m.email ?? '',
  }));
  return {
    id: row.id,
    name: row.name,
    ...(row.description ? { description: row.description } : {}),
    ownerUid: row.owner_id,
    memberUids: members.map((m) => m.uid),
    members,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    schemaVersion: 1,
  };
}

export function mapInviteRow(row: InviteRow): GroupInvite {
  return {
    id: row.id,
    groupId: row.group_id,
    groupName: row.group_name,
    inviterUid: row.inviter_id,
    inviterDisplayName: row.inviter_display_name,
    inviteeEmail: row.invitee_email,
    status: (INVITE_STATUSES.has(row.status) ? row.status : 'pending') as InviteStatus,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    schemaVersion: 1,
  };
}

export function mapExpenseRow(row: ExpenseRow): SharedExpense {
  return {
    id: row.id,
    groupId: row.group_id,
    description: row.description,
    totalCents: centsFromBigint(row.total_cents),
    category: row.category,
    date: row.date,
    payerUid: row.payer_id,
    payerDisplayName: row.payer_display_name,
    splitMethod: (SPLIT_METHODS.has(row.split_method) ? row.split_method : 'igual') as SplitMethod,
    shares: (row.group_expense_shares ?? []).map((s) => ({
      uid: s.user_id,
      displayName: s.display_name,
      amountCents: centsFromBigint(s.amount_cents),
      paid: s.paid,
      ...(s.paid_at ? { paidAt: s.paid_at } : {}),
    })),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    schemaVersion: 1,
  };
}

function fail(op: FirebaseErrorOperation, error: unknown, message: string): never {
  logSanitizedFirebaseError(op, error);
  throw new Error(message);
}

// ──────────────────────────────────────────────
// Leitura ao vivo (consulta + tempo real + aba visível)
// ──────────────────────────────────────────────

interface LiveQuery<TRow, T> {
  /** Chave da consulta; vazia desliga a leitura. */
  key: string;
  load: () => PromiseLike<{ data: unknown; error: unknown }>;
  map: (row: TRow) => T;
  /** Tabelas cujas mudanças recarregam a lista, com filtro opcional do canal. */
  watch: Array<{ table: string; filter?: string }>;
  loadOp: FirebaseErrorOperation;
}

function useLiveQuery<TRow, T>({ key, load, map, watch, loadOp }: LiveQuery<TRow, T>) {
  const [loaded, setLoaded] = useState<{ key: string; items: T[] }>({ key: '', items: [] });
  const [loading, setLoading] = useState(true);
  const latest = useRef(0);
  const loadRef = useRef(load);
  loadRef.current = load;
  const mapRef = useRef(map);
  mapRef.current = map;
  const keyRef = useRef(key);
  keyRef.current = key;
  const watchKey = watch.map((w) => `${w.table}|${w.filter ?? ''}`).join(',');

  const refresh = useCallback(async (): Promise<void> => {
    const request = ++latest.current;
    const requestKey = keyRef.current;
    const { data, error } = await loadRef.current();
    if (request !== latest.current) return;
    if (error) { logSanitizedFirebaseError(loadOp, error); return; }
    setLoaded({ key: requestKey, items: ((data ?? []) as TRow[]).map(mapRef.current) });
  }, [loadOp]);

  useEffect(() => {
    if (!key) { latest.current += 1; setLoaded({ key: '', items: [] }); setLoading(false); return; }
    let active = true;
    setLoading(true);
    void refresh().finally(() => { if (active) setLoading(false); });

    // Só INSERT/UPDATE: o Realtime aplica RLS a eles; DELETE chega sem filtro
    // (exporia ids alheios), então exclusões recarregam ao gravar ou ao voltar à aba.
    // Nome inclui a consulta: convites e despesas do mesmo grupo usam canais distintos;
    // o mesmo hook em duas telas divide um canal (subscribeSharedChannel).
    const leaveChannel = subscribeSharedChannel(
      `groups:${loadOp}:${key}`,
      watchKey.split(',').map((spec) => {
        const [table, filter] = spec.split('|');
        return { table: table ?? '', filter: filter || undefined, insertUpdateOnly: true };
      }),
      () => { void refresh(); },
      () => { void refresh(); },
    );
    const stopVisible = reloadWhenVisible(() => { void refresh(); });

    return () => {
      active = false;
      stopVisible();
      leaveChannel();
    };
  }, [key, watchKey, loadOp, refresh]);

  const current = !!key && loaded.key === key;
  return {
    items: current ? loaded.items : (EMPTY as T[]),
    loading: !!key && (loading || !current),
    refresh,
  };
}

const EMPTY: never[] = [];

// ──────────────────────────────────────────────
// Grupos
// ──────────────────────────────────────────────

export function useGroupsSupabase(uid: string): UseGroupsReturn {
  const { items: groups, loading, refresh } = useLiveQuery<GroupRow, Group>({
    key: uid,
    load: () => getSupabase().from('groups').select(GROUP_COLUMNS).order('created_at', { ascending: true }),
    map: mapGroupRow,
    watch: [{ table: 'groups' }, { table: 'group_members' }],
    loadOp: 'shared_groups_load',
  });

  const createGroup = useCallback(async (name: string, description?: string): Promise<string> => {
    const { data, error } = await getSupabase().rpc('create_group', {
      p_name: name, p_description: description ?? null, p_display_name: null,
    });
    if (error || typeof data !== 'string') fail('shared_group_create', error, 'Não foi possível criar o grupo.');
    await refresh();
    return data;
  }, [refresh]);

  const deleteGroup = useCallback(async (groupId: string): Promise<void> => {
    const { error } = await getSupabase().from('groups').delete().eq('id', groupId);
    if (error) fail('shared_group_delete', error, 'Não foi possível excluir o grupo.');
    await refresh();
  }, [refresh]);

  const createInvite = useCallback(async (
    groupId: string, _groupName: string, inviteeEmail: string, inviterDisplayName: string,
  ): Promise<void> => {
    const email = inviteeEmail.toLowerCase().trim();
    if (!email) return;
    // o nome do grupo vem do banco, não do cliente
    const { error } = await getSupabase().rpc('create_group_invite', {
      p_group_id: groupId, p_invitee_email: email, p_inviter_display_name: inviterDisplayName,
    });
    if (error) fail('shared_group_invite_create', error, 'Não foi possível enviar o convite.');
  }, []);

  const checkGroupInvite = useCallback(async (groupId: string, email: string): Promise<GroupInvite | null> => {
    const { data, error } = await getSupabase()
      .from('group_invites')
      .select(INVITE_COLUMNS)
      .eq('group_id', groupId)
      .eq('invitee_email', email.toLowerCase().trim())
      .eq('status', 'pending')
      .limit(1);
    if (error) { logSanitizedFirebaseError('shared_group_invite_check', error); return null; }
    const first = (data as InviteRow[] | null)?.[0];
    return first ? mapInviteRow(first) : null;
  }, []);

  const acceptInvite = useCallback(async (
    groupId: string, inviteId: string, displayName: string, _email: string,
  ): Promise<void> => {
    void _email; // o e-mail vem do login no servidor
    const { error } = await getSupabase().rpc('accept_group_invite', {
      p_group_id: groupId, p_invite_id: inviteId, p_display_name: displayName,
    });
    if (error) fail('shared_group_invite_accept', error, 'Não foi possível aceitar o convite.');
    await refresh();
  }, [refresh]);

  const rejectInvite = useCallback(async (_groupId: string, inviteId: string): Promise<void> => {
    const { error } = await getSupabase().rpc('reject_group_invite', { p_invite_id: inviteId });
    if (error) fail('shared_group_invite_reject', error, 'Não foi possível recusar o convite.');
  }, []);

  return { groups, loading, createGroup, deleteGroup, createInvite, checkGroupInvite, acceptInvite, rejectInvite };
}

// ──────────────────────────────────────────────
// Convites pendentes (o dono vê)
// ──────────────────────────────────────────────

export function useGroupInvitesSupabase(groupId: string | null): UseGroupInvitesReturn {
  const id = groupId ?? '';
  const { items: invites, loading } = useLiveQuery<InviteRow, GroupInvite>({
    key: id,
    load: () => getSupabase().from('group_invites').select(INVITE_COLUMNS)
      .eq('group_id', id).eq('status', 'pending').order('created_at', { ascending: false }),
    map: mapInviteRow,
    watch: [{ table: 'group_invites', filter: `group_id=eq.${id}` }],
    loadOp: 'shared_group_invites_load',
  });
  return { invites, loading };
}

// ──────────────────────────────────────────────
// Despesas do grupo
// ──────────────────────────────────────────────

export function useGroupExpensesSupabase(groupId: string | null): UseGroupExpensesReturn {
  const id = groupId ?? '';
  const { items: expenses, loading, refresh } = useLiveQuery<ExpenseRow, SharedExpense>({
    key: id,
    load: () => getSupabase().from('group_expenses').select(EXPENSE_COLUMNS)
      .eq('group_id', id).order('date', { ascending: false }).order('created_at', { ascending: false }),
    map: mapExpenseRow,
    // cotas não têm group_id: a quitação também toca updated_at da despesa
    watch: [{ table: 'group_expenses', filter: `group_id=eq.${id}` }],
    loadOp: 'shared_expenses_load',
  });

  const addExpense = useCallback(async (targetGroupId: string, payload: SharedExpenseCreatePayload): Promise<void> => {
    const { error } = await getSupabase().rpc('create_group_expense', {
      p_group_id: targetGroupId,
      p_description: payload.description,
      p_total_cents: payload.totalCents,
      p_category: payload.category,
      p_date: payload.date,
      p_split_method: payload.splitMethod,
      p_payer_display_name: payload.payerDisplayName,
      p_shares: payload.shares.map((s) => ({ uid: s.uid, amountCents: s.amountCents, paid: s.paid })),
    });
    if (error) fail('shared_expense_add', error, 'Não foi possível lançar a despesa.');
    await refresh();
  }, [refresh]);

  const markSharePaid = useCallback(async (_groupId: string, expenseId: string, memberUid: string): Promise<void> => {
    const { error } = await getSupabase().rpc('settle_group_expense_share', {
      p_expense_id: expenseId, p_target_uid: memberUid,
    });
    if (error) fail('shared_expense_mark_paid', error, 'Não foi possível quitar a cota.');
    await refresh();
  }, [refresh]);

  const deleteExpense = useCallback(async (_groupId: string, expenseId: string): Promise<void> => {
    const { error } = await getSupabase().from('group_expenses').delete().eq('id', expenseId);
    if (error) fail('shared_expense_delete', error, 'Não foi possível excluir a despesa.');
    await refresh();
  }, [refresh]);

  return { expenses, loading, addExpense, markSharePaid, deleteExpense };
}
