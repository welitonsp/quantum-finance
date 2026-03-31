// src/App.jsx
import { useEffect, useState, useRef } from "react";
import { auth } from "./firebase";
import { onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { BrainCircuit, AlertTriangle } from "lucide-react";
import toast, { Toaster } from 'react-hot-toast';

// Contextos e Hooks
import { useTheme } from "./contexts/ThemeContext";
import { usePrivacy } from "./contexts/PrivacyContext";
import { NavigationProvider, useNavigation } from "./contexts/NavigationContext";
import { useTransactions } from "./hooks/useTransactions";
import { useFinancialData } from "./hooks/useFinancialData"; // 🧠 O nosso Cérebro Matemático
import { FirestoreService } from "./services/FirestoreService";

// Componentes
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import LoginScreen from "./components/LoginScreen";
import DashboardContent from "./components/DashboardContent";
import ReportsContent from "./components/ReportsContent";
import AIAssistantChat from "./components/AIAssistantChat";
import CategorySettings from "./components/CategorySettings";

// Componente Interno que consome o Contexto de Navegação
const AuthenticatedApp = () => {
  const { theme, toggleTheme } = useTheme();
  const { togglePrivacy } = usePrivacy();
  
  const { 
    currentPage, currentMonth, currentYear, setCurrentMonth, setCurrentYear, 
    activeModule, setActiveModule, handlePrevMonth, handleNextMonth 
  } = useNavigation();

  const [user, setUser] = useState(null);
  const [isAIChatOpen, setIsAIChatOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  const [transactionToEdit, setTransactionToEdit] = useState(null);
  const [transactionToDelete, setTransactionToDelete] = useState(null);
  
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => JSON.parse(localStorage.getItem('quantum_sidebar_collapsed') || 'false'));
  const [monthlyGoal, setMonthlyGoal] = useState(() => Number(localStorage.getItem('quantum_monthly_goal') || 0));

  useEffect(() => localStorage.setItem('quantum_sidebar_collapsed', JSON.stringify(isSidebarCollapsed)), [isSidebarCollapsed]);
  useEffect(() => localStorage.setItem('quantum_monthly_goal', monthlyGoal), [monthlyGoal]);

  // Auth Observer
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  // Atalhos de Teclado
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
      if (e.altKey && e.key.toLowerCase() === 'p') { e.preventDefault(); togglePrivacy(); toast.success("Modo Privacidade Alternado!", { icon: '🔒' }); }
      if (e.altKey && e.key.toLowerCase() === 'n') { e.preventDefault(); setIsFormOpen(true); }
      if (e.key === 'Escape') { setIsFormOpen(false); setIsAIChatOpen(false); setTransactionToDelete(null); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePrivacy]);

  // ✅ 1. DADOS DO FIREBASE
  const { transactions, loading, add, remove, removeBatch, update } = useTransactions(user?.uid);

  // ✅ 2. CÁLCULOS E FILTRAGEM (Delegados para o Hook useFinancialData)
  const { 
    displayedTransactions, 
    moduleBalances, 
    categoryData, 
    topExpensesData 
  } = useFinancialData(transactions, activeModule, currentMonth, currentYear);

  // Alerta de Gastos Atípicos
  const notifiedLargeTxRef = useRef(new Set());
  useEffect(() => {
    if (!displayedTransactions.length) return;
    const largeExpenses = displayedTransactions.filter(tx => tx.type === 'saida' && Math.abs(Number(tx.value)) > 1000 && !notifiedLargeTxRef.current.has(tx.id));
    largeExpenses.forEach(tx => {
      toast.custom((t) => (
        <div className={`${t.visible ? 'animate-in fade-in slide-in-from-top-2' : 'animate-out fade-out slide-out-to-top-2'} max-w-md w-full bg-white dark:bg-slate-800 shadow-2xl rounded-2xl flex ring-1 ring-orange-500/50 p-4 pointer-events-auto`}>
          <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center mr-3"><span className="text-lg">💸</span></div>
          <div className="flex-1">
            <p className="text-sm font-bold text-slate-800 dark:text-white uppercase tracking-wider">Gasto Atípico</p>
            <p className="text-xs text-slate-500 mt-1">{tx.description}</p>
          </div>
          <button onClick={() => toast.dismiss(t.id)} className="text-xs text-slate-400 hover:text-slate-800 ml-4 border-l border-slate-200 dark:border-white/10 pl-4 transition-colors">Fechar</button>
        </div>
      ), { duration: 8000 });
      notifiedLargeTxRef.current.add(tx.id);
    });
  }, [displayedTransactions]);

  // ==========================================
  // HANDLERS ROBUSTOS
  // ==========================================
  const handleImport = async (transacoesImportadas) => {
    if (!user?.uid || !transacoesImportadas?.length) return { added: 0, duplicates: 0 };
    const result = await FirestoreService.saveAllTransactions(user.uid, transacoesImportadas);
    
    // Auto-navegação para o mês da importação
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
    if (bestDate) {
      const [y, m] = bestDate.split('-');
      setCurrentMonth(Number(m)); setCurrentYear(Number(y));
    }
    if (transacoesImportadas[0]?.account) setActiveModule(transacoesImportadas[0].account);
    return result;
  };

  const handleSaveTransaction = async (data) => {
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
  };

  const confirmDelete = async () => {
    if (transactionToDelete) {
      try {
        await remove(transactionToDelete.id);
        toast.success("Registo apagado.");
      } catch (error) {
        console.error("Erro ao apagar:", error);
        toast.error("Erro ao apagar. Olhe o Console.");
      } finally {
        setTransactionToDelete(null);
      }
    }
  };

  const handleBatchDelete = async (ids) => {
    if (!ids || ids.length === 0) return;
    try {
      await removeBatch(ids);
      toast.success(`${ids.length} transações apagadas.`);
    } catch (error) {
      console.error("Erro ao apagar lote:", error);
      toast.error("Erro na exclusão em lote.");
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 overflow-hidden font-sans transition-colors duration-500">
      <Toaster position="bottom-right" toastOptions={{ style: { background: theme === 'dark' ? '#1e293b' : '#fff', color: theme === 'dark' ? '#fff' : '#0f172a', borderRadius: '12px' } }} />

      {/* Modal de Exclusão Individual */}
      {transactionToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-3xl p-6 shadow-2xl border dark:border-white/10 zoom-in-95">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-red-100 dark:bg-red-500/20 text-red-600 rounded-2xl"><AlertTriangle /></div>
              <div><h3 className="text-lg font-bold">Apagar Registo?</h3><p className="text-sm text-slate-500">Esta ação não pode ser desfeita.</p></div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl mb-6 border dark:border-white/5">
              <p className="text-sm font-bold truncate">"{transactionToDelete.description}"</p>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setTransactionToDelete(null)} className="px-5 py-2.5 rounded-xl font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">Cancelar</button>
              <button onClick={confirmDelete} className="px-5 py-2.5 rounded-xl font-bold bg-red-600 text-white hover:bg-red-700 transition-colors">Apagar</button>
            </div>
          </div>
        </div>
      )}

      {/* Background futurista */}
      <div className="fixed inset-0 opacity-10 dark:opacity-30 pointer-events-none z-0">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl animate-float"></div>
        <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-cyan-500/10 rounded-full blur-3xl animate-float" style={{ animationDelay: '1s' }}></div>
      </div>

      <Sidebar user={user} isMobileMenuOpen={isMobileMenuOpen} setIsMobileMenuOpen={setIsMobileMenuOpen} isSidebarCollapsed={isSidebarCollapsed} setIsSettingsOpen={setIsSettingsOpen} handleLogout={() => signOut(auth)} />

      <div className="flex-1 flex flex-col relative z-10 w-full overflow-hidden transition-all duration-300">
        <Header 
          currentPage={currentPage}
          currentMonth={currentMonth}
          currentYear={currentYear}
          handlePrevMonth={handlePrevMonth}
          handleNextMonth={handleNextMonth}
          nomeMeses={["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]} 
          theme={theme} toggleTheme={toggleTheme} isSidebarCollapsed={isSidebarCollapsed} setIsSidebarCollapsed={setIsSidebarCollapsed} setIsMobileMenuOpen={setIsMobileMenuOpen} isFormOpen={isFormOpen} setIsFormOpen={setIsFormOpen} user={user} transactions={transactions} handleImport={handleImport} 
        />

        <main className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="w-full max-w-[1600px] mx-auto p-4 md:p-6 lg:p-12 transition-all duration-300">
            {currentPage === 'dashboard' ? (
              <DashboardContent
                transactions={displayedTransactions}
                loading={loading}
                moduleBalances={moduleBalances}
                categoryData={categoryData}
                topExpensesData={topExpensesData}
                monthlyGoal={monthlyGoal}
                setMonthlyGoal={setMonthlyGoal}
                onSaveTransaction={handleSaveTransaction}
                onEditTransaction={(tx) => { setTransactionToEdit(tx); setIsFormOpen(true); }}
                onDeleteRequest={setTransactionToDelete}
                onBatchDelete={handleBatchDelete}
                onDeleteAll={handleBatchDelete}
                isFormOpen={isFormOpen}
                setIsFormOpen={setIsFormOpen}
                transactionToEdit={transactionToEdit}
                setTransactionToEdit={setTransactionToEdit}
              />
            ) : (
              <ReportsContent transactions={displayedTransactions} balances={moduleBalances} />
            )}
          </div>
        </main>
      </div>

      {isSettingsOpen && <CategorySettings uid={user?.uid} onClose={() => setIsSettingsOpen(false)} />}

      <button onClick={() => setIsAIChatOpen(true)} className="fixed bottom-6 right-6 md:bottom-8 md:right-8 w-14 h-14 md:w-16 md:h-16 bg-gradient-to-br from-indigo-500 to-cyan-500 rounded-2xl flex items-center justify-center shadow-2xl hover:scale-110 active:scale-95 transition-all z-50 group border border-white/20">
        <BrainCircuit className="w-7 h-7 text-white group-hover:animate-pulse" />
      </button>

      <AIAssistantChat transactions={displayedTransactions} balances={moduleBalances} isOpen={isAIChatOpen} onClose={() => setIsAIChatOpen(false)} />
    </div>
  );
};

// ==========================================
// ORQUESTRADOR PRINCIPAL
// ==========================================
export default function App() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => { setUser(u); setAuthReady(true); });
    return () => unsub();
  }, []);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      toast.success("Acesso Autorizado!");
    } catch (error) { toast.error("Falha ao autenticar."); }
  };

  if (!authReady) return <div className="flex min-h-screen items-center justify-center bg-slate-950 text-indigo-500 font-bold uppercase animate-pulse">A ligar Motor Quântico...</div>;
  if (!user) return <LoginScreen onLogin={handleLogin} />;

  return (
    <NavigationProvider>
      <AuthenticatedApp />
    </NavigationProvider>
  );
}