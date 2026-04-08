import { useState, useRef, useCallback, useEffect } from "react";
import toast from 'react-hot-toast';
import { FirestoreService } from "../shared/services/FirestoreService";

export const useAppLogic = (user, transactions, activeModule, setCurrentMonth, setCurrentYear, setActiveModule, update, add, remove, removeBatch) => {
  const [isAIChatOpen, setIsAIChatOpen] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [transactionToEdit, setTransactionToEdit] = useState(null);
  const [transactionToDelete, setTransactionToDelete] = useState(null);
  
  const notifiedLargeTxRef = useRef(new Set());

  // Alertas de Gastos Atípicos
  useEffect(() => {
    if (!transactions?.length) return;
    const largeExpenses = transactions.filter(tx => tx.type === 'saida' && Math.abs(Number(tx.value)) > 1000 && !notifiedLargeTxRef.current.has(tx.id));
    
    largeExpenses.forEach(tx => {
      toast.custom((t) => (
        <div className={`${t.visible ? 'animate-in fade-in slide-in-from-top-2' : 'animate-out fade-out slide-out-to-top-2'} max-w-md w-full bg-slate-900 shadow-2xl rounded-2xl flex ring-1 ring-orange-500/50 p-4`}>
          <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center mr-3"><span className="text-lg">💸</span></div>
          <div className="flex-1">
            <p className="text-sm font-bold text-white uppercase tracking-wider">Gasto Atípico</p>
            <p className="text-xs text-slate-400 mt-1">{tx.description}</p>
          </div>
          <button onClick={() => toast.dismiss(t.id)} className="text-xs text-slate-400 hover:text-white ml-4 border-l border-white/10 pl-4 transition-colors">Fechar</button>
        </div>
      ), { duration: 8000 });
      notifiedLargeTxRef.current.add(tx.id);
    });
  }, [transactions]);

  const handleImport = useCallback(async (transacoesImportadas) => {
    if (!user?.uid || !transacoesImportadas?.length) return { added: 0, duplicates: 0, invalid: 0 };

    try {
      const result = await FirestoreService.saveAllTransactions(user.uid, transacoesImportadas);
      
      const monthCounts = {};
      let bestDate = null, maxCount = 0;
      transacoesImportadas.forEach(tx => {
        const d = tx.date || tx.createdAt;
        if (typeof d === 'string') {
          const monthYear = d.substring(0, 7);
          monthCounts[monthYear] = (monthCounts[monthYear] || 0) + 1;
          if (monthCounts[monthYear] > maxCount) { maxCount = monthCounts[monthYear]; bestDate = d; }
        }
      });
      
      if (bestDate && bestDate.includes('-')) {
        const [y, m] = bestDate.split('-');
        if (y && m) {
          setCurrentMonth(Number(m)); setCurrentYear(Number(y));
        }
      }
      
      if (transacoesImportadas[0]?.account) setActiveModule(transacoesImportadas[0].account);
      
      toast.success(`Importação concluída: +${result.added || transacoesImportadas.length} registos.`);
      return result;
    } catch (error) {
      toast.error("Erro na importação em lote.");
      console.error(error);
      return null;
    }
  }, [user, setCurrentMonth, setCurrentYear, setActiveModule]);

  const handleSaveTransaction = useCallback(async (data) => {
    const finalData = { ...data, account: activeModule === 'geral' ? 'conta_corrente' : activeModule };
    try {
      if (transactionToEdit) {
        await update(transactionToEdit.id, finalData);
        toast.success("Movimentação atualizada!");
      } else {
        await add(finalData);
        toast.success("Movimentação adicionada!");
      }
    } catch (error) {
      toast.error("Erro ao salvar: " + error.message);
    } finally {
      setIsFormOpen(false); 
      setTransactionToEdit(null);
    }
  }, [activeModule, transactionToEdit, update, add]);

  const confirmDelete = useCallback(async () => {
    if (transactionToDelete) {
      try {
        await remove(transactionToDelete.id);
        toast.success("Registo apagado.");
      } catch (error) {
        toast.error("Erro ao apagar.");
      } finally {
        setTransactionToDelete(null);
      }
    }
  }, [transactionToDelete, remove]);

  const handleBatchDelete = useCallback(async (ids) => {
    if (!ids || ids.length === 0) return;
    try {
      await removeBatch(ids);
      toast.success(`${ids.length} transações apagadas.`);
    } catch (error) {
      toast.error("Erro na exclusão em lote.");
    }
  }, [removeBatch]);

  return {
    isAIChatOpen, setIsAIChatOpen,
    isFormOpen, setIsFormOpen,
    isSettingsOpen, setIsSettingsOpen,
    transactionToEdit, setTransactionToEdit,
    transactionToDelete, setTransactionToDelete,
    handleImport, handleSaveTransaction, confirmDelete, handleBatchDelete
  };
};