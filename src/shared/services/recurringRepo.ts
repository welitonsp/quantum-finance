/**
 * recurringRepo.ts — recurring task operations.
 */
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  type CollectionReference,
} from 'firebase/firestore';
import { db } from '../api/firebase/index';

export const recurringRepo = {
  getRecurringCollection(uid: string): CollectionReference {
    if (!uid) throw new Error('[Firestore][getRecurringCollection] UID obrigatório.');
    return collection(db, 'users', uid, 'recurringTasks');
  },

  async addRecurringTask(uid: string, data: Record<string, unknown>): Promise<string> {
    if (!uid) throw new Error('[Firestore][addRecurringTask] UID ausente.');
    const docRef = await addDoc(collection(db, 'users', uid, 'recurringTasks'), {
      ...data,
      schemaVersion: 2,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  },

  async deleteRecurringTask(uid: string, id: string): Promise<void> {
    if (!id) throw new Error('[Firestore][deleteRecurringTask] ID ausente.');
    await deleteDoc(doc(db, 'users', uid, 'recurringTasks', id));
  },
};
