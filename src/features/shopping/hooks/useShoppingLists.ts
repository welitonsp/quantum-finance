import { useState, useEffect, useCallback } from 'react';
import {
  collection, query, orderBy, onSnapshot,
  addDoc, updateDoc, doc, serverTimestamp, deleteDoc,
  getDoc,
} from 'firebase/firestore';
import Decimal from 'decimal.js';
import { db } from '../../../shared/api/firebase/index';
import { logSanitizedFirebaseError } from '../../../shared/lib/firebaseErrorHandling';
import type { ShoppingList, ShoppingListItem, ShoppingUnit } from '../../../shared/types/shopping';
import type { Centavos } from '../../../shared/types/money';
import { shoppingListCreateSchema, shoppingListItemCreateSchema, shoppingListItemCheckSchema } from '../../../shared/schemas/shoppingSchemas';

function buildItem(payload: Omit<ShoppingListItem, 'id' | 'createdAt' | 'checkedAt' | 'actualUnitPriceCents' | 'actualTotalCents'>): ShoppingListItem {
  return {
    ...payload,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
}

function computeEstimatedTotal(items: ShoppingListItem[]): Centavos {
  return items.reduce((acc, item) => {
    const val = new Decimal(acc).plus(item.estimatedTotalCents);
    return val.toNumber() as Centavos;
  }, 0 as Centavos);
}

function computeActualTotal(items: ShoppingListItem[]): Centavos {
  return items.reduce((acc, item) => {
    if (!item.checked || item.actualTotalCents === undefined) return acc;
    return new Decimal(acc).plus(item.actualTotalCents).toNumber() as Centavos;
  }, 0 as Centavos);
}

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

interface UseShoppingListsReturn {
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

export function useShoppingLists(uid: string): UseShoppingListsReturn {
  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) return;
    const ref = collection(db, 'users', uid, 'shoppingLists');
    const q = query(ref, orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setLists(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ShoppingList)));
        setLoading(false);
      },
      (err) => {
        logSanitizedFirebaseError('shopping_lists_load', err);
        setLoading(false);
      },
    );
    return unsub;
  }, [uid]);

  const createList = useCallback(async (name: string, scheduledDate?: string): Promise<string> => {
    const parsed = shoppingListCreateSchema.parse({
      name: name.trim(),
      scheduledDate,
      estimatedTotalCents: 0,
      status: 'open',
      items: [],
    });
    const ref = collection(db, 'users', uid, 'shoppingLists');
    const docRef = await addDoc(ref, {
      ...parsed,
      uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      schemaVersion: 1,
    });
    return docRef.id;
  }, [uid]);

  const deleteList = useCallback(async (listId: string): Promise<void> => {
    const ref = doc(db, 'users', uid, 'shoppingLists', listId);
    await deleteDoc(ref);
  }, [uid]);

  const addItem = useCallback(async (listId: string, payload: AddItemPayload): Promise<void> => {
    const parsed = shoppingListItemCreateSchema.parse({ ...payload, checked: payload.checked ?? false });
    const item = buildItem(parsed as Omit<ShoppingListItem, 'id' | 'createdAt' | 'checkedAt' | 'actualUnitPriceCents' | 'actualTotalCents'>);
    const ref = doc(db, 'users', uid, 'shoppingLists', listId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error('Lista não encontrada');
    const current = snap.data() as ShoppingList;
    const updatedItems = [...(current.items ?? []), item];
    await updateDoc(ref, {
      items: updatedItems,
      estimatedTotalCents: computeEstimatedTotal(updatedItems),
      updatedAt: serverTimestamp(),
    });
  }, [uid]);

  const checkItem = useCallback(async (listId: string, itemId: string, payload: CheckItemPayload): Promise<void> => {
    const parsed = shoppingListItemCheckSchema.parse(payload);
    const ref = doc(db, 'users', uid, 'shoppingLists', listId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error('Lista não encontrada');
    const current = snap.data() as ShoppingList;
    const updatedItems: ShoppingListItem[] = (current.items ?? []).map((it) => {
      if (it.id !== itemId) return it;
      const base = { ...it, checked: parsed.checked };
      if (!parsed.checked) {
        const { checkedAt: _c, actualUnitPriceCents: _u, actualTotalCents: _t, ...rest } = base;
        return rest as ShoppingListItem;
      }
      const updated: ShoppingListItem = { ...base, checkedAt: new Date().toISOString() };
      if (parsed.actualUnitPriceCents !== undefined) updated.actualUnitPriceCents = parsed.actualUnitPriceCents;
      if (parsed.actualTotalCents !== undefined) updated.actualTotalCents = parsed.actualTotalCents;
      if (parsed.store !== undefined) updated.store = parsed.store;
      return updated;
    });
    const allChecked = updatedItems.length > 0 && updatedItems.every((it) => it.checked);
    await updateDoc(ref, {
      items: updatedItems,
      actualTotalCents: computeActualTotal(updatedItems),
      status: allChecked ? 'done' : current.status === 'open' ? 'in_progress' : current.status,
      updatedAt: serverTimestamp(),
    });
  }, [uid]);

  const removeItem = useCallback(async (listId: string, itemId: string): Promise<void> => {
    const ref = doc(db, 'users', uid, 'shoppingLists', listId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error('Lista não encontrada');
    const current = snap.data() as ShoppingList;
    const updatedItems = (current.items ?? []).filter((it) => it.id !== itemId);
    await updateDoc(ref, {
      items: updatedItems,
      estimatedTotalCents: computeEstimatedTotal(updatedItems),
      updatedAt: serverTimestamp(),
    });
  }, [uid]);

  const finishList = useCallback(async (listId: string): Promise<void> => {
    const ref = doc(db, 'users', uid, 'shoppingLists', listId);
    await updateDoc(ref, { status: 'done', updatedAt: serverTimestamp() });
  }, [uid]);

  const linkTransaction = useCallback(async (listId: string, transactionId: string): Promise<void> => {
    const ref = doc(db, 'users', uid, 'shoppingLists', listId);
    await updateDoc(ref, { linkedTransactionId: transactionId, updatedAt: serverTimestamp() });
  }, [uid]);

  return { lists, loading, createList, deleteList, addItem, checkItem, removeItem, finishList, linkTransaction };
}
