// src/shared/services/FirestoreService.js
import { collection, doc, addDoc, getDocs, deleteDoc, updateDoc, serverTimestamp, writeBatch, query, where } from "firebase/firestore";
import { db } from "../api/firebase/index";
import { validateTransaction, toCentavos } from "../schemas/financialSchemas"; 

export class FirestoreService {
  static getTransactionsCollection(uid) {
    return collection(db, "users", uid, "transactions");
  }

  // ============================================================
  // FUNÇÃO: Gera uma chave única para cada transação
  // ============================================================
  static generateTransactionKey(transaction) {
    const date = transaction.date || transaction.createdAt || "";
    const description = (transaction.description || "").trim().toLowerCase();
    const value = Math.abs(Number(transaction.value)).toString();
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
  // FUNÇÃO: Adicionar transação individual (COM AUDITORIA)
  // ============================================================
  static async addTransaction(uid, data) {
    if (!uid) return;

    // --- 🛡️ CAMPO DE FORÇAS ZOD COM CENTAVOS ---
    const validation = validateTransaction({
      description: data.description || "Transação sem nome",
      value: toCentavos(data.value), // Conversão de precisão
      type: data.type || "saida",
      category: data.category || "Diversos",
      date: data.date, 
      accountId: data.account || "conta_corrente",
      isRecurring: Boolean(data.isRecurring)
    });

    if (!validation.success) {
      console.error("❌ Bloqueio Quântico! Dados inválidos:", validation.error.format());
      throw new Error("Falha na validação de dados. Operação abortada pelo Zod.");
    }
    
    const cleanData = validation.data;
    const dataTransacao = cleanData.date ? new Date(`${cleanData.date}T12:00:00`) : new Date();
    
    // 🛡️ INICIA OPERAÇÃO EM LOTE (BATCH)
    const batch = writeBatch(db);
    
    // 1. Grava a Transação
    const txRef = doc(this.getTransactionsCollection(uid));
    batch.set(txRef, {
      ...cleanData,
      createdAt: dataTransacao,
      uniqueKey: this.generateTransactionKey(cleanData),
      registadoEm: serverTimestamp() 
    });

    // 2. Grava a Auditoria
    const auditRef = doc(collection(db, "audit_logs"));
    batch.set(auditRef, {
      userId: uid,
      transactionId: txRef.id,
      operation: 'CREATE',
      newData: cleanData,
      timestamp: serverTimestamp()
    });

    // Executa ambas atomicamente
    await batch.commit();
    return txRef.id;
  }

  // ============================================================
  // FUNÇÃO: Importação em Lotes (Mass Import)
  // ============================================================
  static async saveAllTransactions(uid, transactions) {
    if (!uid || transactions.length === 0) return { added: 0, duplicates: 0, invalid: 0 };
    
    const dates = transactions.map(tx => new Date(tx.date ? `${tx.date}T12:00:00` : Date.now()));
    const minDate = new Date(Math.min(...dates));
    const maxDate = new Date(Math.max(...dates));
    
    minDate.setDate(minDate.getDate() - 2);
    maxDate.setDate(maxDate.getDate() + 2);

    const q = query(
      this.getTransactionsCollection(uid),
      where('createdAt', '>=', minDate),
      where('createdAt', '<=', maxDate)
    );
    const snapshot = await getDocs(q);

    const existingKeys = new Set();
    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.uniqueKey) existingKeys.add(data.uniqueKey);
    });

    let batch = writeBatch(db);
    const colRef = this.getTransactionsCollection(uid);
    
    let addedCount = 0;
    let duplicateCount = 0;
    let invalidCount = 0;
    let currentBatchOperations = 0;

    for (const tx of transactions) {
      const validation = validateTransaction({
        description: tx.description || "Transação Importada",
        value: toCentavos(tx.value),
        type: tx.type === "entrada" ? "entrada" : "saida",
        category: tx.category || "Diversos",
        date: tx.date,
        accountId: tx.account || "conta_corrente",
        isRecurring: Boolean(tx.isRecurring)
      });

      if (!validation.success) {
        console.warn(`⚠️ Linha ignorada: ${tx.description}`, validation.error.format());
        invalidCount++;
        continue;
      }

      const cleanData = validation.data;
      const key = this.generateTransactionKey(cleanData);
      
      if (existingKeys.has(key)) {
        duplicateCount++;
        continue; 
      }

      existingKeys.add(key);

      const docId = tx.uniqueHash || crypto.randomUUID();
      const newDocRef = doc(colRef, docId);
      const dataTransacao = cleanData.date ? new Date(`${cleanData.date}T12:00:00`) : new Date();
      
      batch.set(newDocRef, {
        ...cleanData,
        uniqueHash: docId,
        uniqueKey: key,
        createdAt: dataTransacao,
        registadoEm: serverTimestamp()
      }, { merge: true });
      
      addedCount++;
      currentBatchOperations++;

      if (currentBatchOperations >= 450) {
        await batch.commit();
        batch = writeBatch(db); 
        currentBatchOperations = 0;
      }
    }

    if (currentBatchOperations > 0) {
      await batch.commit();
    }
    
    return { added: addedCount, duplicates: duplicateCount, invalid: invalidCount };
  }

  // ============================================================
  // FUNÇÃO: Deletar Transação (COM AUDITORIA)
  // ============================================================
  static async deleteTransaction(uid, id) {
    const docRef = doc(db, "users", uid, "transactions", id);
    
    const batch = writeBatch(db);
    
    // 1. Apaga a transação
    batch.delete(docRef);

    // 2. Regista quem apagou e quando
    const auditRef = doc(collection(db, "audit_logs"));
    batch.set(auditRef, {
      userId: uid,
      transactionId: id,
      operation: 'DELETE',
      timestamp: serverTimestamp()
    });

    await batch.commit();
  }

  // ============================================================
  // FUNÇÃO: Atualizar Transação (COM AUDITORIA)
  // ============================================================
  static async updateTransaction(uid, id, data) {
    const docRef = doc(db, "users", uid, "transactions", id);
    const dataTransacao = data.date ? new Date(`${data.date}T12:00:00`) : new Date();
    
    const updateData = {
      value: data.value !== undefined ? toCentavos(data.value) : undefined,
      type: data.type,
      category: data.category,
      createdAt: dataTransacao,
      atualizadoEm: serverTimestamp()
    };

    if (data.account) {
      updateData.account = data.account;
    }
    if (data.description !== undefined) {
      updateData.description = data.description;
    }

    // Limpa chaves undefined
    Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);

    const batch = writeBatch(db);
    
    // 1. Atualiza a transação
    batch.update(docRef, updateData);

    // 2. Regista a alteração
    const auditRef = doc(collection(db, "audit_logs"));
    batch.set(auditRef, {
      userId: uid,
      transactionId: id,
      operation: 'UPDATE',
      changes: updateData,
      timestamp: serverTimestamp()
    });

    await batch.commit();
  }

  // ============================================================
  // OUTRAS REGRAS
  // ============================================================
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