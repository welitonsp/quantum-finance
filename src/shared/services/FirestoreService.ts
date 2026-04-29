import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
  getDoc,
  query,
  orderBy,
  writeBatch,
  serverTimestamp,
  deleteField,
  type CollectionReference,
} from 'firebase/firestore';
import { z } from 'zod';
import { db } from '../api/firebase/index';
import {
  centavosSchema,
  dateSchema,
  sourceSchema,
  transactionTypeSchema,
  SOURCE_VALUES,
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

const writeCategorySchema = z.string().trim().min(1).max(80);

const transactionWriteCreateSchema = z.object({
  description: z.string().trim().min(2).max(160),
  value_cents: centavosSchema,
  schemaVersion: z.literal(2),
  type: transactionTypeSchema,
  category: writeCategorySchema,
  date: dateSchema,
  source: sourceSchema,
  account: z.string().trim().min(1).max(120).optional(),
  accountId: z.string().trim().min(1).max(120).optional(),
  cardId: z.string().trim().min(1).max(120).optional(),
  fitId: z.string().trim().min(1).max(160).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(32)).max(20).optional(),
  isRecurring: z.boolean().optional(),
}).strict();

const transactionWriteUpdateSchema = transactionWriteCreateSchema.partial()
  .extend({
    isDeleted: z.boolean().optional(),
    deletedAt: z.unknown().optional(),
  })
  .refine(value => Object.keys(value).length > 0, 'Atualização vazia.');

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

type TransactionCreatePayload = z.infer<typeof transactionWriteCreateSchema>;

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

  const parsed = transactionWriteCreateSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Transação inválida: ${parsed.error.issues.map(issue => issue.message).join('; ')}`);
  }
  return parsed.data;
}

function debugAddPayload(payload: TransactionCreatePayload): void {
  if (!import.meta.env.DEV) return;
  console.warn('[Firestore][addTransaction][payload]', {
    keys: Object.keys(payload).sort(),
    type: payload.type,
    category: payload.category,
    date: payload.date,
    source: payload.source,
    value_cents: payload.value_cents,
    schemaVersion: payload.schemaVersion,
    hasDescription: payload.description.length > 0,
    hasForbiddenFields: false,
  });
}

function debugRejectedAddPayload(payload: TransactionCreatePayload, err: unknown): void {
  if (!import.meta.env.DEV) return;
  const code = typeof err === 'object' && err !== null && 'code' in err
    ? String((err as { code?: unknown }).code ?? '')
    : undefined;
  if (code !== 'permission-denied') return;
  console.warn('[Firestore][addTransaction][permission-denied]', {
    keys: Object.keys(payload).sort(),
    type: payload.type,
    category: payload.category,
    date: payload.date,
    source: payload.source,
    value_cents: payload.value_cents,
    schemaVersion: payload.schemaVersion,
    forbiddenFieldsPresent: ['uid', 'id', 'value', 'createdAt', 'updatedAt']
      .filter(field => field in (payload as unknown as Record<string, unknown>)),
  });
}

function getFirebaseErrorCode(err: unknown): string | undefined {
  return typeof err === 'object' && err !== null && 'code' in err
    ? String((err as { code?: unknown }).code ?? '')
    : undefined;
}

function debugUpdatePayload(
  id: string,
  payload: Record<string, unknown>,
  removesLegacyFields: boolean,
): void {
  if (!import.meta.env.DEV) return;
  console.warn('[Firestore][updateTransaction][payload]', {
    id,
    keys: Object.keys(payload).sort(),
    operation: 'update',
    removesLegacyFields,
    type: payload['type'],
    category: payload['category'],
    date: payload['date'],
    source: payload['source'],
    value_cents: payload['value_cents'],
    schemaVersion: payload['schemaVersion'],
    hasDescription: typeof payload['description'] === 'string' && payload['description'].length > 0,
    forbiddenFieldsPresentAfterWrite: false,
  });
}

function debugRejectedUpdatePayload(id: string, payload: Record<string, unknown>, err: unknown): void {
  if (!import.meta.env.DEV) return;
  if (getFirebaseErrorCode(err) !== 'permission-denied') return;
  console.warn('[Firestore][updateTransaction][permission-denied]', {
    id,
    keys: Object.keys(payload).sort(),
    operation: 'update',
    removesLegacyFields: true,
    type: payload['type'],
    category: payload['category'],
    date: payload['date'],
    source: payload['source'],
    value_cents: payload['value_cents'],
    schemaVersion: payload['schemaVersion'],
    legacyFieldsRequestedForDeletion: ['uid', 'id', 'value'],
  });
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

  const parsed = transactionWriteUpdateSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(`Atualização inválida: ${parsed.error.issues.map(issue => issue.message).join('; ')}`);
  }
  return parsed.data;
}

function buildSoftDeletePatch(existing: Record<string, unknown>): Record<string, unknown> {
  const type = canonicalizeTransactionType(existing['type'] as string | undefined);
  const srcRaw = existing['source'] as string | undefined;
  const source: FinancialSource = SOURCE_VALUES.includes(srcRaw as FinancialSource)
    ? (srcRaw as FinancialSource)
    : 'manual';

  const patch: Record<string, unknown> = {
    schemaVersion: 2,
    type,
    source,
    isDeleted: true,
    deletedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    uid: deleteField(),
    id: deleteField(),
    value: deleteField(),
  };

  // Fix legacy documents where value_cents is absent or zero but a float 'value' exists
  const rawCents = existing['value_cents'];
  const legacyValue = existing['value'];
  if (typeof rawCents === 'number' && rawCents > 0) {
    patch['value_cents'] = Math.round(rawCents);
  } else if (typeof legacyValue === 'number' && legacyValue !== 0) {
    patch['value_cents'] = Math.abs(Math.round(legacyValue * 100));
  }

  return patch;
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
    debugAddPayload(payload);
    try {
      const docRef = await addDoc(txCol(uid), {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return docRef.id;
    } catch (err) {
      debugRejectedAddPayload(payload, err);
      throw err;
    }
  },

  async updateTransaction(uid: string, id: string, data: TransactionUpdateDTO): Promise<void> {
    if (!uid || !id) throw new Error('[Firestore][updateTransaction] UID ou ID ausente.');
    const payload = normalizeUpdatePayload(data);
    const writePayload = {
      ...payload,
      uid: deleteField(),
      id: deleteField(),
      value: deleteField(),
      updatedAt: serverTimestamp(),
    };
    debugUpdatePayload(id, payload, true);
    try {
      await updateDoc(doc(txCol(uid), id), writePayload);
    } catch (err) {
      debugRejectedUpdatePayload(id, payload, err);
      throw err;
    }
  },

  async deleteTransaction(uid: string, id: string): Promise<void> {
    if (!uid || !id) throw new Error('[Firestore][deleteTransaction] UID ou ID ausente.');
    const docRef = doc(txCol(uid), id);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return;
    await updateDoc(docRef, buildSoftDeletePatch(snap.data() as Record<string, unknown>));
  },

  async deleteBatchTransactions(uid: string, ids: string[]): Promise<void> {
    if (!uid || !ids.length) return;

    for (let i = 0; i < ids.length; i += TX_CHUNK_SIZE) {
      const chunk = ids.slice(i, i + TX_CHUNK_SIZE);
      const refs = chunk.map(txId => doc(txCol(uid), txId));
      const snaps = await Promise.all(refs.map(r => getDoc(r)));
      const batch = writeBatch(db);
      chunk.forEach((_, idx) => {
        const snap = snaps[idx];
        if (!snap?.exists()) return;
        batch.update(refs[idx]!, buildSoftDeletePatch(snap.data() as Record<string, unknown>));
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
          uid: deleteField(),
          id: deleteField(),
          value: deleteField(),
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
