import React, { useEffect, useState, lazy, Suspense } from "react";
import { auth } from "./shared/api/firebase/index.js";
import { onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { BrainCircuit, AlertTriangle, Loader2 } from "lucide-react";
import toast, { Toaster } from 'react-hot-toast';

import { useTheme } from "./contexts/ThemeContext";
import { usePrivacy } from "./contexts/PrivacyContext";
import { NavigationProvider, useNavigation } from "./contexts/NavigationContext";
import { useTransactions } from "./hooks/useTransactions";
import { useFinancialData } from "./hooks/useFinancialData";
import { useAppLogic } from "./hooks/useAppLogic";

import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import LoginScreen from "./components/LoginScreen";
import QuantumBackground from "./components/QuantumBackground";
import DashboardContent from "./components/DashboardContent";
import CategorySettings from "./components/CategorySettings";

// ─── Páginas pesadas com lazy load (reduz bundle inicial) ────────────────────
const ReportsContent     = lazy(() => import("./features/reports/ReportsContent"));
const AIAssistantChat    = lazy(() => import("./features/ai-chat/AIAssistantChat").then(m => ({ default: m.AIAssistantChat })));
const AccountsManager    = lazy(() => import("./features/transactions/AccountsManager"));
const CreditCardManager  = lazy(() => import("./features/transactions/CreditCardManager"));
const RecurringManager   = lazy(() => import("./components/RecurringManager"));
const QuantumAIPage      = lazy(() => import("./components/QuantumAIPage"));
const HistoryPage        = lazy(() => import("./components/HistoryPage"));

// ─── Fallback de loading quântico ───────────────────────────────────────────
const QuantumLoader = () => (
  <div className="flex flex-col items-center justify-center h-64 gap-4">
    <Loader2 className="w-10 h-10 text-quantum-accent animate-spin" />
    <span className="text-xs text-quantum-fgMuted uppercase tracking-widest animate-pulse">A carregar módulo...</span>
  </div>
);

// ─── Constantes globais (isoladas da renderização) ───────────────────────────
const MESES_DO_ANO = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

// ─── Helpers de storage (blindagem contra bloqueios) ─────────────────────────
const safeStorageGet = (key, defaultVal) => {
  try {
    const item = localStorage.getItem(key);
    return item !== null ? JSON.parse(item) : defaultVal;
  } catch { return defaultVal; }
};

const safeStorageSet = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Silencia */ }
};

// ─── Sub-componente: Modal de Confirmação ────────────────────────────────────
const ConfirmDeleteModal = ({ transaction, onCancel, onConfirm }) => {
  if (!transaction) return null;
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 w-full max-w-md rounded-3xl p-6 shadow-2xl border border-white/10 zoom-in-95">
        <div className="flex items-center gap-4 mb-4">
          <div className="p-3 bg-red-500/20 text-red-500 rounded-2xl"><AlertTriangle /></div>
          <div>
            <h3 className="text-lg font-bold text-white">Apagar Registo?</h3>
            <p className="text-sm text-slate-400">Esta ação não pode ser desfeita.</p>
          </div>
        </div>
        <div className="bg-slate-950 p-3 rounded-xl mb-6 border border-white/5">
          <p className="text-sm font-bold truncate text-slate-300">"{transaction.description}"</p>
        </div>
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} autoFocus className="px-5 py-2.5 rounded-xl font-bold text-slate-400 hover:text-white hover:bg-white/5 transition-colors">Cancelar</button>
          <button onClick={onConfirm} className="px-5 py-2.5 rounded-xl font-bold bg-red-600 text-white hover:bg-red-700 transition-colors shadow-lg shadow-red-500/20">Apagar</button>
        </div>
      </div>
    </div>
  );
};

// ─── Error Boundary ──────────────────────────────────────────────────────────
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error, info) { console.error("Falha Crítica:", error, info); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 m-4 bg-slate-900/80 border border-red-500/30 rounded-3xl flex flex-col items-center justify-center text-center backdrop-blur-md">
          <AlertTriangle className="w-16 h-16 text-red-500 mb-4 animate-pulse" />
          <h2 className="text-xl font-bold text-white mb-2">Anomalia Detetada</h2>
          {/* ✅ CORREÇÃO 2: Soft Reset restaurado em vez de reload destrutivo */}
          <button 
            onClick={() => this.setState({ hasError: false })} 
            className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-red-500/20"
          >
            Reiniciar Módulo
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Núcleo Autenticado ──────────────────────────────────────────────────────
const AuthenticatedApp = ({ user, handleLogout }) => {
  const { theme, toggleTheme } = useTheme();
  const { togglePrivacy } = usePrivacy();
  const { 
    currentPage, currentMonth, currentYear, setCurrentMonth, setCurrentYear, 
    activeModule, setActiveModule, handlePrevMonth, handleNextMonth 
  } = useNavigation();

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => safeStorageGet('quantum_sidebar_collapsed', false));
  const [monthlyGoal, setMonthlyGoal] = useState(() => Number(safeStorageGet('quantum_monthly_goal', 0)));
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => safeStorageSet('quantum_sidebar_collapsed', isSidebarCollapsed), [isSidebarCollapsed]);
  useEffect(() => safeStorageSet('quantum_monthly_goal', monthlyGoal), [monthlyGoal]);

  const safeUID = user?.uid || "";

  const { transactions, loading, add, remove, removeBatch, update } = useTransactions(safeUID);
  const { displayedTransactions, moduleBalances, categoryData, topExpensesData, allTransactions } = useFinancialData(transactions, activeModule, currentMonth, currentYear);

  const {
    isAIChatOpen, setIsAIChatOpen, isFormOpen, setIsFormOpen, isSettingsOpen, setIsSettingsOpen,
    transactionToEdit, setTransactionToEdit, transactionToDelete, setTransactionToDelete,
    handleImport, handleSaveTransaction, confirmDelete, handleBatchDelete,
  } = useAppLogic(user, update, add, remove, removeBatch);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
      if (e.altKey && e.key?.toLowerCase() === 'p') { e.preventDefault(); togglePrivacy(); }
      if (e.altKey && e.key?.toLowerCase() === 'n') { e.preventDefault(); setIsFormOpen(true); }
      if (e.key === 'Escape') { 
        setIsFormOpen(false); setIsAIChatOpen(false); setTransactionToDelete(null); setIsMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePrivacy, setIsFormOpen, setIsAIChatOpen, setTransactionToDelete]);

  return (
    <div className="flex h-screen overflow-hidden font-sans transition-colors duration-500 relative">
      <Toaster position="bottom-right" />
      <ConfirmDeleteModal transaction={transactionToDelete} onCancel={() => setTransactionToDelete(null)} onConfirm={confirmDelete} />
      <QuantumBackground />

      <div className="relative z-10 flex w-full h-full pointer-events-none">
        <div className="pointer-events-auto">
          <Sidebar user={user} isMobileMenuOpen={isMobileMenuOpen} setIsMobileMenuOpen={setIsMobileMenuOpen} isSidebarCollapsed={isSidebarCollapsed} setIsSettingsOpen={setIsSettingsOpen} handleLogout={handleLogout} />
        </div>

        <div className="flex-1 flex flex-col w-full overflow-hidden pointer-events-auto bg-slate-950/80 backdrop-blur-sm">
          <Header 
            currentPage={currentPage} currentMonth={currentMonth} currentYear={currentYear}
            handlePrevMonth={handlePrevMonth} handleNextMonth={handleNextMonth} nomeMeses={MESES_DO_ANO}
            theme={theme} toggleTheme={toggleTheme} isSidebarCollapsed={isSidebarCollapsed} setIsSidebarCollapsed={setIsSidebarCollapsed} 
            setIsMobileMenuOpen={setIsMobileMenuOpen} isFormOpen={isFormOpen} setIsFormOpen={setIsFormOpen}
            user={user} transactions={transactions} handleImport={handleImport} 
          />

          <main className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6 lg:p-12">
            <ErrorBoundary>
              <Suspense fallback={<QuantumLoader />}>
                {currentPage === 'dashboard' && (
                  <DashboardContent
                    user={user} transactions={displayedTransactions} allTransactions={allTransactions} loading={loading}
                    moduleBalances={moduleBalances} categoryData={categoryData} topExpensesData={topExpensesData}
                    monthlyGoal={monthlyGoal} setMonthlyGoal={setMonthlyGoal} onSaveTransaction={handleSaveTransaction}
                    onEditTransaction={(tx) => { setTransactionToEdit(tx); setIsFormOpen(true); }}
                    onDeleteRequest={setTransactionToDelete} onBatchDelete={handleBatchDelete}
                    isFormOpen={isFormOpen} setIsFormOpen={setIsFormOpen} transactionToEdit={transactionToEdit} setTransactionToEdit={setTransactionToEdit}
                  />
                )}
                {currentPage === 'accounts' && <AccountsManager uid={safeUID} />}
                {currentPage === 'cards' && <CreditCardManager uid={safeUID} transactions={allTransactions} />}
                {currentPage === 'recurring' && <RecurringManager uid={safeUID} />}
                {currentPage === 'quantum' && (
                  <QuantumAIPage
                    transactions={displayedTransactions}
                    allTransactions={allTransactions}
                    balances={moduleBalances}
                    currentMonth={currentMonth}
                    currentYear={currentYear}
                  />
                )}
                {(currentPage === 'history' || currentPage === 'wallet') && (
                  <HistoryPage transactions={displayedTransactions} loading={loading} onEdit={(tx) => { setTransactionToEdit(tx); setIsFormOpen(true); }} onDeleteRequest={setTransactionToDelete} onBatchDelete={handleBatchDelete} onBatchImport={handleImport} />
                )}
                {currentPage === 'reports' && <ReportsContent transactions={displayedTransactions} balances={moduleBalances} />}
              </Suspense>
            </ErrorBoundary>
          </main>
        </div>
      </div>

      <button onClick={() => setIsAIChatOpen(true)} className="fixed bottom-6 right-6 md:bottom-8 md:right-8 w-14 h-14 bg-cyan-600 hover:bg-cyan-500 rounded-2xl flex items-center justify-center shadow-lg z-50 group border border-white/20">
        <BrainCircuit className="w-7 h-7 text-white group-hover:animate-pulse" />
      </button>

      {isSettingsOpen && <ErrorBoundary><CategorySettings uid={safeUID} onClose={() => setIsSettingsOpen(false)} /></ErrorBoundary>}
      <ErrorBoundary>
        <Suspense fallback={null}>
          <AIAssistantChat transactions={displayedTransactions} balances={moduleBalances} isOpen={isAIChatOpen} onClose={() => setIsAIChatOpen(false)} />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
};

// ─── Root ────────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  // ✅ CORREÇÃO 1: Silenciador Quântico movido para dentro do ciclo de vida do React
  // Garante que o patch do console só ocorre no cliente após a montagem,
  // e é devidamente limpo ao desmontar, protegendo testes e a memória (Cleanup).
  useEffect(() => {
    const originalConsoleWarn = console.warn;
    console.warn = (...args) => {
      if (typeof args[0] === 'string' && args[0].includes('The width(-1) and height(-1)')) {
        return; 
      }
      originalConsoleWarn(...args);
    };

    return () => {
      console.warn = originalConsoleWarn;
    };
  }, []);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => { setUser(u); setAuthReady(true); });
  }, []);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      toast.success("Acesso Autorizado, Comandante!");
    } catch (error) {
      console.error("Falha na Autenticação:", error);
      const msg = error.code === 'auth/popup-closed-by-user' ? "Login cancelado." : "Falha ao autenticar.";
      toast.error(msg);
    }
  };

  const handleLogout = async () => {
    try { await signOut(auth); } catch { toast.error("Erro ao sair."); }
  };

  if (!authReady) return <div className="flex min-h-screen items-center justify-center bg-slate-950 text-cyan-400 font-bold animate-pulse uppercase">A inicializar o Quantum Finance...</div>;
  if (!user) return <LoginScreen onLogin={handleLogin} />;

  return (
    <NavigationProvider>
      <ErrorBoundary>
        <AuthenticatedApp user={user} handleLogout={handleLogout} />
      </ErrorBoundary>
    </NavigationProvider>
  );
}