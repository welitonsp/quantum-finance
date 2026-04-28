import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
  type DocumentReference,
} from 'firebase/firestore';
import { db } from '../api/firebase/index';
import { SOURCE_VALUES, transactionCreateSchema, type FinancialSource } from '../schemas/financialSchemas';
import { absCentavos, fromCentavos, toCentavos, type Centavos, type MoneyInput } from '../types/money';
import type { ImportResult, Transaction } from '../types/transaction';
import { canonicalizeTransactionType } from '../../utils/transactionUtils';

const IMPORT_CHUNK_SIZE = 200;

export interface LedgerImportInput {
  description?: string;
  value_cents?: Centavos | number;
  value?: MoneyInput;
  type?: string;
  category?: string;
  date?: string;
  source?: FinancialSource;
  fitId?: string | null;
  account?: string;
  accountId?: string;
  cardId?: string;
  tags?: string[];
  isRecurring?: boolean;
}

export interface NormalizedLedgerTransaction {
  description: string;
  value_cents: Centavos;
  type: 'entrada' | 'saida';
  category: string;
  date: string;
  source: FinancialSource;
  schemaVersion: 2;
  fitId: string | null;
  account?: string;
  accountId?: string;
  cardId?: string;
  tags: string[];
  isRecurring: boolean;
}

interface PreparedImport {
  hash: string;
  txRef: DocumentReference;
  auditRef: DocumentReference;
  payload: NormalizedLedgerTransaction;
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function normalizeLedgerDescription(description: string): string {
  return description
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

async function sha256Hex(input: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Web Crypto API indisponível para gerar hash de importação.');
  }
  const bytes = new TextEncoder().encode(input);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function generateTransactionImportHash(
  uid: string,
  tx: NormalizedLedgerTransaction,
): Promise<string> {
  const hashInput = {
    uid,
    date: tx.date,
    description: normalizeLedgerDescription(tx.description),
    value_cents: tx.value_cents,
    type: tx.type,
    source: tx.source,
    fitId: tx.fitId ?? null,
    accountId: tx.accountId ?? null,
    account: tx.account ?? null,
  };

  return sha256Hex(stableJson(hashInput));
}

export function normalizeImportTransaction(input: LedgerImportInput): NormalizedLedgerTransaction | null {
  const description = (input.description ?? '').replace(/\s+/g, ' ').trim();
  if (description.length < 2) return null;

  const rawCentavos = input.value_cents !== undefined
    ? input.value_cents
    : input.value !== undefined
      ? toCentavos(input.value)
      : null;

  if (rawCentavos === null || rawCentavos === 0) return null;

  const value_cents = absCentavos(rawCentavos);
  const date = input.date ?? '';
  if (!isIsoDate(date)) return null;

  const payload: NormalizedLedgerTransaction = {
    description,
    value_cents,
    type: canonicalizeTransactionType(input.type),
    category: input.category ?? 'Outros',
    date,
    source: input.source ?? 'csv',
    schemaVersion: 2,
    fitId: input.fitId ?? null,
    tags: input.tags ?? [],
    isRecurring: input.isRecurring ?? false,
  };

  if (input.account) payload.account = input.account;
  if (input.accountId) payload.accountId = input.accountId;
  if (input.cardId) payload.cardId = input.cardId;

  const result = transactionCreateSchema.safeParse(payload);
  return result.success ? payload : null;
}

async function prepareImports(uid: string, inputs: LedgerImportInput[]): Promise<{
  prepared: PreparedImport[];
  invalid: number;
  duplicateInputHashes: number;
}> {
  const prepared: PreparedImport[] = [];
  const seen = new Set<string>();
  let invalid = 0;
  let duplicateInputHashes = 0;

  for (const input of inputs) {
    const payload = normalizeImportTransaction(input);
    if (!payload) {
      invalid++;
      continue;
    }

    const hash = await generateTransactionImportHash(uid, payload);
    if (seen.has(hash)) {
      duplicateInputHashes++;
      continue;
    }
    seen.add(hash);

    prepared.push({
      hash,
      txRef: doc(db, 'users', uid, 'transactions', hash),
      auditRef: doc(collection(db, 'users', uid, 'audit_logs')),
      payload,
    });
  }

  return { prepared, invalid, duplicateInputHashes };
}

export const LedgerService = {
  async importTransactions(uid: string, inputs: LedgerImportInput[]): Promise<ImportResult> {
    if (!uid || inputs.length === 0) return { added: 0, duplicates: 0, invalid: 0 };

    const { prepared, invalid, duplicateInputHashes } = await prepareImports(uid, inputs);
    let added = 0;
    let duplicates = duplicateInputHashes;

    for (let i = 0; i < prepared.length; i += IMPORT_CHUNK_SIZE) {
      const chunk = prepared.slice(i, i + IMPORT_CHUNK_SIZE);
      const result = await runTransaction(db, async (transaction) => {
        const snapshots = await Promise.all(chunk.map(item => transaction.get(item.txRef)));
        let chunkAdded = 0;
        let chunkDuplicates = 0;

        snapshots.forEach((snapshot, index) => {
          const item = chunk[index];
          if (!item) return;

          if (snapshot.exists()) {
            chunkDuplicates++;
            return;
          }

          transaction.set(item.txRef, {
            ...item.payload,
            importHash: item.hash,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          transaction.set(item.auditRef, {
            action: 'IMPORT_TRANSACTION',
            entity: 'TRANSACTION',
            txId: item.hash,
            importHash: item.hash,
            source: item.payload.source,
            amount_cents: item.payload.value_cents,
            amount_display: fromCentavos(item.payload.value_cents),
            createdAt: serverTimestamp(),
            schemaVersion: 2,
          });

          chunkAdded++;
        });

        return { added: chunkAdded, duplicates: chunkDuplicates };
      });

      added += result.added;
      duplicates += result.duplicates;
    }

    return { added, duplicates, invalid };
  },

  normalizeImportTransaction,
  generateTransactionImportHash,
  normalizeLedgerDescription,
};

export function transactionToLedgerInput(tx: Partial<Transaction>): LedgerImportInput {
  const input: LedgerImportInput = {};
  if (tx.description !== undefined) input.description = tx.description;
  if (tx.value_cents !== undefined) input.value_cents = tx.value_cents;
  if (tx.value !== undefined) input.value = tx.value;
  if (tx.type !== undefined) input.type = tx.type;
  if (tx.category !== undefined) input.category = tx.category;
  if (tx.date !== undefined) input.date = tx.date;
  if (tx.source !== undefined && SOURCE_VALUES.includes(tx.source as FinancialSource)) {
    input.source = tx.source as FinancialSource;
  }
  if (tx.fitId !== undefined) input.fitId = tx.fitId;
  if (tx.account !== undefined) input.account = tx.account;
  if (tx.accountId !== undefined) input.accountId = tx.accountId;
  if (tx.cardId !== undefined) input.cardId = tx.cardId;
  if (tx.tags !== undefined) input.tags = tx.tags;
  if (tx.isRecurring !== undefined) input.isRecurring = tx.isRecurring;
  return input;
}
