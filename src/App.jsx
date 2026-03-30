// src/App.jsx
import { useEffect, useState, useMemo, useRef } from "react";
import { auth } from "./firebase";
import { onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { 
  ChevronLeft, ChevronRight, BrainCircuit, 
  Wallet, Plus, LogOut, LayoutDashboard, PieChart,
  Menu, Settings, CreditCard, Landmark, Activity,
  Sun, Moon, AlertTriangle
} from "lucide-react";
import toast, { Toaster } from 'react-hot-toast';

import { useTheme } from "./contexts/ThemeContext";
import { usePrivacy } from "./contexts/PrivacyContext";

import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import LoginScreen from "./components/LoginScreen";
import DashboardCards from "./components/DashboardCards";
import DashboardCharts from "./components/DashboardCharts";
import BudgetProgress from "./components/BudgetProgress";
import TransactionsManager from "./components/TransactionsManager";
import ReportsDashboard from "./components/ReportsDashboard"; 
import AIAssistantChat from "./components/AIAssistantChat";
import TransactionForm from "./components/TransactionForm";
import ImportButton from "./components/ImportButton";
import CategorySettings from "./components/CategorySettings";

import { useTransactions } from "./hooks/useTransactions";
import { FirestoreService } from "./services/FirestoreService"; 

export default function App() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  const { theme, toggleTheme } = useTheme();
  const { togglePrivacy } = usePrivacy();

  const [currentPage, setCurrentPage] = useState('dashboard');
  const [activeDashboardTab, setActiveDashboardTab] = useState('overview'); 
  const [isAIChatOpen, setIsAIChatOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeModule, setActiveModule] = useState('geral');
  const [transactionToEdit, setTransactionToEdit] = useState(null);
  const [transactionToDelete, setTransactionToDelete] = useState(null);

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('quantum_sidebar_collapsed');
    return saved !== null ? JSON.parse(saved) : false;
  });

  useEffect(() => {
    localStorage.setItem('quantum_sidebar_collapsed', JSON.stringify(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

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
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.altKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        togglePrivacy();
        toast.success("Modo Privacidade Alternado!", { icon: '🔒', duration: 2000 });
      }
      if (e.altKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        setIsFormOpen(true);
      }
      if (e.key === 'Escape') {
        setIsFormOpen(false);
        setIsAIChatOpen(false);
        setTransactionToDelete(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePrivacy]);

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
      toast.success("Acesso Autorizado!");
    } catch (error) {
      toast.error("Falha ao autenticar credenciais.");
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    toast.success("Sessão encerrada com segurança.");
  };

  // ✅ Adicionado removeBatch
  const { transactions, loading, add, remove, removeBatch, update } = useTransactions(user?.uid);

  // ==========================================
  // FILTRO CORRIGIDO: A DATA DA COMPRA TEM PRIORIDADE
  // ==========================================
  const displayedTransactions = useMemo(() => {
    if (!transactions) return [];

    return transactions.filter(t => {
      const txAccount = t.account || 'conta_corrente';
      const isAccountMatch = activeModule === 'geral' || txAccount === activeModule;
      if (!isAccountMatch) return false;

      const rawDate = t.date || t.data || t.createdAt || null;
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

  const formatCurrency = (value) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
  const notifiedLargeTxRef = useRef(new Set());

  useEffect(() => {
    if (!displayedTransactions.length) return;
    const largeExpenses = displayedTransactions.filter(tx => tx.type === 'saida' && Math.abs(Number(tx.value)) > 1000 && !notifiedLargeTxRef.current.has(tx.id));
    
    largeExpenses.forEach(tx => {
      toast.custom((t) => (
        <div className={`${t.visible ? 'animate-in fade-in slide-in-from-top-2' : 'animate-out fade-out slide-out-to-top-2'} max-w-md w-full bg-white dark:bg-slate-800 shadow-2xl rounded-2xl pointer-events-auto flex ring-1 ring-orange-500/50`}>
          <div className="flex-1 p-4 flex items-start">
            <div className="w-8 h-8 rounded-full bg-orange-100 dark:bg-orange-500/20 flex items-center justify-center border border-orange-200 dark:border-orange-500/30"><span className="text-orange-500 dark:text-orange-400 text-lg">💸</span></div>
            <div className="ml-3 flex-1">
              <p className="text-sm font-bold text-slate-800 dark:text-white uppercase tracking-wider">Gasto Atípico</p>
              <p className="text-xs text-slate-500 dark:text-slate-300 mt-1 font-bold">{tx.description} – <span className="text-orange-600 dark:text-orange-400">{formatCurrency(Math.abs(Number(tx.value)))}</span></p>
            </div>
          </div>
          <button onClick={() => toast.dismiss(t.id)} className="border-l border-slate-100 dark:border-white/5 p-4 flex items-center justify-center text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-white transition-colors">Fechar</button>
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
  const categoryData = Object.keys(categoryMap).map((key, index) => ({ name: key, value: categoryMap[key], color: colors[index % colors.length] })).sort((a, b) => b.value - a.value);
  const topExpensesData = categoryData.slice(0, 4);

  const handlePrevMonth = () => currentMonth === 1 ? (setCurrentMonth(12), setCurrentYear(y => y - 1)) : setCurrentMonth(m => m - 1);
  const handleNextMonth = () => currentMonth === 12 ? (setCurrentMonth(1), setCurrentYear(y => y + 1)) : setCurrentMonth(m => m + 1);

  // ==========================================
  // AUTO-NAVEGAÇÃO INTELIGENTE E RETORNO DE DADOS
  // ==========================================
  const handleImport = async (transacoesImportadas) => {
    if (user?.uid && transacoesImportadas && transacoesImportadas.length > 0) {
      const result = await FirestoreService.saveAllTransactions(user.uid, transacoesImportadas);

      const monthCounts = {};
      let bestDate = null;
      let maxCount = 0;

      transacoesImportadas.forEach(tx => {
         const d = tx.date || tx.createdAt;
         if(d && typeof d === 'string') {
            const monthYear = d.substring(0, 7);
            monthCounts[monthYear] = (monthCounts[monthYear] || 0) + 1;
            if(monthCounts[monthYear] > maxCount) {
                maxCount = monthCounts[monthYear];
                bestDate = d;
            }
         }
      });

      if (bestDate) {
        const [y, m] = bestDate.split('-');
        setCurrentMonth(Number(m));
        setCurrentYear(Number(y));
      }

      if (transacoesImportadas[0].account) {
        setActiveModule(transacoesImportadas[0].account);
      }

      return result; 
    }
    
    return { added: 0, duplicates: 0 };
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

  const confirmDelete = async () => {
    if (transactionToDelete) {
      await remove(transactionToDelete.id);
      toast.success("Registo apagado para sempre.");
      setTransactionToDelete(null);
    }
  };

  // ==========================================
  // EXCLUSÃO EM LOTE
  // ==========================================
  const handleBatchDelete = async (ids) => {
    if (!ids.length) return;
    await removeBatch(ids);
    toast.success(`${ids.length} transações apagadas com sucesso.`);
  };

  const handleDeleteAll = async (ids) => {
    if (!ids.length) return;
    await removeBatch(ids);
    toast.success(`Todas as ${ids.length} transações foram removidas.`);
  };

  const nomeMeses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

  if (!authReady) return <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950 text-indigo-600 font-bold tracking-widest animate-pulse uppercase">A ligar Motor Quântico...</div>;
  if (!user) return <LoginScreen onLogin={handleLogin} />;

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 overflow-hidden font-sans selection:bg-cyan-500/30 transition-colors duration-500">
      <Toaster position="bottom-right" toastOptions={{ style: { background: theme === 'dark' ? '#1e293b' : '#fff', color: theme === 'dark' ? '#fff' : '#0f172a', borderRadius: '12px', border: theme === 'dark' ? 'none' : '1px solid #e2e8f0' } }} />

      {transactionToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-white/10 animate-in zoom-in-95">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400 rounded-2xl"><AlertTriangle className="w-6 h-6" /></div>
              <div>
                <h3 className="text-lg font-bold text-slate-800 dark:text-white">Apagar Registo?</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">Esta ação não pode ser desfeita.</p>
              </div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl mb-6 border border-slate-100 dark:border-white/5">
              <p className="text-sm font-bold text-slate-700 dark:text-slate-300 truncate">"{transactionToDelete.description}"</p>
              <p className="text-xs text-slate-500 mt-1">Valor: R$ {Number(transactionToDelete.value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setTransactionToDelete(null)} className="px-5 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-100 transition-colors">Cancelar</button>
              <button onClick={confirmDelete} className="px-5 py-2.5 rounded-xl font-bold bg-red-600 hover:bg-red-700 text-white transition-all">Sim, Apagar</button>
            </div>
          </div>
        </div>
      )}

      <div className="fixed inset-0 opacity-10 dark:opacity-30 pointer-events-none z-0 transition-opacity duration-500">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl animate-float"></div>
        <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-cyan-500/10 rounded-full blur-3xl animate-float" style={{ animationDelay: '1s' }}></div>
      </div>

      <Sidebar user={user} currentPage={currentPage} setCurrentPage={setCurrentPage} isMobileMenuOpen={isMobileMenuOpen} setIsMobileMenuOpen={setIsMobileMenuOpen} isSidebarCollapsed={isSidebarCollapsed} setIsSettingsOpen={setIsSettingsOpen} handleLogout={handleLogout} />

      <div className="flex-1 flex flex-col relative z-10 w-full overflow-hidden transition-all duration-300">
        <Header currentPage={currentPage} currentMonth={currentMonth} currentYear={currentYear} handlePrevMonth={handlePrevMonth} handleNextMonth={handleNextMonth} nomeMeses={nomeMeses} theme={theme} toggleTheme={toggleTheme} isSidebarCollapsed={isSidebarCollapsed} setIsSidebarCollapsed={setIsSidebarCollapsed} setIsMobileMenuOpen={setIsMobileMenuOpen} isFormOpen={isFormOpen} setIsFormOpen={setIsFormOpen} user={user} transactions={transactions} handleImport={handleImport} />

        <main className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="w-full max-w-[1600px] mx-auto p-4 md:p-6 lg:p-12 transition-all duration-300">
            {currentPage === 'dashboard' ? (
              <div className="space-y-6 md:space-y-8 animate-in fade-in duration-500">
                {isFormOpen && (
                  <div className="p-4 md:p-8 bg-white dark:bg-slate-900/40 border-dashed border-2 border-indigo-200 dark:border-cyan-500/30 rounded-3xl animate-in slide-in-from-top-4 shadow-xl">
                    <TransactionForm onSave={handleSaveTransaction} editingTransaction={transactionToEdit} onCancelEdit={() => { setTransactionToEdit(null); setIsFormOpen(false); }} />
                  </div>
                )}

                <div className="flex flex-wrap gap-2 md:gap-3 bg-white dark:bg-slate-900/50 p-2 rounded-2xl border border-slate-200 dark:border-white/5 w-fit shadow-sm dark:shadow-none">
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
                    <TransactionsManager 
                      transactions={displayedTransactions} 
                      loading={loading} 
                      onEdit={(tx) => { setTransactionToEdit(tx); setIsFormOpen(true); }} 
                      onDeleteRequest={(tx) => setTransactionToDelete(tx)}
                      onBatchDelete={handleBatchDelete}
                      onDeleteAll={handleDeleteAll}
                    />
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
        >
          <BrainCircuit className="w-7 h-7 md:w-8 md:h-8 text-white group-hover:animate-pulse" />
        </button>
      )}

      <AIAssistantChat transactions={displayedTransactions} balances={moduleBalances} isOpen={isAIChatOpen} onClose={() => setIsAIChatOpen(false)} />
    </div>
  );
}