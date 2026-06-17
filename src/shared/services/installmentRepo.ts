/**
 * installmentRepo.ts — installment group operations.
 */
import {
  collection,
  doc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../api/firebase/index';
import type { Centavos } from '../types/money';
import type { Transaction } from '../types/transaction';
import {
  txCol,
  addMonthsToDate,
  resolveCompetencia,
  type InstallmentGroupCreateDTO,
} from './firestoreCore';

// Forward reference — installmentRepo uses cancelRemainingInstallments which
// needs getInstallmentGroup, so we define both in the same object.
export const installmentRepo = {
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
    // Safe integer division: compute remainder first so (total - remainder) divides n exactly.
    const remainder = (total % n) as Centavos;
    const perInstallment = ((total - remainder) / n) as Centavos;
    const lastInstallment = (perInstallment + remainder) as Centavos;

    const groupAnchorRef = doc(txCol(uid));
    const groupId = groupAnchorRef.id;
    const timestamp = serverTimestamp();

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
    const allTxs = await installmentRepo.getInstallmentGroup(uid, groupId);
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
};
