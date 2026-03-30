// src/services/FirestoreService.js
import { collection, doc, addDoc, getDocs, deleteDoc, updateDoc, serverTimestamp, writeBatch, query, where } from "firebase/firestore";
import { db } from "../firebase";

export class FirestoreService {
  static getTransactionsCollection(uid) {
    return collection(db, "users", uid, "transactions");
  }

  // ============================================================
  // NOVA FUNÇÃO: Gera uma chave única para cada transação
  // Base: data + descrição + valor + tipo (entrada/saída)
  // ============================================================
  static generateTransactionKey(transaction) {
    const date = transaction.date || transaction.createdAt || "";
    const description = (transaction.description || "").trim().toLowerCase();
    const value = Math.abs(Number(transaction.value)).toFixed(2);
    const type = transaction.type === "entrada" ? "entrada" : "saida";
    return `${date}|${description}|${value}|${type}`;
  }

  // ============================================================
  // NOVA FUNÇÃO: Verifica se uma transação já existe no Firestore
  // ============================================================
  static async transactionExists(uid, transaction) {
    const key = this.generateTransactionKey(transaction);
    const q = query(
      this.getTransactionsCollection(uid),
      where("uniqueKey", "==", key)
    );
    const snapshot = await getDocs(q);
    return !snapshot.empty;
  }

  // ============================================================
  // FUNÇÃO EXISTENTE: Busca por período (Radar Global)
  // ============================================================
  static async getTransactionsByPeriod(uid, startDate, endDate) {
    try {
      const start = new Date(startDate);
      start.setDate(start.getDate() - 5);
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

  // ============================================================
  // FUNÇÃO EXISTENTE: Adicionar transação individual
  // ============================================================
  static async addTransaction(uid, data) {
    if (!uid) return;
    const dataTransacao = data.date ? new Date(`${data.date}T12:00:00`) : new Date();
    const key = this.generateTransactionKey(data);
    return await addDoc(this.getTransactionsCollection(uid), {
      value: data.value,
      type: data.type || "entrada",
      category: data.category || "Diversos",
      account: data.account || "conta_corrente",
      createdAt: dataTransacao,
      uniqueKey: key,
      registadoEm: serverTimestamp() 
    });
  }

  // ============================================================
  // FUNÇÃO CORAÇÃO: saveAllTransactions com anti‑duplicação
  // Agora retorna { added: number, duplicates: number }
  // ============================================================
  static async saveAllTransactions(uid, transactions) {
    if (!uid || transactions.length === 0) return { added: 0, duplicates: 0 };
    
    const batch = writeBatch(db);
    const colRef = this.getTransactionsCollection(uid);
    let addedCount = 0;
    let duplicateCount = 0;

    for (const tx of transactions) {
      const key = this.generateTransactionKey(tx);
      
      // Verifica se já existe uma transação com a mesma chave
      const exists = await this.transactionExists(uid, { ...tx, uniqueKey: key });
      
      if (exists) {
        duplicateCount++;
        continue; // pula a duplicada
      }

      const docId = tx.uniqueHash || crypto.randomUUID();
      const newDocRef = doc(colRef, docId);
      
      const dataTransacao = tx.date ? new Date(`${tx.date}T12:00:00`) : new Date();
      
      batch.set(newDocRef, {
        ...tx,
        uniqueHash: docId,
        uniqueKey: key,
        createdAt: dataTransacao,
        registadoEm: serverTimestamp()
      }, { merge: true });
      
      addedCount++;
    }

    if (addedCount > 0) {
      await batch.commit();
    }
    
    return { added: addedCount, duplicates: duplicateCount };
  }

  // ============================================================
  // FUNÇÕES EXISTENTES: delete, update, regras
  // ============================================================
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