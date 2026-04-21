// src/features/ai-chat/CategoryService.ts
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../shared/api/firebase/index';

interface CategoryData {
  name: string;
  type: 'income' | 'expense';
}

export class CategoryService {
  static getCollection(uid: string) {
    return collection(db, 'users', uid, 'categories');
  }

  static async addCategory(uid: string, data: CategoryData) {
    return await addDoc(this.getCollection(uid), {
      name:      data.name,
      type:      data.type,
      createdAt: serverTimestamp(),
    });
  }

  static async deleteCategory(uid: string, id: string) {
    return await deleteDoc(doc(db, 'users', uid, 'categories', id));
  }
}
