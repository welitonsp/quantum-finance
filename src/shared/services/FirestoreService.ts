import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  writeBatch, serverTimestamp, CollectionReference
} from 'firebase/firestore';
import { db } from '../api/firebase/index';
import type { Transaction, ImportResult } from '../types/transaction';

type TransactionData = Omit<Transaction, 'id'>;
type PartialTransactionData = Partial<TransactionData> & { amount?: number };

export const FirestoreService = {

  async saveTransaction(uid: string, transactionData: PartialTransactionData): Promise<string> {
    if (!uid) throw new Error('UID ausente.');
    const safeValue = Math.round(Number(transactionData.value || 0) * 100);
    const docRef = await addDoc(collection(db, 'transactions'), {
      ...transactionData, value: safeValue, uid,
      createdAt: transactionData.createdAt || serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    return docRef.id;
  },

  async saveAllTransactions(uid: string, transactions: PartialTransactionData[]): Promise<ImportResult> {
    if (!uid || !transactions.length) return { added: 0, duplicates: 0, invalid: 0 };
    const batch = writeBatch(db);
    let added = 0, duplicates = 0, invalid = 0;
    const cache = new Set<string>();

    transactions.forEach((tx) => {
      const isIncome = tx.type === 'receita' || tx.type === 'entrada';
      const rawVal = Number(tx.value ?? tx.amount ?? 0);
      if (isNaN(rawVal) || rawVal === 0) { invalid++; return; }

      const safeValue = Math.round(Math.abs(rawVal) * 100);
      const txType = isIncome ? 'receita' : 'saida';
      const category = tx.category || 'Diversos';
      const date = tx.date || new Date().toISOString().split('T')[0];
      const account = tx.account || 'conta_corrente';

      const hashStr = `${uid}-${date}-${tx.description}-${safeValue}-${txType}`;
      if (cache.has(hashStr)) { duplicates++; return; }
      cache.add(hashStr);

      const docRef = doc(collection(db, 'transactions'));
      batch.set(docRef, {
        uid, description: tx.description, value: safeValue, type: txType,
        category, date, account, tags: tx.tags || [],
        createdAt: new Date(date).getTime(), updatedAt: serverTimestamp()
      });
      added++;
    });

    await batch.commit();
    return { added, duplicates, invalid };
  },

  async updateTransaction(id: string, data: PartialTransactionData): Promise<void> {
    if (!id) throw new Error('ID ausente.');
    const updatePayload: Record<string, unknown> = { ...data, updatedAt: serverTimestamp() };
    if (data.value !== undefined) updatePayload['value'] = Math.round(Number(data.value) * 100);
    await updateDoc(doc(db, 'transactions', id), updatePayload);
  },

  async deleteTransaction(id: string): Promise<void> {
    if (!id) throw new Error('ID ausente.');
    await deleteDoc(doc(db, 'transactions', id));
  },

  async deleteBatchTransactions(ids: string[]): Promise<void> {
    if (!ids || ids.length === 0) return;
    const batch = writeBatch(db);
    ids.forEach(id => batch.delete(doc(db, 'transactions', id)));
    await batch.commit();
  },

  async batchUpdateTransactions(ids: string[], updateData: PartialTransactionData): Promise<void> {
    if (!ids || ids.length === 0) return;
    const batch = writeBatch(db);
    const payload: Record<string, unknown> = { ...updateData, updatedAt: serverTimestamp() };
    delete payload['value'];
    ids.forEach(id => batch.update(doc(db, 'transactions', id), payload));
    await batch.commit();
  },

  getRecurringCollection(uid?: string): CollectionReference {
    if (uid) return collection(db, 'users', uid, 'recurringTasks');
    return collection(db, 'recurring');
  },

  async saveRecurringTransaction(uid: string, data: Record<string, unknown>): Promise<string> {
    if (!uid) throw new Error('UID ausente.');
    const safeValue = Math.round(Number(data['value'] || 0) * 100);
    const docRef = await addDoc(collection(db, 'recurring'), {
      ...data, value: safeValue, uid,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    });
    return docRef.id;
  },

  async addRecurringTask(uid: string, data: Record<string, unknown>): Promise<string> {
    if (!uid) throw new Error('UID ausente.');
    const docRef = await addDoc(collection(db, 'users', uid, 'recurringTasks'), {
      ...data, uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    });
    return docRef.id;
  },

  async updateRecurringTransaction(id: string, data: Record<string, unknown>): Promise<void> {
    if (!id) throw new Error('ID ausente.');
    const updatePayload: Record<string, unknown> = { ...data, updatedAt: serverTimestamp() };
    if (data['value'] !== undefined) updatePayload['value'] = Math.round(Number(data['value']) * 100);
    await updateDoc(doc(db, 'recurring', id), updatePayload);
  },

  async deleteRecurringTask(uid: string, id: string): Promise<void> {
    if (!id) throw new Error('ID ausente.');
    await deleteDoc(doc(db, 'users', uid, 'recurringTasks', id));
  },

  async deleteRecurringTransaction(id: string): Promise<void> {
    if (!id) throw new Error('ID ausente.');
    await deleteDoc(doc(db, 'recurring', id));
  },
};

