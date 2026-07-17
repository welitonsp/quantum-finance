import { useEffect, useRef, useState, lazy, Suspense, useCallback } from 'react';
import { auth } from './shared/api/firebase/index';
import { onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut, signInAnonymously } from 'firebase/auth';
import type { MultiFactorError, User } from 'firebase/auth';
import { isMfaRequiredError, resolveTotpSignIn } from './shared/lib/mfa';
import { BrainCircuit, AlertTriangle, Loader2, X } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';

import { useTheme } from './contexts/ThemeContext';
import { usePrivacy } from './contexts/PrivacyContext';
import { NavigationProvider, useNavigation } from './contexts/NavigationContext';
import { useTransactions } from './hooks/useTransactions';
import { useFinancialData } from './hooks/useFinancialData';
import { useAccounts } from './hooks/useAccounts';
import { useRecurring } from './hooks/useRecurring';
import { useCategoryRules } from './hooks/useCategoryRules';
import { useCategories } from './hooks/useCategories';
import { useAppLogic } from './hooks/useAppLogic';
import { useCreditCards } from './hooks/useCreditCards';
import { useAiConsent } from './hooks/useAiConsent';
import { logSanitizedFirebaseError } from './shared/lib/firebaseErrorHandling';
import { toCentavos as toBalanceCents } from './shared/schemas/financialSchemas';
import type { Centavos } from './shared/types/money';

import Sidebar from './components/Sidebar';
import Header from './components/Header';
import { AppShell } from './shared/components/layout/AppShell';
import { MobileBottomNav } from './shared/components/layout/MobileBottomNav';
import { TopTabs } from './shared/components/layout/TopTabs';
import OfflineIndicator from './shared/components/OfflineIndicator';
import LoginScreen from './components/LoginScreen';
import QuantumBackground from './components/QuantumBackground';
import DashboardContent from './components/DashboardContent';
import TransactionForm from './features/transactions/TransactionForm';
import TransferForm from './features/transactions/TransferForm';
import { ConversationMemory } from './features/ai-chat/ConversationMemory';
import CategorySettings from './components/CategorySettings';
import { OnboardingWizard } from './components/onboarding/OnboardingWizard';
import { AiConsentGate } from './components/AiConsentGate';
import { ErrorBoundary } from './components/ErrorBoundary';
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
const PurchaseSimulator = lazy(() => import('./features/simulation/PurchaseSimulator'));
const DebtModule        = lazy(() => import('./features/debts/DebtModule'));
const ShoppingPage      = lazy(() => import('./features/shopping/ShoppingPage'));
const IRPage            = lazy(() => import('./features/ir/IRPage'));
const AntiTarifaPage    = lazy(() => import('./features/anti-tarifa/AntiTarifaPage'));
const SharedFinancePage = lazy(() => import('./features/shared-finance/SharedFinancePage'));
const TimelinePage      = lazy(() => import('./features/timeline/TimelinePage'));
const PlanningPage      = lazy(() => import('./features/planning/PlanningPage'));
const PatrimonioPage    = lazy(() => import('./features/patrimonio/PatrimonioPage'));
const CopilotPage       = lazy(() => import('./features/copilot/CopilotPage'));
const GovernancePage    = lazy(() => import('./features/governance/GovernancePage'));
const CalendarPage      = lazy(() => import('./features/calendar/CalendarPage'));

// ─── Quantum Loader ──────────────────────────────────────────────────────────
const QuantumLoader = () => (
  <div className="flex flex-col items-center justify-center h-64 gap-4">
    <Loader2 className="w-10 h-10 text-quantum-accent animate-spin" />
    <span className="text-xs text-quantum-fgMuted uppercase tracking-widest animate-pulse">Carregando módulo...</span>
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
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (transaction) cancelRef.current?.focus(); }, [transaction]);
  useEffect(() => {
    if (!transaction) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [transaction, onCancel]);
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
          <button ref={cancelRef} onClick={onCancel} className="px-5 py-2.5 rounded-xl font-bold text-quantum-fgMuted hover:text-quantum-fg hover:bg-white/5 transition-colors">Cancelar</button>
          <button onClick={onConfirm} className="px-5 py-2.5 rounded-xl font-bold bg-red-600 text-quantum-fg hover:bg-red-700 transition-colors shadow-lg shadow-red-500/20">Apagar</button>
        </div>
      </div>
    </div>
  );
};

// ─── Page → label do grupo da sidebar ─────────────────────────────────────────
// Cada página herda o rótulo do seu grupo de navegação; usado no fallback do
// ErrorBoundary de conteúdo ("Anomalia em {label}").
const PAGE_GROUP_LABELS: Record<string, string> = {
  history: 'Movimentações', accounts: 'Movimentações', cards: 'Movimentações', recurring: 'Movimentações',
  copilot: 'IA', quantum: 'IA', 'anti-tarifa': 'IA',
  reports: 'Análises', timeline: 'Análises', calendar: 'Análises', ir: 'Análises',
  planning: 'Planejamento', debts: 'Planejamento', simulation: 'Planejamento', 'purchase-simulator': 'Planejamento',
  cofre: 'Governança', 'shared-finance': 'Governança',
  shopping: 'Compras',
};
function pageGroupLabel(page: string): string {
  return PAGE_GROUP_LABELS[page] ?? 'Hoje';
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
    currentPage, setCurrentPage, currentMonth, currentYear,
    activeModule, setActiveModule,
    handlePrevMonth, handleNextMonth,
  } = useNavigation();

  const [isSidebarCollapsed,     setIsSidebarCollapsed]     = useState(() => safeStorageGet('quantum_sidebar_collapsed', false));
  const [monthlyGoal,            setMonthlyGoal]            = useState(() => Number(safeStorageGet('quantum_monthly_goal', 0)));
  const [isMobileMenuOpen,       setIsMobileMenuOpen]       = useState(false);
  const [isCommandPaletteOpen,   setIsCommandPaletteOpen]   = useState(false);
  const [isCommanderMode,        setIsCommanderMode]        = useState(false);
  const [onboardingDismissed,    setOnboardingDismissed]    = useState(() => safeStorageGet('quantum_onboarding_dismissed', false));

  useEffect(() => safeStorageSet('quantum_sidebar_collapsed', isSidebarCollapsed), [isSidebarCollapsed]);
  useEffect(() => safeStorageSet('quantum_monthly_goal',      monthlyGoal),        [monthlyGoal]);
  useEffect(() => safeStorageSet('quantum_onboarding_dismissed', onboardingDismissed), [onboardingDismissed]);

  const safeUID = user.uid;

  // Regras do usuário aplicadas em writes manuais; importação passa pelo LedgerService.
  const { asUserRules: userCategoryRules } = useCategoryRules(safeUID);
  const { categories } = useCategories(safeUID);
  const [serverSearchTerm, setServerSearchTerm] = useState('');
  const [serverCategoryFilter, setServerCategoryFilter] = useState('');
  const serverSearch = serverSearchTerm.trim().length >= 2
    ? { term: serverSearchTerm }
    : serverCategoryFilter.trim().length > 0
      ? { category: serverCategoryFilter }
      : undefined;
  const {
    transactions, loading, add, remove, removeBatch, update,
    bulkUpdateTransactions, isBulkUpdating,
    undoLastBulkUpdate, isUndoing, hasUndoSnapshot, clearBulkSnapshot,
    hasMoreTransactions, isLoadingMore, loadedCount, loadMoreTransactions,
  } = useTransactions(safeUID, userCategoryRules, undefined, serverSearch);
  const { accounts, loadingAccounts } = useAccounts(safeUID);
  const { recurringTasks } = useRecurring(safeUID);
  // Espelho realtime do consentimento de IA (gate real é server-trusted, fail-closed).
  const { aiGranted: aiConsentGranted, loading: aiConsentLoading } = useAiConsent(safeUID);
  // totalFaturaCents: faturas abertas de cartões — passivo corrente para o net worth
  const { totalFaturaCents, cards: creditCards } = useCreditCards(safeUID, transactions);
  const { displayedTransactions, moduleBalances, categoryData, topExpensesData, allTransactions } =
    useFinancialData(transactions, activeModule, currentMonth, currentYear, accounts, categories, totalFaturaCents);

  // Onboarding — condição sempre derivada do estado real (nunca um "passo" artificial):
  // some sozinho assim que o usuário tiver 1+ conta ou 1+ transação. "Pular" só evita
  // reaparecer enquanto ambos continuam vazios. Aguarda os 2 primeiros snapshots
  // (loading/loadingAccounts) para não piscar o wizard antes dos dados carregarem.
  const showOnboarding = !onboardingDismissed && !loading && !loadingAccounts
    && accounts.length === 0 && transactions.length === 0;

  const [isTransferFormOpen,    setIsTransferFormOpen]    = useState(false);
  const [transferInitialValues, setTransferInitialValues] = useState<import('./features/transactions/TransferForm').TransferInitialValues>({});

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
      <OfflineIndicator />
      <ConfirmDeleteModal
        transaction={transactionToDelete}
        onCancel={() => setTransactionToDelete(null)}
        onConfirm={confirmDelete}
      />
      {showOnboarding && (
        <OnboardingWizard
          onCreateAccount={() => { setCurrentPage('accounts'); setOnboardingDismissed(true); }}
          onCreateTransaction={() => { setIsFormOpen(true); setOnboardingDismissed(true); }}
          onDismiss={() => setOnboardingDismissed(true)}
        />
      )}
      <QuantumBackground />

      <AppShell
        sidebar={
          <Sidebar
            user={user}
            isMobileMenuOpen={isMobileMenuOpen}
            setIsMobileMenuOpen={setIsMobileMenuOpen}
            isSidebarCollapsed={isSidebarCollapsed}
            setIsSettingsOpen={setIsSettingsOpen}
            handleLogout={handleLogout}
            onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
          />
        }
        header={
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
            onOpenTransferForm={() => setIsTransferFormOpen(true)}
            user={user}
            transactions={transactions}
            handleImport={handleImport}
            userRules={userCategoryRules}
            onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
          />
        }
        bottomNav={
          <MobileBottomNav
            currentPage={currentPage}
            onNavigate={setCurrentPage}
            onOpenMenu={() => setIsMobileMenuOpen(true)}
          />
        }
      >
        <ErrorBoundary label={pageGroupLabel(currentPage)} resetKey={currentPage}>
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
                    categories={categories}
                    creditCards={creditCards}
                    totalFaturaCents={totalFaturaCents}
                  />
                )}
                {(['history', 'accounts', 'cards', 'recurring'] as const).some(t => t === currentPage) && (
                  <>
                    <TopTabs
                      tabs={[
                        { id: 'history',   label: 'Movimentações' },
                        { id: 'accounts',  label: 'Contas'        },
                        { id: 'cards',     label: 'Cartões'       },
                        { id: 'recurring', label: 'Despesas Fixas' },
                      ]}
                      activeTab={currentPage}
                      onTabChange={setCurrentPage}
                    />
                    {currentPage === 'accounts'  && <AccountsManager uid={safeUID} />}
                    {currentPage === 'cards'     && (
                      <CreditCardManager
                        uid={safeUID}
                        transactions={allTransactions}
                        accounts={accounts}
                      />
                    )}
                    {currentPage === 'recurring' && <RecurringManager uid={safeUID} />}
                    {currentPage === 'history'   && (
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
                        uid={safeUID}
                        categories={categories}
                        hasMoreTransactions={hasMoreTransactions}
                        isLoadingMore={isLoadingMore}
                        loadedCount={loadedCount}
                        loadMoreTransactions={loadMoreTransactions}
                        serverSearchTerm={serverSearchTerm}
                        onServerSearch={setServerSearchTerm}
                        serverCategoryFilter={serverCategoryFilter}
                        onServerCategoryFilter={setServerCategoryFilter}
                        onAddNew={() => setIsFormOpen(true)}
                      />
                    )}
                  </>
                )}
                {(['copilot', 'quantum', 'anti-tarifa'] as const).some(t => t === currentPage) && (
                  <>
                    <TopTabs
                      tabs={[
                        { id: 'copilot',     label: 'Copilot IA'        },
                        { id: 'quantum',     label: 'Quantum AI'         },
                        { id: 'anti-tarifa', label: 'Agente Anti-Tarifa' },
                      ]}
                      activeTab={currentPage}
                      onTabChange={setCurrentPage}
                    />
                    <AiConsentGate
                      aiGranted={aiConsentGranted}
                      loading={aiConsentLoading}
                      onOpenPrivacy={() => setCurrentPage('cofre')}
                    >
                      {currentPage === 'copilot'     && <CopilotPage uid={safeUID} />}
                      {currentPage === 'quantum'     && (
                        <QuantumAIPage
                          transactions={displayedTransactions}
                          allTransactions={allTransactions}
                          balances={moduleBalances}
                          currentMonth={currentMonth}
                          currentYear={currentYear}
                        />
                      )}
                      {currentPage === 'anti-tarifa' && <AntiTarifaPage uid={safeUID} />}
                    </AiConsentGate>
                  </>
                )}
                {(['reports', 'timeline', 'calendar', 'ir'] as const).some(t => t === currentPage) && (
                  <>
                    <TopTabs
                      tabs={[
                        { id: 'reports',  label: 'BI & Relatórios'      },
                        { id: 'timeline', label: 'Timeline Financeira'   },
                        { id: 'calendar', label: 'Calendário Financeiro' },
                        { id: 'ir',       label: 'Módulo IR'             },
                      ]}
                      activeTab={currentPage}
                      onTabChange={setCurrentPage}
                    />
                    {currentPage === 'reports'  && (
                      <ReportsContent
                        transactions={displayedTransactions}
                        accounts={accounts}
                        categories={categories}
                      />
                    )}
                    {currentPage === 'timeline' && (
                      <TimelinePage
                        uid={safeUID}
                        currentBalanceCents={toBalanceCents(moduleBalances?.geral?.saldo ?? 0) as Centavos}
                      />
                    )}
                    {currentPage === 'calendar' && <CalendarPage uid={safeUID} />}
                    {currentPage === 'ir'       && <IRPage uid={safeUID} />}
                  </>
                )}
                {(['planning', 'debts', 'simulation', 'purchase-simulator'] as const).some(t => t === currentPage) && (
                  <>
                    <TopTabs
                      tabs={[
                        { id: 'planning',           label: 'Planejamento'          },
                        { id: 'debts',              label: 'Dívidas'               },
                        { id: 'simulation',         label: 'Simulação Monte Carlo' },
                        { id: 'purchase-simulator', label: 'Simulador de Compra'   },
                      ]}
                      activeTab={currentPage}
                      onTabChange={setCurrentPage}
                    />
                    {currentPage === 'planning'           && <PlanningPage uid={safeUID} />}
                    {currentPage === 'debts'              && <DebtModule uid={safeUID} />}
                    {currentPage === 'simulation'         && (
                      <SimulationCenter
                        transactions={displayedTransactions}
                        balances={moduleBalances}
                      />
                    )}
                    {currentPage === 'purchase-simulator' && (
                      <PurchaseSimulator
                        transactions={displayedTransactions}
                        balances={moduleBalances}
                        uid={safeUID}
                        creditCards={creditCards}
                        onRegisterPurchase={(prefill) => {
                          setTransactionToEdit(prefill as Transaction);
                          setIsFormOpen(true);
                        }}
                      />
                    )}
                  </>
                )}
                {currentPage === 'shopping'   && <ShoppingPage uid={safeUID} />}
                {currentPage === 'patrimonio' && <PatrimonioPage uid={safeUID} />}
                {(['cofre', 'shared-finance'] as const).some(t => t === currentPage) && (
                  <>
                    <TopTabs
                      tabs={[
                        { id: 'cofre',          label: 'Cofre & Governança'      },
                        { id: 'shared-finance', label: 'Finanças Compartilhadas' },
                      ]}
                      activeTab={currentPage}
                      onTabChange={setCurrentPage}
                    />
                    {currentPage === 'cofre'          && <GovernancePage uid={safeUID} />}
                    {currentPage === 'shared-finance' && (
                      <SharedFinancePage uid={safeUID} displayName={user?.displayName ?? 'Você'} />
                    )}
                  </>
                )}
          </Suspense>
        </ErrorBoundary>
      </AppShell>

      <button
        onClick={() => setIsAIChatOpen(true)}
        aria-label="Abrir assistente Quantum AI"
        data-testid="ai-chat-fab"
        className="fixed bottom-20 right-6 lg:bottom-8 lg:right-8 w-14 h-14 bg-cyan-600 hover:bg-cyan-500 rounded-2xl flex items-center justify-center shadow-lg z-50 group border border-white/20"
      >
        <BrainCircuit className="w-7 h-7 text-quantum-fg group-hover:animate-pulse" />
      </button>

      {isSettingsOpen && (
        <ErrorBoundary label="Configurações">
          <CategorySettings uid={safeUID} onClose={() => setIsSettingsOpen(false)} />
        </ErrorBoundary>
      )}
      {isAIChatOpen && !aiConsentLoading && !aiConsentGranted ? (
        <div className="fixed bottom-24 right-6 md:right-8 w-[90vw] md:w-[420px] z-50" role="dialog" aria-label="Consentimento de IA necessário">
          <button
            type="button"
            onClick={() => setIsAIChatOpen(false)}
            aria-label="Fechar aviso de consentimento"
            className="absolute top-3 right-3 z-10 p-1.5 rounded-full text-quantum-fgMuted hover:text-quantum-fg hover:bg-white/5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
          <AiConsentGate
            aiGranted={false}
            loading={false}
            onOpenPrivacy={() => { setIsAIChatOpen(false); setCurrentPage('cofre'); }}
          >
            <span />
          </AiConsentGate>
        </div>
      ) : (
        <ErrorBoundary label="Assistente IA">
          <Suspense fallback={null}>
            <AIAssistantChat
              uid={safeUID}
              transactions={displayedTransactions}
              balances={moduleBalances}
              accounts={accounts}
              recurringTasks={recurringTasks}
              isOpen={isAIChatOpen}
              onClose={() => setIsAIChatOpen(false)}
              onRegisterPurchase={(prefill) => {
                setTransactionToEdit(prefill as Transaction);
                setIsFormOpen(true);
                setIsAIChatOpen(false);
              }}
              // Movimentações/Dashboard derivam do listener realtime (`useTransactions`
              // → onSnapshot), então a escrita do agente já aparece automaticamente.
              // Hook explícito mantido para futura invalidação de caches não-realtime.
              onActionExecuted={() => {}}
            />
          </Suspense>
        </ErrorBoundary>
      )}
      <ErrorBoundary label="Busca ⌘K">
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
          creditCards={creditCards}
        />
      )}
      {isTransferFormOpen && (
        <TransferForm
          uid={safeUID}
          accounts={accounts}
          initialValues={transferInitialValues}
          onClose={() => { setIsTransferFormOpen(false); setTransferInitialValues({}); }}
        />
      )}
    </div>
  );
};

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [user,      setUser]      = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  // Sign-in interrompido por MFA (auth/multi-factor-auth-required): guarda o
  // erro original — o resolver TOTP precisa dele para concluir o login.
  const [mfaError,  setMfaError]  = useState<MultiFactorError | null>(null);

  useEffect(() => {
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      if (typeof args[0] === 'string' && args[0].includes('The width(-1) and height(-1)')) return;
      originalWarn(...args);
    };
    return () => { console.warn = originalWarn; };
  }, []);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
      // Em modo emulador (E2E), faz login anônimo automático para não bloquear nos testes
      if (!u && import.meta.env.VITE_USE_EMULATOR === 'true') {
        void signInAnonymously(auth);
      }
    });
  }, []);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      toast.success('Acesso Autorizado, Comandante!');
    } catch (error) {
      if (isMfaRequiredError(error)) {
        setMfaError(error);
        return;
      }
      logSanitizedFirebaseError('auth_login', error);
      const err = error as { code?: string };
      const msg = err.code === 'auth/popup-closed-by-user' ? 'Login cancelado.' : 'Falha ao autenticar.';
      toast.error(msg);
    }
  };

  // Conclui o login com o código TOTP; erro mantém o prompt aberto para nova tentativa.
  const handleMfaCode = async (code: string) => {
    if (!mfaError) return;
    try {
      await resolveTotpSignIn(auth, mfaError, code);
      setMfaError(null);
      toast.success('Acesso Autorizado, Comandante!');
    } catch (error) {
      logSanitizedFirebaseError('auth_mfa_resolve', error);
      toast.error('Código inválido ou expirado. Tente novamente.');
    }
  };

  const handleLogout = async () => {
    // Privacidade (F-10): descarta memória de conversa do chat ao sair.
    ConversationMemory.purgeAll();
    try { await signOut(auth); } catch { toast.error('Erro ao sair.'); }
  };

  if (!authReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-quantum-bg text-cyan-400 font-bold animate-pulse uppercase">
        A inicializar o Quantum Finance...
      </div>
    );
  }
  if (!user) {
    return (
      <LoginScreen
        onLogin={handleLogin}
        mfaPending={mfaError !== null}
        onSubmitMfaCode={handleMfaCode}
        onCancelMfa={() => setMfaError(null)}
      />
    );
  }

  return (
    <NavigationProvider>
      <ErrorBoundary label="Quantum Finance">
        <AuthenticatedApp user={user} handleLogout={handleLogout} />
      </ErrorBoundary>
    </NavigationProvider>
  );
}
