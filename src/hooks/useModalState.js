// src/hooks/useModalState.js
// Responsabilidade única: gerir o estado de abertura/fecho de todos os modais da app.
import { useState } from 'react';

export function useModalState() {
  const [isAIChatOpen,    setIsAIChatOpen]    = useState(false);
  const [isFormOpen,      setIsFormOpen]      = useState(false);
  const [isSettingsOpen,  setIsSettingsOpen]  = useState(false);
  const [transactionToEdit,   setTransactionToEdit]   = useState(null);
  const [transactionToDelete, setTransactionToDelete] = useState(null);

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
