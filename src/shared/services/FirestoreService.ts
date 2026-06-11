import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  getDocs,
  getDoc,
  query,
  orderBy,
  where,
  writeBatch,
  serverTimestamp,
  deleteField,
  type CollectionReference,
  type DocumentReference,
} from 'firebase/firestore';
import { z } from 'zod';
import { db } from '../api/firebase/index';
import {
  centavosSchema,
  dateSchema,
  reconciliationSourceSchema,
  reconciliationStatusSchema,
  sourceSchema,
  transactionTypeSchema,
  SOURCE_VALUES,
  type FinancialSource,
} from '../schemas/financialSchemas';
import { fromCentavos, type Centavos, type MoneyInput } from '../types/money';
import type { ImportResult, ReconciliationSource, ReconciliationStatus, Transaction } from '../types/transaction';
import {
  canonicalizeTransactionType,
  getTransactionCentavos,
} from '../../utils/transactionUtils';
import { LedgerService, transactionToLedgerInput } from './LedgerService';
import { getFirebaseErrorCode, logSanitizedFirebaseError } from '../lib/firebaseErrorHandling';

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
  cardId:        z.string().trim().min(1).max(120).optional(),
  fromAccountId: z.string().trim().min(1).max(128).optional(),
  toAccountId:   z.string().trim().min(1).max(128).optional(),
  fitId: z.string().trim().min(1).max(160).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(32)).max(20).optional(),
  isRecurring: z.boolean().optional(),
  installmentGroupId:    z.string().trim().min(1).max(128).optional(),
  installmentIndex:      z.number().int().min(1).max(999).optional(),
  installmentCount:      z.number().int().min(1).max(999).optional(),
  installmentTotalCents: centavosSchema.optional(),
  reconciliationStatus: reconciliationStatusSchema.optional(),
  reconciliationSource: reconciliationSourceSchema.optional(),
  reconciledAt: z.unknown().optional(),
  reconciledBy: z.string().trim().min(1).max(128).optional(),
  descriptionLower: z.string().trim().max(160).optional(),
}).strict();

const transactionWriteUpdateSchema = transactionWriteCreateSchema.partial()
  .extend({
    isDeleted: z.boolean().optional(),
    deletedAt: z.unknown().optional(),
  })
  .refine(value => Object.keys(value).length > 0, 'Atualização vazia.');

const TRANSACTION_ALLOWED_KEYS = new Set([
  'description',
  'value_cents',
  'schemaVersion',
  'type',
  'category',
  'date',
  'source',
  'account',
  'accountId',
  'cardId',
  'fromAccountId',
  'toAccountId',
  'fitId',
  'tags',
  'isRecurring',
  'importHash',
  'createdAt',
  'updatedAt',
  'isDeleted',
  'deletedAt',
  'reconciliationStatus',
  'reconciliationSource',
  'reconciledAt',
  'reconciledBy',
  '_lastOpId',
  'installmentGroupId',
  'installmentIndex',
  'installmentCount',
  'installmentTotalCents',
  'descriptionLower',
]);

const HISTORY_SNAPSHOT_FORBIDDEN_FIELDS = new Set(['id', 'uid', 'value', 'importHash', '_lastOpId', 'correlationId']);
const HISTORY_SNAPSHOT_ALLOWED_KEYS = new Set(
  [...TRANSACTION_ALLOWED_KEYS].filter(key => !HISTORY_SNAPSHOT_FORBIDDEN_FIELDS.has(key)),
);
const LEGACY_REPAIR_DELETE_SENTINELS = new WeakSet<object>();

export const TransferCreateDTOSchema = z.object({
  fromAccountId: z.string().min(1),
  toAccountId:   z.string().min(1),
  value_cents:   z.number().int().positive(),
  date:          z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description:   z.string().max(160).optional(),
}).strict().refine(
  d => d.fromAccountId !== d.toAccountId,
  { message: 'Origem e destino não podem ser iguais.', path: ['toAccountId'] },
);

export type TransferCreateDTO = z.infer<typeof TransferCreateDTOSchema>;

export interface InstallmentGroupCreateDTO {
  description:      string;
  totalValueCents:  Centavos;
  installmentCount: number;
  date:             string;
  category:         string;
  accountId?:       string;
  cardId?:          string;
  /** Dia de fechamento do cartão (1–31). Quando presente, a competência de cada parcela é calculada corretamente: compra após fechamento entra na fatura do mês seguinte. */
  closingDay?:      number;
}

function addMonthsToDate(dateStr: string, months: number): string {
  const parts = dateStr.split('-').map(Number);
  const y = parts[0] ?? 2000;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  const targetMonthRaw = (m - 1) + months;
  const targetYear  = y + Math.floor(targetMonthRaw / 12);
  const targetMonth = targetMonthRaw % 12; // 0-based
  const lastDay = new Date(targetYear, targetMonth + 1, 0).getDate();
  const day = Math.min(d, lastDay);
  return `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Calcula a competência (YYYY-MM) de uma parcela considerando o dia de fechamento do cartão.
 * Regra: compra realizada APÓS o fechamento entra na fatura do mês seguinte.
 * Parcelas subsequentes avançam um mês por índice.
 *
 * @param purchaseDateISO  Data da compra no formato YYYY-MM-DD
 * @param closingDay       Dia de fechamento do cartão (1–31); se ausente, usa mês calendário
 * @param installmentIndex Índice da parcela (0-based: 0 = primeira parcela)
 */
export function resolveCompetencia(purchaseDateISO: string, closingDay: number | undefined, installmentIndex: number): string {
  const parts = purchaseDateISO.split('-').map(Number);
  const y = parts[0] ?? 2000;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;

  // Sem closingDay: competência é o próprio mês da data da parcela (comportamento legado)
  let baseYear = y;
  let baseMonth = m; // 1-based

  if (closingDay !== undefined && closingDay >= 1 && closingDay <= 31) {
    // Compra após o fechamento → primeira fatura é do mês seguinte
    if (d > closingDay) {
      baseMonth += 1;
      if (baseMonth > 12) { baseMonth = 1; baseYear += 1; }
    }
  }

  // Avança pelo índice da parcela
  const totalMonths = (baseYear * 12 + (baseMonth - 1)) + installmentIndex;
  const resultYear  = Math.floor(totalMonths / 12);
  const resultMonth = (totalMonths % 12) + 1; // 1-based
  return `${resultYear}-${String(resultMonth).padStart(2, '0')}`;
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
  reconciliationStatus?: ReconciliationStatus;
  reconciliationSource?: ReconciliationSource;
  reconciledAt?: unknown;
  reconciledBy?: string;
}

export type ManualTransactionCreateDTO = Partial<Transaction>;

function resolveCentavos(data: Pick<TransactionUpdateDTO, 'value' | 'value_cents'>): Centavos {
  if (data.value_cents !== undefined && Number.isSafeInteger(data.value_cents)) {
    return Math.abs(Math.round(data.value_cents)) as Centavos;
  }
  // FIX: Não usar data.value para gerar value_cents no cliente.
  // O formulário deve enviar value_cents explicitamente.
  return 0 as Centavos;
}

const MANUAL_CREATE_CHANGED_FIELDS = [
  'description',
  'descriptionLower',
  'value_cents',
  'schemaVersion',
  'type',
  'category',
  'date',
  'source',
  'isRecurring',
  'fitId',
  'tags',
  'account',
  'accountId',
  'cardId',
  'fromAccountId',
  'toAccountId',
] as const;

function buildManualCreatePayload(data: ManualTransactionCreateDTO): Record<string, unknown> {
  const rawDescription = data.description ?? '';
  const payload: Record<string, unknown> = {
    description: rawDescription,
    descriptionLower: rawDescription.trim().toLowerCase(),
    value_cents: resolveCentavos(data),
    schemaVersion: 2,
    type: canonicalizeTransactionType(data.type ?? 'saida'),
    category: data.category ?? 'Outros',
    date: data.date ?? new Date().toISOString().slice(0, 10),
    source: 'manual',
    isRecurring: data.isRecurring ?? false,
  };

  if (data.fitId !== undefined) payload['fitId'] = data.fitId;
  if (data.tags !== undefined) payload['tags'] = data.tags;
  if (data.account !== undefined) payload['account'] = data.account;
  if (data.accountId !== undefined) payload['accountId'] = data.accountId;
  if (data.cardId !== undefined) payload['cardId'] = data.cardId;

  const parsed = transactionWriteCreateSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(`Transação inválida: ${parsed.error.issues.map(issue => issue.message).join('; ')}`);
  }
  return parsed.data;
}

function buildManualCreateAfterSnapshot(txPayload: Record<string, unknown>): Record<string, unknown> {
  return MANUAL_CREATE_CHANGED_FIELDS.reduce<Record<string, unknown>>((acc, field) => {
    if (txPayload[field] !== undefined) acc[field] = txPayload[field];
    return acc;
  }, {});
}

function buildManualCreateHistoryPayload(
  txId: string,
  canonicalPayload: Record<string, unknown>,
  timestamp: unknown,
  afterSnapshot: Record<string, unknown>,
  changedFields: string[],
): Record<string, unknown> {
  return {
    action: 'CREATE',
    txId,
    createdAt: timestamp,
    schemaVersion: 1,
    origin: 'manual',
    amount_cents: canonicalPayload['value_cents'],
    category: canonicalPayload['category'],
    after: afterSnapshot,
    changedFields,
  };
}

function assertValidManualTxId(txId: string): void {
  if (txId.length < 1 || txId.length > 128 || txId.includes('/') || txId === '.' || txId === '..') {
    throw new Error('[Firestore][createManualTransactionWithHistory] txId manual inválido.');
  }
}

function canonicalEquals(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((item, index) => canonicalEquals(item, right[index]));
  }
  if (
    left !== null
    && right !== null
    && typeof left === 'object'
    && typeof right === 'object'
  ) {
    const leftRecord = left as Record<string, unknown>;
    const rightRecord = right as Record<string, unknown>;
    const leftKeys = Object.keys(leftRecord).sort();
    const rightKeys = Object.keys(rightRecord).sort();
    if (leftKeys.length !== rightKeys.length) return false;
    return leftKeys.every((key, index) => (
      key === rightKeys[index] && canonicalEquals(leftRecord[key], rightRecord[key])
    ));
  }
  return false;
}

function markLegacyRepairDeleteField(): unknown {
  const sentinel = deleteField();
  if (sentinel !== null && typeof sentinel === 'object') {
    LEGACY_REPAIR_DELETE_SENTINELS.add(sentinel);
  }
  return sentinel;
}

function isLegacyRepairDeleteField(value: unknown): boolean {
  return value !== null
    && typeof value === 'object'
    && LEGACY_REPAIR_DELETE_SENTINELS.has(value);
}

function isStringSizedValue(value: unknown, min: number, max: number): boolean {
  return typeof value === 'string' && value.length >= min && value.length <= max;
}

function isFirestoreTimestampLike(value: unknown): boolean {
  return value !== null
    && typeof value === 'object'
    && typeof (value as { toMillis?: unknown }).toMillis === 'function';
}

function hasAnyKey(data: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.some(key => key in data);
}

function manualCreateTransactionMatchesCanonical(
  data: Record<string, unknown>,
  canonicalPayload: Record<string, unknown>,
): boolean {
  if (hasAnyKey(data, ['id', 'uid', 'value', 'importHash'])) return false;

  const allowedKeys = new Set([...Object.keys(canonicalPayload), 'createdAt', 'updatedAt']);
  if (!Object.keys(data).every(key => allowedKeys.has(key))) return false;

  return Object.entries(canonicalPayload).every(([key, value]) => (
    canonicalEquals(data[key], value)
  ));
}

function manualCreateHistoryMatchesCanonical(
  data: Record<string, unknown>,
  expectedHistory: Record<string, unknown>,
): boolean {
  const allowedKeys = new Set([...Object.keys(expectedHistory), 'createdAt']);
  if (!Object.keys(data).every(key => allowedKeys.has(key))) return false;

  return Object.entries(expectedHistory).every(([key, value]) => (
    key === 'createdAt' || canonicalEquals(data[key], value)
  ));
}

async function manualCreateAlreadyCommitted(
  txRef: DocumentReference,
  historyRef: DocumentReference,
  canonicalPayload: Record<string, unknown>,
  expectedHistory: Record<string, unknown>,
): Promise<boolean> {
  try {
    const [txSnap, historySnap] = await Promise.all([getDoc(txRef), getDoc(historyRef)]);
    if (!txSnap.exists() || !historySnap.exists()) return false;
    return manualCreateTransactionMatchesCanonical(txSnap.data(), canonicalPayload)
      && manualCreateHistoryMatchesCanonical(historySnap.data(), expectedHistory);
  } catch {
    return false;
  }
}

function debugUpdatePayload(
  removesLegacyFields: boolean,
): void {
  if (!import.meta.env.DEV) return;
  console.warn('[Firestore][transaction_update]', {
    operation: 'transaction_update',
    removesLegacyFields,
  });
}

function debugRejectedUpdatePayload(err: unknown): void {
  if (!import.meta.env.DEV) return;
  const code = getFirebaseErrorCode(err);
  if (code !== 'permission-denied' && code !== 'failed-precondition') return;
  logSanitizedFirebaseError('transaction_update', err);
}

function normalizeUpdatePayload(data: TransactionUpdateDTO): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  if (data.description !== undefined) {
    const trimmed = data.description.trim();
    payload['description'] = trimmed;
    payload['descriptionLower'] = trimmed.toLowerCase();
  }
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
  if (data.reconciliationStatus !== undefined) payload['reconciliationStatus'] = data.reconciliationStatus;
  if (data.reconciliationSource !== undefined) payload['reconciliationSource'] = data.reconciliationSource;
  if (data.reconciledAt !== undefined) payload['reconciledAt'] = data.reconciledAt;
  if (data.reconciledBy !== undefined) payload['reconciledBy'] = data.reconciledBy;

  const parsed = transactionWriteUpdateSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(`Atualização inválida: ${parsed.error.issues.map(issue => issue.message).join('; ')}`);
  }
  return parsed.data;
}

function sanitizeHistorySnapshot(snapshot: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(snapshot)) {
    if (
      HISTORY_SNAPSHOT_ALLOWED_KEYS.has(key)
      && !HISTORY_SNAPSHOT_FORBIDDEN_FIELDS.has(key)
      && value !== undefined
      && !isLegacyRepairDeleteField(value)
    ) {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

function buildLegacyTransactionRepairPayload(snapshot?: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    schemaVersion: 2,
  };

  if (!snapshot) return patch;

  // 1. Limpeza de campos não autorizados (ex: uid, id, value legados no root)
  for (const key of Object.keys(snapshot)) {
    if (!TRANSACTION_ALLOWED_KEYS.has(key)) {
      patch[key] = markLegacyRepairDeleteField();
    }
  }

  // 2. Normalização de campos essenciais (Enum-like)
  const type = (snapshot['type'] as string | undefined)?.toLowerCase();
  if (type === 'entrada' || type === 'receita') {
    patch['type'] = 'entrada';
  } else if (type === 'saida' || type === 'despesa') {
    patch['type'] = 'saida';
  } else if (type) {
    patch['type'] = 'saida';
  }

  const source = (snapshot['source'] as string | undefined)?.toLowerCase();
  if (SOURCE_VALUES.includes(source as FinancialSource)) {
    patch['source'] = source;
  } else {
    patch['source'] = 'manual';
  }

  // 3. Validação de tipos e deleção de inválidos
  const rawCents = snapshot['value_cents'];
  if (typeof rawCents === 'number' && Number.isSafeInteger(rawCents) && rawCents >= 0) {
    patch['value_cents'] = rawCents;
  }
  // FIX: Não reconstruir value_cents a partir de snapshot['value'] no cliente.
  // Documentos sem value_cents válido permanecem caso de Admin Repair.

  if ('tags' in snapshot && !Array.isArray(snapshot['tags'])) {
    patch['tags'] = markLegacyRepairDeleteField();
  }

  if ('isRecurring' in snapshot && typeof snapshot['isRecurring'] !== 'boolean') {
    patch['isRecurring'] = markLegacyRepairDeleteField();
  }

  if ('isDeleted' in snapshot && typeof snapshot['isDeleted'] !== 'boolean') {
    patch['isDeleted'] = markLegacyRepairDeleteField();
  }

  if ('account' in snapshot && !isStringSizedValue(snapshot['account'], 1, 120)) {
    patch['account'] = markLegacyRepairDeleteField();
  }

  if ('accountId' in snapshot && !isStringSizedValue(snapshot['accountId'], 1, 120)) {
    patch['accountId'] = markLegacyRepairDeleteField();
  }

  if ('cardId' in snapshot && !isStringSizedValue(snapshot['cardId'], 1, 120)) {
    patch['cardId'] = markLegacyRepairDeleteField();
  }

  if (
    'fitId' in snapshot
    && snapshot['fitId'] !== null
    && !isStringSizedValue(snapshot['fitId'], 1, 160)
  ) {
    patch['fitId'] = markLegacyRepairDeleteField();
  }

  if ('reconciliationStatus' in snapshot && !reconciliationStatusSchema.safeParse(snapshot['reconciliationStatus']).success) {
    patch['reconciliationStatus'] = markLegacyRepairDeleteField();
  }

  if ('reconciliationSource' in snapshot && !reconciliationSourceSchema.safeParse(snapshot['reconciliationSource']).success) {
    patch['reconciliationSource'] = markLegacyRepairDeleteField();
  }

  if ('reconciledAt' in snapshot && !isFirestoreTimestampLike(snapshot['reconciledAt'])) {
    patch['reconciledAt'] = markLegacyRepairDeleteField();
  }

  if ('reconciledBy' in snapshot && !isStringSizedValue(snapshot['reconciledBy'], 1, 128)) {
    patch['reconciledBy'] = markLegacyRepairDeleteField();
  }

  return patch;
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

  // Preserve value_cents if it is a valid safe integer. Do NOT derive from legacy float 'value'.
  const rawCents = existing['value_cents'];
  if (typeof rawCents === 'number' && Number.isSafeInteger(rawCents) && rawCents >= 0) {
    patch['value_cents'] = rawCents;
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
      logSanitizedFirebaseError('firestore_query', err);
      const snap = await getDocs(txCol(uid));
      return snap.docs
        .map(d => normalizeReadTransaction({
          id: d.id,
          ...(d.data() as Omit<Transaction, 'id'>),
        }))
        .filter(isActiveTransaction);
    }
  },

  async createManualTransactionWithHistory(
    uid: string,
    data: ManualTransactionCreateDTO,
    txId?: string,
  ): Promise<string> {
    if (!uid) throw new Error('[Firestore][createManualTransactionWithHistory] UID ausente.');
    if (txId !== undefined) assertValidManualTxId(txId);

    const canonicalPayload = buildManualCreatePayload(data);
    const txRef = txId !== undefined ? doc(txCol(uid), txId) : doc(txCol(uid));
    const historyRef = doc(collection(db, 'users', uid, 'transactions', txRef.id, 'history'), 'create');
    const timestamp = serverTimestamp();
    const txPayload = {
      ...canonicalPayload,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const afterSnapshot = buildManualCreateAfterSnapshot(canonicalPayload);
    const changedFields = MANUAL_CREATE_CHANGED_FIELDS.filter(field => afterSnapshot[field] !== undefined);
    const historyPayload = buildManualCreateHistoryPayload(
      txRef.id,
      canonicalPayload,
      timestamp,
      afterSnapshot,
      changedFields,
    );

    const batch = writeBatch(db);
    batch.set(txRef, txPayload);
    batch.set(historyRef, historyPayload);
    try {
      await batch.commit();
    } catch (err) {
      const alreadyCommitted = await manualCreateAlreadyCommitted(
        txRef,
        historyRef,
        canonicalPayload,
        historyPayload,
      );
      if (alreadyCommitted) return txRef.id;
      throw err;
    }
    return txRef.id;
  },

  async updateTransactionWithHistory(
    uid: string,
    id: string,
    data: TransactionUpdateDTO,
    historyEvent: {
      before: Record<string, unknown>;
      after: Record<string, unknown>;
      changedFields: string[];
      amount_cents?: number;
      category?: string;
      origin?: 'manual' | 'ai' | 'reconcile';
    },
  ): Promise<void> {
    if (!uid || !id) throw new Error('[Firestore][updateTransactionWithHistory] UID ou ID ausente.');
    const payload = {
      ...buildLegacyTransactionRepairPayload(historyEvent.before),
      ...normalizeUpdatePayload(data),
    };
    const txRef = doc(txCol(uid), id);
    const historyRef = doc(collection(db, 'users', uid, 'transactions', id, 'history'));
    const timestamp = serverTimestamp();

    const writePayload = {
      ...payload,
      uid: deleteField(),
      id: deleteField(),
      value: deleteField(),
      updatedAt: timestamp,
      _lastOpId: historyRef.id,
    };

    const historyPayload: Record<string, unknown> = {
      action: 'UPDATE',
      txId: id,
      createdAt: timestamp,
      schemaVersion: 1,
      origin: historyEvent.origin ?? 'manual',
      correlationId: historyRef.id,
      before: sanitizeHistorySnapshot(historyEvent.before),
      after: sanitizeHistorySnapshot(historyEvent.after),
      changedFields: historyEvent.changedFields.filter(f => f !== '_lastOpId' && f !== 'correlationId'),
    };

    if (historyEvent.amount_cents !== undefined) historyPayload.amount_cents = historyEvent.amount_cents;
    if (historyEvent.category !== undefined) historyPayload.category = historyEvent.category;

    const batch = writeBatch(db);
    batch.update(txRef, writePayload);
    batch.set(historyRef, historyPayload);

    debugUpdatePayload(true);
    try {
      await batch.commit();
    } catch (err) {
      debugRejectedUpdatePayload(err);
      throw err;
    }
  },

  async softDeleteTransactionWithHistory(
    uid: string,
    id: string,
    historyEvent: {
      before: Record<string, unknown>;
      amount_cents?: number;
      category?: string;
    },
  ): Promise<void> {
    if (!uid || !id) throw new Error('[Firestore][softDeleteTransactionWithHistory] UID ou ID ausente.');
    const txRef = doc(txCol(uid), id);
    const snap = await getDoc(txRef);
    if (!snap.exists()) return;

    const historyRef = doc(collection(db, 'users', uid, 'transactions', id, 'history'));
    const existing = snap.data() as Record<string, unknown>;
    const softDeletePatch = buildSoftDeletePatch(existing);
    const before = sanitizeHistorySnapshot(existing);
    const after = sanitizeHistorySnapshot({ ...existing, ...softDeletePatch });
    const historyPayload: Record<string, unknown> = {
      action: 'SOFT_DELETE',
      txId: id,
      createdAt: serverTimestamp(),
      schemaVersion: 1,
      origin: 'manual',
      correlationId: historyRef.id,
      before,
      after,
      changedFields: ['isDeleted', 'deletedAt', 'updatedAt'],
    };

    const amountCents = existing['value_cents'] ?? historyEvent.amount_cents;
    const category = existing['category'] ?? historyEvent.category;

    if (typeof amountCents === 'number' && Number.isSafeInteger(amountCents)) {
      historyPayload.amount_cents = amountCents;
    }
    if (typeof category === 'string') historyPayload.category = category;

    const batch = writeBatch(db);
    batch.update(txRef, { ...softDeletePatch, _lastOpId: historyRef.id });
    batch.set(historyRef, historyPayload);
    await batch.commit();
  },

  async deleteBatchTransactionsWithHistory(
    uid: string,
    transactions: Transaction[],
  ): Promise<void> {
    if (!uid || !transactions.length) return;

    // 240 transações * 2 writes (update + history) = 480 writes (limite 500)
    const BATCH_HISTORY_CHUNK_SIZE = 240;

    for (let i = 0; i < transactions.length; i += BATCH_HISTORY_CHUNK_SIZE) {
      const chunk = transactions.slice(i, i + BATCH_HISTORY_CHUNK_SIZE);
      const batch = writeBatch(db);
      const timestamp = serverTimestamp();

      chunk.forEach(tx => {
        const txRef = doc(txCol(uid), tx.id);
        const historyRef = doc(collection(db, 'users', uid, 'transactions', tx.id, 'history'));

        const historyPayload: Record<string, unknown> = {
          action: 'SOFT_DELETE',
          txId: tx.id,
          createdAt: timestamp,
          schemaVersion: 1,
          origin: 'manual',
          correlationId: historyRef.id,
          before: sanitizeHistorySnapshot(tx as unknown as Record<string, unknown>),
        };

        if (tx.value_cents !== undefined) historyPayload.amount_cents = tx.value_cents;
        if (tx.category !== undefined) historyPayload.category = tx.category;

        batch.update(txRef, { ...buildSoftDeletePatch(tx as unknown as Record<string, unknown>), _lastOpId: historyRef.id });
        batch.set(historyRef, historyPayload);
      });

      await batch.commit();
    }
  },

  async batchUpdateTransactionsWithHistory(
    uid: string,
    snapshot: Array<{
      id: string;
      oldCategory: string;
      newCategory?: string;
      before?: Record<string, unknown>;
    }>,
    updates: TransactionUpdateDTO,
    correlationId: string,
  ): Promise<void> {
    if (!uid || !snapshot.length) return;
    const normalizedUpdates = normalizeUpdatePayload(updates);

    // 240 transações * 2 writes (update + history) = 480 writes (limite 500)
    const BATCH_HISTORY_CHUNK_SIZE = 240;

    for (let i = 0; i < snapshot.length; i += BATCH_HISTORY_CHUNK_SIZE) {
      const chunk = snapshot.slice(i, i + BATCH_HISTORY_CHUNK_SIZE);
      const batch = writeBatch(db);
      const timestamp = serverTimestamp();

      chunk.forEach(item => {
        const txRef = doc(txCol(uid), item.id);
        const historyRef = doc(collection(db, 'users', uid, 'transactions', item.id, 'history'));
        const repairPayload = buildLegacyTransactionRepairPayload(item.before);
        const updatePayload = {
          ...repairPayload,
          ...normalizedUpdates,
        };

        batch.update(txRef, {
          ...updatePayload,
          uid: deleteField(),
          id: deleteField(),
          value: deleteField(),
          updatedAt: timestamp,
          _lastOpId: historyRef.id,
        });

        // History BULK_UPDATE
        const before = item.before ?? { category: item.oldCategory };
        const after = { ...before, ...updatePayload };

        const historyPayload: Record<string, unknown> = {
          action: 'BULK_UPDATE',
          origin: 'bulk',
          txId: item.id,
          createdAt: timestamp,
          schemaVersion: 1,
          before: sanitizeHistorySnapshot(before),
          after: sanitizeHistorySnapshot(after),
          changedFields: Object.keys(normalizedUpdates),
          correlationId,
        };

        if (normalizedUpdates['category'] !== undefined) {
          historyPayload['category'] = normalizedUpdates['category'];
        }

        const valueCents = before['value_cents'];
        if (
          typeof valueCents === 'number' &&
          Number.isSafeInteger(valueCents) &&
          valueCents >= 0
        ) {
          historyPayload['amount_cents'] = valueCents;
        }

        batch.set(historyRef, historyPayload);
      });

      await batch.commit();
    }
  },

  async batchUndoBulkUpdateTransactionsWithHistory(
    uid: string,
    snapshot: Array<{
      id: string;
      oldCategory: string;
      newCategory?: string;
      before?: Record<string, unknown>;
    }>,
    correlationId: string,
  ): Promise<void> {
    if (!uid) throw new Error('[Firestore][batchUndoBulkUpdateTransactionsWithHistory] UID ausente.');
    if (!snapshot.length) return;

    // 240 transações * 2 writes (update + history) = 480 writes (limite 500)
    const BATCH_HISTORY_CHUNK_SIZE = 240;

    for (let i = 0; i < snapshot.length; i += BATCH_HISTORY_CHUNK_SIZE) {
      const chunk = snapshot.slice(i, i + BATCH_HISTORY_CHUNK_SIZE);
      const batch = writeBatch(db);
      const timestamp = serverTimestamp();

      chunk.forEach(item => {
        if (!item.id) throw new Error('[Firestore][batchUndoBulkUpdateTransactionsWithHistory] ID ausente.');

        const txRef = doc(txCol(uid), item.id);
        const historyRef = doc(collection(db, 'users', uid, 'transactions', item.id, 'history'));
        const updatePayload = normalizeUpdatePayload({ category: item.oldCategory });
        const restoredCategory = String(updatePayload['category']);
        const currentCategory = item.newCategory ?? restoredCategory;
        const base = sanitizeHistorySnapshot(item.before ?? { category: item.oldCategory });
        const before = sanitizeHistorySnapshot({ ...base, category: currentCategory });
        const after = sanitizeHistorySnapshot({ ...base, category: restoredCategory });

        batch.update(txRef, {
          ...updatePayload,
          uid: deleteField(),
          id: deleteField(),
          value: deleteField(),
          updatedAt: timestamp,
          _lastOpId: historyRef.id,
        });

        const historyPayload: Record<string, unknown> = {
          action: 'UNDO_BULK_UPDATE',
          origin: 'bulk',
          txId: item.id,
          createdAt: timestamp,
          schemaVersion: 1,
          before,
          after,
          changedFields: ['category'],
          correlationId,
          category: restoredCategory,
        };

        const valueCents = base['value_cents'];
        if (
          typeof valueCents === 'number' &&
          Number.isSafeInteger(valueCents) &&
          valueCents >= 0
        ) {
          historyPayload['amount_cents'] = valueCents;
        }

        batch.set(historyRef, historyPayload);
      });

      await batch.commit();
    }
  },

  async createTransferWithHistory(
    uid: string,
    data: TransferCreateDTO,
    txId?: string,
  ): Promise<string> {
    if (!uid) throw new Error('[Firestore][createTransferWithHistory] UID ausente.');
    const parsed = TransferCreateDTOSchema.safeParse(data);
    if (!parsed.success) {
      throw new Error(`[Firestore][createTransferWithHistory] ${parsed.error.issues[0]?.message ?? 'Payload inválido.'}`);
    }
    if (txId !== undefined) assertValidManualTxId(txId);

    const txRef = txId !== undefined ? doc(txCol(uid), txId) : doc(txCol(uid));
    const historyRef = doc(
      collection(db, 'users', uid, 'transactions', txRef.id, 'history'),
      'create',
    );
    const timestamp = serverTimestamp();
    const valueCents = Math.abs(parsed.data.value_cents) as Centavos;

    const { fromAccountId, toAccountId, date, description } = parsed.data;
    const txPayload = {
      description:   description?.trim() ?? 'Transferência',
      value_cents:   valueCents,
      schemaVersion: 2 as const,
      type:          'transferencia' as const,
      category:      'Transferência',
      date,
      source:        'manual' as const,
      fromAccountId,
      toAccountId,
      isRecurring:   false,
      createdAt:     timestamp,
      updatedAt:     timestamp,
    };

    const afterSnapshot = {
      type:          'transferencia',
      value_cents:   valueCents,
      date,
      source:        'manual',
      fromAccountId,
      toAccountId,
    };

    const historyPayload = {
      action:        'CREATE',
      txId:          txRef.id,
      createdAt:     timestamp,
      schemaVersion: 1,
      origin:        'manual',
      amount_cents:  valueCents,
      category:      'Transferência',
      after:         afterSnapshot,
      changedFields: Object.keys(afterSnapshot),
    };

    const batch = writeBatch(db);
    batch.set(txRef, txPayload);
    batch.set(historyRef, historyPayload);
    await batch.commit();
    return txRef.id;
  },

  async createInstallmentGroupWithHistory(
    uid: string,
    data: InstallmentGroupCreateDTO,
  ): Promise<string> {
    if (!uid) throw new Error('[Firestore][createInstallmentGroupWithHistory] UID ausente.');
    if (data.installmentCount < 2 || data.installmentCount > 120) {
      throw new Error('[Firestore][createInstallmentGroupWithHistory] installmentCount deve ser entre 2 e 120.');
    }
    if (!data.description.trim()) {
      throw new Error('[Firestore][createInstallmentGroupWithHistory] Descrição obrigatória.');
    }

    const n = data.installmentCount;
    const total = Math.abs(data.totalValueCents) as Centavos;
    const perInstallment = Math.floor(total / n) as Centavos;
    const lastInstallment = (total - perInstallment * (n - 1)) as Centavos;

    // Gera o groupId a partir de um doc ref gerado pelo Firestore
    const groupAnchorRef = doc(txCol(uid));
    const groupId = groupAnchorRef.id;

    const timestamp = serverTimestamp();

    // Cap de 120 parcelas garante que todos os documentos (120 tx + 120 history = 240 ops)
    // caibam em um único writeBatch — operação atômica, sem risco de grupo parcial órfão.
    const batch = writeBatch(db);

    for (let i = 0; i < n; i++) {
      const index = i + 1; // 1-based
      const valueCents = index === n ? lastInstallment : perInstallment;
      const date = addMonthsToDate(data.date, i);
      const competencia = resolveCompetencia(data.date, data.closingDay, i);

      const txRef = i === 0 ? groupAnchorRef : doc(txCol(uid));
      const historyRef = doc(
        collection(db, 'users', uid, 'transactions', txRef.id, 'history'),
        'create',
      );

      const txPayload = {
        description:          `${data.description.trim()} (${index}/${n})`,
        value_cents:          valueCents,
        schemaVersion:        2 as const,
        type:                 'saida' as const,
        category:             data.category,
        date,
        competencia,
        source:               'manual' as const,
        isRecurring:          false,
        installmentGroupId:   groupId,
        installmentIndex:     index,
        installmentCount:     n,
        installmentTotalCents: total,
        createdAt:            timestamp,
        updatedAt:            timestamp,
        ...(data.accountId ? { accountId: data.accountId } : {}),
        ...(data.cardId    ? { cardId:    data.cardId    } : {}),
      };

      const afterSnapshot = {
        type:                 'saida',
        value_cents:          valueCents,
        date,
        competencia,
        source:               'manual',
        category:             data.category,
        installmentGroupId:   groupId,
        installmentIndex:     index,
        installmentCount:     n,
        installmentTotalCents: total,
      };

      const historyPayload = {
        action:        'CREATE',
        txId:          txRef.id,
        createdAt:     timestamp,
        schemaVersion: 1,
        origin:        'manual',
        amount_cents:  valueCents,
        category:      data.category,
        after:         afterSnapshot,
        changedFields: Object.keys(afterSnapshot),
      };

      batch.set(txRef, txPayload);
      batch.set(historyRef, historyPayload);
    }

    await batch.commit();

    return groupId;
  },

  async getInstallmentGroup(uid: string, groupId: string): Promise<Transaction[]> {
    if (!uid || !groupId) return [];
    const q = query(
      txCol(uid),
      where('installmentGroupId', '==', groupId),
      orderBy('installmentIndex', 'asc'),
    );
    const snap = await getDocs(q);
    return snap.docs
      .map(d => ({ ...(d.data() as Omit<Transaction, 'id'>), id: d.id } as Transaction))
      .filter(tx => tx.isDeleted !== true && !tx.deletedAt);
  },

  async cancelRemainingInstallments(
    uid: string,
    groupId: string,
    fromIndex: number,
  ): Promise<number> {
    if (!uid || !groupId) return 0;
    const allTxs = await FirestoreService.getInstallmentGroup(uid, groupId);
    const toCancel = allTxs.filter(
      tx => (tx.installmentIndex ?? 0) > fromIndex,
    );
    if (toCancel.length === 0) return 0;

    const CHUNK = 200;
    const timestamp = serverTimestamp();
    for (let i = 0; i < toCancel.length; i += CHUNK) {
      const batch = writeBatch(db);
      const chunk = toCancel.slice(i, i + CHUNK);
      for (const tx of chunk) {
        const txRef = doc(txCol(uid), tx.id);
        const lastOpId = `cancel-${tx.id}-${Date.now()}`;
        const historyRef = doc(
          collection(db, 'users', uid, 'transactions', tx.id, 'history'),
          lastOpId,
        );
        batch.update(txRef, {
          isDeleted:  true,
          deletedAt:  timestamp,
          updatedAt:  timestamp,
          _lastOpId:  lastOpId,
        });
        batch.set(historyRef, {
          action:        'SOFT_DELETE',
          txId:          tx.id,
          createdAt:     timestamp,
          schemaVersion: 1,
          origin:        'manual',
          amount_cents:  tx.value_cents ?? 0,
          category:      tx.category ?? 'Outros',
          changedFields: ['isDeleted', 'deletedAt'],
        });
      }
      await batch.commit();
    }
    return toCancel.length;
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
