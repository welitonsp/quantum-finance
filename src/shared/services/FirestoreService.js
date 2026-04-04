// src/shared/services/FirestoreService.js
import { collection, doc, addDoc, getDocs, deleteDoc, updateDoc, serverTimestamp, writeBatch, query, where } from "firebase/firestore";
import { db } from "../api/firebase/index";
import { validateTransaction, toCentavos, transactionSchema } from "../schemas/financialSchemas"; 

export class FirestoreService {
  static getTransactionsCollection(uid) {
    return collection(db, "users", uid, "transactions");
  }

  static generateTransactionKey(transaction) {
    const date = transaction.date || transaction.createdAt || "";
    const description = (transaction.description || "").trim().toLowerCase();
    const value = Math.abs(Number(transaction.value)).toString();
    const type = transaction.type === "entrada" ? "entrada" : "saida";
    return `${date}|${description}|${value}|${type}`;
  }

  static async getTransactionsByPeriod(uid, startDate, endDate) {
    try {
      // CORREÇÃO: Busca baseada na data real da transação ('date') e não quando foi criada
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
      value: data.value, // O valor JÁ VEM em centavos do formulário
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
    
    const batch = writeBatch(db);
    
    const txRef = doc(this.getTransactionsCollection(uid));
    batch.set(txRef, {
      ...cleanData,
      createdAt: dataTransacao,
      uniqueKey: this.generateTransactionKey(cleanData),
      registadoEm: serverTimestamp() 
    });

    const auditRef = doc(collection(db, "audit_logs"));
    batch.set(auditRef, {
      userId: uid,
      transactionId: txRef.id,
      operation: 'CREATE',
      newData: cleanData,
      timestamp: serverTimestamp()
    });

    await batch.commit();
    return txRef.id;
  }

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
        value: toCentavos(tx.value), // Mantido aqui para OFX/CSV que trazem decimais crus
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

  static async deleteTransaction(uid, id) {
    const docRef = doc(db, "users", uid, "transactions", id);
    const batch = writeBatch(db);
    
    batch.delete(docRef);

    const auditRef = doc(collection(db, "audit_logs"));
    batch.set(auditRef, {
      userId: uid,
      transactionId: id,
      operation: 'DELETE',
      timestamp: serverTimestamp()
    });

    await batch.commit();
  }

  // CORREÇÃO: Delete em Lote 100% Atômico
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
        batch.set(auditRef, {
          userId: uid,
          transactionId: id,
          operation: 'DELETE_BATCH',
          timestamp: serverTimestamp()
        });
      });

      await batch.commit(); 
    }
  }

  // CORREÇÃO: Update com Validação Zod Parcial
  static async updateTransaction(uid, id, data) {
    const docRef = doc(db, "users", uid, "transactions", id);
    
    const partialValidation = transactionSchema.partial().safeParse({
      ...data,
      value: data.value !== undefined ? Number(data.value) : undefined
    });

    if (!partialValidation.success) {
      console.error("❌ Bloqueio Quântico no UPDATE:", partialValidation.error.format());
      throw new Error("Falha na validação de dados durante a atualização.");
    }

    const cleanData = partialValidation.data;
    const dataTransacao = cleanData.date ? new Date(`${cleanData.date}T12:00:00`) : new Date();
    
    const updateData = {
      ...cleanData,
      createdAt: dataTransacao,
      atualizadoEm: serverTimestamp()
    };

    Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);

    const batch = writeBatch(db);
    batch.update(docRef, updateData);

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