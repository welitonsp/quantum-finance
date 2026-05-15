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
        await update(transactionToEdit.id, payload);
        toast.success('Movimentação atualizada com sucesso!');
      } else {
        await add(payload);
        toast.success('Nova movimentação registada!');
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
