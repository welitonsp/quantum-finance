import { useEffect, useState } from "react";
import { auth } from "./firebase";
import { onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { 
  ChevronLeft, ChevronRight, Trash2, Pencil, BrainCircuit, 
  Wallet, Plus, ArrowUpRight, ArrowDownLeft, LogOut 
} from "lucide-react";
import toast, { Toaster } from 'react-hot-toast';

// OS NOSSOS NOVOS COMPONENTES FATIADOS
import LoginScreen from "./components/LoginScreen";
import DashboardCards from "./components/DashboardCards";
import DashboardCharts from "./components/DashboardCharts";

// Os Seus Componentes Antigos
import TransactionForm from "./components/TransactionForm";
import ImportButton from "./components/ImportButton";
import CategorySettings from "./components/CategorySettings";

// Hooks e Serviços
import { useTransactions } from "./hooks/useTransactions";
import { FirestoreService } from "./services/FirestoreService"; 

export default function App() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  const dataAtual = new Date();
  const [currentMonth, setCurrentMonth] = useState(dataAtual.getMonth() + 1);
  const [currentYear, setCurrentYear] = useState(dataAtual.getFullYear());

  const [transactionToEdit, setTransactionToEdit] = useState(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [activeModule, setActiveModule] = useState('geral');

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

  const { transactions, loading, add, remove, update } = useTransactions(user?.uid, currentMonth, currentYear);

  const displayedTransactions = transactions?.filter(t => {
    if (activeModule === 'geral') return true;
    return t.account === activeModule;
  }) || [];

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

  const handleDelete = async (id) => {
    await remove(id);
    toast.success("Movimentação eliminada.");
  };

  const nomeMeses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

  if (!authReady) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-950 text-cyan-500 font-bold tracking-widest animate-pulse uppercase">A ligar Motor Quântico...</div>;
  }

  // DELEGA A TELA DE LOGIN PARA O NOVO COMPONENTE
  if (!user) return <LoginScreen onLogin={handleLogin} />;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100 relative overflow-hidden font-sans">
      <Toaster position="bottom-right" toastOptions={{ style: { background: '#1e293b', color: '#fff', borderRadius: '12px' } }} />

      <div className="fixed inset-0 opacity-30 pointer-events-none z-0">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl animate-float"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-500/20 rounded-full blur-3xl animate-float" style={{ animationDelay: '1s' }}></div>
        <div className="absolute top-1/2 right-0 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl animate-float" style={{ animationDelay: '2s' }}></div>
      </div>

      <div className="relative z-10 h-full w-full pb-20">
        <header className="border-b border-white/5 backdrop-blur-md bg-slate-950/30 sticky top-0 z-40">
          <div className="container mx-auto px-4 py-4 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                <Wallet className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold gradient-text tracking-wide uppercase">Quantum Finance</h1>
                <p className="text-[10px] text-slate-400 uppercase tracking-widest">Painel de Controlo</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2 bg-white/5 p-1 rounded-xl border border-white/10">
               <button onClick={handlePrevMonth} className="p-2 hover:bg-white/10 rounded-lg text-slate-300 transition-colors"><ChevronLeft className="w-4 h-4" /></button>
               <span className="text-xs font-bold uppercase tracking-widest text-white w-32 text-center">{nomeMeses[currentMonth - 1]} {currentYear}</span>
               <button onClick={handleNextMonth} className="p-2 hover:bg-white/10 rounded-lg text-slate-300 transition-colors"><ChevronRight className="w-4 h-4" /></button>
            </div>

            <div className="flex items-center gap-3">
              <button onClick={() => setIsSettingsOpen(true)} className="glass-btn-secondary flex items-center h-9 text-xs px-4"><BrainCircuit className="w-4 h-4 mr-2 text-indigo-400" /> IA Regras</button>
              <ImportButton onImportTransactions={handleImport} uid={user?.uid} existingTransactions={transactions} />
              <button onClick={() => setIsFormOpen(!isFormOpen)} className="glass-btn flex items-center h-9 text-xs px-4 shadow-glow-cyan"><Plus className="w-4 h-4 mr-1" /> Nova</button>
              <button onClick={handleLogout} className="p-2 hover:bg-red-500/20 rounded-lg text-red-400 transition-colors ml-2" title="Encerrar Sessão"><LogOut className="w-5 h-5" /></button>
            </div>
          </div>
        </header>

        <div className="container mx-auto px-4 mt-6">
          <div className="flex gap-2 border-b border-white/10 pb-2 overflow-x-auto custom-scrollbar">
              <button onClick={() => setActiveModule('geral')} className={`px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-t-lg transition-all ${activeModule === 'geral' ? 'text-cyan-400 border-b-2 border-cyan-400 bg-cyan-500/10' : 'text-slate-500 hover:text-slate-300'}`}>Visão Geral</button>
              <button onClick={() => setActiveModule('conta_corrente')} className={`px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-t-lg transition-all ${activeModule === 'conta_corrente' ? 'text-emerald-400 border-b-2 border-emerald-400 bg-emerald-500/10' : 'text-slate-500 hover:text-slate-300'}`}>Conta Corrente</button>
              <button onClick={() => setActiveModule('cartao_credito')} className={`px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-t-lg transition-all ${activeModule === 'cartao_credito' ? 'text-orange-400 border-b-2 border-orange-400 bg-orange-500/10' : 'text-slate-500 hover:text-slate-300'}`}>Cartão de Crédito</button>
          </div>
        </div>

        <main className="container mx-auto px-4 py-6 max-w-[1400px]">
          
          {/* DELEGA OS CARTÕES PARA O NOVO COMPONENTE */}
          <DashboardCards balances={moduleBalances} />

          {isFormOpen && (
            <div className="mb-8 p-6 glass-card-dark border-dashed border-2 border-cyan-500/30">
              <TransactionForm onSave={handleSaveTransaction} editingTransaction={transactionToEdit} onCancelEdit={() => { setTransactionToEdit(null); setIsFormOpen(false); }} />
            </div>
          )}

          {/* DELEGA OS GRÁFICOS PARA O NOVO COMPONENTE */}
          <DashboardCharts categoryData={categoryData} topExpensesData={topExpensesData} />

          <div className="glass-card-dark p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-sm font-bold uppercase tracking-widest text-slate-300">Histórico de Transações</h2>
              <span className="text-xs bg-indigo-500/20 text-indigo-400 px-3 py-1 rounded-full font-bold">{displayedTransactions.length} Registos</span>
            </div>
            
            <div className="space-y-3 max-h-[500px] overflow-y-auto custom-scrollbar pr-2">
              {loading ? (
                <p className="text-center text-slate-500 py-10 animate-pulse">A carregar registos da nuvem...</p>
              ) : displayedTransactions.length === 0 ? (
                <div className="text-center py-10"><p className="text-4xl mb-3">📭</p><p className="text-slate-500 text-sm">Nenhuma transação registada neste período.</p></div>
              ) : (
                displayedTransactions.map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between p-4 rounded-xl bg-white/[0.02] hover:bg-white/[0.06] transition-all duration-300 border border-white/5 group">
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${tx.type === "entrada" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
                        {tx.type === "entrada" ? <ArrowDownLeft className="w-5 h-5" /> : <ArrowUpRight className="w-5 h-5" />}
                      </div>
                      <div>
                        <p className="font-bold text-sm text-slate-200 group-hover:text-white transition-colors">{tx.category || "Diversos"}</p>
                        <p className="text-xs text-slate-500 uppercase tracking-wider">
                          {tx.createdAt?.toDate ? tx.createdAt.toDate().toLocaleDateString('pt-BR') : new Date(tx.createdAt).toLocaleDateString('pt-BR')} • {tx.account === 'conta_corrente' ? 'Conta' : 'Cartão'}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <p className={`font-mono font-bold ${tx.type === "entrada" ? "text-emerald-400" : "text-white"}`}>
                        {tx.type === "entrada" ? "+" : "-"}R$ {Math.abs(Number(tx.value)).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </p>
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => { setTransactionToEdit(tx); setIsFormOpen(true); }} className="p-2 bg-amber-500/10 text-amber-400 rounded-lg hover:bg-amber-500/20"><Pencil className="w-3 h-3" /></button>
                        <button onClick={() => handleDelete(tx.id)} className="p-2 bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500/20"><Trash2 className="w-3 h-3" /></button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </main>
        {isSettingsOpen && <CategorySettings uid={user?.uid} onClose={() => setIsSettingsOpen(false)} />}
      </div>
    </div>
  );
}