// src/features/transactions/TransactionForm.jsx
import { useState, useEffect } from "react";
// ✅ INJEÇÃO: Adicionamos o ícone Loader2 para feedback visual
import { Save, X, Tag, DollarSign, Calendar, FileText, AlertCircle, Loader2 } from "lucide-react";
import { transactionSchema } from "../../shared/schemas/financialSchemas";

export default function TransactionForm({ onSave, editingTransaction, onCancelEdit }) {
  const [description, setDescription] = useState("");
  const [value, setValue] = useState("");
  const [type, setType] = useState("saida");
  const [category, setCategory] = useState("");
  const [date, setDate] = useState("");
  
  const [errors, setErrors] = useState({});
  // ✅ NOVO ESCUDO: Estado para bloquear o botão durante o salvamento
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (editingTransaction) {
      setDescription(editingTransaction.description || "");
      setValue(editingTransaction.value || "");
      setType(editingTransaction.type || "saida");
      setCategory(editingTransaction.category || "");
      
      const d = editingTransaction.createdAt?.toDate 
        ? editingTransaction.createdAt.toDate() 
        : new Date(editingTransaction.createdAt || Date.now());
      setDate(d.toISOString().split('T')[0]);
    } else {
      setDate(new Date().toISOString().split('T')[0]);
    }
  }, [editingTransaction]);

  // ✅ Função agora é assíncrona para aguardar a base de dados
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (isSubmitting) return; // Barreira extra contra duplo clique
    
    setErrors({});
    setIsSubmitting(true); // Bloqueia a interface

    try {
      const formData = {
        description,
        value: Number(value),
        type,
        category: category || "Diversos",
        date
      };

      const result = transactionSchema.safeParse(formData);

      if (!result.success) {
        const formattedErrors = {};
        result.error.issues.forEach((issue) => {
          formattedErrors[issue.path[0]] = issue.message;
        });
        setErrors(formattedErrors);
        setIsSubmitting(false); // Liberta a interface se houver erro
        return; 
      }

      // Aguarda a promessa do onSave (Firebase) terminar
      await onSave({
        ...result.data,
        createdAt: date ? new Date(`${date}T12:00:00`).toISOString() : new Date().toISOString()
      });
      
      if (!editingTransaction) {
        setDescription("");
        setValue("");
        setCategory("");
      }
    } catch (error) {
      console.error("Erro ao salvar transação:", error);
      // Aqui poderíamos adicionar um Toast de erro genérico no futuro
    } finally {
      setIsSubmitting(false); // Liberta o botão independentemente do resultado
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold text-white tracking-wide">
            {editingTransaction ? "Editar Movimentação" : "Nova Movimentação"}
          </h3>
          <p className="text-xs text-slate-400">Dados validados via Protocolo Zod.</p>
        </div>
        {editingTransaction && (
          <button 
            type="button" 
            onClick={onCancelEdit} 
            disabled={isSubmitting}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-colors disabled:opacity-50"
          >
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
              <FileText className={`h-4 w-4 ${errors.description ? 'text-red-500' : 'text-slate-500'}`} />
            </div>
            <input 
              type="text" 
              value={description} 
              onChange={e => setDescription(e.target.value)} 
              disabled={isSubmitting}
              className={`w-full bg-slate-900/50 border ${errors.description ? 'border-red-500/50' : 'border-white/10'} rounded-xl pl-10 pr-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 transition-all disabled:opacity-50`} 
            />
          </div>
          {errors.description && <p className="text-[10px] text-red-500 font-bold flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {errors.description}</p>}
        </div>

        {/* Campo: Valor */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">Valor (R$)</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <DollarSign className={`h-4 w-4 ${errors.value ? 'text-red-500' : 'text-slate-500'}`} />
            </div>
            <input 
              type="number" 
              step="0.01" 
              value={value} 
              onChange={e => setValue(e.target.value)} 
              disabled={isSubmitting}
              className={`w-full bg-slate-900/50 border ${errors.value ? 'border-red-500/50' : 'border-white/10'} rounded-xl pl-10 pr-4 py-3 text-sm text-white font-mono focus:outline-none focus:border-indigo-500 transition-all disabled:opacity-50`} 
            />
          </div>
          {errors.value && <p className="text-[10px] text-red-500 font-bold flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {errors.value}</p>}
        </div>

        {/* Campo: Tipo */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">Natureza</label>
          <div className="flex gap-2 p-1 bg-slate-900/50 border border-white/10 rounded-xl">
            <button 
              type="button" 
              disabled={isSubmitting}
              onClick={() => setType('entrada')} 
              className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-all disabled:opacity-50 ${type === 'entrada' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-slate-400'}`}
            >
              Receita
            </button>
            <button 
              type="button" 
              disabled={isSubmitting}
              onClick={() => setType('saida')} 
              className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-all disabled:opacity-50 ${type === 'saida' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'text-slate-400'}`}
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
              <Tag className={`h-4 w-4 ${errors.category ? 'text-red-500' : 'text-slate-500'}`} />
            </div>
            <select 
              value={category} 
              onChange={e => setCategory(e.target.value)}
              disabled={isSubmitting}
              className={`w-full bg-slate-900/50 border ${errors.category ? 'border-red-500/50' : 'border-white/10'} rounded-xl pl-10 pr-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 transition-all appearance-none disabled:opacity-50`}
            >
              <option value="">Selecione...</option>
              <option value="Alimentação">Alimentação</option>
              <option value="Transporte">Transporte</option>
              <option value="Lazer">Lazer</option>
              <option value="Saúde">Saúde</option>
              <option value="Moradia">Moradia</option>
              <option value="Assinaturas">Assinaturas</option>
              <option value="Educação">Educação</option>
              <option value="Investimento">Investimento</option>
              <option value="Salário">Salário</option>
              <option value="Diversos">Diversos</option>
            </select>
          </div>
          {errors.category && <p className="text-[10px] text-red-500 font-bold flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {errors.category}</p>}
        </div>
        
        <div className="space-y-2 md:col-span-2">
          <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">Data</label>
          <input 
            type="date" 
            value={date} 
            onChange={e => setDate(e.target.value)} 
            disabled={isSubmitting}
            className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 [color-scheme:dark] disabled:opacity-50" 
          />
        </div>
      </div>

      <div className="pt-6 flex justify-end gap-3 border-t border-white/10">
        <button 
          type="submit" 
          disabled={isSubmitting}
          className="px-6 py-2.5 text-xs font-bold uppercase tracking-widest rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 text-white shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:scale-100"
        >
          {/* Mostra o ícone de carregamento a girar se estiver a gravar, senão mostra o ícone normal */}
          {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} 
          {isSubmitting ? "A Guardar..." : (editingTransaction ? "Guardar Alterações" : "Registar Transação")}
        </button>
      </div>
    </form>
  );
}