import React, { useState, useEffect } from 'react';
import { X, Save, AlertCircle } from 'lucide-react';
import { ALLOWED_CATEGORIES } from '../../shared/schemas/financialSchemas';

export default function TransactionForm({ onSave, editingTransaction, onCancelEdit }) {
  const [formData, setFormData] = useState({
    description: '',
    value: '',
    type: 'saida',
    category: ALLOWED_CATEGORIES[0],
    date: new Date().toISOString().substring(0, 10)
  });
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (editingTransaction) {
      setFormData({
        description: editingTransaction.description || '',
        value: editingTransaction.value || '',
        type: editingTransaction.type || 'saida',
        category: editingTransaction.category || ALLOWED_CATEGORIES[0],
        date: editingTransaction.date ? editingTransaction.date.substring(0, 10) : new Date().toISOString().substring(0, 10)
      });
    }
  }, [editingTransaction]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!formData.description.trim() || !formData.value) {
      setError('Preencha a descrição e o valor.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      await onSave({
        ...formData,
        value: Number(formData.value)
      });
    } catch (err) {
      setError(err.message || 'Erro ao salvar transação.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-white">
          {editingTransaction ? 'Editar Transação' : 'Nova Transação'}
        </h2>
        {onCancelEdit && (
          <button onClick={onCancelEdit} className="p-2 text-slate-400 hover:text-white bg-slate-800 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-xl flex items-center gap-2 text-red-400 text-sm">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 ml-1">Descrição</label>
            <input
              type="text"
              name="description"
              value={formData.description}
              onChange={handleChange}
              placeholder="Ex: Supermercado"
              className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-quantum-accent"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 ml-1">Valor</label>
            <input
              type="number"
              step="0.01"
              min="0"
              name="value"
              value={formData.value}
              onChange={handleChange}
              placeholder="0.00"
              className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-quantum-accent"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 ml-1">Data</label>
            <input
              type="date"
              name="date"
              value={formData.date}
              onChange={handleChange}
              className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-quantum-accent"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 ml-1">Tipo</label>
            <select
              name="type"
              value={formData.type}
              onChange={handleChange}
              className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-quantum-accent"
            >
              <option value="saida">Despesa (Saída)</option>
              <option value="entrada">Receita (Entrada)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 ml-1">Categoria</label>
            <select
              name="category"
              value={formData.category}
              onChange={handleChange}
              className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-quantum-accent"
            >
              {ALLOWED_CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="pt-4 mt-6 border-t border-white/5 flex justify-end gap-3">
          {onCancelEdit && (
            <button
              type="button"
              onClick={onCancelEdit}
              className="px-6 py-3 rounded-xl font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              Cancelar
            </button>
          )}
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex items-center gap-2 px-6 py-3 bg-quantum-accent text-slate-900 font-bold rounded-xl hover:bg-emerald-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="w-5 h-5" />
            {isSubmitting ? 'A Guardar...' : 'Guardar Transação'}
          </button>
        </div>
      </form>
    </div>
  );
}