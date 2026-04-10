import { collection, doc, addDoc, getDocs, deleteDoc, updateDoc, serverTimestamp, writeBatch, query, where, orderBy, setDoc } from "firebase/firestore";
import { db } from "../api/firebase/index";
import { validateTransaction, toCentavos, transactionSchema } from "../schemas/financialSchemas"; 

export class FirestoreService {
  static getTransactionsCollection(uid) { return collection(db, "users", uid, "transactions"); }
  static getRulesCollection(uid) { return collection(db, "users", uid, "categoryRules"); }
  static getRecurringCollection(uid) { return collection(db, "users", uid, "recurringTasks"); }

  static generateTransactionKey(transaction) {
    const date = transaction.date || transaction.createdAt || "";
    const description = (transaction.description || "").trim().toLowerCase();
    const value = Math.abs(Number(transaction.value)).toString();
    const type = transaction.type === "entrada" ? "entrada" : "saida";
    return `${date}|${description}|${value}|${type}`;
  }

  // ─── LEITURA (Otimizada com OrderBy para não sobrecarregar memória)
  static async getTransactionsByPeriod(uid, startDate, endDate) {
    try {
      const q = query(
        this.getTransactionsCollection(uid),
        where('date', '>=', startDate),
        where('date', '<=', endDate),
        orderBy('date', 'desc')
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
      console.error("Erro no Radar Firestore:", error);
      return [];
    }
  }

  static async addTransaction(uid, data) {
    if (!uid) return;
    const validation = validateTransaction({
      description: data.description || "Sem nome", value: data.value, type: data.type || "saida",
      category: data.category || "Diversos", date: data.date, accountId: data.account || "conta_corrente",
      isRecurring: Boolean(data.isRecurring)
    });
    if (!validation.success) throw new Error("Falha na validação Zod.");
    
    const cleanData = validation.data;
    const dataTransacao = cleanData.date ? new Date(`${cleanData.date}T12:00:00`) : new Date();
    
    const txRef = doc(this.getTransactionsCollection(uid));
    await setDoc(txRef, {
      ...cleanData, createdAt: dataTransacao, uniqueKey: this.generateTransactionKey(cleanData), registadoEm: serverTimestamp() 
    });
    return txRef.id;
  }

  // ─── IMPORTAÇÃO RESILIENTE (Com Fallback Individual)
  static async saveAllTransactions(uid, transactions) {
    if (!uid || transactions.length === 0) return { added: 0, duplicates: 0, invalid: 0 };
    
    const snapshot = await getDocs(this.getTransactionsCollection(uid));
    const existingKeys = new Set();
    snapshot.forEach(doc => { if (doc.data().uniqueKey) existingKeys.add(doc.data().uniqueKey); });

    const colRef = this.getTransactionsCollection(uid);
    let addedCount = 0, duplicateCount = 0, invalidCount = 0;
    
    // Processamento em Chunks Seguros de 400 (O limite do Firebase é 500)
    const chunkSize = 400;
    for (let i = 0; i < transactions.length; i += chunkSize) {
      const chunk = transactions.slice(i, i + chunkSize);
      let batch = writeBatch(db);
      let chunkOps = 0;
      let chunkData = []; // Guardar dados caso o batch falhe
      
      for (const tx of chunk) {
        try {
          const safeDateStr = tx.date || new Date().toISOString().split('T')[0];
          const safeValue = typeof tx.value === 'number' ? tx.value : Number(tx.value || 0);
          
          const safeData = {
            description: tx.description || "Transação Importada", value: safeValue,
            type: tx.type === "entrada" ? "entrada" : "saida", category: tx.category || "Diversos",
            tags: tx.tags || [], date: safeDateStr, accountId: tx.account || "conta_corrente",
            isRecurring: Boolean(tx.isRecurring)
          };

          const key = this.generateTransactionKey(safeData);
          if (existingKeys.has(key)) { duplicateCount++; continue; }
          existingKeys.add(key);

          const docId = tx.uniqueHash || crypto.randomUUID();
          const docRef = doc(colRef, docId);
          const payload = { ...safeData, uniqueHash: docId, uniqueKey: key, createdAt: new Date(`${safeDateStr}T12:00:00`), registadoEm: serverTimestamp() };
          
          batch.set(docRef, payload, { merge: true });
          chunkData.push({ ref: docRef, payload });
          chunkOps++;
        } catch (err) { invalidCount++; }
      }

      if (chunkOps > 0) {
        try {
          await batch.commit(); // Tenta gravar os 400 de uma vez (Super Rápido)
          addedCount += chunkOps;
        } catch (batchError) {
          console.warn("⚠️ Falha no Batch. Iniciando gravação resiliente individual...");
          // Fallback: Se o batch falhar, salva um a um (Mais lento, mas não perde os dados válidos)
          for (const item of chunkData) {
            try { await setDoc(item.ref, item.payload, { merge: true }); addedCount++; } 
            catch (e) { invalidCount++; }
          }
        }
      }
    }
    return { added: addedCount, duplicates: duplicateCount, invalid: invalidCount };
  }

  static async updateTransaction(uid, id, data) {
    const docRef = doc(db, "users", uid, "transactions", id);
    const partialValidation = transactionSchema.partial().safeParse({ ...data, value: data.value !== undefined ? Number(data.value) : undefined });
    if (!partialValidation.success) throw new Error("Validação falhou no update.");
    
    const updateData = { ...partialValidation.data, atualizadoEm: serverTimestamp() };
    if (updateData.date) updateData.createdAt = new Date(`${updateData.date}T12:00:00`);
    
    Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);
    await updateDoc(docRef, updateData);
  }

  static async deleteTransaction(uid, id) {
    await deleteDoc(doc(db, "users", uid, "transactions", id));
  }

  static async deleteTransactionsBatch(uid, ids) {
    if (!uid || !ids || ids.length === 0) return;
    const chunkSize = 400; 
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      const batch = writeBatch(db);
      chunk.forEach(id => batch.delete(doc(db, "users", uid, "transactions", id)));
      await batch.commit(); 
    }
  }

  static async getCategoryRules(uid) {
    if (!uid) return [];
    const snap = await getDocs(this.getRulesCollection(uid));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  static async addCategoryRule(uid, ruleData) {
    return await addDoc(this.getRulesCollection(uid), { category: ruleData.category, keywords: ruleData.keywords, criadoEm: serverTimestamp() });
  }

  static async deleteCategoryRule(uid, ruleId) {
    await deleteDoc(doc(db, "users", uid, "categoryRules", ruleId));
  }

  static async addRecurringTask(uid, data) {
    if (!uid) return;
    const docRef = await addDoc(this.getRecurringCollection(uid), { ...data, createdAt: serverTimestamp() });
    return docRef.id;
  }

  static async deleteRecurringTask(uid, id) {
    if (!uid || !id) return;
    await deleteDoc(doc(db, "users", uid, "recurringTasks", id));
  }
}