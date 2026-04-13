import { useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { FirestoreService } from '../shared/services/FirestoreService';

// Parâmetros recebidos são apenas os que este hook realmente usa.
// displayedTransactions, activeModule, setCurrentMonth, setCurrentYear e
// setActiveModule foram removidos da assinatura — não eram utilizados aqui.
export function useAppLogic(
  user,
  update,
  add,
  remove,
  removeBatch
) {
  // ─── Estados da interface ──────────────────────────────────────────────────

  const [isAIChatOpen,    setIsAIChatOpen]    = useState(false);
  const [isFormOpen,      setIsFormOpen]      = useState(false);
  const [isSettingsOpen,  setIsSettingsOpen]  = useState(false);
  const [transactionToEdit,   setTransactionToEdit]   = useState(null);
  const [transactionToDelete, setTransactionToDelete] = useState(null);

  // ─── Gravar / editar transação ────────────────────────────────────────────

  const handleSaveTransaction = useCallback(async (data) => {
    try {
      if (transactionToEdit) {
        await update(transactionToEdit.id, data);
        toast.success("Movimentação atualizada com sucesso!");
      } else {
        await add(data);
        toast.success("Nova movimentação registada!");
      }

      // Limpeza só em caso de sucesso — formulário permanece aberto se falhar
      setIsFormOpen(false);
      setTransactionToEdit(null);
    } catch (error) {
      console.error("Falha ao gravar no Cofre:", error);
      toast.error("Ocorreu um erro ao gravar. Tente novamente.");
    }
  }, [transactionToEdit, update, add]);

  // ─── Eliminar transação única ─────────────────────────────────────────────

  const confirmDelete = useCallback(async () => {
    if (!transactionToDelete) return;

    // UI optimista: fecha o modal imediatamente para não bloquear o utilizador
    const idToDelete = transactionToDelete.id;
    setTransactionToDelete(null);

    try {
      await remove(idToDelete);
      toast.success("Registo eliminado permanentemente.");
    } catch (error) {
      console.error("Falha ao eliminar registo:", error);
      toast.error("Aviso: Falha ao eliminar a movimentação.");
    }
  }, [transactionToDelete, remove]);

  // ─── Eliminar lote ────────────────────────────────────────────────────────

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

  // ─── Importar ficheiro bancário ───────────────────────────────────────────

  // Depende de user.uid (string primitiva) e não do objeto user inteiro.
  // O Firebase renova o token periodicamente criando um novo objeto user
  // com a mesma uid — usar [user] recriaria esta função desnecessariamente.
  const uid = user?.uid;

  const handleImport = useCallback(async (parsedData) => {
    if (!uid || !parsedData || parsedData.length === 0) {
      toast.error("Ficheiro vazio ou dados corrompidos.");
      return;
    }

    const toastId = toast.loading("A importar dados bancários...");

    try {
      const result = await FirestoreService.saveAllTransactions(uid, parsedData);

      if (result.added > 0) {
        toast.success(`Importação concluída: ${result.added} registos adicionados.`, { id: toastId });
      } else if (result.duplicates > 0) {
        toast.success(`Ficheiro importado. ${result.duplicates} registos ignorados (duplicados).`, { id: toastId });
      } else {
        toast.error("Nenhuma movimentação nova foi adicionada.", { id: toastId });
      }
    } catch (error) {
      console.error("Interferência na Importação:", error);
      toast.error("Falha crítica ao importar o ficheiro.", { id: toastId });
    }
  }, [uid]);

  // ─── API pública do hook ──────────────────────────────────────────────────

  return {
    isAIChatOpen,   setIsAIChatOpen,
    isFormOpen,     setIsFormOpen,
    isSettingsOpen, setIsSettingsOpen,

    transactionToEdit,   setTransactionToEdit,
    transactionToDelete, setTransactionToDelete,

    handleSaveTransaction,
    confirmDelete,
    handleBatchDelete,
    handleImport,
  };
}
