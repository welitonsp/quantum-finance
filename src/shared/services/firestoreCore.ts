/**
 * firestoreCore.ts — shared internals for FirestoreService domain repos.
 * NOT intended for direct import by callers outside of src/shared/services/.
 */
import {
  collection,
  deleteField,
  getDoc,
  serverTimestamp,
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
import type { ReconciliationSource, ReconciliationStatus, Transaction } from '../types/transaction';
import {
  canonicalizeTransactionType,
  getTransactionCentavos,
} from '../../utils/transactionUtils';
import { getFirebaseErrorCode, logSanitizedFirebaseError } from '../lib/firebaseErrorHandling';

// ---------------------------------------------------------------------------
// Core helper
// ---------------------------------------------------------------------------

export const txCol = (uid: string): CollectionReference =>
  collection(db, 'users', uid, 'transactions');

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const writeCategorySchema = z.string().trim().min(1).max(80);

export const transactionWriteCreateSchema = z.object({
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

export const transactionWriteUpdateSchema = transactionWriteCreateSchema.partial()
  .extend({
    isDeleted: z.boolean().optional(),
    deletedAt: z.unknown().optional(),
  })
  .refine(value => Object.keys(value).length > 0, 'Atualização vazia.');

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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const TRANSACTION_ALLOWED_KEYS = new Set([
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

export const HISTORY_SNAPSHOT_FORBIDDEN_FIELDS = new Set([
  'id', 'uid', 'value', 'importHash', '_lastOpId', 'correlationId',
]);

export const HISTORY_SNAPSHOT_ALLOWED_KEYS = new Set(
  [...TRANSACTION_ALLOWED_KEYS].filter(key => !HISTORY_SNAPSHOT_FORBIDDEN_FIELDS.has(key)),
);

export const LEGACY_REPAIR_DELETE_SENTINELS = new WeakSet<object>();

export const MANUAL_CREATE_CHANGED_FIELDS = [
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

// ---------------------------------------------------------------------------
// Public interfaces / types
// ---------------------------------------------------------------------------

export interface InstallmentGroupCreateDTO {
  description:      string;
  totalValueCents:  Centavos;
  installmentCount: number;
  date:             string;
  category:         string;
  accountId?:       string;
  cardId?:          string;
  /** Dia de fechamento do cartão (1–31). Quando presente, a competência de cada parcela é calculada corretamente. */
  closingDay?:      number;
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

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

export function addMonthsToDate(dateStr: string, months: number): string {
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
 */
export function resolveCompetencia(
  purchaseDateISO: string,
  closingDay: number | undefined,
  installmentIndex: number,
): string {
  const parts = purchaseDateISO.split('-').map(Number);
  const y = parts[0] ?? 2000;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;

  let baseYear = y;
  let baseMonth = m; // 1-based

  if (closingDay !== undefined && closingDay >= 1 && closingDay <= 31) {
    if (d > closingDay) {
      baseMonth += 1;
      if (baseMonth > 12) { baseMonth = 1; baseYear += 1; }
    }
  }

  const totalMonths = (baseYear * 12 + (baseMonth - 1)) + installmentIndex;
  const resultYear  = Math.floor(totalMonths / 12);
  const resultMonth = (totalMonths % 12) + 1; // 1-based
  return `${resultYear}-${String(resultMonth).padStart(2, '0')}`;
}

export function resolveCentavos(data: Pick<TransactionUpdateDTO, 'value' | 'value_cents'>): Centavos {
  if (data.value_cents !== undefined && Number.isSafeInteger(data.value_cents)) {
    return Math.abs(Math.round(data.value_cents)) as Centavos;
  }
  return 0 as Centavos;
}

export function buildManualCreatePayload(data: ManualTransactionCreateDTO): Record<string, unknown> {
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

export function buildManualCreateAfterSnapshot(txPayload: Record<string, unknown>): Record<string, unknown> {
  return MANUAL_CREATE_CHANGED_FIELDS.reduce<Record<string, unknown>>((acc, field) => {
    if (txPayload[field] !== undefined) acc[field] = txPayload[field];
    return acc;
  }, {});
}

export function buildManualCreateHistoryPayload(
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

export function assertValidManualTxId(txId: string): void {
  if (txId.length < 1 || txId.length > 128 || txId.includes('/') || txId === '.' || txId === '..') {
    throw new Error('[Firestore][createManualTransactionWithHistory] txId manual inválido.');
  }
}

export function canonicalEquals(left: unknown, right: unknown): boolean {
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

export function markLegacyRepairDeleteField(): unknown {
  const sentinel = deleteField();
  if (sentinel !== null && typeof sentinel === 'object') {
    LEGACY_REPAIR_DELETE_SENTINELS.add(sentinel);
  }
  return sentinel;
}

export function isLegacyRepairDeleteField(value: unknown): boolean {
  return value !== null
    && typeof value === 'object'
    && LEGACY_REPAIR_DELETE_SENTINELS.has(value);
}

export function isStringSizedValue(value: unknown, min: number, max: number): boolean {
  return typeof value === 'string' && value.length >= min && value.length <= max;
}

export function isFirestoreTimestampLike(value: unknown): boolean {
  return value !== null
    && typeof value === 'object'
    && typeof (value as { toMillis?: unknown }).toMillis === 'function';
}

export function hasAnyKey(data: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.some(key => key in data);
}

export function manualCreateTransactionMatchesCanonical(
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

export function manualCreateHistoryMatchesCanonical(
  data: Record<string, unknown>,
  expectedHistory: Record<string, unknown>,
): boolean {
  const allowedKeys = new Set([...Object.keys(expectedHistory), 'createdAt']);
  if (!Object.keys(data).every(key => allowedKeys.has(key))) return false;

  return Object.entries(expectedHistory).every(([key, value]) => (
    key === 'createdAt' || canonicalEquals(data[key], value)
  ));
}

export async function manualCreateAlreadyCommitted(
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

export function debugUpdatePayload(removesLegacyFields: boolean): void {
  if (!import.meta.env.DEV) return;
  console.warn('[Firestore][transaction_update]', {
    operation: 'transaction_update',
    removesLegacyFields,
  });
}

export function debugRejectedUpdatePayload(err: unknown): void {
  if (!import.meta.env.DEV) return;
  const code = getFirebaseErrorCode(err);
  if (code !== 'permission-denied' && code !== 'failed-precondition') return;
  logSanitizedFirebaseError('transaction_update', err);
}

export function normalizeUpdatePayload(data: TransactionUpdateDTO): Record<string, unknown> {
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

export function sanitizeHistorySnapshot(snapshot: Record<string, unknown>): Record<string, unknown> {
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

export function buildLegacyTransactionRepairPayload(snapshot?: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    schemaVersion: 2,
  };

  if (!snapshot) return patch;

  for (const key of Object.keys(snapshot)) {
    if (!TRANSACTION_ALLOWED_KEYS.has(key)) {
      patch[key] = markLegacyRepairDeleteField();
    }
  }

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

  const rawCents = snapshot['value_cents'];
  if (typeof rawCents === 'number' && Number.isSafeInteger(rawCents) && rawCents >= 0) {
    patch['value_cents'] = rawCents;
  }

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

export function buildSoftDeletePatch(existing: Record<string, unknown>): Record<string, unknown> {
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

  const rawCents = existing['value_cents'];
  if (typeof rawCents === 'number' && Number.isSafeInteger(rawCents) && rawCents >= 0) {
    patch['value_cents'] = rawCents;
  }

  return patch;
}

export function normalizeReadTransaction(tx: Transaction): Transaction {
  const value_cents = getTransactionCentavos(tx) ?? (0 as Centavos);
  return {
    ...tx,
    value_cents,
    value: fromCentavos(value_cents),
    schemaVersion: tx.schemaVersion ?? 2,
  };
}

export function isActiveTransaction(tx: Transaction): boolean {
  return tx.isDeleted !== true && !tx.deletedAt;
}
