import React, { useState, useMemo, useEffect } from 'react';
import { Plus, Trash2, Repeat, AlertTriangle, CheckCircle2, X } from 'lucide-react';
import Decimal from 'decimal.js';
import { useRecurring } from '../hooks/useRecurring';
import { formatCurrency } from '../utils/formatters';
import toast from 'react-hot-toast';

export default function RecurringManager({ uid }) {
  // O hook já fornece recurringTasks, loading, addRecurring, removeRecurring
  const { recurringTasks, loading, addRecurring, removeRecurring } = useRecurring(uid);
  
  const [itemToDelete, setItemToDelete] = useState(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [newDescription, setNewDescription] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newCategory, setNewCategory] = useState('Moradia');
  const [newFrequency, setNewFrequency] = useState('mensal');

  // Cálculos financeiros (sem necessidade de fetchRecurring)
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
      {/* Cabeçalho e resto do JSX (mantenha exatamente como estava, só remova qualquer referência a fetchRecurring) */}
      {/* ... todo o JSX permanece igual ao seu original, pois não continha fetchRecurring no JSX */}
      {/* ... apenas o useEffect ou outra lógica que chamava fetchRecurring foi removida */}
    </div>
  );
}