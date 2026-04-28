import React, { useEffect, useState, lazy, Suspense, useCallback } from 'react';
import { auth } from './shared/api/firebase/index';
import { onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { BrainCircuit, AlertTriangle, Loader2 } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';

import { useTheme } from './contexts/ThemeContext';
import { usePrivacy } from './contexts/PrivacyContext';
import { NavigationProvider, useNavigation } from './contexts/NavigationContext';
import { useTransactions } from './hooks/useTransactions';
import { useFinancialData } from './hooks/useFinancialData';
import { useAccounts } from './hooks/useAccounts';
import { useRecurring } from './hooks/useRecurring';
import { useCategoryRules } from './hooks/useCategoryRules';
import { useAppLogic } from './hooks/useAppLogic';

import Sidebar from './components/Sidebar';
import Header from './components/Header';
import LoginScreen from './components/LoginScreen';
import QuantumBackground from './components/QuantumBackground';
import DashboardContent from './components/DashboardContent';
import TransactionForm from './features/transactions/TransactionForm';
import CategorySettings from './components/CategorySettings';
import type { Transaction } from './shared/types/transaction';

// ─── Lazy-loaded pages ───────────────────────────────────────────────────────
const ReportsContent    = lazy(() => import('./features/reports/ReportsContent'));
const AIAssistantChat   = lazy(() =>
  import('./features/ai-chat/AIAssistantChat').then(m => ({ default: m.AIAssistantChat }))
);
const AccountsManager   = lazy(() => import('./features/transactions/AccountsManager'));
const CreditCardManager = lazy(() => import('./features/transactions/CreditCardManager'));
const RecurringManager  = lazy(() => import('./components/RecurringManager'));
const QuantumAIPage     = lazy(() => import('./components/QuantumAIPage'));
const HistoryPage       = lazy(() => import('./components/HistoryPage'));
const CommandPalette    = lazy(() => import('./components/CommandPalette'));
const SimulationCenter  = lazy(() => import('./features/simulation/SimulationCenter'));

// ─── Quantum Loader ──────────────────────────────────────────────────────────
const QuantumLoader = () => (
  <div className="flex flex-col items-center justify-center h-64 gap-4">
    <Loader2 className="w-10 h-10 text-quantum-accent animate-spin" />
    <span className="text-xs text-quantum-fgMuted uppercase tracking-widest animate-pulse">A carregar módulo...</span>
  </div>
);

// ─── Constants ───────────────────────────────────────────────────────────────
const MESES_DO_ANO = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'] as const;

// ─── Safe storage helpers ─────────────────────────────────────────────────────
function safeStorageGet<T>(key: string, defaultVal: T): T {
  try {
    const item = localStorage.getItem(key);
    return item !== null ? (JSON.parse(item) as T) : defaultVal;
  } catch { return defaultVal; }
}
function safeStorageSet(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* silently fail */ }
}

// ─── ConfirmDeleteModal ───────────────────────────────────────────────────────
interface ConfirmDeleteModalProps {
  transaction: Transaction | null;
  onCancel:    () => void;
  onConfirm:   () => void;
}
const ConfirmDeleteModal = ({ transaction, onCancel, onConfirm }: ConfirmDeleteModalProps) => {
  if (!transaction) return null;
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[100] flex items-center justify-center bg-quantum-bg/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-quantum-card w-full max-w-md rounded-3xl p-6 shadow-2xl border border-quantum-border zoom-in-95">
        <div className="flex items-center gap-4 mb-4">
          <div className="p-3 bg-red-500/20 text-red-500 rounded-2xl"><AlertTriangle /></div>
          <div>
            <h3 className="text-lg font-bold text-quantum-fg">Apagar Registo?</h3>
            <p className="text-sm text-quantum-fgMuted">Esta ação não pode ser desfeita.</p>
          </div>
        </div>
        <div className="bg-quantum-bg p-3 rounded-xl mb-6 border border-quantum-border">
          <p className="text-sm font-bold truncate text-quantum-fg">"{transaction.description}"</p>
        </div>
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} autoFocus className="px-5 py-2.5 rounded-xl font-bold text-quantum-fgMuted hover:text-quantum-fg hover:bg-white/5 transition-colors">Cancelar</button>
          <button onClick={onConfirm} className="px-5 py-2.5 rounded-xl font-bold bg-red-600 text-quantum-fg hover:bg-red-700 transition-colors shadow-lg shadow-red-500/20">Apagar</button>
        </div>
      </div>
    </div>
  );
};

// ─── ErrorBoundary ────────────────────────────────────────────────────────────
interface ErrorBoundaryState { hasError: boolean }
class ErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  constructor(props: React.PropsWithChildren) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(): ErrorBoundaryState { return { hasError: true }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) { console.error('Falha Crítica:', error, info); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 m-4 bg-quantum-card/80 border border-red-500/30 rounded-3xl flex flex-col items-center justify-center text-center backdrop-blur-md">
          <AlertTriangle className="w-16 h-16 text-red-500 mb-4 animate-pulse" />
          <h2 className="text-xl font-bold text-quantum-fg mb-2">Anomalia Detetada</h2>
          <button
            onClick={() => this.setState({ hasError: false })}
            className="px-6 py-3 bg-red-600 hover:bg-red-700 text-quantum-fg rounded-xl text-sm font-bold transition-all shadow-lg shadow-red-500/20"
          >
            Reiniciar Módulo
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── AuthenticatedApp ─────────────────────────────────────────────────────────
interface AuthenticatedAppProps {
  user:         User;
  handleLogout: () => Promise<void>;
}
const AuthenticatedApp = ({ user, handleLogout }: AuthenticatedAppProps) => {
  const { theme, resolvedTheme, toggleTheme } = useTheme();
  const { togglePrivacy }        = usePrivacy();
  const {
    currentPage, currentMonth, currentYear,
    activeModule, setActiveModule,
    handlePrevMonth, handleNextMonth,
  } = useNavigation();

  const [isSidebarCollapsed,     setIsSidebarCollapsed]     = useState(() => safeStorageGet('quantum_sidebar_collapsed', false));
  const [monthlyGoal,            setMonthlyGoal]            = useState(() => Number(safeStorageGet('quantum_monthly_goal', 0)));
  const [isMobileMenuOpen,       setIsMobileMenuOpen]       = useState(false);
  const [isCommandPaletteOpen,   setIsCommandPaletteOpen]   = useState(false);
  const [isCommanderMode,        setIsCommanderMode]        = useState(false);

  useEffect(() => safeStorageSet('quantum_sidebar_collapsed', isSidebarCollapsed), [isSidebarCollapsed]);
  useEffect(() => safeStorageSet('quantum_monthly_goal',      monthlyGoal),        [monthlyGoal]);

  const safeUID = user.uid;

  // Regras do usuário aplicadas em writes manuais; importação passa pelo LedgerService.
  const { asUserRules: userCategoryRules } = useCategoryRules(safeUID);
  const {
    transactions, loading, add, remove, removeBatch, update,
    bulkUpdateTransactions, isBulkUpdating,
    undoLastBulkUpdate, isUndoing, hasUndoSnapshot, clearBulkSnapshot,
  } = useTransactions(safeUID, userCategoryRules);
  const { accounts } = useAccounts(safeUID);
  const { recurringTasks } = useRecurring(safeUID);
  const { displayedTransactions, moduleBalances, categoryData, topExpensesData, allTransactions } =
    useFinancialData(transactions, activeModule, currentMonth, currentYear, accounts);

  const {
    isAIChatOpen, setIsAIChatOpen, isFormOpen, setIsFormOpen, isSettingsOpen, setIsSettingsOpen,
    transactionToEdit, setTransactionToEdit, transactionToDelete, setTransactionToDelete,
    handleImport, handleSaveTransaction, confirmDelete, handleBatchDelete,
  } = useAppLogic(user, update, add, remove, removeBatch);

  // setActiveModule é gerido pela Sidebar; não deve ser tocado pelo fluxo de edição
  void setActiveModule;

  const openEditTransaction = useCallback((tx: Transaction) => {
    setTransactionToEdit(tx);
    setIsFormOpen(true);
  }, [setTransactionToEdit, setIsFormOpen]);

  const handleCloseForm = useCallback(() => {
    setIsFormOpen(false);
    setTransactionToEdit(null);
  }, [setIsFormOpen, setTransactionToEdit]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key?.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommanderMode(true);
        setIsCommandPaletteOpen(true);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key?.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommanderMode(false);
        setIsCommandPaletteOpen(prev => !prev);
        return;
      }
      const target = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA'].includes(target.tagName)) return;
      if (e.altKey && e.key?.toLowerCase() === 'p') { e.preventDefault(); togglePrivacy(); }
      if (e.altKey && e.key?.toLowerCase() === 'n') { e.preventDefault(); setIsFormOpen(true); }
      if (e.key === 'Escape') {
        setIsCommandPaletteOpen(false);
        setIsCommanderMode(false);
        setIsFormOpen(false);
        setIsAIChatOpen(false);
        setTransactionToDelete(null);
        setIsMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePrivacy, setIsFormOpen, setIsAIChatOpen, setTransactionToDelete]);

  return (
    <div className="flex h-screen overflow-hidden font-sans transition-colors duration-500 relative">
      <Toaster position="bottom-right" />
      <ConfirmDeleteModal
        transaction={transactionToDelete}
        onCancel={() => setTransactionToDelete(null)}
        onConfirm={confirmDelete}
      />
      <QuantumBackground />

      <div className="relative z-10 flex w-full h-full pointer-events-none">
        <div className="pointer-events-auto">
          <Sidebar
            user={user}
            isMobileMenuOpen={isMobileMenuOpen}
            setIsMobileMenuOpen={setIsMobileMenuOpen}
            isSidebarCollapsed={isSidebarCollapsed}
            setIsSettingsOpen={setIsSettingsOpen}
            handleLogout={handleLogout}
          />
        </div>

        <div className="flex-1 flex flex-col w-full overflow-hidden pointer-events-auto bg-quantum-bg/80 backdrop-blur-sm">
          <Header
            currentPage={currentPage}
            currentMonth={currentMonth}
            currentYear={currentYear}
            handlePrevMonth={handlePrevMonth}
            handleNextMonth={handleNextMonth}
            nomeMeses={MESES_DO_ANO as unknown as string[]}
            theme={theme}
            resolvedTheme={resolvedTheme}
            toggleTheme={toggleTheme}
            isSidebarCollapsed={isSidebarCollapsed}
            setIsSidebarCollapsed={setIsSidebarCollapsed}
            setIsMobileMenuOpen={setIsMobileMenuOpen}
            isFormOpen={isFormOpen}
            setIsFormOpen={setIsFormOpen}
            user={user}
            transactions={transactions}
            handleImport={handleImport}
            userRules={userCategoryRules}
            onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
          />

          <main className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6 lg:p-12">
            <ErrorBoundary>
              <Suspense fallback={<QuantumLoader />}>
                {currentPage === 'dashboard' && (
                  <DashboardContent
                    user={user}
                    transactions={displayedTransactions}
                    allTransactions={allTransactions}
                    loading={loading}
                    moduleBalances={moduleBalances}
                    categoryData={categoryData}
                    topExpensesData={topExpensesData}
                    monthlyGoal={monthlyGoal}
                    setMonthlyGoal={setMonthlyGoal}
                    onSaveTransaction={handleSaveTransaction}
                    onEditTransaction={openEditTransaction}
                    onDeleteRequest={setTransactionToDelete}
                    onBatchDelete={handleBatchDelete}
                    isFormOpen={isFormOpen}
                    setIsFormOpen={setIsFormOpen}
                    transactionToEdit={transactionToEdit}
                    setTransactionToEdit={setTransactionToEdit}
                    onCloseForm={handleCloseForm}
                    accounts={accounts}
                    recurringTasks={recurringTasks}
                  />
                )}
                {currentPage === 'accounts'   && <AccountsManager   uid={safeUID} />}
                {currentPage === 'cards'      && <CreditCardManager uid={safeUID} transactions={allTransactions} />}
                {currentPage === 'recurring'  && <RecurringManager  uid={safeUID} />}
                {currentPage === 'quantum'    && (
                  <QuantumAIPage
                    transactions={displayedTransactions}
                    allTransactions={allTransactions}
                    balances={moduleBalances}
                    currentMonth={currentMonth}
                    currentYear={currentYear}
                  />
                )}
                {(currentPage === 'history' || currentPage === 'wallet') && (
                  <HistoryPage
                    transactions={displayedTransactions}
                    loading={loading}
                    onEdit={openEditTransaction}
                    onDeleteRequest={setTransactionToDelete}
                    onBatchDelete={handleBatchDelete}
                    onBatchImport={handleImport}
                    onBulkUpdate={bulkUpdateTransactions}
                    isBulkUpdating={isBulkUpdating}
                    undoLastBulkUpdate={undoLastBulkUpdate}
                    isUndoing={isUndoing}
                    hasUndoSnapshot={hasUndoSnapshot}
                    clearBulkSnapshot={clearBulkSnapshot}
                  />
                )}
                {currentPage === 'reports' && (
                  <ReportsContent
                    transactions={displayedTransactions}
                    accounts={accounts}
                  />
                )}
                {currentPage === 'simulation' && (
                  <SimulationCenter
                    transactions={displayedTransactions}
                    balances={moduleBalances}
                  />
                )}
              </Suspense>
            </ErrorBoundary>
          </main>
        </div>
      </div>

      <button
        onClick={() => setIsAIChatOpen(true)}
        className="fixed bottom-6 right-6 md:bottom-8 md:right-8 w-14 h-14 bg-cyan-600 hover:bg-cyan-500 rounded-2xl flex items-center justify-center shadow-lg z-50 group border border-white/20"
      >
        <BrainCircuit className="w-7 h-7 text-quantum-fg group-hover:animate-pulse" />
      </button>

      {isSettingsOpen && (
        <ErrorBoundary>
          <CategorySettings uid={safeUID} onClose={() => setIsSettingsOpen(false)} />
        </ErrorBoundary>
      )}
      <ErrorBoundary>
        <Suspense fallback={null}>
          <AIAssistantChat
            transactions={displayedTransactions}
            balances={moduleBalances}
            isOpen={isAIChatOpen}
            onClose={() => setIsAIChatOpen(false)}
          />
        </Suspense>
      </ErrorBoundary>
      <ErrorBoundary>
        <Suspense fallback={null}>
          <CommandPalette
            isOpen={isCommandPaletteOpen}
            onClose={() => { setIsCommandPaletteOpen(false); setIsCommanderMode(false); }}
            isCommanderMode={isCommanderMode}
          />
        </Suspense>
      </ErrorBoundary>
      {isFormOpen && (
        <TransactionForm
          uid={safeUID}
          onSave={handleSaveTransaction}
          editingTransaction={transactionToEdit}
          onCancelEdit={handleCloseForm}
        />
      )}
    </div>
  );
};

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [user,      setUser]      = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      if (typeof args[0] === 'string' && args[0].includes('The width(-1) and height(-1)')) return;
      originalWarn(...args);
    };
    return () => { console.warn = originalWarn; };
  }, []);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => { setUser(u); setAuthReady(true); });
  }, []);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      toast.success('Acesso Autorizado, Comandante!');
    } catch (error) {
      console.error('Falha na Autenticação:', error);
      const err = error as { code?: string };
      const msg = err.code === 'auth/popup-closed-by-user' ? 'Login cancelado.' : 'Falha ao autenticar.';
      toast.error(msg);
    }
  };

  const handleLogout = async () => {
    try { await signOut(auth); } catch { toast.error('Erro ao sair.'); }
  };

  if (!authReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-quantum-bg text-cyan-400 font-bold animate-pulse uppercase">
        A inicializar o Quantum Finance...
      </div>
    );
  }
  if (!user) return <LoginScreen onLogin={handleLogin} />;

  return (
    <NavigationProvider>
      <ErrorBoundary>
        <AuthenticatedApp user={user} handleLogout={handleLogout} />
      </ErrorBoundary>
    </NavigationProvider>
  );
}
