import React, { useState, useMemo } from 'react';
import { Search, Filter, Trash2, Edit3, ArrowUpRight, ArrowDownRight, Calendar, CheckSquare, Square } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';

export default function TransactionsManager({
  transactions, loading, onEdit, onDeleteRequest, onBatchDelete, onDeleteAll
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());

  // Motor de Pesquisa
  const filteredTransactions = useMemo(() => {
    if (!transactions) return [];
    return transactions.filter(tx =>
      (tx.description || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (tx.category || '').toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [transactions, searchTerm]);

  const toggleSelect = (id) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const handleBatchDelete = () => {
    if (selectedIds.size > 0 && onBatchDelete) {
      onBatchDelete(Array.from(selectedIds));
      setSelectedIds(new Set());
    }
  };

  if (loading) {
    return <div className="p-12 text-center text-cyan-500 animate-pulse font-mono uppercase tracking-widest text-xs">A Sincronizar Matriz de Dados...</div>;
  }

  return (
    <div className="flex flex-col h-full w-full">
      
      {/* ── BARRA DE FERRAMENTAS ────────────────────────────── */}
      <div className="p-4 md:p-6 border-b border-slate-800/50 bg-slate-900/20 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Pesquisar movimentações..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-950/50 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-cyan-500 transition-colors"
          />
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          {selectedIds.size > 0 && (
            <button onClick={handleBatchDelete} className="flex items-center gap-2 px-4 py-2.5 bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 rounded-xl text-sm font-bold transition-all w-full md:w-auto justify-center animate-in zoom-in-95">
              <Trash2 className="w-4 h-4" /> Apagar ({selectedIds.size})
            </button>
          )}
        </div>
      </div>

      {/* ── LISTA DE TRANSAÇÕES ─────────────────────────────── */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-2 md:p-4">
        {filteredTransactions.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 bg-slate-800/50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Filter className="w-8 h-8 text-slate-500" />
            </div>
            <p className="text-slate-400 font-bold">Nenhuma movimentação encontrada.</p>
            <p className="text-xs text-slate-500 mt-1">Tente ajustar a sua pesquisa ou importar um extrato bancário.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredTransactions.map(tx => {
              const isIncome = tx.type === 'receita' || tx.type === 'entrada';
              const txDate = tx.date ? new Date(`${tx.date}T12:00:00`).toLocaleDateString('pt-BR') :
                            tx.createdAt ? new Date(tx.createdAt).toLocaleDateString('pt-BR') : 'Sem data';

              return (
                <div key={tx.id} className={`group flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 rounded-2xl border transition-all ${selectedIds.has(tx.id) ? 'bg-cyan-900/20 border-cyan-800/50' : 'bg-slate-900/40 border-slate-800 hover:border-slate-700 hover:bg-slate-800/50'}`}>
                  
                  <div className="flex items-center gap-4 w-full sm:w-auto">
                    <button onClick={() => toggleSelect(tx.id)} className="text-slate-500 hover:text-cyan-400 transition-colors">
                      {selectedIds.has(tx.id) ? <CheckSquare className="w-5 h-5 text-cyan-400" /> : <Square className="w-5 h-5" />}
                    </button>
                    
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isIncome ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                      {isIncome ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownRight className="w-5 h-5" />}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-200 truncate">{tx.description}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">{tx.category || 'Diversos'}</span>
                        <span className="text-[10px] text-slate-500 flex items-center gap-1"><Calendar className="w-3 h-3" /> {txDate}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between sm:justify-end w-full sm:w-auto mt-4 sm:mt-0 pl-14 sm:pl-0 gap-6">
                    <p className={`font-mono font-bold text-lg ${isIncome ? 'text-emerald-400' : 'text-slate-300'}`}>
                      {isIncome ? '+' : '-'}{formatCurrency(Math.abs(Number(tx.value || 0)))}
                    </p>
                    
                    <div className="flex items-center gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      <button onClick={() => onEdit(tx)} className="p-2 text-slate-500 hover:text-cyan-400 hover:bg-cyan-500/10 rounded-lg transition-colors" title="Editar">
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button onClick={() => onDeleteRequest(tx)} className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors" title="Apagar">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}