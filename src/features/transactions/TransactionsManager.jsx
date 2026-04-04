import React, { useState, useMemo } from 'react';
import { Search, Filter, Trash2, Edit3, AlertTriangle } from 'lucide-react';
import { formatCurrency, formatDate } from '../../utils/formatters';

export default function TransactionsManager({ transactions, loading, onEdit, onDeleteRequest, onBatchDelete, onDeleteAll }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('todos');
  const [selectedIds, setSelectedIds] = useState(new Set());
  
  const [deleteAllModalOpen, setDeleteAllModalOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => {
      const matchSearch = tx.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          tx.category?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchType = filterType === 'todos' || tx.type === filterType;
      return matchSearch && matchType;
    });
  }, [transactions, searchTerm, filterType]);

  const toggleSelection = (id) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const handleBatchDeleteClick = () => {
    if (selectedIds.size === 0) return;
    onBatchDelete(Array.from(selectedIds));
    setSelectedIds(new Set());
  };

  const handleDeleteAllClick = () => {
    if (filteredTransactions.length === 0) return;
    setDeleteAllModalOpen(true);
  };

  if (loading) return <div className="p-8 text-center text-quantum-fgMuted animate-pulse">A carregar registos...</div>;

  return (
    <div className="bg-quantum-card border border-quantum-border rounded-3xl p-6 shadow-xl h-full flex flex-col">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <h2 className="text-xl font-bold text-white">Livro Razão</h2>
        
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Pesquisar..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-900/50 border border-white/10 rounded-xl pl-9 pr-4 py-2 text-sm text-white focus:border-quantum-accent focus:outline-none"
            />
          </div>
          <select 
            value={filterType} 
            onChange={(e) => setFilterType(e.target.value)}
            className="bg-slate-900/50 border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:outline-none"
          >
            <option value="todos">Todos</option>
            <option value="entrada">Receitas</option>
            <option value="saida">Despesas</option>
          </select>
        </div>
      </div>

      <div className="flex items-center gap-4 mb-4 pb-4 border-b border-white/5">
        <button 
          onClick={handleBatchDeleteClick}
          disabled={selectedIds.size === 0}
          className="text-xs font-bold px-4 py-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          Apagar Selecionados ({selectedIds.size})
        </button>
        <button 
          onClick={handleDeleteAllClick}
          disabled={filteredTransactions.length === 0}
          className="text-xs font-bold px-4 py-2 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors ml-auto"
        >
          Apagar Tudo Visível
        </button>
      </div>

      {deleteAllModalOpen && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 w-full max-w-sm rounded-3xl p-6 shadow-2xl border border-white/10 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-red-500/10 rounded-2xl">
                <AlertTriangle className="w-6 h-6 text-red-500" />
              </div>
              <h3 className="text-lg font-bold text-white">Apagar {filteredTransactions.length} registos?</h3>
            </div>
            <p className="text-sm text-slate-400 mb-4">
              Esta ação é <strong className="text-red-500">irreversível</strong>. Todos os registos visíveis serão eliminados permanentemente.
            </p>
            <p className="text-xs text-slate-500 mb-2">Digite <strong className="text-white">APAGAR</strong> para confirmar:</p>
            <input 
              value={confirmText} 
              onChange={e => setConfirmText(e.target.value)}
              placeholder="APAGAR"
              className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm mb-6 text-white focus:outline-none focus:border-red-500 transition-colors" 
            />
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => { setDeleteAllModalOpen(false); setConfirmText(''); }}
                className="px-5 py-2.5 rounded-xl font-bold text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
              >
                Cancelar
              </button>
              <button 
                disabled={confirmText !== 'APAGAR'}
                onClick={() => { onDeleteAll(filteredTransactions.map(t => t.id)); setDeleteAllModalOpen(false); setConfirmText(''); }}
                className="px-5 py-2.5 rounded-xl font-bold bg-red-600 text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                Apagar Definitivamente
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
        {filteredTransactions.length === 0 ? (
          <div className="text-center py-12 text-quantum-fgMuted">Nenhuma transação encontrada.</div>
        ) : (
          <div className="space-y-2">
            {filteredTransactions.map(tx => (
              <div key={tx.id} className="flex items-center gap-4 p-3 hover:bg-slate-800/50 rounded-xl transition-colors border border-transparent hover:border-white/5 group">
                <input 
                  type="checkbox" 
                  checked={selectedIds.has(tx.id)}
                  onChange={() => toggleSelection(tx.id)}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-900 accent-quantum-accent"
                />
                <div className={`w-2 h-2 rounded-full ${tx.type === 'entrada' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white truncate">{tx.description}</p>
                  <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                    <span className="px-1.5 py-0.5 bg-slate-800 rounded">{tx.category}</span>
                    <span>{formatDate(tx.date || tx.createdAt)}</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-bold font-mono ${tx.type === 'entrada' ? 'text-emerald-400' : 'text-white'}`}>
                    {tx.type === 'saida' ? '-' : '+'}{formatCurrency(tx.value)}
                  </p>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => onEdit(tx)} className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"><Edit3 className="w-4 h-4" /></button>
                  <button onClick={() => onDeleteRequest(tx)} className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}