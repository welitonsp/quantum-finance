// src/components/AccountsManager.jsx
import { useState, useMemo } from 'react';
import { Plus, Building2, PiggyBank, TrendingUp, CreditCard, Landmark, Trash2, Wallet } from 'lucide-react';
import { useAccounts } from '../hooks/useAccounts';

export default function AccountsManager({ uid }) {
  const { accounts, loadingAccounts, addAccount, removeAccount } = useAccounts(uid);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Estados do formulário
  const [name, setName] = useState('');
  const [type, setType] = useState('corrente');
  const [balance, setBalance] = useState('');

  // 1. CÁLCULOS DE PATRIMÓNIO
  const { totalAtivos, totalPassivos, patrimonioLiquido } = useMemo(() => {
    let ativos = 0;
    let passivos = 0;

    accounts.forEach(acc => {
      const val = Number(acc.balance);
      if (['corrente', 'poupanca', 'investimento'].includes(acc.type)) {
        ativos += val;
      } else if (['cartao', 'divida'].includes(acc.type)) {
        passivos += Math.abs(val); // Passivos são sempre tratados como valor absoluto para a soma
      }
    });

    return {
      totalAtivos: ativos,
      totalPassivos: passivos,
      patrimonioLiquido: ativos - passivos
    };
  }, [accounts]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!name.trim() || !balance) return;

    try {
      // Ajuste automático: se for cartão ou dívida e o user meter positivo, transformamos em negativo
      let finalBalance = Number(balance);
      if (['cartao', 'divida'].includes(type) && finalBalance > 0) {
         finalBalance = -finalBalance;
      }

      await addAccount({ name: name.trim(), type, balance: finalBalance });
      setIsModalOpen(false);
      setName('');
      setBalance('');
      setType('corrente');
    } catch (error) {
      console.error(error);
    }
  };

  const getIcon = (type) => {
    switch (type) {
      case 'corrente': return <Building2 className="text-emerald-500" />;
      case 'poupanca': return <PiggyBank className="text-blue-500" />;
      case 'investimento': return <TrendingUp className="text-purple-500" />;
      case 'cartao': return <CreditCard className="text-orange-500" />;
      case 'divida': return <Landmark className="text-red-500" />;
      default: return <Wallet className="text-slate-500" />;
    }
  };

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* 2. HEADER E BOTÃO DE ADICIONAR */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-800 dark:text-white tracking-tight">As Suas Contas</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Gira o seu património e veja a sua evolução real.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl transition-all flex items-center gap-2 shadow-lg shadow-indigo-500/30 hover:scale-105 active:scale-95"
        >
          <Plus className="w-4 h-4" /> Nova Conta
        </button>
      </div>

      {/* 3. CARDS DE RESUMO (KPIs) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900/50 p-5 rounded-2xl border border-slate-200 dark:border-white/5 shadow-sm">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Património Líquido</p>
          <p className={`text-2xl font-black ${patrimonioLiquido >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
            {formatCurrency(patrimonioLiquido)}
          </p>
        </div>
        <div className="bg-white dark:bg-slate-900/50 p-5 rounded-2xl border border-slate-200 dark:border-white/5 shadow-sm">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Total de Ativos</p>
          <p className="text-2xl font-black text-slate-800 dark:text-white">{formatCurrency(totalAtivos)}</p>
        </div>
        <div className="bg-white dark:bg-slate-900/50 p-5 rounded-2xl border border-slate-200 dark:border-white/5 shadow-sm">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Total de Passivos</p>
          <p className="text-2xl font-black text-slate-800 dark:text-white">{formatCurrency(totalPassivos)}</p>
        </div>
      </div>

      {/* 4. LISTA DE CONTAS */}
      {loadingAccounts ? (
        <div className="text-center py-10 text-slate-500 animate-pulse font-bold">A carregar os seus cofres...</div>
      ) : accounts.length === 0 ? (
        <div className="bg-white dark:bg-slate-900/30 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl p-10 text-center">
          <Wallet className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-700 mb-4" />
          <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300">Nenhuma conta encontrada</h3>
          <p className="text-sm text-slate-500 mt-2">Comece por adicionar a sua conta à ordem ou os seus investimentos.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map(acc => (
            <div key={acc.id} className="bg-white dark:bg-slate-900/60 p-5 rounded-2xl border border-slate-200 dark:border-white/5 shadow-sm hover:border-indigo-500/30 transition-colors group relative overflow-hidden">
               {/* Decoração sutil de fundo baseada no tipo */}
               <div className={`absolute -right-6 -bottom-6 w-24 h-24 rounded-full blur-2xl opacity-10 pointer-events-none 
                  ${['cartao', 'divida'].includes(acc.type) ? 'bg-red-500' : 'bg-emerald-500'}`}>
               </div>
               
               <div className="flex justify-between items-start mb-4 relative z-10">
                 <div className="flex items-center gap-3">
                   <div className="p-2.5 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700">
                     {getIcon(acc.type)}
                   </div>
                   <div>
                     <h4 className="font-bold text-slate-800 dark:text-white text-sm leading-tight">{acc.name}</h4>
                     <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mt-0.5">{acc.type}</p>
                   </div>
                 </div>
                 <button 
                   onClick={() => removeAccount(acc.id)}
                   className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                   title="Apagar Conta"
                 >
                   <Trash2 className="w-4 h-4" />
                 </button>
               </div>
               
               <div className="relative z-10 mt-2">
                 <p className="text-xs text-slate-500 mb-1">Saldo Atual</p>
                 <p className={`text-xl font-black tracking-tight ${acc.balance < 0 ? 'text-red-500 dark:text-red-400' : 'text-slate-800 dark:text-white'}`}>
                   {formatCurrency(acc.balance)}
                 </p>
               </div>
            </div>
          ))}
        </div>
      )}

      {/* 5. MODAL DE ADICIONAR CONTA */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}></div>
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-3xl p-6 relative z-10 shadow-2xl border dark:border-white/10 animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-6">Nova Conta</h3>
            
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Nome da Instituição</label>
                <input 
                  type="text" required value={name} onChange={e => setName(e.target.value)}
                  placeholder="Ex: Nubank, Binance, BPI..."
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none dark:text-white"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Tipo</label>
                  <select 
                    value={type} onChange={e => setType(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none dark:text-white"
                  >
                    <option value="corrente">Conta Corrente</option>
                    <option value="poupanca">Poupança</option>
                    <option value="investimento">Investimento</option>
                    <option value="cartao">Cartão de Crédito</option>
                    <option value="divida">Empréstimo/Dívida</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Saldo Atual</label>
                  <input 
                    type="number" step="0.01" required value={balance} onChange={e => setBalance(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none dark:text-white"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-8">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 rounded-xl font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-sm">Cancelar</button>
                <button type="submit" className="px-5 py-2.5 rounded-xl font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors text-sm">Salvar Conta</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}