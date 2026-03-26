// src/components/TransactionForm.jsx
import { useState, useEffect } from "react";

export default function TransactionForm({ onSave, editingTransaction, onCancelEdit }) {
  const [value, setValue] = useState("");
  const [type, setType] = useState("entrada");
  const [category, setCategory] = useState("");
  
  const hoje = new Date().toISOString().split('T')[0];
  const [date, setDate] = useState(hoje);

  // Observador: Se recebermos uma transação para editar, preenchemos os campos
  useEffect(() => {
    if (editingTransaction) {
      setValue(editingTransaction.value);
      setType(editingTransaction.type);
      setCategory(editingTransaction.category);
      
      // Formata a data corretamente para o input (YYYY-MM-DD)
      const d = editingTransaction.createdAt;
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      setDate(`${yyyy}-${mm}-${dd}`);
    } else {
      limparFormulario();
    }
  }, [editingTransaction]);

  const limparFormulario = () => {
    setValue("");
    setCategory("");
    setType("entrada");
    setDate(hoje);
  };

  const handleSave = () => {
    if (!value) return;
    
    onSave({ 
      value: Number(value), 
      type: type || "entrada", 
      category: category || "Diversos",
      date: date 
    });
    
    limparFormulario();
  };

  // O formulário muda para tons de âmbar se estiver no modo de edição
  return (
    <div className={`mb-10 rounded-3xl border p-6 shadow-2xl backdrop-blur-md transition-all duration-300 ${editingTransaction ? 'border-amber-500/50 bg-amber-950/20' : 'border-zinc-800/60 bg-zinc-900/40'}`}>
      
      {editingTransaction && (
        <div className="mb-4 flex items-center justify-between text-amber-400">
          <span className="text-sm font-bold uppercase tracking-widest flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
            </span>
            Modo de Edição Ativo
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-6 md:items-end">
        
        <div className="flex flex-col gap-1.5 md:col-span-1">
          <label className="text-xs font-bold tracking-wider text-zinc-500 uppercase">Data</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-xl border border-zinc-700/50 bg-zinc-950/50 px-4 py-3 text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 [color-scheme:dark]" />
        </div>

        <div className="flex flex-col gap-1.5 md:col-span-1">
          <label className="text-xs font-bold tracking-wider text-zinc-500 uppercase">Valor (R$)</label>
          <input type="number" placeholder="0,00" value={value} onChange={(e) => setValue(e.target.value)} className="w-full rounded-xl border border-zinc-700/50 bg-zinc-950/50 px-4 py-3 text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
        </div>

        <div className="flex flex-col gap-1.5 md:col-span-1">
          <label className="text-xs font-bold tracking-wider text-zinc-500 uppercase">Tipo</label>
          <select value={type} onChange={(e) => setType(e.target.value)} className="w-full rounded-xl border border-zinc-700/50 bg-zinc-950/50 px-4 py-3 text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500">
            <option value="entrada">🟢 Entrada</option>
            <option value="saida">🔴 Saída</option>
          </select>
        </div>

        <div className="flex flex-col gap-1.5 md:col-span-2">
          <label className="text-xs font-bold tracking-wider text-zinc-500 uppercase">Categoria</label>
          <input type="text" placeholder="Ex: Salário..." value={category} onChange={(e) => setCategory(e.target.value)} className="w-full rounded-xl border border-zinc-700/50 bg-zinc-950/50 px-4 py-3 text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
        </div>

        <div className="flex flex-col gap-2 md:col-span-1">
          <button onClick={handleSave} className={`w-full rounded-xl px-4 py-3 font-bold text-white shadow-lg transition-all active:scale-95 ${editingTransaction ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-500/20' : 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-500/20'}`}>
            {editingTransaction ? "Atualizar" : "Gravar"}
          </button>
          
          {editingTransaction && (
            <button onClick={onCancelEdit} className="w-full rounded-xl bg-zinc-800 px-4 py-2 text-sm font-bold text-zinc-400 transition-all hover:bg-zinc-700 hover:text-white">
              Cancelar
            </button>
          )}
        </div>

      </div>
    </div>
  );
}