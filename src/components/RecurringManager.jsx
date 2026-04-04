import React, { useState, useMemo, useEffect } from 'react';
import { Plus, Trash2, Edit3, Repeat, AlertTriangle, CheckCircle2 } from 'lucide-react';
import Decimal from 'decimal.js';
import { useRecurring } from '../hooks/useRecurring';
import { formatCurrency } from '../utils/formatters';

export default function RecurringManager({ uid }) {
  const { recurringTasks, loading, fetchRecurring, removeRecurring } = useRecurring(uid);
  const [itemToDelete, setItemToDelete] = useState(null);

  useEffect(() => {
    if (uid) fetchRecurring();
  }, [uid, fetchRecurring]);

  // Cálculo Blindado com Decimal.js
  const { totalMensal, totalAnual, itensAtivos } = useMemo(() => {
    let mensal = new Decimal(0);
    let anual  = new Decimal(0);
    let ativos = 0;

    recurringTasks.forEach(item => {
      if (item.active !== false) { // Assume ativo se não definido
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

  if (loading) {
    return <div className="p-8 text-center text-quantum-fgMuted animate-pulse">A carregar compromissos...</div>;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Repeat className="w-6 h-6 text-quantum-accent" /> Gestor de Recorrentes
        </h2>
        <button className="px-4 py-2 bg-quantum-accent text-slate-900 font-bold rounded-xl flex items-center gap-2 hover:bg-emerald-400 transition-colors">
          <Plus className="w-4 h-4" /> Novo
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-slate-900/50 p-6 rounded-2xl border border-white/5">
          <p className="text-sm text-slate-400 uppercase tracking-widest font-bold mb-1">Custo Mensal Fixo</p>
          <p className="text-2xl font-black text-white">{formatCurrency(totalMensal)}</p>
        </div>
        <div className="bg-slate-900/50 p-6 rounded-2xl border border-white/5">
          <p className="text-sm text-slate-400 uppercase tracking-widest font-bold mb-1">Impacto Anual</p>
          <p className="text-2xl font-black text-red-400">{formatCurrency(totalAnual)}</p>
        </div>
        <div className="bg-slate-900/50 p-6 rounded-2xl border border-white/5">
          <p className="text-sm text-slate-400 uppercase tracking-widest font-bold mb-1">Contratos Ativos</p>
          <p className="text-2xl font-black text-quantum-accent">{itensAtivos}</p>
        </div>
      </div>

      {/* Modal de Exclusão Seguro */}
      {itemToDelete && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 w-full max-w-sm rounded-3xl p-6 shadow-2xl border border-white/10 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-red-500/10 rounded-2xl">
                <AlertTriangle className="w-6 h-6 text-red-500" />
              </div>
              <h3 className="text-lg font-bold text-white">Remover Recorrência?</h3>
            </div>
            <p className="text-sm text-slate-400 mb-6">
              Deseja parar o rastreio da despesa "{itemToDelete.description}"? Isto não apagará o histórico passado.
            </p>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setItemToDelete(null)}
                className="px-5 py-2.5 rounded-xl font-bold text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={() => { removeRecurring(itemToDelete.id); setItemToDelete(null); }}
                className="px-5 py-2.5 rounded-xl font-bold bg-red-600 text-white hover:bg-red-700 transition-all"
              >
                Remover
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-quantum-card border border-quantum-border rounded-3xl p-2 md:p-6">
        {recurringTasks.length === 0 ? (
          <div className="text-center py-10 text-slate-500">Nenhuma despesa fixa configurada.</div>
        ) : (
          <div className="space-y-3">
            {recurringTasks.map(item => (
              <div key={item.id} className="flex items-center justify-between p-4 bg-slate-900/30 rounded-xl border border-white/5 hover:border-white/10 transition-colors">
                <div className="flex items-center gap-4">
                  <div className={`p-2 rounded-lg ${item.active !== false ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-slate-500'}`}>
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-bold text-white">{item.description}</p>
                    <p className="text-xs text-slate-400 capitalize">{item.frequency} • {item.category}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <p className="font-bold font-mono text-white">{formatCurrency(item.value)}</p>
                  <div className="flex items-center gap-2">
                    <button className="p-2 text-slate-500 hover:text-white transition-colors"><Edit3 className="w-4 h-4" /></button>
                    <button onClick={() => setItemToDelete(item)} className="p-2 text-slate-500 hover:text-red-400 transition-colors"><Trash2 className="w-4 h-4" /></button>
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