// Regras puras dos itens de uma lista de compras, iguais no Firebase e no Supabase.
import Decimal from 'decimal.js';
import type { ShoppingList, ShoppingListItem, ShoppingUnit } from '../../../shared/types/shopping';
import type { Centavos } from '../../../shared/types/money';
import type { z } from 'zod';
import type { shoppingListItemCheckSchema } from '../../../shared/schemas/shoppingSchemas';

export type NewItemFields = Omit<ShoppingListItem, 'id' | 'createdAt' | 'checkedAt' | 'actualUnitPriceCents' | 'actualTotalCents'>;

export interface AddItemPayload {
  productName: string;
  quantity: string;
  unit: ShoppingUnit;
  estimatedUnitPriceCents: Centavos;
  estimatedTotalCents: Centavos;
  store?: string;
  checked?: boolean;
  notes?: string;
}

export interface CheckItemPayload {
  checked: boolean;
  actualUnitPriceCents?: Centavos;
  actualTotalCents?: Centavos;
  store?: string;
}

export interface UseShoppingListsReturn {
  lists: ShoppingList[];
  loading: boolean;
  createList: (name: string, scheduledDate?: string) => Promise<string>;
  deleteList: (listId: string) => Promise<void>;
  addItem: (listId: string, payload: AddItemPayload) => Promise<void>;
  checkItem: (listId: string, itemId: string, payload: CheckItemPayload) => Promise<void>;
  removeItem: (listId: string, itemId: string) => Promise<void>;
  finishList: (listId: string) => Promise<void>;
  linkTransaction: (listId: string, transactionId: string) => Promise<void>;
}

export function buildItem(payload: NewItemFields): ShoppingListItem {
  return {
    ...payload,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
}

export function computeEstimatedTotal(items: ShoppingListItem[]): Centavos {
  return items.reduce((acc, item) => {
    const val = new Decimal(acc).plus(item.estimatedTotalCents);
    return val.toNumber() as Centavos;
  }, 0 as Centavos);
}

export function computeActualTotal(items: ShoppingListItem[]): Centavos {
  return items.reduce((acc, item) => {
    if (!item.checked || item.actualTotalCents === undefined) return acc;
    return new Decimal(acc).plus(item.actualTotalCents).toNumber() as Centavos;
  }, 0 as Centavos);
}

type ParsedCheck = z.infer<typeof shoppingListItemCheckSchema>;

/** Marca/desmarca um item e devolve os itens, o total real e o novo status da lista. */
export function applyCheck(
  current: Pick<ShoppingList, 'items' | 'status'>,
  itemId: string,
  parsed: ParsedCheck,
): { items: ShoppingListItem[]; actualTotalCents: Centavos; status: ShoppingList['status'] } {
  const items: ShoppingListItem[] = (current.items ?? []).map((it) => {
    if (it.id !== itemId) return it;
    const base = { ...it, checked: parsed.checked };
    if (!parsed.checked) {
      const { checkedAt: _c, actualUnitPriceCents: _u, actualTotalCents: _t, ...rest } = base;
      return rest as ShoppingListItem;
    }
    const updated: ShoppingListItem = { ...base, checkedAt: new Date().toISOString() };
    if (parsed.actualUnitPriceCents !== undefined) updated.actualUnitPriceCents = parsed.actualUnitPriceCents as Centavos;
    if (parsed.actualTotalCents !== undefined) updated.actualTotalCents = parsed.actualTotalCents as Centavos;
    if (parsed.store !== undefined) updated.store = parsed.store;
    return updated;
  });
  const allChecked = items.length > 0 && items.every((it) => it.checked);
  return {
    items,
    actualTotalCents: computeActualTotal(items),
    status: allChecked ? 'done' : current.status === 'open' ? 'in_progress' : current.status,
  };
}
