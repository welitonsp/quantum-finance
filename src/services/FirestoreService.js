// src/services/FirestoreService.js
import { collection, doc, addDoc, getDocs, deleteDoc, updateDoc, serverTimestamp, writeBatch, query, where } from "firebase/firestore";
import { db } from "../firebase";

export class FirestoreService {
  static getTransactionsCollection(uid) {
    return collection(db, "users", uid, "transactions");
  }

  // 📡 NOVO: O Radar Global (Faltava esta função!)
  // Busca transações num intervalo de datas para bloquear duplicados fantasma
  static async getTransactionsByPeriod(uid, startDate, endDate) {
    try {
      const start = new Date(startDate);
      start.setDate(start.getDate() - 5); // Margem de 5 dias
      const end = new Date(endDate);
      end.setDate(end.getDate() + 5);

      const q = query(
        this.getTransactionsCollection(uid),
        where('createdAt', '>=', start),
        where('createdAt', '<=', end)
      );

      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt || Date.now())
        };
      });
    } catch (error) {
      console.error("Erro no Radar Global do Firestore:", error);
      return [];
    }
  }

  static async addTransaction(uid, data) {
    if (!uid) return;
    const dataTransacao = data.date ? new Date(`${data.date}T12:00:00`) : new Date();
    return await addDoc(this.getTransactionsCollection(uid), {
      value: data.value,
      type: data.type || "entrada",
      category: data.category || "Diversos",
      account: data.account || "conta_corrente",
      createdAt: dataTransacao,
      registadoEm: serverTimestamp() 
    });
  }

  // 🛡️ ATUALIZADO: A Trava Absoluta! Agora usa o uniqueHash para impedir duplicados
  static async saveAllTransactions(uid, transactions) {
    if (!uid || transactions.length === 0) return;
    
    const batch = writeBatch(db);
    const colRef = this.getTransactionsCollection(uid);

    transactions.forEach((tx) => {
      // MAGIA: Se a transação trouxer um Hash, usa-o como ID oficial. Se não, gera um aleatório.
      const docId = tx.uniqueHash || crypto.randomUUID();
      const newDocRef = doc(colRef, docId);
      
      const dataTransacao = tx.date ? new Date(`${tx.date}T12:00:00`) : new Date();
      
      batch.set(newDocRef, {
        ...tx,
        uniqueHash: docId, // Guarda o Hash no documento
        createdAt: dataTransacao,
        registadoEm: serverTimestamp()
      }, { merge: true }); // O merge protege dados existentes!
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