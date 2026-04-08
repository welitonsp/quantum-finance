import { collection, doc, addDoc, getDocs, deleteDoc, updateDoc, serverTimestamp, writeBatch, query, where } from "firebase/firestore";
import { db } from "../api/firebase/index";
import { validateTransaction, toCentavos, transactionSchema } from "../schemas/financialSchemas"; 

export class FirestoreService {
  // ==========================================
  // 1. REFERÊNCIAS DE COLEÇÕES
  // ==========================================
  static getTransactionsCollection(uid) {
    return collection(db, "users", uid, "transactions");
  }

  static getRulesCollection(uid) {
    return collection(db, "users", uid, "categoryRules");
  }

  static getRecurringCollection(uid) {
    return collection(db, "users", uid, "recurringTasks");
  }

  // ==========================================
  // 2. UTILITÁRIOS
  // ==========================================
  static generateTransactionKey(transaction) {
    const date = transaction.date || transaction.createdAt || "";
    const description = (transaction.description || "").trim().toLowerCase();
    const value = Math.abs(Number(transaction.value)).toString();
    const type = transaction.type === "entrada" ? "entrada" : "saida";
    return `${date}|${description}|${value}|${type}`;
  }

  // ==========================================
  // 3. TRANSAÇÕES: LEITURA E GRAVAÇÃO ÚNICA
  // ==========================================
  static async getTransactionsByPeriod(uid, startDate, endDate) {
    try {
      const q = query(
        this.getTransactionsCollection(uid),
        where('date', '>=', startDate),
        where('date', '<=', endDate)
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
    const validation = validateTransaction({
      description: data.description || "Transação sem nome",
      value: data.value,
      type: data.type || "saida",
      category: data.category || "Diversos",
      date: data.date, 
      accountId: data.account || "conta_corrente",
      isRecurring: Boolean(data.isRecurring)
    });

    if (!validation.success) {
      throw new Error("Falha na validação de dados. Operação abortada pelo Zod.");
    }
    
    const cleanData = validation.data;
    const dataTransacao = cleanData.date ? new Date(`${cleanData.date}T12:00:00`) : new Date();
    const batch = writeBatch(db);
    const txRef = doc(this.getTransactionsCollection(uid));
    
    batch.set(txRef, {
      ...cleanData,
      createdAt: dataTransacao,
      uniqueKey: this.generateTransactionKey(cleanData),
      registadoEm: serverTimestamp() 
    });

    const auditRef = doc(collection(db, "audit_logs"));
    batch.set(auditRef, { userId: uid, transactionId: txRef.id, operation: 'CREATE', newData: cleanData, timestamp: serverTimestamp() });

    await batch.commit();
    return txRef.id;
  }

  // ==========================================
  // 4. TRANSAÇÕES: LOTE ATÓMICO (IMPORTAÇÃO COM BYPASS PARA IA)
  // ==========================================
  static async saveAllTransactions(uid, transactions) {
    if (!uid || transactions.length === 0) return { added: 0, duplicates: 0, invalid: 0 };
    
    const snapshot = await getDocs(this.getTransactionsCollection(uid));
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
      try {
        // Formatação segura forçada (Bypass do Zod para não perder categorização da IA)
        const safeDateStr = tx.date || new Date().toISOString().split('T')[0];
        const safeValue = typeof tx.value === 'number' ? Math.round(tx.value * 100) : toCentavos(tx.value || 0);
        
        const safeData = {
          description: tx.description || "Transação Importada",
          value: safeValue,
          type: tx.type === "entrada" ? "entrada" : "saida",
          category: tx.category || "Diversos",
          tags: tx.tags || [], // Preserva as tags de Fixa/Variável da IA
          date: safeDateStr,
          accountId: tx.account || "conta_corrente",
          isRecurring: Boolean(tx.isRecurring)
        };

        const key = this.generateTransactionKey(safeData);
        
        if (existingKeys.has(key)) {
          duplicateCount++;
          continue; 
        }

        existingKeys.add(key);

        const docId = tx.uniqueHash || crypto.randomUUID();
        const newDocRef = doc(colRef, docId);
        const dataTransacao = new Date(`${safeDateStr}T12:00:00`);
        
        batch.set(newDocRef, {
          ...safeData,
          uniqueHash: docId,
          uniqueKey: key,
          createdAt: dataTransacao,
          registadoEm: serverTimestamp()
        }, { merge: true });
        
        addedCount++;
        currentBatchOperations++;

        // Submete o batch a cada 450 operações para respeitar o limite do Firestore
        if (currentBatchOperations >= 450) {
          await batch.commit();
          batch = writeBatch(db); 
          currentBatchOperations = 0;
        }
      } catch (err) {
        console.warn(`⚠️ Linha ignorada: ${tx.description}`, err);
        invalidCount++;
      }
    }

    if (currentBatchOperations > 0) {
      await batch.commit();
    }
    
    return { added: addedCount, duplicates: duplicateCount, invalid: invalidCount };
  }

  // ==========================================
  // 5. TRANSAÇÕES: ATUALIZAÇÃO E ELIMINAÇÃO
  // ==========================================
  static async updateTransaction(uid, id, data) {
    const docRef = doc(db, "users", uid, "transactions", id);
    const partialValidation = transactionSchema.partial().safeParse({ ...data, value: data.value !== undefined ? Number(data.value) : undefined });
    
    if (!partialValidation.success) throw new Error("Falha na validação de dados durante a atualização.");
    
    const cleanData = partialValidation.data;
    const dataTransacao = cleanData.date ? new Date(`${cleanData.date}T12:00:00`) : new Date();
    const updateData = { ...cleanData, createdAt: dataTransacao, atualizadoEm: serverTimestamp() };
    
    // Remove chaves indefinidas para o Firestore não dar erro
    Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);
    
    const batch = writeBatch(db);
    batch.update(docRef, updateData);
    
    const auditRef = doc(collection(db, "audit_logs"));
    batch.set(auditRef, { userId: uid, transactionId: id, operation: 'UPDATE', changes: updateData, timestamp: serverTimestamp() });
    
    await batch.commit();
  }

  static async deleteTransaction(uid, id) {
    const docRef = doc(db, "users", uid, "transactions", id);
    const batch = writeBatch(db);
    batch.delete(docRef);
    
    const auditRef = doc(collection(db, "audit_logs"));
    batch.set(auditRef, { userId: uid, transactionId: id, operation: 'DELETE', timestamp: serverTimestamp() });
    
    await batch.commit();
  }

  static async deleteTransactionsBatch(uid, ids) {
    if (!uid || !ids || ids.length === 0) return;
    const chunkSize = 200; 
    const chunks = [];
    
    for (let i = 0; i < ids.length; i += chunkSize) {
      chunks.push(ids.slice(i, i + chunkSize));
    }
    
    for (const chunk of chunks) {
      const batch = writeBatch(db);
      chunk.forEach(id => {
        const docRef = doc(db, "users", uid, "transactions", id);
        batch.delete(docRef);
        const auditRef = doc(collection(db, "audit_logs"));
        batch.set(auditRef, { userId: uid, transactionId: id, operation: 'DELETE_BATCH', timestamp: serverTimestamp() });
      });
      await batch.commit(); 
    }
  }

  // ==========================================
  // 6. GESTÃO DE REGRAS DE CATEGORIA
  // ==========================================
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

  // ==========================================
  // 7. GESTÃO DE DESPESAS RECORRENTES
  // ==========================================
  static async addRecurringTask(uid, data) {
    if (!uid) return;
    const docRef = await addDoc(this.getRecurringCollection(uid), {
      ...data,
      createdAt: serverTimestamp()
    });
    return docRef.id;
  }

  static async deleteRecurringTask(uid, id) {
    if (!uid || !id) return;
    const docRef = doc(db, "users", uid, "recurringTasks", id);
    await deleteDoc(docRef);
  }
}