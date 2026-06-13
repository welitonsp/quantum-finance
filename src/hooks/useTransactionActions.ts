import { useCallback } from 'react';
import toast from 'react-hot-toast';
import { toCentavos } from '../shared/types/money';
import type { Transaction } from '../shared/types/transaction';
import type { User } from 'firebase/auth';
import {
  getUserFriendlyErrorMessage,
  logSanitizedFirebaseError,
} from '../shared/lib/firebaseErrorHandling';

interface UseTransactionActionsParams {
  user: User | null;
  update: (id: string, data: Partial<Transaction>) => Promise<void>;
  add: (data: Partial<Transaction>) => Promise<string>;
  remove: (id: string) => Promise<void>;
  removeBatch: (ids: string[]) => Promise<void>;
  transactionToEdit: Transaction | null;
  setTransactionToEdit: (tx: Transaction | null) => void;
  setIsFormOpen: (v: boolean) => void;
  setTransactionToDelete: (tx: Transaction | null) => void;
}

function valuesEqual(left: unknown, right: unknown): boolean {
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return Object.is(left, right);
  }
}

function setChangedField<K extends keyof Transaction>(
  target: Partial<Transaction>,
  previous: Transaction,
  key: K,
  value: Transaction[K] | undefined,
): void {
  if (value !== undefined && !valuesEqual(previous[key], value)) {
    target[key] = value;
  }
}

function buildEditPayload(previous: Transaction, data: Partial<Transaction>): Partial<Transaction> {
  const payload: Partial<Transaction> = {};

  setChangedField(payload, previous, 'description', data.description);
  setChangedField(payload, previous, 'type', data.type);
  setChangedField(payload, previous, 'category', data.category);
  setChangedField(payload, previous, 'date', data.date);
  setChangedField(payload, previous, 'account', data.account);
  setChangedField(payload, previous, 'accountId', data.accountId);
  setChangedField(payload, previous, 'cardId', data.cardId);
  setChangedField(payload, previous, 'fitId', data.fitId);
  setChangedField(payload, previous, 'tags', data.tags);
  setChangedField(payload, previous, 'isRecurring', data.isRecurring);

  if (data.value_cents !== undefined && data.value_cents !== previous.value_cents) {
    payload.value_cents = data.value_cents;
  }

  if (previous.schemaVersion !== 2) {
    payload.schemaVersion = 2;
  }

  return payload;
}

export function useTransactionActions({
  user,
  update,
  add,
  remove,
  removeBatch,
  transactionToEdit,
  setTransactionToEdit,
  setIsFormOpen,
  setTransactionToDelete,
}: UseTransactionActionsParams) {
  const uid = user?.uid;

  const handleSaveTransaction = useCallback(async (data: Partial<Transaction>) => {
    try {
      const payload: Partial<Transaction> = { ...data, schemaVersion: data.schemaVersion ?? 2 };
      if (data.value_cents !== undefined) {
        payload.value_cents = data.value_cents;
      } else if (data.value !== undefined) {
        payload.value_cents = toCentavos(data.value);
      }
      if (transactionToEdit) {
        const editPayload = buildEditPayload(transactionToEdit, payload);
        if (Object.keys(editPayload).length > 0) {
          await update(transactionToEdit.id, editPayload);
        }
        toast.success('Movimentação atualizada com sucesso!');
      } else {
        await add(payload);
        toast.success('Nova movimentação registrada!');
      }
      setIsFormOpen(false);
      setTransactionToEdit(null);
    } catch (error) {
      const operation = transactionToEdit ? 'transaction_update' : 'transaction_add';
      logSanitizedFirebaseError(operation, error);
      toast.error(getUserFriendlyErrorMessage(error, operation));
    }
  }, [transactionToEdit, update, add, setIsFormOpen, setTransactionToEdit]);

  const confirmDelete = useCallback(async (transactionToDelete: Transaction | null) => {
    if (!transactionToDelete) return;
    const idToDelete = transactionToDelete.id;
    setTransactionToDelete(null);
    try {
      await remove(idToDelete);
      toast.success('Registo eliminado permanentemente.');
    } catch (error) {
      logSanitizedFirebaseError('transaction_delete', error);
      toast.error(getUserFriendlyErrorMessage(error, 'transaction_delete'));
    }
  }, [remove, setTransactionToDelete]);

  const handleBatchDelete = useCallback(async (ids: string[]) => {
    if (!ids || ids.length === 0) return;
    try {
      await removeBatch(ids);
      toast.success(`${ids.length} movimentações eliminadas.`);
    } catch (error) {
      logSanitizedFirebaseError('transaction_delete_batch', error);
      toast.error(getUserFriendlyErrorMessage(error, 'transaction_delete_batch'));
    }
  }, [removeBatch]);

  return { handleSaveTransaction, confirmDelete, handleBatchDelete, uid };
}
