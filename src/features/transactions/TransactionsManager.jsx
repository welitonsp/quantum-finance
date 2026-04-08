import React, { useState, useMemo, useEffect } from 'react';
import { Plus, Trash2, Repeat, AlertTriangle, CheckCircle2, X } from 'lucide-react';
import Decimal from 'decimal.js';
import { useRecurring } from '../hooks/useRecurring';
import { formatCurrency } from '../utils/formatters';
import toast from 'react-hot-toast';

export default function RecurringManager({ uid }) {
  const { recurringTasks, loading, addRecurring, removeRecurring } = useRecurring(uid);
  
  // Estados para modais e formulários
  const [itemToDelete, setItemToDelete] = useState(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Campos do formulário
  const [newDescription, setNewDescription] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newCategory, setNewCategory] = useState('Moradia');
  const [newFrequency, setNewFrequency] = useState('mensal');

  // Cálculos financeiros precisos com Decimal.js
  const { totalMensal, totalAnual, itensAtivos } = useMemo(() => {
    let mensal = new Decimal(0);
    let anual  = new Decimal(0);
    let ativos = 0;

    if (!recurringTasks) return { totalMensal: 0, totalAnual: 0, itensAtivos: 0 };

    recurringTasks.forEach(item => {
      if (item.active !== false) { 
        ativos++;
        const val = new Decimal(item.value || 0);
        if (item.frequency === 'mensal') {
          mensal = mensal.plus(val);
          anual  = anual.plus(val.times(12));
        } else if (item.frequency === 'anual') {
          anual  = anual.plus(val);
          mensal = mensal.plus(val.dividedBy(12));
        }
      }
    });

    return {
      totalMensal:  mensal.toNumber(),
      totalAnual:   anual.toNumber(),
      itensAtivos:  ativos
    };
  }, [recurringTasks]);

  // Handler para submeter nova despesa fixa
  const handleAddRecurring = async (e) => {
    e.preventDefault();
    if (!newDescription || !newValue) {
      toast.error("Preencha a descrição e o valor.");
      return;
    }
    
    setIsProcessing(true);
    try {
      await addRecurring({
        description: newDescription,
        value: parseFloat(newValue),
        category: newCategory,
        frequency: newFrequency,
        active: true,
      });
      
      toast.success("Despesa fixa guardada com sucesso!");
      setIsAddModalOpen(false);
      
      // Limpar formulário
      setNewDescription('');
      setNewValue('');
      setNewCategory('Moradia');
      setNewFrequency('mensal');
    } catch (err) {
      console.error("Erro ao adicionar:", err);
      toast.error("Erro ao salvar a despesa.");
    } finally {
      setIsProcessing(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500 animate-pulse">A carregar compromissos...</div>;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 relative z-10">
      
      {/* CABEÇALHO */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Repeat className="w-6 h-6 text-cyan-400" /> Gestor de Recorrentes
          </h2>
          <p className="text-sm text-slate-400 mt-1">Controle as suas assinaturas e custos fixos.</p>
        </div>
        <button 
          onClick={() => setIsAddModalOpen(true)}
          className="w-full sm:w-auto px-5 py-3 sm:py-2.5 bg-cyan-500 text-slate-900 font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-cyan-400 transition-colors shadow-lg shadow-cyan-500/20"
        >
          <Plus className="w-5 h-5" /> Novo Contrato
        </button>
      </div>

      {/* DASHBOARD RESUMO */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-slate-900/40 p-6 rounded-3xl border border-white/5 backdrop-blur-sm">
          <p className="text-xs text-slate-400 uppercase tracking-widest font-bold mb-1">Custo Mensal Fixo</p>
          <p className="text-2xl font-black text-white">{formatCurrency(totalMensal)}</p>
        </div>
        <div className="bg-slate-900/40 p-6 rounded-3xl border border-white/5 backdrop-blur-sm">
          <p className="text-xs text-slate-400 uppercase tracking-widest font-bold mb-1">Impacto Anual</p>
          <p className="text-2xl font-black text-red-400">{formatCurrency(totalAnual)}</p>
        </div>
        <div className="bg-slate-900/40 p-6 rounded-3xl border border-white/5 backdrop-blur-sm">
          <p className="text-xs text-slate-400 uppercase tracking-widest font-bold mb-1">Contratos Ativos</p>
          <p className="text-2xl font-black text-cyan-400">{itensAtivos}</p>
        </div>
      </div>

      {/* MODAL DE ADIÇÃO */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 w-full max-w-md rounded-3xl p-6 shadow-2xl border border-white/10 animate-in zoom-in-95">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-white">Nova Despesa Fixa</h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-white transition-colors p-2 bg-slate-800 rounded-full hover:bg-slate-700">
                <X className="w-5 h-5"/>
              </button>
            </div>
            
            <form onSubmit={handleAddRecurring} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Descrição</label>
                <input 
                  required 
                  type="text" 
                  value={newDescription} 
                  onChange={e => setNewDescription(e.target.value)} 
                  className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-3.5 text-white focus:border-cyan-400 outline-none transition-colors" 
                  placeholder="Ex: Aluguel, Netflix, Internet"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Valor (R$)</label>
                  <input 
                    required 
                    type="number" 
                    step="0.01" 
                    min="0"
                    value={newValue} 
                    onChange={e => setNewValue(e.target.value)} 
                    className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-3.5 text-white focus:border-cyan-400 outline-none font-mono transition-colors" 
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Frequência</label>
                  <select 
                    value={newFrequency} 
                    onChange={e => setNewFrequency(e.target.value)} 
                    className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-3.5 text-white focus:border-cyan-400 outline-none transition-colors"
                  >
                    <option value="mensal">Mensal</option>
                    <option value="anual">Anual</option>
                  </select>
                </div>
              </div>
              
              <button 
                type="submit" 
                disabled={isProcessing}
                className="w-full py-4 bg-cyan-500 text-slate-900 font-bold rounded-xl hover:bg-cyan-400 transition-colors mt-6 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isProcessing ? 'A Guardar...' : 'Salvar Registo'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE EXCLUSÃO */}
      {itemToDelete && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 w-full max-w-sm rounded-3xl p-6 shadow-2xl border border-white/10 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-red-500/10 rounded-2xl">
                <AlertTriangle className="w-6 h-6 text-red-500" />
              </div>
              <h3 className="text-lg font-bold text-white">Remover Registo?</h3>
            </div>
            <p className="text-sm text-slate-400 mb-6">
              Deseja parar o rastreio da despesa <strong className="text-white">"{itemToDelete.description}"</strong>? Isto não apagará o histórico passado do livro razão.
            </p>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setItemToDelete(null)} 
                className="px-5 py-3 rounded-xl font-bold text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={async () => { 
                  await removeRecurring(itemToDelete.id); 
                  setItemToDelete(null); 
                  toast.success("Registo removido.");
                }} 
                className="px-5 py-3 rounded-xl font-bold bg-red-600 text-white hover:bg-red-700 transition-all shadow-lg shadow-red-500/20"
              >
                Remover
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LISTA DE RECORRENTES */}
      <div className="bg-slate-900/40 border border-white/5 rounded-3xl p-3 md:p-6 backdrop-blur-sm shadow-xl">
        {recurringTasks.length === 0 ? (
          <div className="text-center py-12 text-slate-500">Nenhuma despesa fixa configurada. Adicione o seu primeiro contrato.</div>
        ) : (
          <div className="space-y-3">
            {recurringTasks.map(item => (
              <div key={item.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-slate-950/50 rounded-2xl border border-white/5 hover:border-white/10 transition-colors gap-4 group">
                
                <div className="flex items-center gap-4">
                  <div className={`p-2.5 rounded-xl shrink-0 ${item.active !== false ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-slate-500'}`}>
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-bold text-white text-sm sm:text-base">{item.description}</p>
                    <p className="text-xs text-slate-400 capitalize mt-0.5">{item.frequency}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto border-t sm:border-t-0 border-white/5 pt-3 sm:pt-0">
                  <p className="font-bold font-mono text-white text-lg sm:text-base">{formatCurrency(item.value)}</p>
                  
                  {/* Touch Targets de UX/UI para Mobile e Hover state no Desktop */}
                  <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={() => setItemToDelete(item)} 
                      className="min-w-[44px] min-h-[44px] sm:min-w-[36px] sm:min-h-[36px] flex items-center justify-center text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all"
                      aria-label="Apagar Registo"
                    >
                      <Trash2 className="w-5 h-5 sm:w-4 sm:h-4" />
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