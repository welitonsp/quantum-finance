// src/App.jsx
import React, { useEffect, useState, useRef, useCallback, lazy, Suspense } from "react";
import { auth } from "./shared/api/firebase/index.js";
import { onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { BrainCircuit, AlertTriangle, Loader2 } from "lucide-react";
import toast, { Toaster } from 'react-hot-toast';

// Contextos e Hooks
import { useTheme } from "./contexts/ThemeContext";
import { usePrivacy } from "./contexts/PrivacyContext";
import { NavigationProvider, useNavigation } from "./contexts/NavigationContext";
import { useTransactions } from "./hooks/useTransactions";
import { useFinancialData } from "./hooks/useFinancialData";
import { FirestoreService } from "./shared/services/FirestoreService";

// ==========================================
// 🛡️ O ESCUDO DE CONTENÇÃO (Error Boundary)
// ==========================================
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, errorInfo) { console.error("Interferência Quântica:", error, errorInfo); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 m-4 bg-slate-900/80 border border-red-500/30 rounded-3xl flex flex-col items-center justify-center text-center backdrop-blur-md">
          <AlertTriangle className="w-16 h-16 text-red-500 mb-4 animate-pulse" />
          <h2 className="text-xl font-bold text-white mb-2">Interferência no Módulo</h2>
          <p className="text-sm text-slate-400 mb-6">Ocorreu uma anomalia isolada nesta secção. O resto do sistema está operacional.</p>
          <button onClick={() => this.setState({ hasError: false })} className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-red-500/20">
            Tentar Reiniciar Módulo
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ⚡ O INDICADOR DE CARREGAMENTO DINÂMICO
const PageLoader = () => (
  <div className="flex flex-col items-center justify-center h-full min-h-[400px] w-full">
    <Loader2 className="w-12 h-12 text-indigo-500 animate-spin mb-4" />
    <p className="text-sm font-bold tracking-widest text-slate-400 uppercase animate-pulse">A Ligar Módulo Quântico...</p>
  </div>
);

// ==========================================
// COMPONENTES LEVES (Carregamento Imediato)
// ==========================================
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import LoginScreen from "./components/LoginScreen";
import QuantumBackground from "./components/QuantumBackground";
import MarketTicker from "./components/MarketTicker";

// ==========================================
// ⚡ COMPONENTES PESADOS (Lazy Loading)
// ==========================================
const DashboardContent = lazy(() => import("./components/DashboardContent"));
const CategorySettings = lazy(() => import("./components/CategorySettings"));
const ReportsContent = lazy(() => import("./features/reports/ReportsContent"));
const AIAssistantChat = lazy(() => import("./features/ai-chat/AIAssistantChat"));
const AccountsManager = lazy(() => import("./features/transactions/AccountsManager"));
const RecurringManager = lazy(() => import("./components/RecurringManager"));
const PortfolioPage = lazy(() => import("./components/PortfolioPage"));
const MarketsPage = lazy(() => import("./components/MarketsPage"));
const QuantumAIPage = lazy(() => import("./components/QuantumAIPage"));
const HistoryPage = lazy(() => import("./components/HistoryPage"));

const AuthenticatedApp = ({ user }) => {
  const { theme, toggleTheme } = useTheme();
  const { togglePrivacy } = usePrivacy();
  
  const { 
    currentPage, currentMonth, currentYear, setCurrentMonth, setCurrentYear, 
    activeModule, setActiveModule, handlePrevMonth, handleNextMonth 
  } = useNavigation();

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

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
      if (e.altKey && e.key?.toLowerCase() === 'p') { e.preventDefault(); togglePrivacy(); toast.success("Modo Privacidade Alternado!", { icon: '🔒' }); }
      if (e.altKey && e.key?.toLowerCase() === 'n') { e.preventDefault(); setIsFormOpen(true); }
      if (e.key === 'Escape') { setIsFormOpen(false); setIsAIChatOpen(false); setTransactionToDelete(null); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePrivacy]);

  const { transactions, loading, add, remove, removeBatch, update } = useTransactions(user?.uid);
  const { displayedTransactions, moduleBalances, categoryData, topExpensesData } = useFinancialData(transactions, activeModule, currentMonth, currentYear);

  const notifiedLargeTxRef = useRef(new Set());
  useEffect(() => {
    if (!displayedTransactions.length) return;
    const largeExpenses = displayedTransactions.filter(tx => tx.type === 'saida' && Math.abs(Number(tx.value)) > 1000 && !notifiedLargeTxRef.current.has(tx.id));
    largeExpenses.forEach(tx => {
      toast.custom((t) => (
        <div className={`${t.visible ? 'animate-in fade-in slide-in-from-top-2' : 'animate-out fade-out slide-out-to-top-2'} max-w-md w-full bg-quantum-card shadow-2xl rounded-2xl flex ring-1 ring-orange-500/50 p-4 pointer-events-auto`}>
          <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center mr-3"><span className="text-lg">💸</span></div>
          <div className="flex-1">
            <p className="text-sm font-bold text-white uppercase tracking-wider">Gasto Atípico</p>
            <p className="text-xs text-quantum-fgMuted mt-1">{tx.description}</p>
          </div>
          <button onClick={() => toast.dismiss(t.id)} className="text-xs text-quantum-fgMuted hover:text-white ml-4 border-l border-white/10 pl-4 transition-colors">Fechar</button>
        </div>
      ), { duration: 8000 });
      notifiedLargeTxRef.current.add(tx.id);
    });
  }, [displayedTransactions]);

  const handleImport = useCallback(async (transacoesImportadas) => {
    if (!user?.uid || !transacoesImportadas?.length) return { added: 0, duplicates: 0 };
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
    return result;
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

  return (
    <div className="flex h-screen overflow-hidden font-sans transition-colors duration-500 relative">
      <Toaster position="bottom-right" toastOptions={{ 
        style: { background: '#131A2A', color: '#E8ECF4', border: '1px solid #1E2A3F', borderRadius: '12px' },
        success: { iconTheme: { primary: '#00E68A', secondary: '#131A2A' } },
        error: { iconTheme: { primary: '#FF4757', secondary: '#131A2A' } }
      }} />

      {transactionToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-quantum-card w-full max-w-md rounded-3xl p-6 shadow-2xl border border-quantum-border zoom-in-95">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-red-500/20 text-quantum-red rounded-2xl"><AlertTriangle /></div>
              <div><h3 className="text-lg font-bold text-white">Apagar Registo?</h3><p className="text-sm text-quantum-fgMuted">Esta ação não pode ser desfeita.</p></div>
            </div>
            <div className="bg-quantum-bgSecondary p-3 rounded-xl mb-6 border border-quantum-border">
              <p className="text-sm font-bold truncate text-quantum-fg">"{transactionToDelete.description}"</p>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setTransactionToDelete(null)} className="px-5 py-2.5 rounded-xl font-bold text-quantum-fgMuted hover:bg-quantum-border transition-colors">Cancelar</button>
              <button onClick={confirmDelete} className="px-5 py-2.5 rounded-xl font-bold bg-quantum-red text-white hover:bg-red-700 transition-colors">Apagar</button>
            </div>
          </div>
        </div>
      )}

      <QuantumBackground />

      <div className="relative z-10 flex w-full h-full pointer-events-none">
        
        <div className="pointer-events-auto">
          <Sidebar user={user} isMobileMenuOpen={isMobileMenuOpen} setIsMobileMenuOpen={setIsMobileMenuOpen} isSidebarCollapsed={isSidebarCollapsed} setIsSettingsOpen={setIsSettingsOpen} handleLogout={() => signOut(auth)} />
        </div>

        <div className="flex-1 flex flex-col w-full overflow-hidden pointer-events-auto bg-quantum-bg/80 backdrop-blur-sm">
          
          <Header 
            currentPage={currentPage} currentMonth={currentMonth} currentYear={currentYear}
            handlePrevMonth={handlePrevMonth} handleNextMonth={handleNextMonth}
            nomeMeses={["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]} 
            theme={theme} toggleTheme={toggleTheme} isSidebarCollapsed={isSidebarCollapsed} setIsSidebarCollapsed={setIsSidebarCollapsed} setIsMobileMenuOpen={setIsMobileMenuOpen} isFormOpen={isFormOpen} setIsFormOpen={setIsFormOpen} user={user} transactions={transactions} handleImport={handleImport} 
          />
          
          <MarketTicker />

          <main className="flex-1 overflow-y-auto custom-scrollbar relative">
            <div className="w-full max-w-[1600px] mx-auto p-4 md:p-6 lg:p-12 transition-all duration-300">
              
              <ErrorBoundary>
                <Suspense fallback={<PageLoader />}>
                  
                  {/* ✅ AQUI ESTÁ A NOSSA CORREÇÃO: user={user} INJETADO! */}
                  {currentPage === 'dashboard' && (
                    <DashboardContent
                      user={user}
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
                  )}

                  {currentPage === 'accounts' && <AccountsManager uid={user?.uid} />}
                  {currentPage === 'recurring' && <RecurringManager uid={user?.uid} />}
                  {currentPage === 'portfolio' && <PortfolioPage moduleBalances={moduleBalances} />}
                  {currentPage === 'markets' && (
                    <MarketsPage onTradeClick={(symbol) => {
                      alert(`A abrir operação para: ${symbol}`);
                    }} />
                  )}
                  {currentPage === 'quantum' && <QuantumAIPage />}
                  {(currentPage === 'history' || currentPage === 'wallet') && (
                    <HistoryPage
                      transactions={displayedTransactions}
                      loading={loading}
                      onEdit={(tx) => { setTransactionToEdit(tx); setIsFormOpen(true); }}
                      onDeleteRequest={setTransactionToDelete}
                      onBatchDelete={handleBatchDelete}
                      onDeleteAll={handleBatchDelete}
                    />
                  )}
                  {currentPage === 'reports' && (
                    <ReportsContent transactions={displayedTransactions} balances={moduleBalances} />
                  )}
                </Suspense>
              </ErrorBoundary>

            </div>
          </main>
        </div>
      </div>

      {isSettingsOpen && (
        <ErrorBoundary>
          <Suspense fallback={null}>
            <CategorySettings uid={user?.uid} onClose={() => setIsSettingsOpen(false)} />
          </Suspense>
        </ErrorBoundary>
      )}

      <button onClick={() => setIsAIChatOpen(true)} className="fixed bottom-6 right-6 md:bottom-8 md:right-8 w-14 h-14 md:w-16 md:h-16 bg-quantum-purple hover:bg-purple-600 rounded-2xl flex items-center justify-center shadow-[0_0_30px_rgba(168,85,247,0.3)] hover:scale-110 active:scale-95 transition-all z-50 group border border-white/20">
        <BrainCircuit className="w-7 h-7 text-white group-hover:animate-pulse" />
      </button>

      <ErrorBoundary>
        <Suspense fallback={null}>
          <AIAssistantChat transactions={displayedTransactions} balances={moduleBalances} isOpen={isAIChatOpen} onClose={() => setIsAIChatOpen(false)} />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
};

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

  if (!authReady) return <div className="flex min-h-screen items-center justify-center bg-quantum-bg text-quantum-accent font-bold uppercase animate-pulse">A ligar Motor Quântico...</div>;
  if (!user) return <LoginScreen onLogin={handleLogin} />;

  return (
    <NavigationProvider>
      <AuthenticatedApp user={user} />
    </NavigationProvider>
  );
}