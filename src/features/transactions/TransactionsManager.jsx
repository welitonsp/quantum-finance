// src/features/transactions/TransactionsManager.jsx
import { useState, useMemo } from "react";
import { Search, Edit2, Trash2, ArrowUpRight, ArrowDownRight, Frown, Loader2, Trash, CheckSquare, Square } from "lucide-react";
// ✅ CORREÇÃO: Voltando duas pastas para achar o contexto
import { usePrivacy } from "../../contexts/PrivacyContext";

export default function TransactionsManager({ 
  transactions, 
  loading, 
  onEdit, 
  onDeleteRequest,
  onBatchDelete,      // 🆕 função para apagar múltiplos (recebe array de IDs)
  onDeleteAll         // 🆕 função para apagar todos os visíveis (recebe array de IDs)
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("todos");
  const [selectedIds, setSelectedIds] = useState(new Set());
  const { isPrivacyMode } = usePrivacy();

  // Filtragem
  const filteredTransactions = useMemo(() => {
    if (!transactions) return [];
    return transactions.filter(tx => {
      const matchSearch = (tx.description || "").toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (tx.category || "").toLowerCase().includes(searchTerm.toLowerCase());
      const matchType = filterType === "todos" ? true : tx.type === filterType;
      return matchSearch && matchType;
    });
  }, [transactions, searchTerm, filterType]);

  // Selecionar / desselecionar todos
  const allSelected = filteredTransactions.length > 0 && filteredTransactions.every(tx => selectedIds.has(tx.id));
  
  const handleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      const newSet = new Set(filteredTransactions.map(tx => tx.id));
      setSelectedIds(newSet);
    }
  };

  const toggleSelect = (id) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  // Exclusão em lote (itens selecionados)
  const handleBatchDeleteClick = () => {
    if (selectedIds.size === 0) return;
    if (window.confirm(`Tem a certeza que deseja eliminar ${selectedIds.size} transação(ões) permanentemente?`)) {
      onBatchDelete(Array.from(selectedIds));
      setSelectedIds(new Set());
    }
  };

  // Exclusão de todos os registos visíveis (com dupla confirmação)
  const handleDeleteAllClick = () => {
    if (filteredTransactions.length === 0) return;
    const confirmMsg = `⚠️ ATENÇÃO: Esta ação irá apagar TODAS as ${filteredTransactions.length} transações visíveis (com os filtros atuais). Não poderá desfazer. Deseja continuar?`;
    if (window.confirm(confirmMsg)) {
      if (window.confirm("ÚLTIMA CONFIRMAÇÃO: Tem a certeza absoluta?")) {
        onDeleteAll(filteredTransactions.map(tx => tx.id));
        setSelectedIds(new Set());
      }
    }
  };

  const formatDate = (rawDate) => {
    if (!rawDate) return "Data desconhecida";
    let dateObj = rawDate.toDate ? rawDate.toDate() : new Date(rawDate);
    if (isNaN(dateObj.getTime())) return "Data inválida";
    return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(dateObj);
  };

  return (
    <div className="glass-card-quantum p-6 flex flex-col h-full min-h-[500px] border-t-4 border-t-cyan-500 animate-in fade-in duration-500">
      {/* Cabeçalho com título e contador de seleção */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-white tracking-wide uppercase transition-colors">Livro Razão</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-bold">
            {selectedIds.size > 0 ? `${selectedIds.size} selecionada(s)` : "Gira e audite todas as suas movimentações."}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          {/* Campo de pesquisa */}
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

          {/* Filtros de tipo */}
          <div className="flex p-1 bg-slate-100 dark:bg-slate-900/80 border border-slate-200 dark:border-white/10 rounded-xl shadow-inner">
            <button onClick={() => setFilterType('todos')} className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${filterType === 'todos' ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}>Tudo</button>
            <button onClick={() => setFilterType('entrada')} className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${filterType === 'entrada' ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}>Receitas</button>
            <button onClick={() => setFilterType('saida')} className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${filterType === 'saida' ? 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400 shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}>Despesas</button>
          </div>
        </div>
      </div>

      {/* Barra de ações em lote (aparece apenas se houver seleção) */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between bg-indigo-50 dark:bg-indigo-500/10 p-3 rounded-xl mb-4 border border-indigo-200 dark:border-indigo-500/30">
          <span className="text-sm font-bold text-indigo-700 dark:text-indigo-300">
            {selectedIds.size} transação(ões) selecionada(s)
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setSelectedIds(new Set())}
              className="px-3 py-1.5 text-xs font-bold rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleBatchDeleteClick}
              className="px-3 py-1.5 text-xs font-bold rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors flex items-center gap-1"
            >
              <Trash className="w-3 h-3" /> Apagar Selecionados
            </button>
          </div>
        </div>
      )}

      {/* Lista de transações */}
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
            {transactions.length > 0 && filteredTransactions.length === 0 && (
              <button
                onClick={handleDeleteAllClick}
                className="mt-4 px-4 py-2 bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400 text-xs font-bold rounded-lg hover:bg-red-200 dark:hover:bg-red-500/30 transition-colors"
              >
                Apagar Todos os Registos (filtro atual)
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Cabeçalho da tabela com "Selecionar todos" e "Apagar tudo" */}
            <div className="flex items-center gap-2 mb-2 px-4">
              <button onClick={handleSelectAll} className="p-1 text-slate-500 hover:text-indigo-600 transition-colors" title={allSelected ? "Desselecionar todos" : "Selecionar todos"}>
                {allSelected ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
              </button>
              <span className="text-xs text-slate-500">Selecionar todos</span>
              {filteredTransactions.length > 0 && (
                <button
                  onClick={handleDeleteAllClick}
                  className="ml-auto text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition-colors flex items-center gap-1"
                  title="Apagar todas as transações visíveis"
                >
                  <Trash className="w-3 h-3" /> Apagar tudo
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-2 pb-4">
              {filteredTransactions.map((tx) => (
                <div 
                  key={tx.id} 
                  className={`group relative flex flex-wrap items-center justify-between p-4 bg-white dark:bg-slate-900/40 border rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-all overflow-hidden shadow-sm dark:shadow-none ${
                    selectedIds.has(tx.id) 
                      ? 'border-indigo-400 dark:border-indigo-500 ring-1 ring-indigo-400' 
                      : 'border-slate-200 dark:border-white/5'
                  }`}
                >
                  {/* Checkbox de seleção */}
                  <div className="mr-3 flex-shrink-0">
                    <button onClick={() => toggleSelect(tx.id)} className="p-1 text-slate-500 hover:text-indigo-600 transition-colors">
                      {selectedIds.has(tx.id) ? <CheckSquare className="w-5 h-5 text-indigo-600" /> : <Square className="w-5 h-5" />}
                    </button>
                  </div>

                  <div className={`absolute left-0 top-0 bottom-0 w-1 ${tx.type === 'entrada' ? 'bg-emerald-500' : 'bg-red-500'} opacity-0 group-hover:opacity-100 transition-opacity`}></div>

                  <div className="flex items-center gap-4 flex-1 min-w-[180px]">
                    <div className={`p-3 rounded-xl border ${tx.type === 'entrada' ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-transparent' : 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border-red-100 dark:border-transparent'}`}>
                      {tx.type === 'entrada' ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownRight className="w-5 h-5" />}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-800 dark:text-white mb-0.5 transition-colors">{tx.description}</h4>
                      <div className="flex items-center gap-2 text-xs text-slate-500 font-bold flex-wrap">
                        <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded-md border border-slate-200 dark:border-white/5">{tx.category || 'Diversos'}</span>
                        <span>• {formatDate(tx.createdAt || tx.date)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 mt-3 sm:mt-0">
                    <span className={`text-base font-black font-mono transition-colors ${tx.type === 'entrada' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-800 dark:text-white'}`}>
                      {isPrivacyMode ? '••••••' : `${tx.type === 'entrada' ? '+' : '-'} R$ ${Number(tx.value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                    </span>
                    
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity translate-x-4 group-hover:translate-x-0 duration-200">
                      <button onClick={() => onEdit(tx)} className="p-2 text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-500/10 rounded-lg transition-colors" title="Editar">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => onDeleteRequest(tx)} className="p-2 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors" title="Apagar">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}