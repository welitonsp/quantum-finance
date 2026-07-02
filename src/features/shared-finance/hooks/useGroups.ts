import { useState, useEffect, useCallback } from 'react';
import {
  collection, query, where, onSnapshot,
  doc, addDoc, deleteDoc, updateDoc, getDocs,
  serverTimestamp, writeBatch, getDoc, arrayUnion,
} from 'firebase/firestore';
import { db } from '../../../shared/api/firebase';
import { logSanitizedFirebaseError } from '../../../shared/lib/firebaseErrorHandling';
import type { Group, GroupInvite, SharedExpense, SharedExpenseCreatePayload } from '../../../shared/types/shared';

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

  /**
   * Cria um convite pendente para o e-mail informado.
   * Substitui o antigo `inviteMember` que adicionava o membro diretamente
   * sem consentimento. O membro só entra no grupo ao aceitar o convite.
   */
  const createInvite = useCallback(
    async (
      groupId: string,
      groupName: string,
      inviteeEmail: string,
      inviterDisplayName: string,
    ): Promise<void> => {
      const email = inviteeEmail.toLowerCase().trim();
      if (!email) return;
      try {
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        await addDoc(collection(db, 'groups', groupId, 'invites'), {
          groupId,
          groupName,
          inviterUid: uid,
          inviterDisplayName,
          inviteeEmail: email,
          status: 'pending',
          createdAt: serverTimestamp(),
          expiresAt,
          schemaVersion: 1,
        });
      } catch (err) {
        logSanitizedFirebaseError('shared_group_invite_create', err);
        throw err;
      }
    },
    [uid],
  );

  /**
   * Busca convite pendente para o e-mail do usuário no grupo informado.
   * Retorna null se não houver convite pendente.
   */
  const checkGroupInvite = useCallback(
    async (groupId: string, email: string): Promise<GroupInvite | null> => {
      try {
        const q = query(
          collection(db, 'groups', groupId, 'invites'),
          where('inviteeEmail', '==', email.toLowerCase().trim()),
          where('status', '==', 'pending'),
        );
        const snap = await getDocs(q);
        const first = snap.docs[0];
        if (!first) return null;
        return { id: first.id, ...first.data() } as GroupInvite;
      } catch (err) {
        logSanitizedFirebaseError('shared_group_invite_check', err);
        return null;
      }
    },
    [],
  );

  /**
   * Aceita um convite: em batch, marca o convite como 'accepted' e adiciona
   * o usuário ao grupo. O server-side Rule valida via `_lastAcceptedInviteId`
   * que o invite existe e foi aceito antes de autorizar a entrada no grupo.
   */
  const acceptInvite = useCallback(
    async (
      groupId: string,
      inviteId: string,
      displayName: string,
      email: string,
    ): Promise<void> => {
      try {
        const inviteRef = doc(db, 'groups', groupId, 'invites', inviteId);
        const groupRef  = doc(db, 'groups', groupId);

        // Step 1: mark invite accepted so the group update rule can verify it.
        await updateDoc(inviteRef, { status: 'accepted', acceptedAt: serverTimestamp() });

        // Step 2: add self to the group. Rules check the already-committed invite.
        await updateDoc(groupRef, {
          memberUids: arrayUnion(uid),
          members:    arrayUnion({ uid, displayName, email }),
          updatedAt:  serverTimestamp(),
          _lastAcceptedInviteId: inviteId,
        });
      } catch (err) {
        logSanitizedFirebaseError('shared_group_invite_accept', err);
        throw err;
      }
    },
    [uid],
  );

  const rejectInvite = useCallback(
    async (groupId: string, inviteId: string): Promise<void> => {
      try {
        await updateDoc(doc(db, 'groups', groupId, 'invites', inviteId), {
          status: 'rejected',
          rejectedAt: serverTimestamp(),
        });
      } catch (err) {
        logSanitizedFirebaseError('shared_group_invite_reject', err);
        throw err;
      }
    },
    [],
  );

  return { groups, loading, createGroup, deleteGroup, createInvite, checkGroupInvite, acceptInvite, rejectInvite };
}

// ──────────────────────────────────────────────
// Hook de convites enviados (para o dono do grupo ver)
// ──────────────────────────────────────────────

export function useGroupInvites(groupId: string | null) {
  const [invites, setInvites] = useState<GroupInvite[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!groupId) { setLoading(false); return; }

    const q = query(
      collection(db, 'groups', groupId, 'invites'),
      where('status', '==', 'pending'),
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setInvites(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as GroupInvite));
        setLoading(false);
      },
      (err) => {
        logSanitizedFirebaseError('shared_group_invites_load', err);
        setLoading(false);
      },
    );

    return unsub;
  }, [groupId]);

  return { invites, loading };
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
