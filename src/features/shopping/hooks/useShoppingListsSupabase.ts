// Listas de compras no Supabase (tabela public.shopping_lists, itens em jsonb).
import { useCallback } from 'react';
import { getSupabase } from '../../../shared/api/supabase/client';
import { logSanitizedFirebaseError, type FirebaseErrorOperation } from '../../../shared/lib/firebaseErrorHandling';
import type { ShoppingList, ShoppingListItem } from '../../../shared/types/shopping';
import { shoppingListCreateSchema, shoppingListItemCreateSchema, shoppingListItemCheckSchema } from '../../../shared/schemas/shoppingSchemas';
import { centsFromBigint } from '../../../hooks/supabase/useAccountsSupabase';
import { useSupabaseTable } from '../../../hooks/supabase/useSupabaseTable';
import {
  applyCheck, buildItem, computeEstimatedTotal,
  type AddItemPayload, type CheckItemPayload, type NewItemFields, type UseShoppingListsReturn,
} from './shoppingListItems';

export interface ShoppingListRow {
  id: string;
  user_id: string;
  name: string | null;
  scheduled_date: string | null;
  estimated_total_cents: number | string | null;
  actual_total_cents: number | string | null;
  status: string | null;
  linked_transaction_id: string | null;
  items: unknown;
  created_at: string | null;
  updated_at: string | null;
}

const STATUSES: ReadonlySet<string> = new Set(['open', 'in_progress', 'done']);

export function mapShoppingListRow(row: ShoppingListRow): ShoppingList {
  const list: ShoppingList = {
    id: row.id,
    uid: row.user_id,
    name: row.name ?? '',
    estimatedTotalCents: centsFromBigint(row.estimated_total_cents),
    status: row.status && STATUSES.has(row.status) ? (row.status as ShoppingList['status']) : 'open',
    items: Array.isArray(row.items) ? (row.items as ShoppingListItem[]) : [],
    createdAt: row.created_at ?? '',
    updatedAt: row.updated_at ?? '',
    schemaVersion: 1,
  };
  if (row.scheduled_date) list.scheduledDate = row.scheduled_date;
  if (row.actual_total_cents !== null && row.actual_total_cents !== undefined) {
    list.actualTotalCents = centsFromBigint(row.actual_total_cents);
  }
  if (row.linked_transaction_id) list.linkedTransactionId = row.linked_transaction_id;
  return list;
}

const SHOPPING_OPTIONS = {
  table: 'shopping_lists',
  columns: 'id, user_id, name, scheduled_date, estimated_total_cents, actual_total_cents, status, linked_transaction_id, items, created_at, updated_at',
  orderBy: 'created_at',
  ascending: false,
  map: mapShoppingListRow,
  loadOp: 'shopping_lists_load',
} as const;

function fail(op: FirebaseErrorOperation, error: unknown, message: string): never {
  logSanitizedFirebaseError(op, error);
  throw new Error(message);
}

export function useShoppingListsSupabase(uid: string): UseShoppingListsReturn {
  const { items: lists, loading, refresh } = useSupabaseTable<ShoppingListRow, ShoppingList>(uid, SHOPPING_OPTIONS);

  /** Lê itens e status atuais da lista (a RLS só devolve listas do próprio usuário). */
  const readList = useCallback(async (listId: string): Promise<Pick<ShoppingList, 'items' | 'status'>> => {
    const { data, error } = await getSupabase()
      .from('shopping_lists').select('items, status').eq('id', listId).maybeSingle();
    if (error) fail('shopping_list_update', error, 'Não foi possível atualizar a lista.');
    if (!data) throw new Error('Lista não encontrada');
    const row = data as Pick<ShoppingListRow, 'items' | 'status'>;
    return {
      items: Array.isArray(row.items) ? (row.items as ShoppingListItem[]) : [],
      status: row.status && STATUSES.has(row.status) ? (row.status as ShoppingList['status']) : 'open',
    };
  }, []);

  const updateList = useCallback(async (listId: string, cols: Record<string, unknown>): Promise<void> => {
    const { error } = await getSupabase().from('shopping_lists').update(cols).eq('id', listId);
    if (error) fail('shopping_list_update', error, 'Não foi possível atualizar a lista.');
    await refresh();
  }, [refresh]);

  const createList = useCallback(async (name: string, scheduledDate?: string): Promise<string> => {
    if (!uid) throw new Error('Utilizador não autenticado.');
    const parsed = shoppingListCreateSchema.parse({
      name: name.trim(),
      scheduledDate,
      estimatedTotalCents: 0,
      status: 'open',
      items: [],
    });
    const { data, error } = await getSupabase()
      .from('shopping_lists')
      .insert({
        name: parsed.name,
        scheduled_date: parsed.scheduledDate ?? null,
        estimated_total_cents: parsed.estimatedTotalCents,
        status: parsed.status,
        items: parsed.items,
      })
      .select('id')
      .single();
    if (error || !data) fail('shopping_list_create', error, 'Não foi possível criar a lista.');
    await refresh();
    return (data as { id: string }).id;
  }, [uid, refresh]);

  const deleteList = useCallback(async (listId: string): Promise<void> => {
    const { error } = await getSupabase().from('shopping_lists').delete().eq('id', listId);
    if (error) fail('shopping_list_delete', error, 'Não foi possível excluir a lista.');
    await refresh();
  }, [refresh]);

  const addItem = useCallback(async (listId: string, payload: AddItemPayload): Promise<void> => {
    const parsed = shoppingListItemCreateSchema.parse({ ...payload, checked: payload.checked ?? false });
    const item = buildItem(parsed as NewItemFields);
    const current = await readList(listId);
    const items = [...current.items, item];
    await updateList(listId, { items, estimated_total_cents: computeEstimatedTotal(items) });
  }, [readList, updateList]);

  const checkItem = useCallback(async (listId: string, itemId: string, payload: CheckItemPayload): Promise<void> => {
    const parsed = shoppingListItemCheckSchema.parse(payload);
    const next = applyCheck(await readList(listId), itemId, parsed);
    await updateList(listId, {
      items: next.items,
      actual_total_cents: next.actualTotalCents,
      status: next.status,
    });
  }, [readList, updateList]);

  const removeItem = useCallback(async (listId: string, itemId: string): Promise<void> => {
    const current = await readList(listId);
    const items = current.items.filter((it) => it.id !== itemId);
    await updateList(listId, { items, estimated_total_cents: computeEstimatedTotal(items) });
  }, [readList, updateList]);

  const finishList = useCallback(
    (listId: string) => updateList(listId, { status: 'done' }),
    [updateList],
  );

  const linkTransaction = useCallback(
    (listId: string, transactionId: string) => updateList(listId, { linked_transaction_id: transactionId }),
    [updateList],
  );

  return { lists, loading, createList, deleteList, addItem, checkItem, removeItem, finishList, linkTransaction };
}
