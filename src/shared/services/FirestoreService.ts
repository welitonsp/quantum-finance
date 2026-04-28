import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
  query,
  orderBy,
  writeBatch,
  serverTimestamp,
  type CollectionReference,
} from 'firebase/firestore';
import { db } from '../api/firebase/index';
import {
  transactionCreateSchema,
  transactionUpdateSchema,
  type FinancialSource,
} from '../schemas/financialSchemas';
import { fromCentavos, toCentavos, type Centavos, type MoneyInput } from '../types/money';
import type { ImportResult, Transaction } from '../types/transaction';
import {
  canonicalizeTransactionType,
  getTransactionCentavos,
} from '../../utils/transactionUtils';
import { LedgerService, transactionToLedgerInput } from './LedgerService';

const TX_CHUNK_SIZE = 450;

const txCol = (uid: string): CollectionReference =>
  collection(db, 'users', uid, 'transactions');

export interface TransactionCreateDTO {
  description?: string;
  value_cents?: Centavos | number;
  value?: MoneyInput;
  type?: string;
  category?: string;
  date?: string;
  account?: string;
  accountId?: string;
  cardId?: string;
  isRecurring?: boolean;
  tags?: string[];
  source?: FinancialSource;
  fitId?: string | null;
}

export interface TransactionUpdateDTO {
  description?: string;
  value_cents?: Centavos | number;
  value?: MoneyInput;
  type?: string;
  category?: string;
  date?: string;
  account?: string;
  accountId?: string;
  cardId?: string;
  isRecurring?: boolean;
  tags?: string[];
  source?: FinancialSource;
  fitId?: string | null;
  isDeleted?: boolean;
  deletedAt?: unknown;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function resolveCentavos(data: Pick<TransactionCreateDTO, 'value' | 'value_cents'>): Centavos {
  if (data.value_cents !== undefined) return Math.abs(Math.round(data.value_cents)) as Centavos;
  if (data.value !== undefined) return Math.abs(toCentavos(data.value)) as Centavos;
  return 0 as Centavos;
}

function normalizeCreatePayload(data: TransactionCreateDTO) {
  const value_cents = resolveCentavos(data);
  const raw = {
    description: data.description?.trim() ?? '',
    value_cents,
    schemaVersion: 2 as const,
    type: canonicalizeTransactionType(data.type),
    category: data.category ?? 'Outros',
    date: data.date ?? todayIso(),
    source: data.source ?? 'manual',
    fitId: data.fitId ?? null,
    tags: data.tags ?? [],
    isRecurring: data.isRecurring ?? false,
    ...(data.account ? { account: data.account } : {}),
    ...(data.accountId ? { accountId: data.accountId } : {}),
    ...(data.cardId ? { cardId: data.cardId } : {}),
  };

  const parsed = transactionCreateSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Transação inválida: ${parsed.error.issues.map(issue => issue.message).join('; ')}`);
  }
  return parsed.data;
}

function normalizeUpdatePayload(data: TransactionUpdateDTO): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  if (data.description !== undefined) payload['description'] = data.description.trim();
  if (data.value_cents !== undefined || data.value !== undefined) {
    payload['value_cents'] = resolveCentavos(data);
    payload['schemaVersion'] = 2;
  }
  if (data.type !== undefined) payload['type'] = canonicalizeTransactionType(data.type);
  if (data.category !== undefined) payload['category'] = data.category;
  if (data.date !== undefined) payload['date'] = data.date;
  if (data.source !== undefined) payload['source'] = data.source;
  if (data.account !== undefined) payload['account'] = data.account;
  if (data.accountId !== undefined) payload['accountId'] = data.accountId;
  if (data.cardId !== undefined) payload['cardId'] = data.cardId;
  if (data.fitId !== undefined) payload['fitId'] = data.fitId;
  if (data.tags !== undefined) payload['tags'] = data.tags;
  if (data.isRecurring !== undefined) payload['isRecurring'] = data.isRecurring;
  if (data.isDeleted !== undefined) payload['isDeleted'] = data.isDeleted;
  if (data.deletedAt !== undefined) payload['deletedAt'] = data.deletedAt;

  const parsed = transactionUpdateSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(`Atualização inválida: ${parsed.error.issues.map(issue => issue.message).join('; ')}`);
  }
  return parsed.data;
}

function normalizeReadTransaction(tx: Transaction): Transaction {
  const value_cents = getTransactionCentavos(tx) ?? (0 as Centavos);
  return {
    ...tx,
    value_cents,
    value: fromCentavos(value_cents),
    schemaVersion: tx.schemaVersion ?? 2,
  };
}

function isActiveTransaction(tx: Transaction): boolean {
  return tx.isDeleted !== true && !tx.deletedAt;
}

export const FirestoreService = {
  async getTransactions(uid: string): Promise<Transaction[]> {
    if (!uid) return [];
    try {
      const snap = await getDocs(
        query(txCol(uid), orderBy('createdAt', 'desc')),
      );
      return snap.docs
        .map(d => normalizeReadTransaction({
          id: d.id,
          ...(d.data() as Omit<Transaction, 'id'>),
        }))
        .filter(isActiveTransaction);
    } catch (err) {
      console.warn('[Firestore][getTransactions] fallback sem orderBy:', (err as Error).message);
      const snap = await getDocs(txCol(uid));
      return snap.docs
        .map(d => normalizeReadTransaction({
          id: d.id,
          ...(d.data() as Omit<Transaction, 'id'>),
        }))
        .filter(isActiveTransaction);
    }
  },

  async addTransaction(uid: string, data: TransactionCreateDTO): Promise<string> {
    if (!uid) throw new Error('[Firestore][addTransaction] UID ausente.');
    const payload = normalizeCreatePayload(data);
    const docRef = await addDoc(txCol(uid), {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  },

  async updateTransaction(uid: string, id: string, data: TransactionUpdateDTO): Promise<void> {
    if (!uid || !id) throw new Error('[Firestore][updateTransaction] UID ou ID ausente.');
    const payload = normalizeUpdatePayload(data);
    await updateDoc(doc(txCol(uid), id), {
      ...payload,
      updatedAt: serverTimestamp(),
    });
  },

  async deleteTransaction(uid: string, id: string): Promise<void> {
    if (!uid || !id) throw new Error('[Firestore][deleteTransaction] UID ou ID ausente.');
    await updateDoc(doc(txCol(uid), id), {
      isDeleted: true,
      deletedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  },

  async deleteBatchTransactions(uid: string, ids: string[]): Promise<void> {
    if (!uid || !ids.length) return;

    for (let i = 0; i < ids.length; i += TX_CHUNK_SIZE) {
      const chunk = ids.slice(i, i + TX_CHUNK_SIZE);
      const batch = writeBatch(db);
      chunk.forEach(id => {
        batch.update(doc(txCol(uid), id), {
          isDeleted: true,
          deletedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });
      await batch.commit();
    }
  },

  async batchUpdateTransactions(
    uidOrNull: string | null | undefined,
    ids: string[],
    updateData: TransactionUpdateDTO,
  ): Promise<void> {
    if (!ids.length) return;
    const payload = normalizeUpdatePayload(updateData);

    for (let i = 0; i < ids.length; i += TX_CHUNK_SIZE) {
      const chunk = ids.slice(i, i + TX_CHUNK_SIZE);
      const batch = writeBatch(db);
      chunk.forEach(id => {
        const ref = uidOrNull
          ? doc(txCol(uidOrNull), id)
          : doc(collection(db, 'transactions'), id);
        batch.update(ref, {
          ...payload,
          updatedAt: serverTimestamp(),
        });
      });
      await batch.commit();
    }
  },

  async saveAllTransactions(
    uid: string,
    transactions: Array<Partial<Transaction>>,
  ): Promise<ImportResult> {
    if (!uid || !transactions.length) return { added: 0, duplicates: 0, invalid: 0 };
    return LedgerService.importTransactions(uid, transactions.map(transactionToLedgerInput));
  },

  getRecurringCollection(uid: string): CollectionReference {
    if (!uid) throw new Error('[Firestore][getRecurringCollection] UID obrigatório.');
    return collection(db, 'users', uid, 'recurringTasks');
  },

  async addRecurringTask(uid: string, data: Record<string, unknown>): Promise<string> {
    if (!uid) throw new Error('[Firestore][addRecurringTask] UID ausente.');
    const docRef = await addDoc(collection(db, 'users', uid, 'recurringTasks'), {
      ...data,
      schemaVersion: 2,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  },

  async deleteRecurringTask(uid: string, id: string): Promise<void> {
    if (!id) throw new Error('[Firestore][deleteRecurringTask] ID ausente.');
    await deleteDoc(doc(db, 'users', uid, 'recurringTasks', id));
  },
};
