// src/shared/services/FirestoreService.js
import { 
  collection, doc, addDoc, getDocs, deleteDoc, updateDoc, 
  serverTimestamp, writeBatch, query, where, getDoc 
} from "firebase/firestore";
import { db } from "../api/firebase/index";
import { validateTransaction, toCentavos, transactionSchema } from "../schemas/financialSchemas";

export class FirestoreService {
  /**
   * Helper: Obtém a referência da coleção privada do usuário
   */
  static getTransactionsCollection(uid) {
    return collection(db, "users", uid, "transactions");
  }

  /**
   * Helper: Gera uma chave única para evitar duplicatas (Deduplicação)
   */
  static generateTransactionKey(transaction) {
    const date = transaction.date || "";
    const description = (transaction.description || "").trim().toLowerCase();
    const value = Math.abs(Number(transaction.value)).toString();
    const type = transaction.type === "entrada" ? "entrada" : "saida";
    return `${date}|${description}|${value}|${type}`;
  }

  /**
   * GRAVAÇÃO EM LOTE (Batch): Importação massiva com deduplicação atômica
   */
  static async saveAllTransactions(uid, transactions) {
    if (!uid || !transactions.length) return { added: 0, duplicates: 0, invalid: 0 };

    const batch = writeBatch(db);
    let added = 0;
    let duplicates = 0;
    let invalid = 0;

    // 1. Buscar transações existentes para checar duplicatas no período
    // Nota: Em cenários de alta densidade, poderíamos filtrar por data inicial/final aqui
    const snapshot = await getDocs(this.getTransactionsCollection(uid));
    const existingKeys = new Set(snapshot.docs.map(doc => this.generateTransactionKey(doc.data())));

    transactions.forEach(tx => {
      try {
        const key = this.generateTransactionKey(tx);
        
        if (existingKeys.has(key)) {
          duplicates++;
          return;
        }

        const validated = validateTransaction(tx);
        const docRef = doc(this.getTransactionsCollection(uid));
        
        batch.set(docRef, {
          ...validated,
          value: toCentavos(tx.value), // Armazenar em centavos (Integer)
          userId: uid,
          createdAt: serverTimestamp(),
          importKey: key
        });

        added++;
        existingKeys.add(key); // Evitar duplicatas dentro do próprio lote
      } catch (err) {
        console.error("Erro ao validar transação no lote:", err);
        invalid++;
      }
    });

    if (added > 0) await batch.commit();
    return { added, duplicates, invalid };
  }

  /**
   * ADIÇÃO ÚNICA: Cadastro manual de transação
   */
  static async addTransaction(uid, data) {
    const validated = validateTransaction(data);
    const docRef = await addDoc(this.getTransactionsCollection(uid), {
      ...validated,
      value: toCentavos(data.value),
      userId: uid,
      createdAt: serverTimestamp()
    });
    return docRef.id;
  }

  /**
   * ATUALIZAÇÃO: Edição de registro existente
   */
  static async updateTransaction(uid, id, data) {
    const docRef = doc(db, "users", uid, "transactions", id);
    
    // Validação parcial para atualização
    const partialValidation = transactionSchema.partial().safeParse(data);
    if (!partialValidation.success) throw new Error("Dados inválidos para atualização.");

    await updateDoc(docRef, {
      ...partialValidation.data,
      value: toCentavos(data.value),
      updatedAt: serverTimestamp()
    });
  }

  /**
   * ELIMINAÇÃO EM LOTE: Operação atômica para limpeza
   */
  static async deleteTransactionsBatch(uid, ids) {
    if (!ids.length) return;
    const batch = writeBatch(db);
    ids.forEach(id => {
      const docRef = doc(db, "users", uid, "transactions", id);
      batch.delete(docRef);
    });
    await batch.commit();
  }

  // --- GESTÃO DE REGRAS DE CATEGORIA ---

  static getRulesCollection(uid) {
    return collection(db, "users", uid, "categoryRules");
  }

  static async getCategoryRules(uid) {
    if (!uid) return [];
    const snap = await getDocs(this.getRulesCollection(uid));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  static async addCategoryRule(uid, rule) {
    const docRef = await addDoc(this.getRulesCollection(uid), {
      ...rule,
      createdAt: serverTimestamp()
    });
    return docRef.id;
  }
}