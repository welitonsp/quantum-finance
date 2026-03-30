// src/components/DashboardCards.jsx
import { useState } from "react";
import { Wallet, ArrowUpCircle, ArrowDownCircle, Eye, EyeOff, Sparkles } from "lucide-react";

export default function DashboardCards({ balances }) {
  const [showBalance, setShowBalance] = useState(true);

  const saldo = Number(balances?.saldoAtual) || 0;
  const entradas = Number(balances?.entradas) || 0;
  const saidas = Number(balances?.saidas) || 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
      
      {/* 1. BALANCE HERO (Mantém o gradiente para destaque máximo) */}
      <div className="lg:col-span-3 xl:col-span-1 p-8 relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-indigo-700 to-cyan-600 border-none shadow-2xl shadow-indigo-500/30 group transition-all duration-500 hover:shadow-indigo-500/50">
        
        <div className="absolute -right-10 -top-10 w-48 h-48 bg-white/10 blur-3xl rounded-full pointer-events-none group-hover:bg-white/20 transition-all duration-700"></div>
        <div className="absolute bottom-0 left-0 w-full h-1/2 bg-gradient-to-t from-black/20 to-transparent pointer-events-none"></div>

        <div className="relative z-10 flex flex-col h-full justify-between">
          <div className="flex justify-between items-start mb-6">
            <div className="flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-full border border-white/20 backdrop-blur-md">
              <Sparkles className="w-4 h-4 text-cyan-300" />
              <span className="text-xs font-bold text-cyan-50 uppercase tracking-widest">Saldo Disponível</span>
            </div>
            
            <button 
              onClick={() => setShowBalance(!showBalance)}
              className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition-all"
              title={showBalance ? "Ocultar Valores" : "Mostrar Valores"}
            >
              {showBalance ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>

          <div>
            <h3 className={`text-5xl font-black tracking-tighter mb-2 ${saldo >= 0 ? 'text-white' : 'text-red-200'}`}>
              {showBalance ? (
                <>
                  <span className="text-2xl opacity-70 mr-1 font-normal">R$</span>
                  {saldo.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </>
              ) : (
                <span className="text-white opacity-80 mt-2 block tracking-widest">••••••••</span>
              )}
            </h3>
            <p className="text-xs text-indigo-200 uppercase tracking-widest font-bold flex items-center gap-1">
              <Wallet className="w-3.5 h-3.5" /> Atualizado neste instante
            </p>
          </div>
        </div>
      </div>

      {/* 2. RECEITAS DO MÊS (Adaptável Claro/Escuro) */}
      <div className="glass-card-quantum p-7 flex flex-col justify-between group border-t-4 border-t-emerald-500 hover:bg-slate-50 dark:hover:bg-slate-800/80 xl:col-span-1">
        <div className="flex items-center justify-between mb-4">
          <div className="p-3 rounded-2xl bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">
            <ArrowUpCircle className="w-6 h-6" />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest">Entradas</p>
        </div>
        
        <div>
          <h3 className="text-3xl font-black tracking-tighter text-slate-800 dark:text-white transition-colors">
            {showBalance ? (
              <>
                <span className="text-emerald-600 dark:text-emerald-400 mr-1">+</span>
                R$ {entradas.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </>
            ) : (
              <span className="text-slate-400 dark:text-slate-500 tracking-widest">••••••</span>
            )}
          </h3>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-tight mt-2 border-t border-slate-200 dark:border-white/5 pt-3 transition-colors">
            Fluxo de Rendimentos
          </p>
        </div>
      </div>

      {/* 3. DESPESAS DO MÊS (Adaptável Claro/Escuro) */}
      <div className="glass-card-quantum p-7 flex flex-col justify-between group border-t-4 border-t-red-500 hover:bg-slate-50 dark:hover:bg-slate-800/80 xl:col-span-1">
        <div className="flex items-center justify-between mb-4">
          <div className="p-3 rounded-2xl bg-red-100 dark:bg-red-500/10 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-500/20">
            <ArrowDownCircle className="w-6 h-6" />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest">Saídas</p>
        </div>
        
        <div>
          <h3 className="text-3xl font-black tracking-tighter text-slate-800 dark:text-white transition-colors">
            {showBalance ? (
              <>
                <span className="text-red-600 dark:text-red-400 mr-1">-</span>
                R$ {saidas.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </>
            ) : (
              <span className="text-slate-400 dark:text-slate-500 tracking-widest">••••••</span>
            )}
          </h3>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-tight mt-2 border-t border-slate-200 dark:border-white/5 pt-3 transition-colors">
            Controlo de Consumo
          </p>
        </div>
      </div>

    </div>
  );
}