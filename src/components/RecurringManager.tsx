import { useState, useMemo } from 'react';
import { Plus, Trash2, Repeat, AlertTriangle, Wallet, Calendar, X, CheckCircle2 } from 'lucide-react';
import Decimal from 'decimal.js';
import { useRecurring } from '../hooks/useRecurring';
import { formatCurrency } from '../utils/formatters';
import toast from 'react-hot-toast';
import type { RecurringTask } from '../shared/types/transaction';

interface Props {
  uid: string;
}

export default function RecurringManager({ uid }: Props) {
  const { recurringTasks, loading, addRecurring, removeRecurring } = useRecurring(uid);

  const [itemToDelete,    setItemToDelete]    = useState<RecurringTask | null>(null);
  const [isAddModalOpen,  setIsAddModalOpen]  = useState(false);
  const [isProcessing,    setIsProcessing]    = useState(false);

  const [newDescription, setNewDescription] = useState('');
  const [newValue,       setNewValue]       = useState('');
  const [newCategory,    setNewCategory]    = useState('Moradia');
  const [newFrequency,   setNewFrequency]   = useState<'mensal' | 'anual'>('mensal');

  const { totalMensal, totalAnual, itensAtivos } = useMemo(() => {
    let mensal = new Decimal(0);
    let anual  = new Decimal(0);
    let ativos = 0;

    const tasks = recurringTasks ?? [];
    tasks.forEach(item => {
      if (item.active !== false) {
        ativos++;
        const val = new Decimal(item.value ?? 0);
        if (item.frequency === 'mensal') {
          mensal = mensal.plus(val);
          anual  = anual.plus(val.times(12));
        } else if (item.frequency === 'anual') {
          anual  = anual.plus(val);
          mensal = mensal.plus(val.dividedBy(12));
        }
      }
    });
    return { totalMensal: mensal.toNumber(), totalAnual: anual.toNumber(), itensAtivos: ativos };
  }, [recurringTasks]);

  const handleAddRecurring = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDescription || !newValue) { toast.error('Preencha a descrição e o valor.'); return; }
    setIsProcessing(true);
    try {
      await addRecurring({
        description: newDescription,
        value:       parseFloat(newValue),
        category:    newCategory,
        frequency:   newFrequency,
        dueDay:      1,
        active:      true,
      });
      toast.success('Despesa fixa registada!');
      setIsAddModalOpen(false);
      setNewDescription(''); setNewValue(''); setNewCategory('Moradia'); setNewFrequency('mensal');
    } catch (err) {
      console.error('Erro ao adicionar contrato:', err);
      toast.error('Erro na encriptação da despesa.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = async () => {
    if (!itemToDelete) return;
    try {
      await removeRecurring(itemToDelete.id);
      toast.success('Contrato eliminado.');
      setItemToDelete(null);
    } catch {
      toast.error('Erro ao remover o contrato.');
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-cyan-500 animate-pulse font-mono uppercase tracking-widest text-xs mt-10">A carregar motor de contratos...</div>;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 relative z-10 flex flex-col h-full w-full max-w-[1600px] mx-auto pb-12">

      <div>
        <h1 className="text-2xl font-bold text-quantum-fg mb-1">Despesas Fixas</h1>
        <p className="text-sm text-quantum-fgMuted">Motor de gestão de contratos, assinaturas e compromissos recorrentes.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-quantum-card/40 backdrop-blur-md border border-quantum-border rounded-3xl p-6 shadow-xl transition-all hover:-translate-y-1">
          <div className="flex items-center gap-2 text-quantum-fgMuted mb-2">
            <Wallet className="w-4 h-4 text-red-400" />
            <span className="text-[10px] font-bold uppercase tracking-widest">Impacto Mensal</span>
          </div>
          <span className="font-mono text-3xl font-black text-quantum-fg tracking-tight">{formatCurrency(totalMensal)}</span>
        </div>

        <div className="bg-quantum-card/40 backdrop-blur-md border border-quantum-border rounded-3xl p-6 shadow-xl transition-all hover:-translate-y-1">
          <div className="flex items-center gap-2 text-quantum-fgMuted mb-2">
            <Calendar className="w-4 h-4 text-amber-400" />
            <span className="text-[10px] font-bold uppercase tracking-widest">Projeção Anual</span>
          </div>
          <span className="font-mono text-3xl font-black text-quantum-fg tracking-tight">{formatCurrency(totalAnual)}</span>
        </div>

        <div className="bg-quantum-card/40 backdrop-blur-md border border-quantum-border rounded-3xl p-6 shadow-xl flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-quantum-fgMuted uppercase tracking-widest block mb-2">Contratos Ativos</span>
            <span className="font-mono text-3xl font-black text-cyan-400">{itensAtivos}</span>
          </div>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="w-14 h-14 bg-cyan-600 hover:bg-cyan-500 rounded-full flex items-center justify-center text-white transition-all shadow-[0_0_20px_rgba(8,145,178,0.4)] hover:scale-105 active:scale-95"
            title="Novo Contrato Fixo"
          >
            <Plus className="w-6 h-6" />
          </button>
        </div>
      </div>

      <div className="flex-1 bg-quantum-card/40 backdrop-blur-md border border-quantum-border rounded-3xl overflow-hidden shadow-xl flex flex-col">
        <div className="p-6 border-b border-quantum-border/50 bg-quantum-bg/30 flex justify-between items-center">
          <h2 className="text-xs font-black text-quantum-fg uppercase tracking-[0.2em] flex items-center gap-2">
            <Repeat className="w-4 h-4 text-cyan-400" /> Lista de Contratos
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {(!recurringTasks || recurringTasks.length === 0) ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 bg-quantum-bgSecondary/50 rounded-full flex items-center justify-center mb-4">
                <Repeat className="w-8 h-8 text-quantum-fgMuted" />
              </div>
              <p className="text-quantum-fgMuted font-medium">Nenhuma despesa fixa registada.</p>
              <p className="text-xs text-quantum-fgMuted mt-1">Clique no botão "+" acima para adicionar.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-800/50">
              {recurringTasks.map(item => (
                <div key={item.id} className="p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:bg-quantum-bgSecondary/30 transition-colors group">
                  <div className="flex items-center gap-4">
                    <div className={`p-2 rounded-xl ${item.active !== false ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-quantum-bgSecondary text-quantum-fgMuted border border-quantum-border'}`}>
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-quantum-fg">{item.description}</h3>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-[9px] font-bold uppercase tracking-wider bg-quantum-bgSecondary text-quantum-fg px-2 py-0.5 rounded border border-quantum-border">{item.category}</span>
                        <span className="text-[9px] font-bold uppercase tracking-wider bg-cyan-900/30 text-cyan-400 border border-cyan-800/50 px-2 py-0.5 rounded">{item.frequency}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-5 w-full sm:w-auto justify-between sm:justify-end">
                    <span className="font-mono text-base font-bold text-quantum-fg">{formatCurrency(Number(item.value))}</span>
                    <button
                      onClick={() => setItemToDelete(item)}
                      className="p-2.5 text-quantum-fgMuted opacity-100 sm:opacity-0 sm:group-hover:opacity-100 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all"
                      title="Remover"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal: Nova Despesa */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-quantum-bg/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-quantum-card border border-quantum-border rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-quantum-border flex justify-between items-center bg-quantum-bg/50">
              <h3 className="text-sm font-bold text-quantum-fg uppercase tracking-widest">Novo Contrato Fixo</h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-quantum-fgMuted hover:text-quantum-fg transition-colors bg-quantum-bgSecondary/50 hover:bg-quantum-bgSecondary p-2 rounded-full">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={(e) => void handleAddRecurring(e)} className="p-6 space-y-5">
              <div>
                <label className="block text-[10px] font-bold text-quantum-fgMuted uppercase tracking-widest mb-2">Descrição</label>
                <input type="text" value={newDescription} onChange={e => setNewDescription(e.target.value)} required placeholder="Ex: Aluguel, Internet..."
                  className="w-full bg-quantum-bg border border-quantum-border rounded-xl px-4 py-3 text-sm text-quantum-fg focus:outline-none focus:border-cyan-500 transition-colors placeholder:text-slate-600" />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-quantum-fgMuted uppercase tracking-widest mb-2">Valor Fixo (R$)</label>
                <input type="number" step="0.01" value={newValue} onChange={e => setNewValue(e.target.value)} required placeholder="0.00"
                  className="w-full bg-quantum-bg border border-quantum-border rounded-xl px-4 py-3 text-sm text-quantum-fg focus:outline-none focus:border-cyan-500 font-mono transition-colors placeholder:text-slate-600" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-quantum-fgMuted uppercase tracking-widest mb-2">Categoria</label>
                  <select value={newCategory} onChange={e => setNewCategory(e.target.value)} className="w-full bg-quantum-bg border border-quantum-border rounded-xl px-4 py-3 text-sm text-quantum-fg focus:outline-none focus:border-cyan-500 transition-colors">
                    {['Moradia','Transporte','Assinaturas','Saúde','Educação','Outros'].map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-quantum-fgMuted uppercase tracking-widest mb-2">Frequência</label>
                  <select value={newFrequency} onChange={e => setNewFrequency(e.target.value as 'mensal' | 'anual')} className="w-full bg-quantum-bg border border-quantum-border rounded-xl px-4 py-3 text-sm text-quantum-fg focus:outline-none focus:border-cyan-500 transition-colors">
                    <option value="mensal">Mensal</option>
                    <option value="anual">Anual</option>
                  </select>
                </div>
              </div>

              <div className="pt-4">
                <button type="submit" disabled={isProcessing} className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-3.5 rounded-xl transition-all shadow-[0_0_15px_rgba(8,145,178,0.3)] disabled:opacity-50 active:scale-[0.98]">
                  {isProcessing ? 'A Processar...' : 'Guardar Compromisso'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Confirmar Eliminação */}
      {itemToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-quantum-bg/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-quantum-card border border-quantum-border rounded-3xl w-full max-w-sm p-6 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-red-500/20 text-red-500 rounded-2xl">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-quantum-fg">Anular Contrato?</h3>
                <p className="text-xs text-quantum-fgMuted mt-1">Ação irreversível.</p>
              </div>
            </div>

            <div className="bg-quantum-bg p-4 rounded-xl mb-6 border border-quantum-border">
              <p className="text-sm font-bold truncate text-quantum-fg">"{itemToDelete.description}"</p>
              <p className="text-xs font-mono text-red-400 mt-1">{formatCurrency(Number(itemToDelete.value))}</p>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setItemToDelete(null)} className="flex-1 bg-quantum-bgSecondary hover:bg-slate-700 text-quantum-fg font-bold py-3 rounded-xl transition-colors">Cancelar</button>
              <button onClick={() => void handleDelete()} className="flex-1 bg-red-600 hover:bg-red-500 text-white font-bold py-3 rounded-xl transition-colors shadow-[0_0_15px_rgba(239,68,68,0.3)]">Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
