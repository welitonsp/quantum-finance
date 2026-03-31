// src/services/FirestoreService.js
import { collection, doc, addDoc, getDocs, deleteDoc, updateDoc, serverTimestamp, writeBatch, query, where } from "firebase/firestore";
import { db } from "../firebase";

export class FirestoreService {
  static getTransactionsCollection(uid) {
    return collection(db, "users", uid, "transactions");
  }

  // ============================================================
  // FUNÇÃO: Gera uma chave única para cada transação
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
  // FUNÇÃO: Busca por período (Radar Global)
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
  // FUNÇÃO: Adicionar transação individual
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
  // OTIMIZAÇÃO CRÍTICA: saveAllTransactions (Resolve o Problema N+1)
  // Faz apenas 1 leitura ao banco de dados e salva em lotes seguros.
  // ============================================================
  static async saveAllTransactions(uid, transactions) {
    if (!uid || transactions.length === 0) return { added: 0, duplicates: 0 };
    
    // 1. Descobrir o intervalo de datas do lote que está a ser importado
    const dates = transactions.map(tx => new Date(tx.date ? `${tx.date}T12:00:00` : Date.now()));
    const minDate = new Date(Math.min(...dates));
    const maxDate = new Date(Math.max(...dates));
    
    // Alargar a margem por causa de fusos horários
    minDate.setDate(minDate.getDate() - 2);
    maxDate.setDate(maxDate.getDate() + 2);

    // 2. FAZER APENAS 1 QUERY PARA DESCOBRIR DUPLICADOS!
    const q = query(
      this.getTransactionsCollection(uid),
      where('createdAt', '>=', minDate),
      where('createdAt', '<=', maxDate)
    );
    const snapshot = await getDocs(q);

    // 3. Colocar as chaves existentes num "Set" na memória RAM (Super Rápido)
    const existingKeys = new Set();
    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.uniqueKey) existingKeys.add(data.uniqueKey);
    });

    // 4. Preparar o envio em lotes (Evitar o limite de 500 do Firebase)
    let batch = writeBatch(db);
    const colRef = this.getTransactionsCollection(uid);
    
    let addedCount = 0;
    let duplicateCount = 0;
    let currentBatchOperations = 0;

    for (const tx of transactions) {
      const key = this.generateTransactionKey(tx);
      
      // Verifica no Set na RAM se existe (não faz chamada ao banco!)
      if (existingKeys.has(key)) {
        duplicateCount++;
        continue; // pula a duplicada
      }

      // Adiciona ao Set para não importar duplicados dentro do próprio ficheiro
      existingKeys.add(key);

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
      currentBatchOperations++;

      // Proteção de limite do Firebase (máx 500 operações por batch)
      if (currentBatchOperations >= 450) {
        await batch.commit();
        batch = writeBatch(db); // Cria um novo batch
        currentBatchOperations = 0;
      }
    }

    // Envia o que sobrou no último batch
    if (currentBatchOperations > 0) {
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