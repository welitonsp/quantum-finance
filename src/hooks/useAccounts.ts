// src/hooks/useAccounts.ts
import { useState, useEffect, useCallback } from 'react';
import {
  collection, query, onSnapshot,
  addDoc, deleteDoc, doc, updateDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../shared/api/firebase/index.js';

type AnyRecord = Record<string, unknown>;

interface Account extends AnyRecord {
  id: string;
  name?: string;
  balance?: number;
}

export function useAccounts(uid: string | null | undefined) {
  const [accounts, setAccounts]               = useState<Account[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);

  useEffect(() => {
    if (!uid) {
      setAccounts([]);
      setLoadingAccounts(false);
      return;
    }

    setLoadingAccounts(true);
    const accountsRef = collection(db, 'users', uid, 'accounts');
    const q = query(accountsRef);

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data: Account[] = snapshot.docs.map(d => ({
          ...d.data(),
          id: d.id,
        }));
        data.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setAccounts(data);
        setLoadingAccounts(false);
      },
      (err) => {
        console.error('Erro ao ler contas:', err);
        setLoadingAccounts(false);
      }
    );

    return () => unsubscribe();
  }, [uid]);

  const addAccount = useCallback(async (accountData: AnyRecord): Promise<string> => {
    if (!uid) throw new Error('Utilizador não autenticado.');
    const accountsRef = collection(db, 'users', uid, 'accounts');
    const docRef = await addDoc(accountsRef, {
      ...accountData,
      balance:   Number(accountData['balance']) || 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  }, [uid]);

  const updateAccount = useCallback(async (id: string, data: AnyRecord): Promise<void> => {
    if (!uid || !id) return;
    const docRef = doc(db, 'users', uid, 'accounts', id);
    await updateDoc(docRef, { ...data, updatedAt: serverTimestamp() });
  }, [uid]);

  const removeAccount = useCallback(async (id: string): Promise<void> => {
    if (!uid || !id) return;
    await deleteDoc(doc(db, 'users', uid, 'accounts', id));
  }, [uid]);

  return { accounts, loadingAccounts, addAccount, updateAccount, removeAccount };
}
