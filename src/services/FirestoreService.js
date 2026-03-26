// src/services/FirestoreService.js
import { collection, doc, addDoc, getDocs, deleteDoc, updateDoc, serverTimestamp, writeBatch } from "firebase/firestore";
import { db } from "../firebase";

export class FirestoreService {
  static getTransactionsCollection(uid) {
    return collection(db, "users", uid, "transactions");
  }

  static async addTransaction(uid, data) {
    if (!uid) return;
    const dataTransacao = data.date ? new Date(`${data.date}T12:00:00`) : new Date();
    return await addDoc(this.getTransactionsCollection(uid), {
      value: data.value,
      type: data.type || "entrada",
      category: data.category || "Diversos",
      createdAt: dataTransacao,
      registadoEm: serverTimestamp() 
    });
  }

  static async deleteTransaction(uid, id) {
    await deleteDoc(doc(db, "users", uid, "transactions", id));
  }

  static async updateTransaction(uid, id, data) {
    const docRef = doc(db, "users", uid, "transactions", id);
    const dataTransacao = data.date ? new Date(`${data.date}T12:00:00`) : new Date();
    return await updateDoc(docRef, {
      value: data.value,
      type: data.type,
      category: data.category,
      createdAt: dataTransacao,
      atualizadoEm: serverTimestamp()
    });
  }

  static getRulesCollection(uid) {
    return collection(db, "users", uid, "categoryRules");
  }

  static async getCategoryRules(uid) {
    if (!uid) return [];
    const snap = await getDocs(this.getRulesCollection(uid));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  static async addCategoryRule(uid, ruleData) {
    return await addDoc(this.getRulesCollection(uid), {
      category: ruleData.category,
      keywords: ruleData.keywords,
      criadoEm: serverTimestamp()
    });
  }

  static async deleteCategoryRule(uid, ruleId) {
    await deleteDoc(doc(db, "users", uid, "categoryRules", ruleId));
  }
}