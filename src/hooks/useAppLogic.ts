import { useModalState } from './useModalState';
import { useTransactionActions } from './useTransactionActions';
import { useImportActions } from './useImportActions';
import type { Transaction, ImportResult } from '../shared/types/transaction';
import type { User } from 'firebase/auth';

interface UseAppLogicReturn {
  isAIChatOpen: boolean;
  setIsAIChatOpen: (v: boolean) => void;
  isFormOpen: boolean;
  setIsFormOpen: (v: boolean) => void;
  isSettingsOpen: boolean;
  setIsSettingsOpen: (v: boolean) => void;
  transactionToEdit: Transaction | null;
  setTransactionToEdit: (tx: Transaction | null) => void;
  transactionToDelete: Transaction | null;
  setTransactionToDelete: (tx: Transaction | null) => void;
  handleSaveTransaction: (data: Partial<Transaction>) => Promise<void>;
  confirmDelete: () => void;
  handleBatchDelete: (ids: string[]) => Promise<void>;
  handleImport: (parsedData: Partial<Transaction>[]) => Promise<ImportResult | undefined>;
}

export function useAppLogic(
  user: User | null,
  update: (id: string, data: Partial<Transaction>) => Promise<void>,
  add: (data: Partial<Transaction>) => Promise<string>,
  remove: (id: string) => Promise<void>,
  removeBatch: (ids: string[]) => Promise<void>
): UseAppLogicReturn {
  const modalState = useModalState();

  const { handleSaveTransaction, confirmDelete: confirmDeleteAction, handleBatchDelete } = useTransactionActions({
    user,
    update,
    add,
    remove,
    removeBatch,
    transactionToEdit:      modalState.transactionToEdit,
    setTransactionToEdit:   modalState.setTransactionToEdit,
    setIsFormOpen:          modalState.setIsFormOpen,
    setTransactionToDelete: modalState.setTransactionToDelete,
  });

  const { handleImport } = useImportActions(user);

  const confirmDelete = () => confirmDeleteAction(modalState.transactionToDelete);

  return {
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
    handleSaveTransaction,
    confirmDelete,
    handleBatchDelete,
    handleImport,
  };
}
