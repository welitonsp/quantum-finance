// src/hooks/useAppLogic.ts
// Orquestrador: compõe os 3 hooks focados e expõe a mesma API pública de sempre.
import { useModalState } from './useModalState';
import { useTransactionActions } from './useTransactionActions';
import { useImportActions } from './useImportActions';

type AnyRecord = Record<string, unknown>;

interface User {
  uid?: string;
}

export function useAppLogic(
  user: User | null | undefined,
  update:      (id: string, data: AnyRecord) => Promise<void>,
  add:         (data: AnyRecord)             => Promise<string>,
  remove:      (id: string)                  => Promise<void>,
  removeBatch: (ids: string[])               => Promise<void>,
) {
  const modalState = useModalState();

  const { handleSaveTransaction, confirmDelete: confirmDeleteAction, handleBatchDelete } = useTransactionActions({
    user, update, add, remove, removeBatch,
    transactionToEdit:      modalState.transactionToEdit,
    setTransactionToEdit:   modalState.setTransactionToEdit,
    setIsFormOpen:          modalState.setIsFormOpen,
    setTransactionToDelete: modalState.setTransactionToDelete,
  });

  const { handleImport } = useImportActions(user);

  const confirmDelete = () => confirmDeleteAction(modalState.transactionToDelete);

  return {
    isAIChatOpen:     modalState.isAIChatOpen,
    setIsAIChatOpen:  modalState.setIsAIChatOpen,
    isFormOpen:       modalState.isFormOpen,
    setIsFormOpen:    modalState.setIsFormOpen,
    isSettingsOpen:   modalState.isSettingsOpen,
    setIsSettingsOpen:modalState.setIsSettingsOpen,
    transactionToEdit:       modalState.transactionToEdit,
    setTransactionToEdit:    modalState.setTransactionToEdit,
    transactionToDelete:     modalState.transactionToDelete,
    setTransactionToDelete:  modalState.setTransactionToDelete,
    handleSaveTransaction,
    confirmDelete,
    handleBatchDelete,
    handleImport,
  };
}
