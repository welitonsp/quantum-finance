import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  getDocs, query, orderBy,
  writeBatch, serverTimestamp,
  type CollectionReference,
} from 'firebase/firestore';
import { db } from '../api/firebase/index';
import type { Transaction, ImportResult } from '../types/transaction';
import { fromCentavos, toCentavos, type Centavos } from '../types/money';
import { isIncome as checkIncome } from '../../utils/transactionUtils';

// ─── Helpers de path ──────────────────────────────────────────────────────────

/** Coleção de transações por utilizador (caminho canónico). */
const txCol = (uid: string): CollectionReference =>
  collection(db, 'users', uid, 'transactions');

type PartialTx = Partial<Omit<Transaction, 'id'>>;

function txCentavos(tx: Partial<Transaction>): Centavos {
  return tx.value_cents !== undefined
    ? tx.value_cents
    : toCentavos(tx.value ?? 0);
}

function withMoneyPayload<T extends Partial<Transaction>>(tx: T): T & Pick<Transaction, 'value_cents' | 'schemaVersion'> {
  const value_cents = txCentavos(tx);
  return {
    ...tx,
    value_cents,
    value: tx.value ?? fromCentavos(value_cents),
    schemaVersion: tx.schemaVersion ?? 2,
  };
}

// ─── CRUD de Transações (API pública, com uid) ────────────────────────────────

export const FirestoreService = {

  /**
   * Lê todas as transações do utilizador e devolve array ordenado (mais recente primeiro).
   */
  async getTransactions(uid: string): Promise<Transaction[]> {
    if (!uid) return [];
    try {
      const snap = await getDocs(
        query(txCol(uid), orderBy('createdAt', 'desc'))
      );
      return snap.docs.map(d => ({
        id: d.id,
        ...(d.data() as Omit<Transaction, 'id'>),
      }));
    } catch (err) {
      // Falha de índice? Tenta sem ordenação
      console.warn('[Firestore][getTransactions] fallback sem orderBy:', (err as Error).message);
      const snap = await getDocs(txCol(uid));
      return snap.docs.map(d => ({
        id: d.id,
        ...(d.data() as Omit<Transaction, 'id'>),
      }));
    }
  },

  /**
   * Adiciona uma transação na sub-coleção do utilizador.
   * Assume que `data.value` já está em centavos (inteiro).
   */
  async addTransaction(uid: string, data: PartialTx): Promise<string> {
    if (!uid) throw new Error('[Firestore][addTransaction] UID ausente.');
    const { id: _id, uid: _uid, createdAt: _ca, updatedAt: _ua, ...payload } = withMoneyPayload(data as Partial<Transaction>);
    const docRef = await addDoc(txCol(uid), {
      ...payload,
      uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  },

  /**
   * Atualiza campos de uma transação na sub-coleção do utilizador.
   */
  async updateTransaction(uid: string, id: string, data: Partial<Transaction>): Promise<void> {
    if (!uid || !id) throw new Error('[Firestore][updateTransaction] UID ou ID ausente.');
    const normalized = data.value !== undefined || data.value_cents !== undefined
      ? withMoneyPayload(data)
      : data;
    const { id: _id, uid: _uid, createdAt: _ca, ...updatePayload } = normalized;
    await updateDoc(doc(txCol(uid), id), {
      ...updatePayload,
      updatedAt: serverTimestamp(),
    });
  },

  /**
   * Elimina uma transação na sub-coleção do utilizador.
   */
  async deleteTransaction(uid: string, id: string): Promise<void> {
    if (!uid || !id) throw new Error('[Firestore][deleteTransaction] UID ou ID ausente.');
    await deleteDoc(doc(txCol(uid), id));
  },

  /**
   * Elimina em batch transações na sub-coleção do utilizador.
   */
  async deleteBatchTransactions(uid: string, ids: string[]): Promise<void> {
    if (!uid || !ids.length) return;
    const batch = writeBatch(db);
    ids.forEach(id => batch.delete(doc(txCol(uid), id)));
    await batch.commit();
  },

  /**
   * Atualiza em batch um campo comum (ex: categoria) em múltiplas transações.
   * Chunking automático de 500 operações por batch (limite Firestore).
   * Se uid for fornecido, usa caminho por utilizador; caso contrário usa caminho legado.
   */
  async batchUpdateTransactions(
    uidOrNull: string | null | undefined,
    ids: string[],
    updateData: Partial<Transaction>
  ): Promise<void> {
    if (!ids.length) return;
    const { id: _id, uid: _uid, createdAt: _ca, ...payload } = updateData as Partial<Transaction>;
    const safePayload: Record<string, unknown> = { ...payload, updatedAt: serverTimestamp() };

    const CHUNK_SIZE = 500;
    for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
      const chunk = ids.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      chunk.forEach(id => {
        const ref = uidOrNull
          ? doc(txCol(uidOrNull), id)
          : doc(collection(db, 'transactions'), id);
        batch.update(ref, safePayload);
      });
      await batch.commit();
    }
  },

  // ─── Importação em Batch ────────────────────────────────────────────────────

  /**
   * Importa múltiplas transações em batch, com deduplicação por hash.
   * Escreve em users/{uid}/transactions.
   */
  async saveAllTransactions(
    uid: string,
    transactions: Array<Partial<Transaction>>
  ): Promise<ImportResult> {
    if (!uid || !transactions.length) return { added: 0, duplicates: 0, invalid: 0 };

    const batch  = writeBatch(db);
    const cache  = new Set<string>();
    let added = 0, duplicates = 0, invalid = 0;

    transactions.forEach(tx => {
      const isIncome = checkIncome(tx.type ?? '');
      const centavos = txCentavos(tx);
      if (Number.isNaN(Number(centavos)) || Number(centavos) === 0) { invalid++; return; }
      const txType   = isIncome ? 'entrada' : 'saida';
      const category = tx.category ?? 'Outros';
      const date     = tx.date ?? new Date().toISOString().split('T')[0];

      const hashKey = `${date}|${tx.description ?? ''}|${centavos}|${txType}`;
      if (cache.has(hashKey)) { duplicates++; return; }
      cache.add(hashKey);

      const docRef = doc(txCol(uid));
      batch.set(docRef, {
        uid,
        description: tx.description ?? '',
        value:       tx.value ?? fromCentavos(centavos),
        value_cents: centavos,
        schemaVersion: 2,
        type:        txType,
        category,
        date,
        account:     tx.account ?? 'conta_corrente',
        tags:        tx.tags ?? [],
        source:      tx.source ?? 'csv',
        fitId:       tx.fitId ?? null,
        isRecurring: false,
        createdAt:   serverTimestamp(),
        updatedAt:   serverTimestamp(),
      });
      added++;
    });

    await batch.commit();
    return { added, duplicates, invalid };
  },

  // ─── Recorrentes ────────────────────────────────────────────────────────────

  getRecurringCollection(uid: string): CollectionReference {
    if (!uid) throw new Error('[Firestore][getRecurringCollection] UID obrigatório.');
    return collection(db, 'users', uid, 'recurringTasks');
  },

  async addRecurringTask(uid: string, data: Record<string, unknown>): Promise<string> {
    if (!uid) throw new Error('[Firestore][addRecurringTask] UID ausente.');
    const docRef = await addDoc(collection(db, 'users', uid, 'recurringTasks'), {
      ...data, uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    return docRef.id;
  },

  async deleteRecurringTask(uid: string, id: string): Promise<void> {
    if (!id) throw new Error('[Firestore][deleteRecurringTask] ID ausente.');
    await deleteDoc(doc(db, 'users', uid, 'recurringTasks', id));
  },

};
