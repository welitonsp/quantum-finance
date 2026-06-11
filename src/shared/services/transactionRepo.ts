/**
 * transactionRepo.ts — CRUD operations for transactions collection.
 */
import {
  collection,
  deleteField,
  doc,
  getDocs,
  getDoc,
  query,
  orderBy,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../api/firebase/index';
import type { ImportResult, Transaction } from '../types/transaction';
import { LedgerService, transactionToLedgerInput } from './LedgerService';
import { logSanitizedFirebaseError } from '../lib/firebaseErrorHandling';
import {
  txCol,
  MANUAL_CREATE_CHANGED_FIELDS,
  buildManualCreatePayload,
  buildManualCreateAfterSnapshot,
  buildManualCreateHistoryPayload,
  assertValidManualTxId,
  manualCreateAlreadyCommitted,
  normalizeUpdatePayload,
  buildLegacyTransactionRepairPayload,
  sanitizeHistorySnapshot,
  buildSoftDeletePatch,
  normalizeReadTransaction,
  isActiveTransaction,
  debugUpdatePayload,
  debugRejectedUpdatePayload,
  type ManualTransactionCreateDTO,
  type TransactionUpdateDTO,
} from './firestoreCore';

export const transactionRepo = {
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

  async saveAllTransactions(
    uid: string,
    transactions: Array<Partial<Transaction>>,
  ): Promise<ImportResult> {
    if (!uid || !transactions.length) return { added: 0, duplicates: 0, invalid: 0 };
    return LedgerService.importTransactions(uid, transactions.map(transactionToLedgerInput));
  },
};
