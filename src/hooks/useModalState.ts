// src/hooks/useModalState.ts
import { useState } from 'react';

type AnyRecord = Record<string, unknown>;

export function useModalState() {
  const [isAIChatOpen,        setIsAIChatOpen]        = useState(false);
  const [isFormOpen,          setIsFormOpen]          = useState(false);
  const [isSettingsOpen,      setIsSettingsOpen]      = useState(false);
  const [transactionToEdit,   setTransactionToEdit]   = useState<AnyRecord | null>(null);
  const [transactionToDelete, setTransactionToDelete] = useState<AnyRecord | null>(null);

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
