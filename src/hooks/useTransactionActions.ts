import { useCallback } from 'react';
import toast from 'react-hot-toast';
import type { Transaction } from '../shared/types/transaction';
import type { User } from 'firebase/auth';

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
      if (transactionToEdit) {
        await update(transactionToEdit.id, data);
        toast.success('Movimentação atualizada com sucesso!');
      } else {
        await add(data);
        toast.success('Nova movimentação registada!');
      }
      setIsFormOpen(false);
      setTransactionToEdit(null);
    } catch (error) {
      console.error('Falha ao gravar no Cofre:', error);
      toast.error('Ocorreu um erro ao gravar. Tente novamente.');
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
      console.error('Falha ao eliminar registo:', error);
      toast.error('Aviso: Falha ao eliminar a movimentação.');
    }
  }, [remove, setTransactionToDelete]);

  const handleBatchDelete = useCallback(async (ids: string[]) => {
    if (!ids || ids.length === 0) return;
    try {
      await removeBatch(ids);
      toast.success(`${ids.length} movimentações eliminadas.`);
    } catch (error) {
      console.error('Falha na eliminação em massa:', error);
      toast.error('Aviso: Falha ao executar eliminação em lote.');
    }
  }, [removeBatch]);

  return { handleSaveTransaction, confirmDelete, handleBatchDelete, uid };
}
