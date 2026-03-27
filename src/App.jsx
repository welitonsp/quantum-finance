// src/App.jsx
import { useEffect, useState } from "react";
import { auth } from "./firebase";
import { signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { 
  ChevronLeft, ChevronRight, Trash2, Pencil, BrainCircuit, 
  ArrowUpCircle, ArrowDownCircle, Wallet, CreditCard, LayoutDashboard 
} from "lucide-react";

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
  
  // NOVO: Estado para controlar o módulo ativo
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
      } else {
        alert("Erro: Utilizador não identificado.");
      }
    } catch (error) {
      console.error("Erro na gravação em lote:", error);
      alert("Erro ao guardar as transações na base de dados.");
    }
  };

  const handleSaveTransaction = async (data) => {
    // Se for um novo registo manual, guarda no módulo que estiver aberto
    const finalData = { 
      ...data, 
      account: activeModule === 'geral' ? 'conta_corrente' : activeModule 
    };
    
    if (transactionToEdit) {
      await update(transactionToEdit.id, finalData);
      setTransactionToEdit(null);
    } else {
      await add(finalData);
    }
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
      
      {/* NOVO: SIDEBAR (MENU LATERAL) */}
      <aside className="hidden md:flex flex-col w-64 border-r border-zinc-800/60 bg-zinc-950/50 p-6 shadow-2xl">
        <div className="mb-10 mt-2">
          <h1 className="text-xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400">
            QUANTUM<span className="text-zinc-100">FINANCE</span>
          </h1>
        </div>

        <nav className="flex flex-col gap-2 flex-1">
          <button 
            onClick={() => setActiveModule('geral')}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-bold text-sm ${activeModule === 'geral' ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'}`}
          >
            <LayoutDashboard className="w-5 h-5" />
            Visão Geral
          </button>
          
          <button 
            onClick={() => setActiveModule('conta_corrente')}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-bold text-sm ${activeModule === 'conta_corrente' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'}`}
          >
            <Wallet className="w-5 h-5" />
            Conta Corrente
          </button>

          <button 
            onClick={() => setActiveModule('cartao_credito')}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-bold text-sm ${activeModule === 'cartao_credito' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'}`}
          >
            <CreditCard className="w-5 h-5" />
            Cartão de Crédito
          </button>
        </nav>
      </aside>

      {/* ÁREA PRINCIPAL */}
      <main className="flex-1 p-4 sm:p-8 overflow-y-auto h-screen custom-scrollbar">
        <div className="mx-auto w-full max-w-5xl">
          
          {/* Header Mobile (Oculto em ecrãs grandes) */}
          <div className="md:hidden mb-6">
            <Header />
            <div className="flex gap-2 mt-4 overflow-x-auto pb-2">
              <button onClick={() => setActiveModule('geral')} className={`px-4 py-2 text-xs font-bold rounded-full whitespace-nowrap ${activeModule === 'geral' ? 'bg-indigo-500 text-white' : 'bg-zinc-800 text-zinc-400'}`}>Geral</button>
              <button onClick={() => setActiveModule('conta_corrente')} className={`px-4 py-2 text-xs font-bold rounded-full whitespace-nowrap ${activeModule === 'conta_corrente' ? 'bg-emerald-500 text-white' : 'bg-zinc-800 text-zinc-400'}`}>Conta</button>
              <button onClick={() => setActiveModule('cartao_credito')} className={`px-4 py-2 text-xs font-bold rounded-full whitespace-nowrap ${activeModule === 'cartao_credito' ? 'bg-orange-500 text-white' : 'bg-zinc-800 text-zinc-400'}`}>Cartão</button>
            </div>
          </div>

          {/* DASHBOARD DE SALDOS DINÂMICOS */}
          <div className="mb-8 flex flex-col lg:flex-row items-center justify-between gap-6 rounded-[2.5rem] border border-zinc-800/60 bg-zinc-900/40 p-8 shadow-2xl backdrop-blur-md">
            
            <div className="flex items-center gap-4 bg-zinc-950/50 p-2 rounded-2xl border border-zinc-800/50">
              <button onClick={handlePrevMonth} className="p-2 hover:bg-zinc-800 rounded-xl transition-colors">
                <ChevronLeft className="w-5 h-5 text-zinc-400" />
              </button>
              <span className="w-32 text-center font-bold text-zinc-200 uppercase tracking-wider text-sm">
                {nomeMeses[currentMonth - 1]} {currentYear}
              </span>
              <button onClick={handleNextMonth} className="p-2 hover:bg-zinc-800 rounded-xl transition-colors">
                <ChevronRight className="w-5 h-5 text-zinc-400" />
              </button>
            </div>

            <div className="flex flex-wrap flex-1 items-center justify-end gap-8">
              <div className="flex items-center gap-3">
                <ArrowUpCircle className="w-8 h-8 text-emerald-500/50" />
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Entradas</span>
                  <span className="text-xl font-mono font-bold text-emerald-400">R$ {moduleBalances.entradas.toFixed(2)}</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <ArrowDownCircle className="w-8 h-8 text-red-500/50" />
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Saídas</span>
                  <span className="text-xl font-mono font-bold text-red-400">R$ {moduleBalances.saidas.toFixed(2)}</span>
                </div>
              </div>

              <div className="h-12 w-px bg-zinc-800 hidden lg:block"></div>

              <div className="flex flex-col items-end min-w-[120px]">
                <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                  {activeModule === 'cartao_credito' ? 'Total Fatura' : 'Saldo Atual'}
                </span>
                <span className={`text-2xl font-mono font-bold ${moduleBalances.saldoAtual >= 0 ? 'text-indigo-400' : 'text-orange-400'}`}>
                  R$ {Math.abs(moduleBalances.saldoAtual).toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* CONTROLOS SUPERIORES */}
          <div className="mb-8 space-y-4">
            <div className="flex justify-between items-center px-2">
              <button 
                onClick={() => setIsSettingsOpen(true)}
                className="flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-800/30 px-4 py-2 text-xs font-bold text-zinc-400 transition-all hover:bg-zinc-700 hover:text-white"
              >
                <BrainCircuit className="w-4 h-4 text-indigo-400" />
                REGRAS DE IA
              </button>
              
              <ImportButton onImportTransactions={handleImport} uid={user?.uid} />
            </div>
            
            <TransactionForm 
              onSave={handleSaveTransaction} 
              editingTransaction={transactionToEdit}
              onCancelEdit={() => setTransactionToEdit(null)}
            />
          </div>

          {/* LISTA E GRÁFICOS */}
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
            <div className="lg:col-span-7 flex flex-col rounded-[2.5rem] border border-zinc-800/60 bg-zinc-900/40 p-6 shadow-2xl backdrop-blur-sm">
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500">
                  Movimentações ({activeModule.replace('_', ' ')})
                </h2>
                <span className="rounded-full bg-indigo-500/10 px-3 py-1 text-[10px] font-bold text-indigo-400 uppercase tracking-tighter">
                  {loading ? "..." : displayedTransactions.length} registos
                </span>
              </div>

              <ul className="flex-1 space-y-3 overflow-y-auto pr-2 max-h-[500px] custom-scrollbar">
                {loading ? (
                  <div className="text-zinc-500 text-center py-20 animate-pulse text-sm">A sincronizar com a base de dados...</div>
                ) : displayedTransactions.map((t) => (
                  <li key={t.id} className={`group flex items-center justify-between rounded-2xl border p-4 transition-all hover:shadow-lg ${transactionToEdit?.id === t.id ? 'border-amber-500/50 bg-amber-900/20' : 'border-zinc-800/40 bg-zinc-800/20 hover:bg-zinc-800/50'}`}>
                    <div className="flex items-center gap-4 flex-1 overflow-hidden">
                      <div className={`flex h-11 w-11 min-w-[44px] items-center justify-center rounded-2xl text-lg ${t.type === 'saida' ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                        {t.type === 'saida' ? '↓' : '↑'}
                      </div>
                      <div className="flex flex-col overflow-hidden">
                        <span className="font-semibold text-zinc-200 group-hover:text-white truncate">{t.category || "Diversos"}</span>
                        <div className="flex items-center gap-2">
                           <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">{t.createdAt.toLocaleDateString('pt-PT')}</span>
                           {activeModule === 'geral' && (
                             <span className={`text-[8px] uppercase px-1.5 py-0.5 rounded border ${t.account === 'cartao_credito' ? 'border-orange-500/30 text-orange-400' : 'border-emerald-500/30 text-emerald-400'}`}>
                               {t.account === 'cartao_credito' ? 'Cartão' : 'Conta'}
                             </span>
                           )}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 ml-4">
                      <span className={`font-mono font-bold text-lg tracking-tight whitespace-nowrap mr-3 ${t.type === 'saida' ? 'text-zinc-100' : 'text-emerald-400'}`}>
                        {t.type === 'saida' ? '-' : '+'} R$ {Number(t.value).toFixed(2)}
                      </span>
                      
                      <button onClick={() => setTransactionToEdit(t)} className="p-2 text-zinc-600 hover:bg-amber-500/10 hover:text-amber-400 rounded-lg transition-all opacity-0 group-hover:opacity-100" title="Editar">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => remove(t.id)} className="p-2 text-zinc-600 hover:bg-red-500/10 hover:text-red-400 rounded-lg transition-all opacity-0 group-hover:opacity-100" title="Remover">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </li>
                ))}
                {!loading && displayedTransactions.length === 0 && <div className="flex h-32 items-center justify-center text-sm text-zinc-600 italic">Nenhuma movimentação para este módulo.</div>}
              </ul>
            </div>

            <div className="lg:col-span-5 flex flex-col rounded-[2.5rem] border border-zinc-800/60 bg-zinc-900/40 p-8 shadow-2xl backdrop-blur-sm">
               <h2 className="mb-8 text-xs font-bold uppercase tracking-widest text-zinc-500">Distribuição por Categoria</h2>
              <div className="flex-1 flex items-center justify-center min-h-[300px]">
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