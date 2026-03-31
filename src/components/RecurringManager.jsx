// src/components/RecurringManager.jsx
import { useState, useMemo } from 'react';
import { Plus, Repeat, Trash2, Power, PowerOff, CreditCard, AlertTriangle } from 'lucide-react';
import { useRecurring } from '../hooks/useRecurring';

export default function RecurringManager({ uid }) {
  const { recurring, loadingRecurring, addRecurring, updateRecurring, removeRecurring } = useRecurring(uid);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Estados do formulário
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Moradia');
  const [frequency, setFrequency] = useState('mensal');
  const [value, setValue] = useState('');

  // Lista padrão de categorias (pode vir de um contexto futuramente)
  const categories = ['Moradia', 'Alimentação', 'Transporte', 'Saúde', 'Educação', 'Lazer', 'Assinaturas', 'Seguros', 'Dívidas', 'Outros'];

  // CÁLCULOS DO CUSTO FIXO
  const { totalMensal, totalAnual, itensAtivos } = useMemo(() => {
    let mensal = 0;
    let anual = 0;
    let ativos = 0;

    recurring.forEach(item => {
      if (item.active) {
        ativos += 1;
        const val = Number(item.value);
        if (item.frequency === 'mensal') {
          mensal += val;
          anual += (val * 12);
        } else if (item.frequency === 'anual') {
          anual += val;
          mensal += (val / 12);
        }
      }
    });

    return { totalMensal: mensal, totalAnual: anual, itensAtivos: ativos };
  }, [recurring]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!description.trim() || !value) return;

    try {
      await addRecurring({ 
        description: description.trim(), 
        category, 
        frequency, 
        value: Number(value) 
      });
      setIsModalOpen(false);
      setDescription('');
      setValue('');
      setFrequency('mensal');
    } catch (error) {
      console.error(error);
    }
  };

  const toggleActive = (id, currentStatus) => {
    updateRecurring(id, { active: !currentStatus });
  };

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-800 dark:text-white tracking-tight">Despesas Fixas</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Gira as suas assinaturas e compromissos recorrentes.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl transition-all flex items-center gap-2 shadow-lg shadow-indigo-500/30 hover:scale-105 active:scale-95"
        >
          <Plus className="w-4 h-4" /> Novo Compromisso
        </button>
      </div>

      {/* CARDS DE RESUMO */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900/50 p-5 rounded-2xl border border-slate-200 dark:border-white/5 shadow-sm relative overflow-hidden">
          <div className="absolute -right-4 -top-4 w-16 h-16 bg-red-500/10 rounded-full blur-xl pointer-events-none"></div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Custo Fixo Mensal</p>
          <p className="text-2xl font-black text-red-500 dark:text-red-400">{formatCurrency(totalMensal)}</p>
          <p className="text-[10px] text-slate-400 mt-1 font-bold">{itensAtivos} compromissos ativos</p>
        </div>
        <div className="bg-white dark:bg-slate-900/50 p-5 rounded-2xl border border-slate-200 dark:border-white/5 shadow-sm">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Projeção Anual</p>
          <p className="text-2xl font-black text-slate-800 dark:text-white">{formatCurrency(totalAnual)}</p>
          <p className="text-[10px] text-slate-400 mt-1 font-bold">O que este custo representa em 12 meses</p>
        </div>
        <div className="bg-gradient-to-br from-indigo-500 to-cyan-600 p-5 rounded-2xl shadow-sm text-white flex flex-col justify-center">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-indigo-200" />
            <p className="text-xs font-bold uppercase tracking-wider text-indigo-100">Dica Quântica</p>
          </div>
          <p className="text-sm font-medium leading-tight text-white/90">
            Manter as suas despesas fixas abaixo de 30% da sua receita é a chave para a paz de espírito financeira.
          </p>
        </div>
      </div>

      {/* LISTA DE DESPESAS */}
      {loadingRecurring ? (
        <div className="text-center py-10 text-slate-500 animate-pulse font-bold">A carregar assinaturas...</div>
      ) : recurring.length === 0 ? (
        <div className="bg-white dark:bg-slate-900/30 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl p-10 text-center">
          <Repeat className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-700 mb-4" />
          <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300">Sem compromissos fixos</h3>
          <p className="text-sm text-slate-500 mt-2">Adicione a sua renda, luz, internet ou assinaturas.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-white/5 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-white/5">
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Descrição</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Categoria</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Frequência</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Valor</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Estado</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {recurring.map(item => (
                  <tr key={item.id} className={`transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/30 ${!item.active ? 'opacity-50 grayscale' : ''}`}>
                    <td className="p-4 font-bold text-sm text-slate-800 dark:text-white flex items-center gap-3">
                      <CreditCard className="w-4 h-4 text-slate-400" /> {item.description}
                    </td>
                    <td className="p-4 text-sm text-slate-500">
                      <span className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded-md text-xs">{item.category}</span>
                    </td>
                    <td className="p-4 text-sm text-slate-500 capitalize">{item.frequency}</td>
                    <td className="p-4 text-sm font-black text-slate-800 dark:text-white">{formatCurrency(item.value)}</td>
                    <td className="p-4 text-center">
                      <button 
                        onClick={() => toggleActive(item.id, item.active)}
                        className={`p-2 rounded-xl transition-colors ${item.active ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400' : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'}`}
                        title={item.active ? "Desativar (Pausar assinatura)" : "Reativar"}
                      >
                        {item.active ? <Power className="w-4 h-4" /> : <PowerOff className="w-4 h-4" />}
                      </button>
                    </td>
                    <td className="p-4 text-right">
                      <button 
                        onClick={() => removeRecurring(item.id)}
                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-all"
                        title="Eliminar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL DE ADICIONAR */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}></div>
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-3xl p-6 relative z-10 shadow-2xl border dark:border-white/10 animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-6">Nova Despesa Fixa</h3>
            
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Descrição</label>
                <input 
                  type="text" required value={description} onChange={e => setDescription(e.target.value)}
                  placeholder="Ex: Renda da Casa, Netflix, Ginásio..."
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Categoria</label>
                <select 
                  value={category} onChange={e => setCategory(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none dark:text-white"
                >
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Frequência</label>
                  <select 
                    value={frequency} onChange={e => setFrequency(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none dark:text-white"
                  >
                    <option value="mensal">Mensal</option>
                    <option value="anual">Anual</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Valor</label>
                  <input 
                    type="number" step="0.01" required value={value} onChange={e => setValue(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none dark:text-white"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-8">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 rounded-xl font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-sm">Cancelar</button>
                <button type="submit" className="px-5 py-2.5 rounded-xl font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors text-sm">Salvar Despesa</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}