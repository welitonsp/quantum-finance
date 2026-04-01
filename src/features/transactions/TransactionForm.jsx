// src/components/TransactionForm.jsx
import { useState, useEffect } from "react";
import { Save, X, Tag, DollarSign, Calendar, FileText } from "lucide-react";

export default function TransactionForm({ onSave, editingTransaction, onCancelEdit }) {
  const [description, setDescription] = useState("");
  const [value, setValue] = useState("");
  const [type, setType] = useState("saida");
  const [category, setCategory] = useState("");
  const [date, setDate] = useState("");

  // Carrega os dados se estivermos a editar uma transação existente
  useEffect(() => {
    if (editingTransaction) {
      setDescription(editingTransaction.description || "");
      setValue(editingTransaction.value || "");
      setType(editingTransaction.type || "saida");
      setCategory(editingTransaction.category || "");
      
      // Formatação segura de datas vindas do Firebase
      const d = editingTransaction.createdAt?.toDate 
        ? editingTransaction.createdAt.toDate() 
        : new Date(editingTransaction.createdAt || Date.now());
      setDate(d.toISOString().split('T')[0]);
    } else {
      // Valor por defeito para nova transação: data de hoje
      setDate(new Date().toISOString().split('T')[0]);
    }
  }, [editingTransaction]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      description,
      value: Number(value),
      type,
      category: category || "Diversos",
      // Adiciona a hora atual à data selecionada para manter a ordenação cronológica precisa
      createdAt: date ? new Date(`${date}T12:00:00`).toISOString() : new Date().toISOString()
    });
    
    // Limpa o formulário após salvar (se for nova transação)
    if (!editingTransaction) {
      setDescription("");
      setValue("");
      setCategory("");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      
      {/* Cabeçalho do Formulário */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold text-white tracking-wide">
            {editingTransaction ? "Editar Movimentação" : "Nova Movimentação"}
          </h3>
          <p className="text-xs text-slate-400">Registe os detalhes da transação com precisão.</p>
        </div>
        {editingTransaction && (
          <button type="button" onClick={onCancelEdit} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-colors" title="Cancelar Edição">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        
        {/* Campo: Descrição */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">Descrição</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <FileText className="h-4 w-4 text-slate-500" />
            </div>
            <input 
              required 
              type="text" 
              value={description} 
              onChange={e => setDescription(e.target.value)} 
              placeholder="Ex: Supermercado, Salário..." 
              className="w-full bg-slate-900/50 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all shadow-inner" 
            />
          </div>
        </div>

        {/* Campo: Valor */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">Valor (R$)</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <DollarSign className="h-4 w-4 text-slate-500" />
            </div>
            <input 
              required 
              type="number" 
              step="0.01" 
              min="0.01"
              value={value} 
              onChange={e => setValue(e.target.value)} 
              placeholder="0.00" 
              className="w-full bg-slate-900/50 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all shadow-inner font-mono" 
            />
          </div>
        </div>

        {/* Campo: Tipo (Entrada/Saída) */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">Natureza da Operação</label>
          <div className="flex gap-2 p-1 bg-slate-900/50 border border-white/10 rounded-xl shadow-inner">
            <button 
              type="button" 
              onClick={() => setType('entrada')} 
              className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-all ${type === 'entrada' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-md' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}
            >
              Receita
            </button>
            <button 
              type="button" 
              onClick={() => setType('saida')} 
              className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-all ${type === 'saida' ? 'bg-red-500/20 text-red-400 border border-red-500/30 shadow-md' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}
            >
              Despesa
            </button>
          </div>
        </div>

        {/* Campo: Categoria */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">Categoria</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Tag className="h-4 w-4 text-slate-500" />
            </div>
            <input 
              type="text" 
              value={category} 
              onChange={e => setCategory(e.target.value)} 
              placeholder="Ex: Alimentação, Lazer..." 
              className="w-full bg-slate-900/50 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all shadow-inner" 
            />
          </div>
        </div>
        
        {/* Campo: Data */}
        <div className="space-y-2 md:col-span-2">
          <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">Data da Ocorrência</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Calendar className="h-4 w-4 text-slate-500" />
            </div>
            {/* [color-scheme:dark] forca o calendário nativo do navegador a ficar com fundo preto */}
            <input 
              required 
              type="date" 
              value={date} 
              onChange={e => setDate(e.target.value)} 
              className="w-full bg-slate-900/50 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all shadow-inner [color-scheme:dark]" 
            />
          </div>
        </div>
      </div>

      {/* Rodapé: Ações */}
      <div className="pt-6 flex justify-end gap-3 border-t border-white/10">
        {editingTransaction && (
          <button 
            type="button" 
            onClick={onCancelEdit} 
            className="px-6 py-2.5 text-xs font-bold uppercase tracking-widest rounded-xl border border-white/10 text-slate-300 hover:bg-slate-800 transition-all"
          >
            Cancelar
          </button>
        )}
        <button 
          type="submit" 
          className="px-6 py-2.5 text-xs font-bold uppercase tracking-widest rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 text-white shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2"
        >
          <Save className="w-4 h-4" /> 
          {editingTransaction ? "Guardar Alterações" : "Registar Transação"}
        </button>
      </div>
    </form>
  );
}