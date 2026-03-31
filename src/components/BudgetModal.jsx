// src/components/BudgetModal.jsx
import { useState, useEffect } from 'react';
import { X, Target } from 'lucide-react';
import toast from 'react-hot-toast';

export default function BudgetModal({ isOpen, onClose, currentGoal, onSave }) {
  const [goal, setGoal] = useState('');

  // Sincroniza o valor atual quando o modal abre
  useEffect(() => {
    if (isOpen) {
      setGoal(currentGoal ? String(currentGoal) : '');
    }
  }, [isOpen, currentGoal]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    
    const numericGoal = Number(goal);
    
    if (isNaN(numericGoal) || numericGoal < 0) {
      toast.error("Por favor, insira um valor válido.");
      return;
    }

    onSave(numericGoal);
    toast.success("Teto mensal atualizado com sucesso!");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-quantum-card w-full max-w-sm rounded-3xl p-6 shadow-2xl border border-quantum-border animate-in zoom-in-95">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Target className="w-5 h-5 text-quantum-accent" />
            Teto Mensal
          </h2>
          <button onClick={onClose} className="p-1.5 bg-quantum-bgSecondary text-quantum-fgMuted rounded-full hover:bg-quantum-border hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-quantum-fgMuted mb-6">
          Defina o limite máximo que pretende gastar este mês. Iremos avisá-lo caso se aproxime deste teto.
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-bold text-quantum-fgMuted uppercase tracking-wider mb-1.5 ml-1">
              Valor do Teto (R$)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="Ex: 3500.00"
              autoFocus
              className="w-full px-4 py-3 bg-quantum-bg border border-quantum-border rounded-xl text-white font-mono focus:outline-none focus:border-quantum-accent focus:ring-1 focus:ring-quantum-accent transition-all"
            />
          </div>

          <button
            type="submit"
            className="w-full py-3.5 font-bold rounded-xl transition-all shadow-lg bg-quantum-accent text-quantum-bg hover:bg-emerald-400 hover:shadow-quantum-accentGlow flex items-center justify-center gap-2"
          >
            Guardar Objetivo
          </button>
        </form>
      </div>
    </div>
  );
}