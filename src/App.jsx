// src/App.jsx
import { useEffect, useState } from "react";
import { auth } from "./firebase";
import { signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { ChevronLeft, ChevronRight, Trash2, Pencil, BrainCircuit, ArrowUpCircle, ArrowDownCircle } from "lucide-react";

import Header from "./components/Header";
import TransactionForm from "./components/TransactionForm";
import CategoryPieChart from "./components/CategoryPieChart";
import ImportButton from "./components/ImportButton";
import CategorySettings from "./components/CategorySettings";

import { useTransactions } from "./hooks/useTransactions";

export default function App() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  const dataAtual = new Date();
  const [currentMonth, setCurrentMonth] = useState(dataAtual.getMonth() + 1);
  const [currentYear, setCurrentYear] = useState(dataAtual.getFullYear());

  const [transactionToEdit, setTransactionToEdit] = useState(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

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

  const { transactions, saldos, loading, add, remove, update } = useTransactions(user?.uid, currentMonth, currentYear);

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
    for (const transacao of transacoesImportadas) {
      await add(transacao);
    }
  };

  const handleSaveTransaction = async (data) => {
    if (transactionToEdit) {
      await update(transactionToEdit.id, data);
      setTransactionToEdit(null);
    } else {
      await add(data);
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
    <div className="min-h-screen bg-[#09090b] text-zinc-100 p-4 sm:p-8 font-sans selection:bg-indigo-500/30 relative">
      <div className="mx-auto w-full max-w-6xl">

        <Header />

        {/* --- DASHBOARD DE SALDOS --- */}
        <div className="mb-8 flex flex-col md:flex-row items-center justify-between gap-6 rounded-[2.5rem] border border-zinc-800/60 bg-zinc-900/40 p-8 shadow-2xl backdrop-blur-md">
          
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
                <span className="text-xl font-mono font-bold text-emerald-400">R$ {saldos?.entradas?.toFixed(2) || "0.00"}</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <ArrowDownCircle className="w-8 h-8 text-red-500/50" />
              <div className="flex flex-col">
                <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Saídas</span>
                <span className="text-xl font-mono font-bold text-red-400">R$ {saldos?.saidas?.toFixed(2) || "0.00"}</span>
              </div>
            </div>

            <div className="h-12 w-px bg-zinc-800 hidden lg:block"></div>

            <div className="flex flex-col items-end min-w-[120px]">
              <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Saldo Atual</span>
              <span className={`text-2xl font-mono font-bold ${saldos?.saldoAtual >= 0 ? 'text-indigo-400' : 'text-orange-400'}`}>
                R$ {saldos?.saldoAtual?.toFixed(2) || "0.00"}
              </span>
            </div>
          </div>

        </div>

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

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          {/* Coluna da Esquerda: Lista de Transações (Mais larga) */}
          <div className="lg:col-span-7 flex flex-col rounded-[2.5rem] border border-zinc-800/60 bg-zinc-900/40 p-6 shadow-2xl backdrop-blur-sm">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500">Histórico de Movimentações</h2>
              <span className="rounded-full bg-indigo-500/10 px-3 py-1 text-[10px] font-bold text-indigo-400 uppercase tracking-tighter">
                {loading ? "..." : transactions.length} registos encontrados
              </span>
            </div>

            <ul className="flex-1 space-y-3 overflow-y-auto pr-2 max-h-[500px] custom-scrollbar">
              {loading ? (
                <div className="text-zinc-500 text-center py-20 animate-pulse text-sm">Sincronizando com a base de dados...</div>
              ) : transactions.map((t) => (
                <li key={t.id} className={`group flex items-center justify-between rounded-2xl border p-4 transition-all hover:shadow-lg ${transactionToEdit?.id === t.id ? 'border-amber-500/50 bg-amber-900/20' : 'border-zinc-800/40 bg-zinc-800/20 hover:bg-zinc-800/50'}`}>
                  <div className="flex items-center gap-4 flex-1 overflow-hidden">
                    <div className={`flex h-11 w-11 min-w-[44px] items-center justify-center rounded-2xl text-lg ${t.type === 'saida' ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                      {t.type === 'saida' ? '↓' : '↑'}
                    </div>
                    <div className="flex flex-col overflow-hidden">
                      <span className="font-semibold text-zinc-200 group-hover:text-white truncate">{t.category || "Diversos"}</span>
                      <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">{t.createdAt.toLocaleDateString('pt-PT')}</span>
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
              {!loading && transactions.length === 0 && <div className="flex h-32 items-center justify-center text-sm text-zinc-600 italic">Nenhuma movimentação neste período.</div>}
            </ul>
          </div>

          {/* Coluna da Direita: Gráfico (Mais estreita) */}
          <div className="lg:col-span-5 flex flex-col rounded-[2.5rem] border border-zinc-800/60 bg-zinc-900/40 p-8 shadow-2xl backdrop-blur-sm">
             <h2 className="mb-8 text-xs font-bold uppercase tracking-widest text-zinc-500">Distribuição por Categoria</h2>
            <div className="flex-1 flex items-center justify-center min-h-[300px]">
              <CategoryPieChart transactions={transactions} />
            </div>
          </div>
        </div>
      </div>

      {isSettingsOpen && <CategorySettings uid={user?.uid} onClose={() => setIsSettingsOpen(false)} />}
    </div>
  );
}