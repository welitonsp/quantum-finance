import { useState, useEffect, useCallback } from 'react';
import {
  collection, query, onSnapshot, addDoc, deleteDoc, doc, updateDoc, serverTimestamp
} from 'firebase/firestore';
import { db } from '../shared/api/firebase/index';
import type { Account } from '../shared/types/transaction';

interface UseAccountsReturn {
  accounts: Account[];
  loadingAccounts: boolean;
  addAccount: (data: Omit<Account, 'id'>) => Promise<string>;
  updateAccount: (id: string, data: Partial<Account>) => Promise<void>;
  removeAccount: (id: string) => Promise<void>;
}

export function useAccounts(uid: string): UseAccountsReturn {
  const [accounts, setAccounts]               = useState<Account[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);

  useEffect(() => {
    if (!uid) { setAccounts([]); setLoadingAccounts(false); return; }

    setLoadingAccounts(true);
    const accountsRef = collection(db, 'users', uid, 'accounts');
    const q = query(accountsRef);

    const unsubscribe = onSnapshot(q,
      (snapshot) => {
        const data: Account[] = snapshot.docs.map(d => ({
          ...(d.data() as Omit<Account, 'id'>),
          id: d.id
        }));
        data.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setAccounts(data);
        setLoadingAccounts(false);
      },
      (err) => {
        console.error('❌ Erro ao ler contas:', err);
        setLoadingAccounts(false);
      }
    );

    return () => unsubscribe();
  }, [uid]);

  const addAccount = useCallback(async (accountData: Omit<Account, 'id'>): Promise<string> => {
    if (!uid) throw new Error('Utilizador não autenticado.');
    const accountsRef = collection(db, 'users', uid, 'accounts');
    const docRef = await addDoc(accountsRef, {
      ...accountData,
      balance:   Number(accountData.balance) || 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    return docRef.id;
  }, [uid]);

  const updateAccount = useCallback(async (id: string, data: Partial<Account>): Promise<void> => {
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
