import { useState } from 'react';
import type { Transaction } from '../shared/types/transaction';

export interface ModalState {
  isAIChatOpen:    boolean;
  setIsAIChatOpen: (v: boolean) => void;
  isFormOpen:      boolean;
  setIsFormOpen:   (v: boolean) => void;
  isSettingsOpen:  boolean;
  setIsSettingsOpen: (v: boolean) => void;
  transactionToEdit:    Transaction | null;
  setTransactionToEdit: (tx: Transaction | null) => void;
  transactionToDelete:  Transaction | null;
  setTransactionToDelete: (tx: Transaction | null) => void;
  closeAll: () => void;
}

export function useModalState(): ModalState {
  const [isAIChatOpen,    setIsAIChatOpen]    = useState(false);
  const [isFormOpen,      setIsFormOpen]      = useState(false);
  const [isSettingsOpen,  setIsSettingsOpen]  = useState(false);
  const [transactionToEdit,   setTransactionToEdit]   = useState<Transaction | null>(null);
  const [transactionToDelete, setTransactionToDelete] = useState<Transaction | null>(null);

  const closeAll = () => {
    setIsFormOpen(false);
    setIsAIChatOpen(false);
    setTransactionToDelete(null);
  };

  return {
    isAIChatOpen,    setIsAIChatOpen,
    isFormOpen,      setIsFormOpen,
    isSettingsOpen,  setIsSettingsOpen,
    transactionToEdit,   setTransactionToEdit,
    transactionToDelete, setTransactionToDelete,
    closeAll,
  };
}
