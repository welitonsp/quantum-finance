import { useState, useCallback, useEffect } from "react";
import toast from 'react-hot-toast';
import { FirestoreService } from "../shared/services/FirestoreService";
import { getFunctions, httpsCallable } from "firebase/functions"; 
import { app } from "../shared/api/firebase/index.js"; 

export const useAppLogic = (user, transactions, activeModule, setCurrentMonth, setCurrentYear, setActiveModule, update, add, remove, removeBatch) => {
  const [isAIChatOpen, setIsAIChatOpen] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [transactionToEdit, setTransactionToEdit] = useState(null);
  const [transactionToDelete, setTransactionToDelete] = useState(null);

  // 🌟 O MOTOR QUÂNTICO DE IMPORTAÇÃO E ANÁLISE
  const handleImport = useCallback(async (transacoesImportadas) => {
    if (!user?.uid || !transacoesImportadas?.length) return { added: 0, duplicates: 0, invalid: 0 };

    const functions = getFunctions(app);
    const categorizeBatch = httpsCallable(functions, 'categorizeTransactionsBatch');
    let transacoesFinais = [...transacoesImportadas];

    const toastId = toast.loading(`A analisar ${transacoesImportadas.length} registos...`, {
      style: { background: '#1e293b', color: '#06b6d4', fontWeight: 'bold' }
    });

    try {
      toast.loading("O Cérebro Quântico está a categorizar...", { id: toastId });
      
      const aiResponse = await categorizeBatch({ transactions: transacoesImportadas });
      const categoriasIA = aiResponse.data;

      if (categoriasIA && Array.isArray(categoriasIA)) {
        transacoesFinais = transacoesImportadas.map(tx => {
          const iaMatch = categoriasIA.find(ia => ia.id === tx.id);
          if (iaMatch) return { ...tx, category: iaMatch.category, tags: [iaMatch.tag] };
          return tx;
        });
      }
      toast.loading("A guardar no cofre...", { id: toastId });
    } catch (error) {
      console.warn("IA Falhou, a guardar modo offline:", error);
      toast.error("IA offline. A guardar com categorias base.", { id: toastId });
    }

    try {
      const result = await FirestoreService.saveAllTransactions(user.uid, transacoesFinais);
      
      let bestDate = transacoesFinais[0]?.date || transacoesFinais[0]?.createdAt;
      if (bestDate && typeof bestDate === 'string' && bestDate.includes('-')) {
        const [y, m] = bestDate.split('-');
        if (y && m) { setCurrentMonth(Number(m)); setCurrentYear(Number(y)); }
      }
      
      if (transacoesFinais[0]?.account) setActiveModule(transacoesFinais[0].account);
      
      if (result.added > 0) {
        toast.success(
          `Sucesso! +${result.added} Registos. (Ignorados: ${result.duplicates})`, 
          { id: toastId, duration: 4000, style: { background: '#059669', color: '#fff' } }
        );

        // 🎯 O RADAR DE GASTOS ATÍPICOS (AGORA DISPARA APENAS NA IMPORTAÇÃO)
        const largeExpenses = transacoesFinais.filter(tx => 
          (tx.type === 'saida' || tx.type === 'despesa') && Math.abs(Number(tx.value)) > 1000
        );

        if (largeExpenses.length > 0) {
          // Atraso de 2s para não atropelar a notificação de sucesso
          setTimeout(() => {
            largeExpenses.forEach(tx => {
              toast.custom((t) => (
                <div className={`${t.visible ? 'animate-in fade-in slide-in-from-top-2' : 'animate-out fade-out slide-out-to-top-2'} max-w-md w-full bg-slate-900 shadow-2xl rounded-2xl flex ring-1 ring-orange-500/50 p-4`}>
                  <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center mr-3"><span className="text-lg">💸</span></div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-white uppercase tracking-wider">Alerta de Gasto Atípico</p>
                    <p className="text-xs text-slate-400 mt-1">{tx.description} (R$ {Math.abs(Number(tx.value)).toFixed(2)})</p>
                  </div>
                  <button onClick={() => toast.dismiss(t.id)} className="text-xs text-slate-400 hover:text-white ml-4 border-l border-white/10 pl-4 transition-colors">Fechar</button>
                </div>
              ), { duration: 10000 }); // Fica 10 segundos no ecrã para dar tempo de ler
            });
          }, 2000);
        }

      } else {
        toast.error(`Aviso: Adicionados: ${result.added}, Duplicados: ${result.duplicates}, Inválidos: ${result.invalid}`, { id: toastId, duration: 6000 });
      }
      
      return result;
    } catch (error) {
      toast.error("Erro fatal ao guardar base de dados.", { id: toastId });
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
    } catch (error) { toast.error("Erro ao salvar: " + error.message); } 
    finally { setIsFormOpen(false); setTransactionToEdit(null); }
  }, [activeModule, transactionToEdit, update, add]);

  const confirmDelete = useCallback(async () => {
    if (transactionToDelete) {
      try {
        await remove(transactionToDelete.id);
        toast.success("Registo apagado.");
      } catch (error) { toast.error("Erro ao apagar."); } 
      finally { setTransactionToDelete(null); }
    }
  }, [transactionToDelete, remove]);

  const handleBatchDelete = useCallback(async (ids) => {
    if (!ids || ids.length === 0) return;
    try {
      await removeBatch(ids);
      toast.success(`${ids.length} transações apagadas.`);
    } catch (error) { toast.error("Erro na exclusão em lote."); }
  }, [removeBatch]);

  return {
    isAIChatOpen, setIsAIChatOpen, isFormOpen, setIsFormOpen, isSettingsOpen, setIsSettingsOpen,
    transactionToEdit, setTransactionToEdit, transactionToDelete, setTransactionToDelete,
    handleImport, handleSaveTransaction, confirmDelete, handleBatchDelete
  };
};