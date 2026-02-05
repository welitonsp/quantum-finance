// src/services/FirestoreService.js

import {
  collection,
  doc,
  addDoc,
  getDocs,
  deleteDoc,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase/index";

export class FirestoreService {
  static getTransactionsCollection(uid) {
    return collection(db, "users", uid, "transactions");
  }

  static async addTransaction(uid, data) {
    return await addDoc(this.getTransactionsCollection(uid), {
      value: data.value,
      categoryId: data.categoryId || null,
      categoryName: data.categoryName || null,
      createdAt: serverTimestamp(),
    });
  }

  static async loadTransactions(uid) {
    const snap = await getDocs(this.getTransactionsCollection(uid));
    return snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));
  }

  static async deleteTransaction(uid, id) {
    await deleteDoc(doc(db, "users", uid, "transactions", id));
  }

  static async saveAllTransactions(uid, transactions) {
    const batch = writeBatch(db);
    const col = this.getTransactionsCollection(uid);

    transactions.forEach((tx) => {
      const ref = tx.id ? doc(col, tx.id) : doc(col);
      batch.set(ref, tx, { merge: true });
    });

    await batch.commit();
  }
}
