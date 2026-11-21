import { useState, useEffect, useCallback } from 'react';
import {
  collection, query, orderBy, onSnapshot,
  addDoc, updateDoc, doc, serverTimestamp, deleteDoc,
  getDoc,
} from 'firebase/firestore';
import { db } from '../../../shared/api/firebase/index';
import { logSanitizedFirebaseError } from '../../../shared/lib/firebaseErrorHandling';
import type { ShoppingList } from '../../../shared/types/shopping';
import { shoppingListCreateSchema, shoppingListItemCreateSchema, shoppingListItemCheckSchema } from '../../../shared/schemas/shoppingSchemas';
import { DATA_BACKEND } from '../../../shared/config/backend';
import {
  applyCheck, buildItem, computeEstimatedTotal,
  type AddItemPayload, type CheckItemPayload, type NewItemFields, type UseShoppingListsReturn,
} from './shoppingListItems';
import { useShoppingListsSupabase } from './useShoppingListsSupabase';

export type { AddItemPayload, CheckItemPayload, UseShoppingListsReturn } from './shoppingListItems';

function useShoppingListsFirebase(uid: string): UseShoppingListsReturn {
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
    const item = buildItem(parsed as NewItemFields);
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
    const next = applyCheck(current, itemId, parsed);
    await updateDoc(ref, {
      items: next.items,
      actualTotalCents: next.actualTotalCents,
      status: next.status,
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

/** Firebase ou Supabase, escolhido no build (VITE_AUTH_PROVIDER). */
export const useShoppingLists: (uid: string) => UseShoppingListsReturn =
  DATA_BACKEND === 'supabase' ? useShoppingListsSupabase : useShoppingListsFirebase;
