// src/components/TransactionsManager.jsx
import { useState, useMemo } from "react";
import { Search, ArrowUpRight, ArrowDownLeft, Pencil, Trash2, Filter } from "lucide-react";

export default function TransactionsManager({ transactions, loading, onEdit, onDelete }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all"); // 'all', 'entrada', 'saida'

  // Motor de Busca em Tempo Real (Filtra por texto e tipo)
  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => {
      // Verifica se o texto pesquisado bate com a categoria, descrição ou conta
      const searchableText = `${tx.category || "Diversos"} ${tx.description || ""} ${tx.account || ""}`.toLowerCase();
      const matchesSearch = searchableText.includes(searchTerm.toLowerCase());
      
      // Verifica o tipo (Entrada/Saída)
      const matchesType = filterType === "all" || tx.type === filterType;
      
      return matchesSearch && matchesType;
    });
  }, [transactions, searchTerm, filterType]);

  return (
    <div className="glass-card-dark p-6 flex flex-col min-h-[500px]">
      {/* Cabeçalho do Gestor */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-widest text-slate-300">Histórico Avançado</h2>
          <p className="text-xs text-slate-500">Gestão e pesquisa de movimentações</p>
        </div>
        <span className="text-xs bg-indigo-500/20 text-indigo-400 px-3 py-1 rounded-full font-bold border border-indigo-500/20">
          {filteredTransactions.length} Registos encontrados
        </span>
      </div>

      {/* Barra de Ferramentas (Pesquisa e Filtros) */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-slate-500" />
          </div>
          <input
            type="text"
            placeholder="Pesquisar categoria, descrição..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-900/50 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all"
          />
        </div>
        <div className="flex gap-2 bg-slate-900/50 p-1 rounded-xl border border-white/10 overflow-x-auto custom-scrollbar">
          <button 
            onClick={() => setFilterType("all")} 
            className={`px-4 py-1.5 text-xs font-bold rounded-lg whitespace-nowrap transition-colors ${filterType === "all" ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white"}`}
          >
            Todas
          </button>
          <button 
            onClick={() => setFilterType("entrada")} 
            className={`px-4 py-1.5 text-xs font-bold rounded-lg whitespace-nowrap transition-colors flex items-center gap-1 ${filterType === "entrada" ? "bg-emerald-500/20 text-emerald-400" : "text-slate-400 hover:text-emerald-400"}`}
          >
            <ArrowDownLeft className="w-3 h-3" /> Entradas
          </button>
          <button 
            onClick={() => setFilterType("saida")} 
            className={`px-4 py-1.5 text-xs font-bold rounded-lg whitespace-nowrap transition-colors flex items-center gap-1 ${filterType === "saida" ? "bg-red-500/20 text-red-400" : "text-slate-400 hover:text-red-400"}`}
          >
            <ArrowUpRight className="w-3 h-3" /> Saídas
          </button>
        </div>
      </div>
      
      {/* Lista de Transações */}
      <div className="flex-1 space-y-3 overflow-y-auto custom-scrollbar pr-2 max-h-[600px]">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-40 text-slate-500 animate-pulse">
            <Filter className="w-8 h-8 mb-2 opacity-50" />
            <p className="text-sm">A carregar registos da nuvem...</p>
          </div>
        ) : filteredTransactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-slate-500 border-2 border-dashed border-white/5 rounded-2xl">
            <p className="text-4xl mb-3">📭</p>
            <p className="text-sm font-medium">Nenhuma transação encontrada.</p>
            {searchTerm && <p className="text-xs mt-1">Tente usar outros termos de pesquisa.</p>}
          </div>
        ) : (
          filteredTransactions.map((tx) => (
            <div key={tx.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl bg-slate-900/40 hover:bg-slate-800/60 transition-all duration-300 border border-white/5 group">
              <div className="flex items-center gap-4 mb-3 sm:mb-0">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 shadow-inner ${tx.type === "entrada" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"}`}>
                  {tx.type === "entrada" ? <ArrowDownLeft className="w-5 h-5" /> : <ArrowUpRight className="w-5 h-5" />}
                </div>
                <div className="overflow-hidden">
                  <p className="font-bold text-sm text-slate-200 group-hover:text-white transition-colors truncate">{tx.category || "Diversos"}</p>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider truncate mt-0.5">
                    {tx.createdAt?.toDate ? tx.createdAt.toDate().toLocaleDateString('pt-BR') : new Date(tx.createdAt).toLocaleDateString('pt-BR')} 
                    <span className="mx-1">•</span> 
                    <span className={tx.account === 'cartao_credito' ? 'text-orange-400/70' : 'text-emerald-400/70'}>
                      {tx.account === 'conta_corrente' ? 'Conta' : 'Cartão'}
                    </span>
                    {tx.description && <span className="hidden md:inline"><span className="mx-1">•</span>{tx.description}</span>}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto">
                <p className={`font-mono font-bold text-lg ${tx.type === "entrada" ? "text-emerald-400" : "text-white"}`}>
                  {tx.type === "entrada" ? "+" : "-"}R$ {Math.abs(Number(tx.value)).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </p>
                <div className="flex gap-2 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                  <button onClick={() => onEdit(tx)} className="p-2 bg-amber-500/10 text-amber-400 rounded-lg hover:bg-amber-500/20 transition-colors" title="Editar"><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => onDelete(tx.id)} className="p-2 bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500/20 transition-colors" title="Remover"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}