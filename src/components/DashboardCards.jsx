// src/components/DashboardCards.jsx - Estrutura Indestrutível e Premium
import { Wallet, ArrowUpCircle, ArrowDownCircle, TrendingUp } from "lucide-react";

export default function DashboardCards({ balances }) {
  // Garantimos que os valores sejam números para evitar erros de renderização
  const saldo = Number(balances.saldoAtual) || 0;
  const entradas = Number(balances.entradas) || 0;
  const saidas = Number(balances.saidas) || 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
      
      {/* Saldo Atual - Estilo Quantum Indigo */}
      <div className="glass-card-quantum p-7 transition-all flex flex-col justify-between h-full group gradient-border-indigo relative overflow-hidden">
        {/* Aura Quântica (Luz de fundo) */}
        <div className="absolute -right-6 -top-6 w-28 h-28 bg-indigo-500/10 blur-2xl rounded-full group-hover:bg-indigo-500/20 transition-colors"></div>
        
        {/* Camada Principal - Layout Flex Robustissimo */}
        <div className="flex items-center justify-between gap-x-4 mb-5 relative z-10">
          {/* Contêiner de Texto ( flex-1 garante que ele ocupe o espaço livre) */}
          <div className="flex-1 min-w-0 pr-4">
            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-1 truncate">
              Saldo Total
            </p>
            {/* VALOR: Aumentamos para text-4xl para maior impacto */}
            <h3 className={`text-4xl font-black font-mono tracking-tighter truncate ${saldo >= 0 ? 'text-white' : 'text-red-400'}`}>
              R$ {saldo.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </h3>
          </div>
          
          {/* Contêiner do Ícone - Forçamos o tamanho para evitar colapso */}
          <div className="p-3.5 flex-shrink-0 rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 group-hover:scale-110 transition-transform">
            <Wallet className="w-7 h-7" />
          </div>
        </div>
        
        {/* Rodapé do Cartão - Espaçamento fixo */}
        <p className="text-[10px] text-slate-500 uppercase tracking-tight relative z-10 flex items-center gap-1.5 pt-3 border-t border-white/5">
          <TrendingUp className="w-3.5 h-3.5 text-indigo-400" /> Atualizado em tempo real
        </p>
      </div>

      {/* Receitas Mensais - Estilo Quantum Emerald */}
      <div className="glass-card-quantum p-7 transition-all flex flex-col justify-between h-full group gradient-border-emerald relative overflow-hidden">
        <div className="absolute -right-6 -top-6 w-28 h-28 bg-emerald-500/10 blur-2xl rounded-full group-hover:bg-emerald-500/20 transition-colors"></div>
        
        <div className="flex items-center justify-between gap-x-4 mb-5 relative z-10">
          <div className="flex-1 min-w-0 pr-4">
            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-1 truncate">
              Entradas (Mês)
            </p>
            <h3 className="text-4xl font-black font-mono tracking-tighter text-emerald-400 truncate">
              + R$ {entradas.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </h3>
          </div>
          
          <div className="p-3.5 flex-shrink-0 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 group-hover:scale-110 transition-transform">
            <ArrowUpCircle className="w-7 h-7" />
          </div>
        </div>
        <p className="text-[10px] text-slate-500 uppercase tracking-tight relative z-10 flex items-center gap-1.5 pt-3 border-t border-white/5">
          Fluxo de rendimentos
        </p>
      </div>

      {/* Despesas Mensais - Estilo Quantum Red */}
      <div className="glass-card-quantum p-7 transition-all flex flex-col justify-between h-full group gradient-border-red relative overflow-hidden">
        <div className="absolute -right-6 -top-6 w-28 h-28 bg-red-500/10 blur-2xl rounded-full group-hover:bg-red-500/20 transition-colors"></div>
        
        <div className="flex items-center justify-between gap-x-4 mb-5 relative z-10">
          <div className="flex-1 min-w-0 pr-4">
            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-1 truncate">
              Saídas (Mês)
            </p>
            <h3 className="text-4xl font-black font-mono tracking-tighter text-red-400 truncate">
              - R$ {saidas.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </h3>
          </div>
          
          <div className="p-3.5 flex-shrink-0 rounded-2xl bg-red-500/10 text-red-400 border border-red-500/20 group-hover:scale-110 transition-transform">
            <ArrowDownCircle className="w-6 h-6" />
          </div>
        </div>
        <p className="text-[10px] text-slate-500 uppercase tracking-tight relative z-10 flex items-center gap-1.5 pt-3 border-t border-white/5">
          Controle de consumo
        </p>
      </div>

    </div>
  );
}