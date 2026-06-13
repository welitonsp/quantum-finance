import { useState, useEffect, useCallback } from 'react';
import {
  collection, query, where, onSnapshot,
  doc, addDoc, deleteDoc, updateDoc,
  serverTimestamp, writeBatch, getDoc,
} from 'firebase/firestore';
import { db } from '../../../shared/api/firebase';
import { logSanitizedFirebaseError } from '../../../shared/lib/firebaseErrorHandling';
import type { Group, SharedExpense, SharedExpenseCreatePayload } from '../../../shared/types/shared';

// ──────────────────────────────────────────────
// Hook de grupos
// ──────────────────────────────────────────────

export function useGroups(uid: string) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) return;

    const q = query(
      collection(db, 'groups'),
      where('memberUids', 'array-contains', uid),
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setGroups(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Group));
        setLoading(false);
      },
      (err) => {
        logSanitizedFirebaseError('shared_groups_load', err);
        setLoading(false);
      },
    );

    return unsub;
  }, [uid]);

  const createGroup = useCallback(
    async (name: string, description?: string): Promise<string> => {
      try {
        const ref = await addDoc(collection(db, 'groups'), {
          name,
          ...(description ? { description } : {}),
          ownerUid: uid,
          memberUids: [uid],
          members: [],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          schemaVersion: 1,
        });
        return ref.id;
      } catch (err) {
        logSanitizedFirebaseError('shared_group_create', err);
        throw err;
      }
    },
    [uid],
  );

  const deleteGroup = useCallback(
    async (groupId: string): Promise<void> => {
      try {
        await deleteDoc(doc(db, 'groups', groupId));
      } catch (err) {
        logSanitizedFirebaseError('shared_group_delete', err);
        throw err;
      }
    },
    [],
  );

  const inviteMember = useCallback(
    async (groupId: string, memberUid: string, displayName: string, email: string): Promise<void> => {
      try {
        const groupRef = doc(db, 'groups', groupId);
        const snap = await getDoc(groupRef);
        if (!snap.exists()) throw new Error('Grupo não encontrado');

        const data = snap.data() as Group;
        if (data.memberUids.includes(memberUid)) return;

        await updateDoc(groupRef, {
          memberUids: [...data.memberUids, memberUid],
          members: [...data.members, { uid: memberUid, displayName, email }],
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        logSanitizedFirebaseError('shared_group_invite', err);
        throw err;
      }
    },
    [],
  );

  return { groups, loading, createGroup, deleteGroup, inviteMember };
}

// ──────────────────────────────────────────────
// Hook de despesas do grupo
// ──────────────────────────────────────────────

export function useGroupExpenses(groupId: string | null) {
  const [expenses, setExpenses] = useState<SharedExpense[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!groupId) { setLoading(false); return; }

    const q = collection(db, 'groups', groupId, 'expenses');

    const unsub = onSnapshot(
      q,
      (snap) => {
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as SharedExpense);
        docs.sort((a, b) => b.date.localeCompare(a.date));
        setExpenses(docs);
        setLoading(false);
      },
      (err) => {
        logSanitizedFirebaseError('shared_expenses_load', err);
        setLoading(false);
      },
    );

    return unsub;
  }, [groupId]);

  const addExpense = useCallback(
    async (groupId: string, payload: SharedExpenseCreatePayload): Promise<void> => {
      try {
        await addDoc(collection(db, 'groups', groupId, 'expenses'), {
          ...payload,
          groupId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          schemaVersion: 1,
        });
      } catch (err) {
        logSanitizedFirebaseError('shared_expense_add', err);
        throw err;
      }
    },
    [],
  );

  const markSharePaid = useCallback(
    async (groupId: string, expenseId: string, memberUid: string): Promise<void> => {
      try {
        const ref = doc(db, 'groups', groupId, 'expenses', expenseId);
        const snap = await getDoc(ref);
        if (!snap.exists()) return;

        const data = snap.data() as SharedExpense;
        const updatedShares = data.shares.map((s) =>
          s.uid === memberUid
            ? { ...s, paid: true, paidAt: new Date().toISOString() }
            : s,
        );

        const batch = writeBatch(db);
        batch.update(ref, { shares: updatedShares, updatedAt: serverTimestamp() });
        await batch.commit();
      } catch (err) {
        logSanitizedFirebaseError('shared_expense_mark_paid', err);
        throw err;
      }
    },
    [],
  );

  const deleteExpense = useCallback(
    async (groupId: string, expenseId: string): Promise<void> => {
      try {
        await deleteDoc(doc(db, 'groups', groupId, 'expenses', expenseId));
      } catch (err) {
        logSanitizedFirebaseError('shared_expense_delete', err);
        throw err;
      }
    },
    [],
  );

  return { expenses, loading, addExpense, markSharePaid, deleteExpense };
}
