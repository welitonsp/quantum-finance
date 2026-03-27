// src/App.jsx
import { useEffect, useState } from "react";
import { auth } from "./firebase";
import { signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { 
  ChevronLeft, ChevronRight, Trash2, Pencil, BrainCircuit, 
  ArrowUpCircle, ArrowDownCircle, Wallet, CreditCard, LayoutDashboard 
} from "lucide-react";
import toast, { Toaster } from 'react-hot-toast'; // NOSSA NOVA BIBLIOTECA PREMIUM

import Header from "./components/Header";
import TransactionForm from "./components/TransactionForm";
import CategoryPieChart from "./components/CategoryPieChart";
import ImportButton from "./components/ImportButton";
import CategorySettings from "./components/CategorySettings";

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
  
  // Estado para controlar o módulo ativo
  const [activeModule, setActiveModule] = useState('geral'); // 'geral', 'conta_corrente', 'cartao_credito'

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) { 
        setUser(u); 
        setAuthReady(true); 
      } else { 
        signInAnonymously(auth).catch(console.error); 
      }
    });
    return () => unsub();
  }, []);

  const { transactions, loading, add, remove, update } = useTransactions(user?.uid, currentMonth, currentYear);

  // LÓGICA DE MÓDULOS: Filtra as transações consoante o separador selecionado
  const displayedTransactions = transactions.filter(t => {
    if (activeModule === 'geral') return true;
    return t.account === activeModule;
  });

  // Recalcula os saldos dinamicamente para o módulo selecionado
  const moduleBalances = displayedTransactions.reduce((acc, tx) => {
    if (tx.type === 'entrada') acc.entradas += Number(tx.value);
    if (tx.type === 'saida') acc.saidas += Number(tx.value);
    return acc;
  }, { entradas: 0, saidas: 0 });
  
  moduleBalances.saldoAtual = moduleBalances.entradas - moduleBalances.saidas;

  const handlePrevMonth = () => {
    if (currentMonth === 1) {
      setCurrentMonth(12);
      setCurrentYear(y => y - 1);
    } else {
      setCurrentMonth(m => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 12) {
      setCurrentMonth(1);
      setCurrentYear(y => y + 1);
    } else {
      setCurrentMonth(m => m + 1);
    }
  };

  const handleImport = async (transacoesImportadas) => {
    try {
      if (user?.uid) {
        await FirestoreService.saveAllTransactions(user.uid, transacoesImportadas);
        // Nota: A notificação de sucesso já é gerada dentro do ImportButton
      } else {
        toast.error("Erro: Utilizador não identificado.");
      }
    } catch (error) {
      console.error("Erro na gravação em lote:", error);
      toast.error("Erro ao guardar as transações na base de dados.");
    }
  };

  const handleSaveTransaction = async (data) => {
    const finalData = { 
      ...data, 
      account: activeModule === 'geral' ? 'conta_corrente' : activeModule 
    };
    
    if (transactionToEdit) {
      await update(transactionToEdit.id, finalData);
      setTransactionToEdit(null);
      toast.success("Movimentação atualizada!");
    } else {
      await add(finalData);
      toast.success("Movimentação adicionada!");
    }
  };

  const handleDelete = async (id) => {
    await remove(id);
    toast.success("Movimentação eliminada.");
  };

  const nomeMeses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

  if (!authReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#09090b] text-indigo-500 font-bold tracking-widest animate-pulse uppercase">
        A iniciar Quantum Core...
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#09090b] text-zinc-100 font-sans selection:bg-indigo-500/30">
      
      {/* 🌟 MAGIA UX: O componente invisível que gere os alertas modernos */}
      <Toaster 
        position="bottom-right" 
        toastOptions={{
          style: {
            background: '#18181b',
            color: '#e4e4e7',
            border: '1px solid rgba(63, 63, 70, 0.5)',
            borderRadius: '1rem',
            fontWeight: 'bold',
          }
        }} 
      />

      {/* SIDEBAR - MENU LATERAL */}
      <aside className="hidden md:flex flex-col w-64 lg:w-72 xl:w-80 border-r border-zinc-800/60 bg-zinc-950/80 p-6 xl:p-8 shadow-2xl backdrop-blur-3xl z-10 transition-all duration-300">
        <div className="mb-12 mt-4">
          <h1 className="text-2xl xl:text-3xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400">
            QUANTUM<span className="text-zinc-100">FINANCE</span>
          </h1>
        </div>

        <nav className="flex flex-col gap-3 flex-1">
          <button 
            onClick={() => setActiveModule('geral')}
            className={`flex items-center gap-4 px-5 py-4 rounded-2xl transition-all font-bold text-sm xl:text-base ${activeModule === 'geral' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shadow-[0_0_20px_rgba(99,102,241,0.1)]' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'}`}
          >
            <LayoutDashboard className="w-5 h-5 xl:w-6 xl:h-6" />
            Visão Geral
          </button>
          
          <button 
            onClick={() => setActiveModule('conta_corrente')}
            className={`flex items-center gap-4 px-5 py-4 rounded-2xl transition-all font-bold text-sm xl:text-base ${activeModule === 'conta_corrente' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_20px_rgba(16,185,129,0.1)]' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'}`}
          >
            <Wallet className="w-5 h-5 xl:w-6 xl:h-6" />
            Conta Corrente
          </button>

          <button 
            onClick={() => setActiveModule('cartao_credito')}
            className={`flex items-center gap-4 px-5 py-4 rounded-2xl transition-all font-bold text-sm xl:text-base ${activeModule === 'cartao_credito' ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20 shadow-[0_0_20px_rgba(249,115,22,0.1)]' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'}`}
          >
            <CreditCard className="w-5 h-5 xl:w-6 xl:h-6" />
            Cartão de Crédito
          </button>
        </nav>
      </aside>

      {/* ÁREA PRINCIPAL */}
      <main className="flex-1 p-4 sm:p-6 lg:p-10 xl:p-14 overflow-y-auto h-screen custom-scrollbar relative bg-gradient-to-br from-[#09090b] via-[#0f0f13] to-[#09090b]">
        
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[300px] bg-indigo-500/10 blur-[120px] rounded-full pointer-events-none"></div>

        <div className="mx-auto w-full max-w-[1600px] relative z-10">
          
          <div className="md:hidden mb-8">
            <Header />
            <div className="flex gap-3 mt-6 overflow-x-auto pb-4 custom-scrollbar snap-x">
              <button onClick={() => setActiveModule('geral')} className={`snap-start px-6 py-3 text-sm font-bold rounded-2xl whitespace-nowrap shadow-lg ${activeModule === 'geral' ? 'bg-indigo-500 text-white' : 'bg-zinc-800/80 text-zinc-400 backdrop-blur-md border border-zinc-700'}`}>Geral</button>
              <button onClick={() => setActiveModule('conta_corrente')} className={`snap-start px-6 py-3 text-sm font-bold rounded-2xl whitespace-nowrap shadow-lg ${activeModule === 'conta_corrente' ? 'bg-emerald-500 text-white' : 'bg-zinc-800/80 text-zinc-400 backdrop-blur-md border border-zinc-700'}`}>Conta Corrente</button>
              <button onClick={() => setActiveModule('cartao_credito')} className={`snap-start px-6 py-3 text-sm font-bold rounded-2xl whitespace-nowrap shadow-lg ${activeModule === 'cartao_credito' ? 'bg-orange-500 text-white' : 'bg-zinc-800/80 text-zinc-400 backdrop-blur-md border border-zinc-700'}`}>Cartão de Crédito</button>
            </div>
          </div>

          <div className="mb-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 xl:gap-8">
            
            <div className="flex flex-col justify-center items-center gap-4 rounded-[2rem] border border-zinc-800/60 bg-zinc-900/40 p-6 xl:p-8 shadow-2xl backdrop-blur-md transition-transform hover:scale-[1.02]">
              <span className="text-[10px] xl:text-xs font-bold uppercase tracking-widest text-zinc-500">Período</span>
              <div className="flex items-center gap-4 w-full justify-between bg-zinc-950/50 p-3 rounded-2xl border border-zinc-800/50">
                <button onClick={handlePrevMonth} className="p-2 hover:bg-zinc-800 rounded-xl transition-colors">
                  <ChevronLeft className="w-5 h-5 xl:w-6 xl:h-6 text-zinc-400" />
                </button>
                <span className="text-center font-bold text-zinc-200 uppercase tracking-wider text-sm xl:text-base">
                  {nomeMeses[currentMonth - 1]} {currentYear}
                </span>
                <button onClick={handleNextMonth} className="p-2 hover:bg-zinc-800 rounded-xl transition-colors">
                  <ChevronRight className="w-5 h-5 xl:w-6 xl:h-6 text-zinc-400" />
                </button>
              </div>
            </div>

            <div className="flex flex-col justify-between rounded-[2rem] border border-zinc-800/60 bg-zinc-900/40 p-6 xl:p-8 shadow-2xl backdrop-blur-md transition-transform hover:scale-[1.02]">
              <div className="flex items-center gap-3 mb-4">
                <ArrowUpCircle className="w-6 h-6 xl:w-8 xl:h-8 text-emerald-500/50" />
                <span className="text-xs xl:text-sm font-bold uppercase tracking-widest text-zinc-500">Entradas</span>
              </div>
              <span className="text-2xl lg:text-3xl xl:text-4xl 2xl:text-5xl font-mono font-bold text-emerald-400 truncate">
                R$ {moduleBalances.entradas.toFixed(2)}
              </span>
            </div>

            <div className="flex flex-col justify-between rounded-[2rem] border border-zinc-800/60 bg-zinc-900/40 p-6 xl:p-8 shadow-2xl backdrop-blur-md transition-transform hover:scale-[1.02]">
              <div className="flex items-center gap-3 mb-4">
                <ArrowDownCircle className="w-6 h-6 xl:w-8 xl:h-8 text-red-500/50" />
                <span className="text-xs xl:text-sm font-bold uppercase tracking-widest text-zinc-500">Saídas</span>
              </div>
              <span className="text-2xl lg:text-3xl xl:text-4xl 2xl:text-5xl font-mono font-bold text-red-400 truncate">
                R$ {moduleBalances.saidas.toFixed(2)}
              </span>
            </div>

            <div className="flex flex-col justify-between rounded-[2rem] border border-indigo-500/20 bg-indigo-500/5 p-6 xl:p-8 shadow-[0_0_40px_rgba(99,102,241,0.05)] backdrop-blur-md transition-transform hover:scale-[1.02] relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 blur-[40px] rounded-full"></div>
              <div className="flex items-center gap-3 mb-4 relative z-10">
                <span className="text-xs xl:text-sm font-bold uppercase tracking-widest text-indigo-300/70">
                  {activeModule === 'cartao_credito' ? 'Total Fatura' : 'Saldo Atual'}
                </span>
              </div>
              <span className={`text-3xl lg:text-4xl xl:text-5xl 2xl:text-6xl font-mono font-black tracking-tighter relative z-10 truncate ${moduleBalances.saldoAtual >= 0 ? 'text-indigo-400' : 'text-orange-400'}`}>
                R$ {Math.abs(moduleBalances.saldoAtual).toFixed(2)}
              </span>
            </div>

          </div>

          <div className="mb-10 space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 px-2">
              <button 
                onClick={() => setIsSettingsOpen(true)}
                className="flex items-center gap-3 rounded-2xl border border-zinc-700/50 bg-zinc-800/40 px-5 py-3 text-sm xl:text-base font-bold text-zinc-300 transition-all hover:bg-zinc-700 hover:text-white hover:border-indigo-500/50 shadow-lg backdrop-blur-sm"
              >
                <BrainCircuit className="w-5 h-5 xl:w-6 xl:h-6 text-indigo-400" />
                REGRAS DE IA
              </button>
              
              {/* 🛡️ AQUI PASSAMOS AS TRANSAÇÕES EXISTENTES PARA O BOTÃO VERIFICAR */}
              <ImportButton 
                onImportTransactions={handleImport} 
                uid={user?.uid} 
                existingTransactions={transactions} 
              />
            </div>
            
            <TransactionForm 
              onSave={handleSaveTransaction} 
              editingTransaction={transactionToEdit}
              onCancelEdit={() => setTransactionToEdit(null)}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 xl:gap-10">
            
            <div className="lg:col-span-7 2xl:col-span-8 flex flex-col rounded-[2.5rem] border border-zinc-800/60 bg-zinc-900/40 p-6 xl:p-10 shadow-2xl backdrop-blur-sm">
              <div className="mb-8 flex items-center justify-between">
                <h2 className="text-sm xl:text-base font-bold uppercase tracking-widest text-zinc-500">
                  Movimentações ({activeModule.replace('_', ' ')})
                </h2>
                <span className="rounded-full bg-indigo-500/10 px-4 py-1.5 text-xs xl:text-sm font-bold text-indigo-400 uppercase tracking-tighter border border-indigo-500/20">
                  {loading ? "..." : displayedTransactions.length} registos
                </span>
              </div>

              <ul className="flex-1 space-y-4 overflow-y-auto pr-4 max-h-[600px] xl:max-h-[800px] custom-scrollbar">
                {loading ? (
                  <div className="text-zinc-500 text-center py-20 animate-pulse text-sm xl:text-base font-medium">A sincronizar inteligência...</div>
                ) : displayedTransactions.map((t) => (
                  <li key={t.id} className={`group flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-3xl border p-5 xl:p-6 transition-all hover:shadow-[0_8px_30px_rgba(0,0,0,0.5)] ${transactionToEdit?.id === t.id ? 'border-amber-500/50 bg-amber-900/20' : 'border-zinc-800/40 bg-zinc-950/50 hover:bg-zinc-800/80 hover:border-zinc-700'}`}>
                    
                    <div className="flex items-center gap-5 flex-1 overflow-hidden">
                      <div className={`flex h-14 w-14 xl:h-16 xl:w-16 min-w-[56px] xl:min-w-[64px] items-center justify-center rounded-2xl text-xl xl:text-2xl shadow-inner ${t.type === 'saida' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
                        {t.type === 'saida' ? '↓' : '↑'}
                      </div>
                      <div className="flex flex-col overflow-hidden gap-1">
                        <span className="font-bold text-base xl:text-lg text-zinc-200 group-hover:text-white truncate transition-colors">{t.category || "Diversos"}</span>
                        <div className="flex items-center gap-3">
                           <span className="text-xs xl:text-sm text-zinc-500 uppercase font-bold tracking-wider">{t.createdAt.toLocaleDateString('pt-PT')}</span>
                           {activeModule === 'geral' && (
                             <span className={`text-[9px] xl:text-[10px] font-black uppercase px-2 py-0.5 rounded-md border ${t.account === 'cartao_credito' ? 'border-orange-500/30 text-orange-400 bg-orange-500/5' : 'border-emerald-500/30 text-emerald-400 bg-emerald-500/5'}`}>
                               {t.account === 'cartao_credito' ? 'Cartão' : 'Conta'}
                             </span>
                           )}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between sm:justify-end gap-4 sm:ml-4 w-full sm:w-auto mt-2 sm:mt-0 pt-4 sm:pt-0 border-t sm:border-0 border-zinc-800/50">
                      <span className={`font-mono font-black text-xl xl:text-2xl tracking-tight whitespace-nowrap ${t.type === 'saida' ? 'text-zinc-100' : 'text-emerald-400'}`}>
                        {t.type === 'saida' ? '-' : '+'} R$ {Number(t.value).toFixed(2)}
                      </span>
                      
                      <div className="flex items-center gap-1 xl:gap-2">
                        <button onClick={() => setTransactionToEdit(t)} className="p-2.5 xl:p-3 text-zinc-500 hover:bg-amber-500/10 hover:text-amber-400 rounded-xl transition-all sm:opacity-0 sm:group-hover:opacity-100" title="Editar">
                          <Pencil className="w-4 h-4 xl:w-5 xl:h-5" />
                        </button>
                        <button onClick={() => handleDelete(t.id)} className="p-2.5 xl:p-3 text-zinc-500 hover:bg-red-500/10 hover:text-red-400 rounded-xl transition-all sm:opacity-0 sm:group-hover:opacity-100" title="Remover">
                          <Trash2 className="w-4 h-4 xl:w-5 xl:h-5" />
                        </button>
                      </div>
                    </div>
                  </li>
                ))}

                {!loading && displayedTransactions.length === 0 && (
                  <div className="flex flex-col h-40 xl:h-64 items-center justify-center text-zinc-500 gap-3 border-2 border-dashed border-zinc-800/50 rounded-3xl m-2">
                    <span className="text-4xl">📭</span>
                    <span className="text-sm xl:text-base font-medium italic">Nenhuma movimentação para este módulo.</span>
                  </div>
                )}
              </ul>
            </div>

            <div className="lg:col-span-5 2xl:col-span-4 flex flex-col rounded-[2.5rem] border border-zinc-800/60 bg-zinc-900/40 p-8 xl:p-10 shadow-2xl backdrop-blur-sm relative overflow-hidden">
               <div className="absolute -top-24 -right-24 w-64 h-64 bg-indigo-500/5 blur-[80px] rounded-full"></div>
               <h2 className="mb-10 text-sm xl:text-base font-bold uppercase tracking-widest text-zinc-500 relative z-10">Distribuição Inteligente</h2>
              <div className="flex-1 flex items-center justify-center min-h-[350px] xl:min-h-[450px] relative z-10 scale-110 xl:scale-125 transform origin-center">
                <CategoryPieChart transactions={displayedTransactions} />
              </div>
            </div>
          </div>
        </div>
      </main>

      {isSettingsOpen && <CategorySettings uid={user?.uid} onClose={() => setIsSettingsOpen(false)} />}
    </div>
  );
}