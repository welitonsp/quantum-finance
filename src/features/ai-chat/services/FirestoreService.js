// src/services/FirestoreService.js
import { collection, doc, addDoc, getDocs, deleteDoc, updateDoc, serverTimestamp, writeBatch, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { validateTransaction } from "../schemas/financialSchemas"; // 🛡️ INJEÇÃO DO ZOD

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
  // FUNÇÃO: Adicionar transação individual BLINDADA
  // ============================================================
  static async addTransaction(uid, data) {
    if (!uid) return;

    // --- 🛡️ CAMPO DE FORÇAS ZOD ---
    // Mapeamos os dados para garantir que os tipos batem certo com o Schema
    const validation = validateTransaction({
      description: data.description || "Transação sem nome",
      value: Number(data.value),
      type: data.type || "saida",
      category: data.category || "Diversos",
      date: data.date, // Formato YYYY-MM-DD
      accountId: data.account || "conta_corrente",
      isRecurring: Boolean(data.isRecurring)
    });

    if (!validation.success) {
      console.error("❌ Bloqueio Quântico! Tentativa de injetar dados inválidos:", validation.error.format());
      throw new Error("Falha na validação de dados. Operação abortada pelo Zod.");
    }
    
    const cleanData = validation.data; // Dados 100% puros e tipados
    // ------------------------------

    const dataTransacao = cleanData.date ? new Date(`${cleanData.date}T12:00:00`) : new Date();
    const key = this.generateTransactionKey(cleanData);
    
    return await addDoc(this.getTransactionsCollection(uid), {
      ...cleanData, // Usa os dados limpos em vez dos dados crus
      createdAt: dataTransacao,
      uniqueKey: key,
      registadoEm: serverTimestamp() 
    });
  }

  // ============================================================
  // FUNÇÃO: Importação em Lotes BLINDADA
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
    let invalidCount = 0; // Novo contador
    let currentBatchOperations = 0;

    for (const tx of transactions) {
      // --- 🛡️ CAMPO DE FORÇAS ZOD EM LOTE ---
      const validation = validateTransaction({
        description: tx.description || "Transação Importada",
        value: Number(tx.value),
        type: tx.type === "entrada" ? "entrada" : "saida",
        category: tx.category || "Diversos",
        date: tx.date,
        accountId: tx.account || "conta_corrente",
        isRecurring: Boolean(tx.isRecurring)
      });

      if (!validation.success) {
        console.warn(`⚠️ Linha ignorada por erro de formato: ${tx.description}`, validation.error.format());
        invalidCount++;
        continue; // Se a linha estiver corrupta, ignora esta linha, mas salva o resto da fatura!
      }

      const cleanData = validation.data;
      // --------------------------------------

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
    
    // Retornamos também os inválidos para no futuro podermos mostrar um alerta ao utilizador
    return { added: addedCount, duplicates: duplicateCount, invalid: invalidCount };
  }

  // ============================================================
  // FUNÇÕES EXISTENTES
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