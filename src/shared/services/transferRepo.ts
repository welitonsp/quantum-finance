/**
 * transferRepo.ts — transfer transaction operations.
 */
import {
  collection,
  doc,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../api/firebase/index';
import type { Centavos } from '../types/money';
import {
  txCol,
  assertValidManualTxId,
  TransferCreateDTOSchema,
  type TransferCreateDTO,
} from './firestoreCore';

export const transferRepo = {
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
};
