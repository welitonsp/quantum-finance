import { useEffect, useState, useMemo, useRef } from "react";
import { auth } from "./firebase";
import { onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { 
  ChevronLeft, ChevronRight, BrainCircuit, 
  Wallet, Plus, LogOut, LayoutDashboard, PieChart,
  Menu, Settings, CreditCard, Landmark, Activity,
  Sun, Moon
} from "lucide-react";
import toast, { Toaster } from 'react-hot-toast';

// IMPORT DO SEU NOVO CÉREBRO DE TEMA
import { useTheme } from "./contexts/ThemeContext";

// OS COMPONENTES FATIADOS
import LoginScreen from "./components/LoginScreen";
import DashboardCards from "./components/DashboardCards";
import DashboardCharts from "./components/DashboardCharts";
import BudgetProgress from "./components/BudgetProgress";
import TransactionsManager from "./components/TransactionsManager";
import ReportsDashboard from "./components/ReportsDashboard"; 
import AIAssistantChat from "./components/AIAssistantChat";

// OS COMPONENTES BASE
import TransactionForm from "./components/TransactionForm";
import ImportButton from "./components/ImportButton";
import CategorySettings from "./components/CategorySettings";

// HOOKS E SERVIÇOS
import { useTransactions } from "./hooks/useTransactions";
import { FirestoreService } from "./services/FirestoreService"; 

export default function App() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  const { theme, toggleTheme } = useTheme();

  const [currentPage, setCurrentPage] = useState('dashboard');
  const [activeDashboardTab, setActiveDashboardTab] = useState('overview'); 
  const [isAIChatOpen, setIsAIChatOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeModule, setActiveModule] = useState('geral');
  const [transactionToEdit, setTransactionToEdit] = useState(null);

  // 1. PERSISTÊNCIA: Sidebar Colapsável
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('quantum_sidebar_collapsed');
    return saved !== null ? JSON.parse(saved) : false;
  });

  useEffect(() => {
    localStorage.setItem('quantum_sidebar_collapsed', JSON.stringify(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  // 2. PERSISTÊNCIA: Meta Mensal (Orçamento)
  const [monthlyGoal, setMonthlyGoal] = useState(() => {
    const saved = localStorage.getItem('quantum_monthly_goal');
    return saved !== null ? Number(saved) : 0;
  });

  useEffect(() => {
    localStorage.setItem('quantum_monthly_goal', monthlyGoal);
  }, [monthlyGoal]);

  const dataAtual = new Date();
  const [currentMonth, setCurrentMonth] = useState(dataAtual.getMonth() + 1);
  const [currentYear, setCurrentYear] = useState(dataAtual.getFullYear());

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      toast.success("Acesso Quântico Autorizado!");
    } catch (error) {
      toast.error("Falha ao autenticar credenciais.");
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    toast.success("Sessão encerrada com segurança.");
  };

  const { transactions, loading, add, remove, update } = useTransactions(user?.uid);

  const displayedTransactions = useMemo(() => {
    if (!transactions) return [];

    return transactions.filter(t => {
      // 3. CORREÇÃO DE LEGADO: Proteção para transações antigas sem 'account'
      const txAccount = t.account || 'conta_corrente';
      const isAccountMatch = activeModule === 'geral' || txAccount === activeModule;
      if (!isAccountMatch) return false;

      if (t.month !== undefined && t.year !== undefined) {
        return Number(t.month) === currentMonth && Number(t.year) === currentYear;
      }

      const rawDate = t.createdAt || t.date || t.data || null;
      if (!rawDate) return false;

      let txDate;
      if (rawDate.toDate) {
        txDate = rawDate.toDate(); 
      } else if (typeof rawDate === 'string') {
        if (rawDate.includes('T')) {
          txDate = new Date(rawDate);
        } else {
          const [y, m, d] = rawDate.split('T')[0].split('-');
          txDate = new Date(Number(y), Number(m) - 1, Number(d) || 1);
        }
      } else {
        txDate = new Date(rawDate); 
      }

      if (isNaN(txDate.getTime())) return false;

      const isMonthMatch = (txDate.getMonth() + 1) === currentMonth;
      const isYearMatch = txDate.getFullYear() === currentYear;

      return isMonthMatch && isYearMatch;
    });
  }, [transactions, activeModule, currentMonth, currentYear]);

  // ========== NOTIFICAÇÃO DE GASTO ATÍPICO ==========
  const formatCurrency = (value) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const notifiedLargeTxRef = useRef(new Set());

  useEffect(() => {
    if (!displayedTransactions.length) return;
    
    const largeExpenses = displayedTransactions.filter(tx => 
      tx.type === 'saida' && 
      Math.abs(Number(tx.value)) > 1000 &&
      !notifiedLargeTxRef.current.has(tx.id)
    );
    
    largeExpenses.forEach(tx => {
      toast.custom((t) => (
        <div className={`${t.visible ? 'animate-in fade-in slide-in-from-top-2' : 'animate-out fade-out slide-out-to-top-2'} max-w-md w-full bg-white dark:bg-slate-800 shadow-2xl rounded-2xl pointer-events-auto flex ring-1 ring-orange-500/50`}>
          <div className="flex-1 p-4">
            <div className="flex items-start">
              <div className="flex-shrink-0 pt-0.5">
                <div className="w-8 h-8 rounded-full bg-orange-100 dark:bg-orange-500/20 flex items-center justify-center border border-orange-200 dark:border-orange-500/30">
                  <span className="text-orange-500 dark:text-orange-400 text-lg">💸</span>
                </div>
              </div>
              <div className="ml-3 flex-1">
                <p className="text-sm font-bold text-slate-800 dark:text-white uppercase tracking-wider">Gasto Atípico Detectado</p>
                <p className="text-xs text-slate-500 dark:text-slate-300 mt-1 font-bold">
                  {tx.description || tx.category || 'Transação'} – <span className="text-orange-600 dark:text-orange-400">{formatCurrency(Math.abs(Number(tx.value)))}</span>
                </p>
                <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-widest">Revise este volume para manter o controle.</p>
              </div>
            </div>
          </div>
          <div className="flex border-l border-slate-100 dark:border-white/5">
            <button onClick={() => toast.dismiss(t.id)} className="w-full border border-transparent rounded-none rounded-r-2xl p-4 flex items-center justify-center text-xs font-bold uppercase tracking-widest text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
              Fechar
            </button>
          </div>
        </div>
      ), { duration: 8000 });
      
      notifiedLargeTxRef.current.add(tx.id);
    });
  }, [displayedTransactions]);

  const moduleBalances = displayedTransactions.reduce((acc, tx) => {
    if (tx.type === 'entrada') acc.entradas += Number(tx.value);
    if (tx.type === 'saida') acc.saidas += Number(tx.value);
    return acc;
  }, { entradas: 0, saidas: 0, saldoAtual: 0 });
  
  moduleBalances.saldoAtual = moduleBalances.entradas - moduleBalances.saidas;

  const categoryMap = {};
  displayedTransactions.forEach(tx => {
    if (tx.type === 'saida') {
      const cat = tx.category || 'Diversos';
      categoryMap[cat] = (categoryMap[cat] || 0) + Math.abs(Number(tx.value));
    }
  });

  const colors = ['#ef4444', '#06b6d4', '#a855f7', '#f59e0b', '#10b981', '#3b82f6'];
  const categoryData = Object.keys(categoryMap).map((key, index) => ({
    name: key,
    value: categoryMap[key],
    color: colors[index % colors.length]
  })).sort((a, b) => b.value - a.value);

  const topExpensesData = categoryData.slice(0, 4);

  const handlePrevMonth = () => {
    if (currentMonth === 1) { setCurrentMonth(12); setCurrentYear(y => y - 1); } 
    else { setCurrentMonth(m => m - 1); }
  };

  const handleNextMonth = () => {
    if (currentMonth === 12) { setCurrentMonth(1); setCurrentYear(y => y + 1); } 
    else { setCurrentMonth(m => m + 1); }
  };

  const handleImport = async (transacoesImportadas) => {
    if (user?.uid) await FirestoreService.saveAllTransactions(user.uid, transacoesImportadas);
  };

  const handleSaveTransaction = async (data) => {
    const finalData = { ...data, account: activeModule === 'geral' ? 'conta_corrente' : activeModule };
    if (transactionToEdit) {
      await update(transactionToEdit.id, finalData);
      setTransactionToEdit(null);
      toast.success("Movimentação atualizada!");
    } else {
      await add(finalData);
      toast.success("Movimentação adicionada!");
    }
    setIsFormOpen(false);
  };

  // 4. PROTEÇÃO UX: Confirmação antes de eliminar
  const handleDelete = async (id) => {
    if (window.confirm("Aviso de Segurança: Tem a certeza que deseja eliminar esta movimentação permanentemente?")) {
      await remove(id);
      toast.success("Movimentação eliminada com sucesso.");
    }
  };

  const nomeMeses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

  if (!authReady) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950 text-indigo-600 dark:text-cyan-500 font-bold tracking-widest animate-pulse uppercase">A ligar Motor Quântico...</div>;
  }

  if (!user) return <LoginScreen onLogin={handleLogin} />;

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 overflow-hidden font-sans selection:bg-cyan-500/30 transition-colors duration-500">
      <Toaster position="bottom-right" toastOptions={{ style: { background: theme === 'dark' ? '#1e293b' : '#fff', color: theme === 'dark' ? '#fff' : '#0f172a', borderRadius: '12px', border: theme === 'dark' ? 'none' : '1px solid #e2e8f0' } }} />

      <div className="fixed inset-0 opacity-10 dark:opacity-30 pointer-events-none z-0 transition-opacity duration-500">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl animate-float"></div>
        <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-cyan-500/10 rounded-full blur-3xl animate-float" style={{ animationDelay: '1s' }}></div>
      </div>

      {isMobileMenuOpen && (
        <div className="fixed inset-0 bg-slate-900/40 dark:bg-slate-950/80 backdrop-blur-sm z-40 lg:hidden" onClick={() => setIsMobileMenuOpen(false)}></div>
      )}
      
      <aside className={`fixed lg:static inset-y-0 left-0 z-50 bg-white/80 dark:bg-slate-950/80 backdrop-blur-2xl border-r border-slate-200 dark:border-white/5 flex flex-col transition-all duration-300 ease-in-out ${isMobileMenuOpen ? 'translate-x-0 w-72' : '-translate-x-full lg:translate-x-0'} ${isSidebarCollapsed ? 'lg:w-20' : 'lg:w-72'}`}>
        
        <div className={`h-24 flex items-center ${isSidebarCollapsed ? 'justify-center px-0' : 'justify-start px-8'} gap-4 border-b border-slate-200 dark:border-white/5 transition-all duration-300`}>
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-indigo-500/20 flex-shrink-0">
            <Wallet className="w-6 h-6 text-white" />
          </div>
          {!isSidebarCollapsed && (
            <div className="animate-in fade-in duration-300 whitespace-nowrap overflow-hidden">
              <h1 className="text-xl font-black text-slate-800 dark:text-white tracking-wide uppercase leading-tight">Quantum<br/><span className="text-indigo-600 dark:text-cyan-400">Finance</span></h1>
            </div>
          )}
        </div>

        <nav className="flex-1 py-8 space-y-2 overflow-y-auto custom-scrollbar overflow-x-hidden">
          
          <div className="px-4">
            {!isSidebarCollapsed ? (
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4 animate-in fade-in">Menu Principal</p>
            ) : (
              <div className="w-full h-px bg-slate-200 dark:bg-white/10 my-4"></div>
            )}
            
            <button onClick={() => { setCurrentPage('dashboard'); setIsMobileMenuOpen(false); }} title="Painel Central" className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center px-0' : 'justify-start px-4 gap-4'} py-3.5 rounded-xl font-bold transition-all ${currentPage === 'dashboard' ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-500/20 shadow-inner' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white'}`}>
              <LayoutDashboard className="w-5 h-5 flex-shrink-0" />
              {!isSidebarCollapsed && <span className="animate-in fade-in duration-300 whitespace-nowrap">Painel Central</span>}
            </button>
            
            <button onClick={() => { setCurrentPage('reports'); setIsMobileMenuOpen(false); }} title="Relatórios Analíticos" className={`mt-2 w-full flex items-center ${isSidebarCollapsed ? 'justify-center px-0' : 'justify-start px-4 gap-4'} py-3.5 rounded-xl font-bold transition-all ${currentPage === 'reports' ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-500/20 shadow-inner' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white'}`}>
              <PieChart className="w-5 h-5 flex-shrink-0" />
              {!isSidebarCollapsed && <span className="animate-in fade-in duration-300 whitespace-nowrap">Relatórios</span>}
            </button>
          </div>

          <div className="px-4 mt-8">
            {!isSidebarCollapsed ? (
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4 animate-in fade-in">Inteligência & Regras</p>
            ) : (
              <div className="w-full h-px bg-slate-200 dark:bg-white/10 my-6"></div>
            )}
            
            <button onClick={() => { setIsSettingsOpen(true); setIsMobileMenuOpen(false); }} title="Motor de Automação" className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center px-0' : 'justify-start px-4 gap-4'} py-3.5 rounded-xl font-bold text-slate-500 dark:text-slate-400 hover:bg-indigo-50 dark:hover:bg-cyan-500/10 hover:text-indigo-600 dark:hover:text-cyan-400 transition-all`}>
              <Settings className="w-5 h-5 flex-shrink-0" />
              {!isSidebarCollapsed && <span className="animate-in fade-in duration-300 whitespace-nowrap">Motor de Automação</span>}
            </button>
          </div>
        </nav>

        <div className="p-4 border-t border-slate-200 dark:border-white/5">
          <div className={`flex items-center ${isSidebarCollapsed ? 'justify-center flex-col gap-3' : 'justify-between'} bg-slate-50 dark:bg-slate-900/50 p-2 rounded-2xl border border-slate-200 dark:border-white/5 transition-all`}>
            
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold border border-indigo-200 dark:border-indigo-500/30 flex-shrink-0" title={user?.displayName}>
                {user?.email?.charAt(0).toUpperCase() || 'U'}
              </div>
              {!isSidebarCollapsed && (
                <div className="truncate animate-in fade-in duration-300">
                  <p className="text-sm font-bold text-slate-800 dark:text-white truncate">{user?.displayName || 'Usuário'}</p>
                  <p className="text-xs text-slate-500 truncate">Sessão Ativa</p>
                </div>
              )}
            </div>

            {!isSidebarCollapsed ? (
              <button onClick={handleLogout} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-all flex-shrink-0" title="Sair do Sistema">
                <LogOut className="w-5 h-5" />
              </button>
            ) : (
              <button onClick={handleLogout} className="w-full flex justify-center p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-all" title="Sair do Sistema">
                <LogOut className="w-5 h-5" />
              </button>
            )}

          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col relative z-10 w-full overflow-hidden transition-all duration-300">
        
        <header className="h-24 border-b border-slate-200 dark:border-white/5 bg-white/50 dark:bg-slate-950/30 backdrop-blur-md flex items-center justify-between px-4 lg:px-8 flex-shrink-0 transition-all">
          
          <div className="flex items-center gap-4">
            <button onClick={() => setIsMobileMenuOpen(true)} className="lg:hidden p-2 bg-slate-100 dark:bg-white/5 rounded-xl text-slate-800 dark:text-white">
              <Menu className="w-6 h-6" />
            </button>
            
            <button 
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)} 
              className="hidden lg:flex p-2 bg-slate-100 dark:bg-slate-900/50 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white border border-slate-200 dark:border-white/5 transition-colors"
              title={isSidebarCollapsed ? "Expandir Menu" : "Recolher Menu"}
            >
              <Menu className="w-5 h-5" />
            </button>

            <h2 className="text-xl md:text-2xl font-black text-slate-800 dark:text-white tracking-wide hidden sm:block">
              {currentPage === 'dashboard' ? 'Painel Central' : 'Relatórios Analíticos'}
            </h2>
          </div>

          <div className="flex items-center gap-1 md:gap-2 bg-white dark:bg-slate-900/80 p-1.5 rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm dark:shadow-inner">
             <button onClick={handlePrevMonth} className="p-2 hover:bg-slate-100 dark:hover:bg-white/10 rounded-xl text-slate-500 dark:text-slate-300 transition-colors"><ChevronLeft className="w-4 md:w-5 h-4 md:h-5" /></button>
             <div className="flex flex-col items-center justify-center w-28 md:w-40">
               <span className="text-xs md:text-sm font-bold text-slate-800 dark:text-white uppercase tracking-wider">{nomeMeses[currentMonth - 1]}</span>
               <span className="text-[10px] md:text-xs font-mono text-indigo-600 dark:text-cyan-400">{currentYear}</span>
             </div>
             <button onClick={handleNextMonth} className="p-2 hover:bg-slate-100 dark:hover:bg-white/10 rounded-xl text-slate-500 dark:text-slate-300 transition-colors"><ChevronRight className="w-4 md:w-5 h-4 md:h-5" /></button>
          </div>

          <div className="flex items-center gap-2 md:gap-4">
            
            <button 
              onClick={toggleTheme} 
              className="p-3 bg-white dark:bg-slate-900/50 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-cyan-400 border border-slate-200 dark:border-white/5 transition-all shadow-sm"
              title={theme === 'dark' ? 'Ativar Modo Claro' : 'Ativar Modo Escuro'}
            >
              {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>

            {currentPage === 'dashboard' && (
              <>
                <div className="hidden xl:block">
                  <ImportButton onImportTransactions={handleImport} uid={user?.uid} existingTransactions={transactions} />
                </div>
                <button 
                  onClick={() => setIsFormOpen(!isFormOpen)} 
                  className="px-4 py-2.5 md:px-6 md:py-3.5 bg-gradient-to-r from-indigo-600 to-cyan-500 text-white rounded-2xl flex items-center text-xs md:text-sm font-bold shadow-lg shadow-indigo-500/25 hover:shadow-cyan-500/40 hover:scale-105 active:scale-95 transition-all"
                >
                  <Plus className="w-4 h-4 md:w-5 md:h-5 md:mr-2" /> <span className="hidden md:inline">Nova Transação</span>
                </button>
              </>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="w-full max-w-[1600px] mx-auto p-4 md:p-6 lg:p-12 transition-all duration-300">
            
            {currentPage === 'dashboard' ? (
              <div className="space-y-6 md:space-y-8 animate-in fade-in duration-500">
                
                {isFormOpen && (
                  <div className="p-4 md:p-8 bg-white dark:bg-slate-900/40 border-dashed border-2 border-indigo-200 dark:border-cyan-500/30 rounded-3xl animate-in slide-in-from-top-4 shadow-xl">
                    <TransactionForm onSave={handleSaveTransaction} editingTransaction={transactionToEdit} onCancelEdit={() => { setTransactionToEdit(null); setIsFormOpen(false); }} />
                  </div>
                )}

                <div className="flex flex-wrap gap-2 md:gap-3 bg-white dark:bg-slate-900/50 p-2 rounded-2xl border border-slate-200 dark:border-white/5 w-fit shadow-sm">
                  <button onClick={() => setActiveModule('geral')} className={`flex items-center gap-2 px-4 py-2 md:px-6 md:py-3 text-xs md:text-sm font-bold rounded-xl transition-all ${activeModule === 'geral' ? 'bg-slate-800 text-white shadow-md' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}><Activity className="w-4 h-4"/> Visão Geral</button>
                  <button onClick={() => setActiveModule('conta_corrente')} className={`flex items-center gap-2 px-4 py-2 md:px-6 md:py-3 text-xs md:text-sm font-bold rounded-xl transition-all ${activeModule === 'conta_corrente' ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 shadow-md' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}><Landmark className="w-4 h-4"/> Conta Corrente</button>
                  <button onClick={() => setActiveModule('cartao_credito')} className={`flex items-center gap-2 px-4 py-2 md:px-6 md:py-3 text-xs md:text-sm font-bold rounded-xl transition-all ${activeModule === 'cartao_credito' ? 'bg-orange-100 dark:bg-orange-500/20 text-orange-700 dark:text-orange-400 shadow-md' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}><CreditCard className="w-4 h-4"/> Cartão de Crédito</button>
                </div>

                <div className="flex gap-4 md:gap-8 border-b border-slate-200 dark:border-white/10 mt-4 overflow-x-auto custom-scrollbar">
                  <button onClick={() => setActiveDashboardTab('overview')} className={`pb-4 text-sm md:text-base font-bold tracking-widest uppercase transition-all border-b-2 whitespace-nowrap ${activeDashboardTab === 'overview' ? 'border-indigo-600 dark:border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}>Dashboard Analítico</button>
                  <button onClick={() => setActiveDashboardTab('transactions')} className={`pb-4 text-sm md:text-base font-bold tracking-widest uppercase transition-all border-b-2 whitespace-nowrap ${activeDashboardTab === 'transactions' ? 'border-cyan-600 dark:border-cyan-500 text-cyan-600 dark:text-cyan-400' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}>Livro Razão (Busca)</button>
                </div>

                {activeDashboardTab === 'overview' ? (
                  <div className="space-y-6 md:space-y-8 animate-in fade-in slide-in-from-bottom-4">
                    <DashboardCards balances={moduleBalances} />
                    <div className="mt-4 md:mt-8 mb-4 md:mb-8">
                      <BudgetProgress totalExpenses={moduleBalances.saidas} monthlyGoal={monthlyGoal} onSetGoal={() => {
                          const newGoal = prompt("Defina o Teto Mensal de Gastos (Ex: 3500):", monthlyGoal || "");
                          if (newGoal && !isNaN(newGoal)) setMonthlyGoal(Number(newGoal));
                        }}
                      />
                    </div>
                    <DashboardCharts categoryData={categoryData} topExpensesData={topExpensesData} />
                  </div>
                ) : (
                  <div className="animate-in fade-in slide-in-from-bottom-4 h-[600px] md:h-[700px]">
                    <TransactionsManager transactions={displayedTransactions} loading={loading} onEdit={(tx) => { setTransactionToEdit(tx); setIsFormOpen(true); }} onDelete={handleDelete} />
                  </div>
                )}
              </div>
            ) : (
              <div className="w-full animate-in fade-in slide-in-from-bottom-4">
                <ReportsDashboard transactions={displayedTransactions} balances={moduleBalances} />
              </div>
            )}

          </div>
        </main>
      </div>
      
      {isSettingsOpen && <CategorySettings uid={user?.uid} onClose={() => setIsSettingsOpen(false)} />}
      
      {user && (
        <button
          onClick={() => setIsAIChatOpen(true)}
          className="fixed bottom-6 right-6 md:bottom-8 md:right-8 w-14 h-14 md:w-16 md:h-16 bg-gradient-to-br from-indigo-500 to-cyan-500 rounded-2xl flex items-center justify-center shadow-2xl shadow-indigo-500/50 hover:scale-110 active:scale-95 transition-all z-50 group border border-white/20"
          title="Quantum Assistant"
        >
          <BrainCircuit className="w-7 h-7 md:w-8 md:h-8 text-white group-hover:animate-pulse" />
        </button>
      )}

      <AIAssistantChat transactions={displayedTransactions} balances={moduleBalances} isOpen={isAIChatOpen} onClose={() => setIsAIChatOpen(false)} />
    </div>
  );
}