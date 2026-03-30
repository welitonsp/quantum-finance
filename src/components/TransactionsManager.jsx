// src/components/TransactionsManager.jsx
import { useState, useMemo } from "react";
import { Search, Edit2, Trash2, ArrowUpRight, ArrowDownRight, Frown, Loader2 } from "lucide-react";

export default function TransactionsManager({ transactions, loading, onEdit, onDelete }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("todos"); 

  const filteredTransactions = useMemo(() => {
    if (!transactions) return [];
    return transactions.filter(tx => {
      const matchSearch = (tx.description || "").toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (tx.category || "").toLowerCase().includes(searchTerm.toLowerCase());
      const matchType = filterType === "todos" ? true : tx.type === filterType;
      return matchSearch && matchType;
    });
  }, [transactions, searchTerm, filterType]);

  const formatDate = (rawDate) => {
    if (!rawDate) return "Data desconhecida";
    let dateObj;
    if (rawDate.toDate) { dateObj = rawDate.toDate(); } else { dateObj = new Date(rawDate); }
    if (isNaN(dateObj.getTime())) return "Data inválida";
    return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(dateObj);
  };

  return (
    <div className="glass-card-quantum p-6 flex flex-col h-full min-h-[500px] border-t-4 border-t-cyan-500 animate-in fade-in duration-500">
      
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-white tracking-wide uppercase transition-colors">Livro Razão</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-bold">Gira e audite todas as suas movimentações.</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          {/* Input Temático */}
          <div className="relative w-full sm:w-64">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-slate-400 dark:text-slate-500" />
            </div>
            <input 
              type="text" 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Pesquisar transação..." 
              className="w-full bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-white/10 rounded-xl pl-10 pr-4 py-2 text-sm text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all shadow-inner"
            />
          </div>

          {/* Filtros em Pílula Temáticos */}
          <div className="flex p-1 bg-slate-100 dark:bg-slate-900/80 border border-slate-200 dark:border-white/10 rounded-xl shadow-inner">
            <button onClick={() => setFilterType('todos')} className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${filterType === 'todos' ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}>Tudo</button>
            <button onClick={() => setFilterType('entrada')} className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${filterType === 'entrada' ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}>Receitas</button>
            <button onClick={() => setFilterType('saida')} className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${filterType === 'saida' ? 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400 shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}>Despesas</button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        {loading ? (
          <div className="flex-1 flex flex-col justify-center items-center text-slate-500">
            <Loader2 className="w-8 h-8 animate-spin text-cyan-500 mb-4" />
            <p className="text-sm font-bold tracking-widest uppercase">A carregar registos...</p>
          </div>
        ) : filteredTransactions.length === 0 ? (
          <div className="flex-1 flex flex-col justify-center items-center text-slate-500 border-2 border-dashed border-slate-200 dark:border-white/5 rounded-2xl p-6 bg-slate-50 dark:bg-transparent transition-colors">
            <Frown className="w-12 h-12 mb-3 text-slate-400 dark:text-slate-600" />
            <p className="text-base font-bold text-slate-600 dark:text-slate-400">Nenhum registo encontrado</p>
            <p className="text-xs mt-1 font-bold">Altere os filtros ou adicione uma nova movimentação.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-2 pb-4">
            {filteredTransactions.map((tx) => (
              <div key={tx.id} className="group relative flex items-center justify-between p-4 bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-white/5 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:border-slate-300 dark:hover:border-white/10 transition-all overflow-hidden shadow-sm dark:shadow-none">
                
                <div className={`absolute left-0 top-0 bottom-0 w-1 ${tx.type === 'entrada' ? 'bg-emerald-500' : 'bg-red-500'} opacity-0 group-hover:opacity-100 transition-opacity`}></div>

                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-xl border ${tx.type === 'entrada' ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-transparent' : 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border-red-100 dark:border-transparent'}`}>
                    {tx.type === 'entrada' ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownRight className="w-5 h-5" />}
                  </div>
                  
                  <div>
                    <h4 className="text-sm font-bold text-slate-800 dark:text-white mb-0.5 transition-colors">{tx.description}</h4>
                    <div className="flex items-center gap-2 text-xs text-slate-500 font-bold">
                      <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded-md border border-slate-200 dark:border-white/5 transition-colors">{tx.category || 'Diversos'}</span>
                      <span>•</span>
                      <span>{formatDate(tx.createdAt || tx.date)}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <span className={`text-base font-black font-mono transition-colors ${tx.type === 'entrada' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-800 dark:text-white'}`}>
                    {tx.type === 'entrada' ? '+' : '-'} R$ {Number(tx.value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                  
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity translate-x-4 group-hover:translate-x-0 duration-200">
                    <button onClick={() => onEdit(tx)} className="p-2 text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-500/10 rounded-lg transition-colors" title="Editar">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => onDelete(tx.id)} className="p-2 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors" title="Apagar">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}