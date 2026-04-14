// src/hooks/useAppLogic.jsx
// Orquestrador: compõe os 3 hooks focados e expõe a mesma API pública de sempre.
// A interface pública não mudou — App.jsx não precisa de ser alterado.
import { useModalState } from './useModalState';
import { useTransactionActions } from './useTransactionActions';
import { useImportActions } from './useImportActions';

export function useAppLogic(user, update, add, remove, removeBatch) {
  const modalState = useModalState();

  const { handleSaveTransaction, confirmDelete: confirmDeleteAction, handleBatchDelete } = useTransactionActions({
    user,
    update,
    add,
    remove,
    removeBatch,
    transactionToEdit:   modalState.transactionToEdit,
    setTransactionToEdit: modalState.setTransactionToEdit,
    setIsFormOpen:        modalState.setIsFormOpen,
    setTransactionToDelete: modalState.setTransactionToDelete,
  });

  const { handleImport } = useImportActions(user);

  // Wrapper para manter a assinatura original: confirmDelete() sem argumento
  const confirmDelete = () => confirmDeleteAction(modalState.transactionToDelete);

  return {
    // Estados dos modais
    isAIChatOpen:    modalState.isAIChatOpen,
    setIsAIChatOpen: modalState.setIsAIChatOpen,
    isFormOpen:      modalState.isFormOpen,
    setIsFormOpen:   modalState.setIsFormOpen,
    isSettingsOpen:  modalState.isSettingsOpen,
    setIsSettingsOpen: modalState.setIsSettingsOpen,

    transactionToEdit:       modalState.transactionToEdit,
    setTransactionToEdit:    modalState.setTransactionToEdit,
    transactionToDelete:     modalState.transactionToDelete,
    setTransactionToDelete:  modalState.setTransactionToDelete,

    // Ações
    handleSaveTransaction,
    confirmDelete,
    handleBatchDelete,
    handleImport,
  };
}
