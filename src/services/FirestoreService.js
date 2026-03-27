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
      account: data.account || "conta_corrente", // NOVO: Módulo da transação
      createdAt: dataTransacao,
      registadoEm: serverTimestamp() 
    });
  }

  // NOVO: Método de Alta Performance (Gravação em Lote) com Suporte a Módulos
  static async saveAllTransactions(uid, transactions) {
    if (!uid || transactions.length === 0) return;
    
    const batch = writeBatch(db);
    const colRef = this.getTransactionsCollection(uid);

    transactions.forEach((tx) => {
      const newDocRef = doc(colRef);
      const dataTransacao = tx.date ? new Date(`${tx.date}T12:00:00`) : new Date();
      
      batch.set(newDocRef, {
        value: tx.value,
        type: tx.type || "entrada",
        category: tx.category || "Diversos",
        account: tx.account || "conta_corrente", // NOVO: Etiqueta de Conta ou Cartão
        createdAt: dataTransacao,
        registadoEm: serverTimestamp()
      });
    });

    return await batch.commit(); 
  }

  static async deleteTransaction(uid, id) {
    await deleteDoc(doc(db, "users", uid, "transactions", id));
  }

  static async updateTransaction(uid, id, data) {
    const docRef = doc(db, "users", uid, "transactions", id);
    const dataTransacao = data.date ? new Date(`${data.date}T12:00:00`) : new Date();
    
    const updateData = {
      value: data.value,
      type: data.type,
      category: data.category,
      createdAt: dataTransacao,
      atualizadoEm: serverTimestamp()
    };

    // Só atualiza a conta se ela for enviada na edição
    if (data.account) {
      updateData.account = data.account;
    }

    return await updateDoc(docRef, updateData);
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