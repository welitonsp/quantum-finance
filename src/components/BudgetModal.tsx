import { useState, useEffect } from 'react';
import { X, Target, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentGoal: number;
  onSave: (goal: number) => void;
}

export default function BudgetModal({ isOpen, onClose, currentGoal, onSave }: Props) {
  const [goal, setGoal]                     = useState('');
  const [showConfirmZero, setShowConfirmZero] = useState(false);

  useEffect(() => {
    if (isOpen) { setGoal(currentGoal ? String(currentGoal) : ''); setShowConfirmZero(false); }
  }, [isOpen, currentGoal]);

  if (!isOpen) return null;

  const executeSave = (numericGoal: number) => {
    onSave(numericGoal);
    toast.success(numericGoal === 0 ? 'Monitorização de orçamento desativada.' : 'Teto mensal atualizado com sucesso!');
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const numericGoal = Number(goal);
    if (isNaN(numericGoal) || numericGoal < 0) { toast.error('Por favor, insira um valor válido.'); return; }
    if (numericGoal === 0) { setShowConfirmZero(true); return; }
    executeSave(numericGoal);
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-quantum-card w-full max-w-sm rounded-3xl p-6 shadow-2xl border border-quantum-border animate-in zoom-in-95 relative overflow-hidden">
        <div className="flex items-center justify-between mb-6 relative z-10">
          <h2 className="text-xl font-bold text-white flex items-center gap-2"><Target className="w-5 h-5 text-quantum-accent" />Teto Mensal</h2>
          <button onClick={onClose} className="p-1.5 bg-quantum-bgSecondary text-quantum-fgMuted rounded-full hover:bg-quantum-border hover:text-white transition-colors"><X className="w-5 h-5" /></button>
        </div>

        {showConfirmZero ? (
          <div className="space-y-6 relative z-10 animate-in slide-in-from-right-4">
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-center">
              <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-2" />
              <h3 className="text-sm font-bold text-white mb-1">Desativar Orçamento?</h3>
              <p className="text-xs text-slate-400">Ao definir a meta como R$ 0.00, a IA deixará de monitorizar e avisar sobre os seus gastos.</p>
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => setShowConfirmZero(false)} className="flex-1 py-3 font-bold rounded-xl text-slate-300 bg-slate-800 hover:bg-slate-700 transition-colors text-sm">Cancelar</button>
              <button type="button" onClick={() => executeSave(0)} className="flex-1 py-3 font-bold rounded-xl text-white bg-red-600 hover:bg-red-700 transition-colors shadow-lg shadow-red-600/20 text-sm">Confirmar</button>
            </div>
          </div>
        ) : (
          <div className="relative z-10">
            <p className="text-sm text-quantum-fgMuted mb-6">Defina o limite máximo que pretende gastar este mês.</p>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-quantum-fgMuted uppercase tracking-wider mb-1.5 ml-1">Valor do Teto (R$)</label>
                <input type="number" step="0.01" min="0" value={goal} onChange={e => setGoal(e.target.value)} placeholder="Ex: 3500.00" autoFocus
                  className="w-full px-4 py-3 bg-quantum-bg border border-quantum-border rounded-xl text-white font-mono focus:outline-none focus:border-quantum-accent focus:ring-1 focus:ring-quantum-accent transition-all" />
              </div>
              <button type="submit" className="w-full py-3.5 font-bold rounded-xl transition-all shadow-lg bg-quantum-accent text-quantum-bg hover:bg-emerald-400 hover:shadow-quantum-accentGlow flex items-center justify-center gap-2">Guardar Objetivo</button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
