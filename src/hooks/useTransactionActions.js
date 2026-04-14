// src/hooks/useTransactionActions.js
// Responsabilidade única: operações CRUD sobre transações (save, delete, batch delete).
import { useCallback } from 'react';
import toast from 'react-hot-toast';

export function useTransactionActions({ user, update, add, remove, removeBatch, transactionToEdit, setTransactionToEdit, setIsFormOpen, setTransactionToDelete }) {
  const uid = user?.uid;

  const handleSaveTransaction = useCallback(async (data) => {
    try {
      if (transactionToEdit) {
        await update(transactionToEdit.id, data);
        toast.success("Movimentação atualizada com sucesso!");
      } else {
        await add(data);
        toast.success("Nova movimentação registada!");
      }
      setIsFormOpen(false);
      setTransactionToEdit(null);
    } catch (error) {
      console.error("Falha ao gravar no Cofre:", error);
      toast.error("Ocorreu um erro ao gravar. Tente novamente.");
    }
  }, [transactionToEdit, update, add, setIsFormOpen, setTransactionToEdit]);

  const confirmDelete = useCallback(async (transactionToDelete) => {
    if (!transactionToDelete) return;
    const idToDelete = transactionToDelete.id;
    setTransactionToDelete(null);
    try {
      await remove(idToDelete);
      toast.success("Registo eliminado permanentemente.");
    } catch (error) {
      console.error("Falha ao eliminar registo:", error);
      toast.error("Aviso: Falha ao eliminar a movimentação.");
    }
  }, [remove, setTransactionToDelete]);

  const handleBatchDelete = useCallback(async (ids) => {
    if (!ids || ids.length === 0) return;
    try {
      await removeBatch(ids);
      toast.success(`${ids.length} movimentações eliminadas.`);
    } catch (error) {
      console.error("Falha na eliminação em massa:", error);
      toast.error("Aviso: Falha ao executar eliminação em lote.");
    }
  }, [removeBatch]);

  return { handleSaveTransaction, confirmDelete, handleBatchDelete, uid };
}
