// src/features/transactions/AccountsManager.tsx
import { useState, useMemo } from 'react';
import { Plus, Building2, PiggyBank, TrendingUp, CreditCard, Landmark, Trash2, Wallet } from 'lucide-react';
import { useAccounts } from '../../hooks/useAccounts';
import Decimal from 'decimal.js';
import { formatCurrency } from '../../utils/formatters';
import type { Account } from '../../shared/types/transaction';

type AccountType = 'corrente' | 'poupanca' | 'investimento' | 'cartao' | 'divida';

interface Props {
  uid: string;
}

export default function AccountsManager({ uid }: Props) {
  const { accounts, loadingAccounts, addAccount, removeAccount } = useAccounts(uid);
  const [isModalOpen,    setIsModalOpen]    = useState(false);
  const [accountToDelete, setAccountToDelete] = useState<Account | null>(null);

  const [name,    setName]    = useState('');
  const [type,    setType]    = useState<AccountType>('corrente');
  const [balance, setBalance] = useState('');

  const { totalAtivos, totalPassivos, patrimonioLiquido } = useMemo(() => {
    let ativos    = new Decimal(0);
    let passivos  = new Decimal(0);

    accounts.forEach(acc => {
      const val = new Decimal(acc.balance ?? 0);
      if (['corrente', 'poupanca', 'investimento'].includes(acc.type)) {
        ativos = ativos.plus(val);
      } else if (['cartao', 'divida'].includes(acc.type)) {
        passivos = passivos.plus(val.abs());
      }
    });

    return {
      totalAtivos:        ativos.toNumber(),
      totalPassivos:      passivos.toNumber(),
      patrimonioLiquido:  ativos.minus(passivos).toNumber(),
    };
  }, [accounts]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !balance) return;

    try {
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

  const getIcon = (t: string) => {
    switch (t) {
      case 'corrente':    return <Building2   className="text-emerald-500" />;
      case 'poupanca':    return <PiggyBank   className="text-blue-500" />;
      case 'investimento':return <TrendingUp  className="text-purple-500" />;
      case 'cartao':      return <CreditCard  className="text-orange-500" />;
      case 'divida':      return <Landmark    className="text-red-500" />;
      default:            return <Wallet      className="text-quantum-fgMuted" />;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">

      {accountToDelete && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-quantum-card w-full max-w-sm rounded-3xl p-6 shadow-2xl border dark:border-quantum-border animate-in zoom-in-95">
            <h3 className="text-lg font-bold text-quantum-fg mb-2">Apagar "{accountToDelete.name}"?</h3>
            <p className="text-sm text-quantum-fgMuted mb-6">
              Esta ação remove a conta da visão, mas <strong>não apaga</strong> as transações associadas.
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setAccountToDelete(null)}
                className="px-5 py-2.5 rounded-xl font-bold text-quantum-fgMuted hover:bg-slate-100 dark:hover:bg-quantum-bgSecondary transition-colors">
                Cancelar
              </button>
              <button onClick={() => { void removeAccount(accountToDelete.id); setAccountToDelete(null); }}
                className="px-5 py-2.5 rounded-xl font-bold bg-red-600 text-white hover:bg-red-700 transition-colors">
                Apagar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-black text-quantum-fg tracking-tight">As Suas Contas</h2>
          <p className="text-xs text-quantum-fgMuted dark:text-quantum-fgMuted mt-1">Gira o seu património e veja a sua evolução real.</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-quantum-fg text-sm font-bold rounded-xl transition-all flex items-center gap-2 shadow-lg shadow-indigo-500/30 hover:scale-105 active:scale-95"
        >
          <Plus className="w-4 h-4" /> Nova Conta
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-quantum-card/50 p-5 rounded-2xl border border-slate-200 dark:border-quantum-border shadow-sm">
          <p className="text-xs font-bold text-quantum-fgMuted uppercase tracking-wider mb-1">Património Líquido</p>
          <p className={`text-2xl font-black ${patrimonioLiquido >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
            {formatCurrency(patrimonioLiquido)}
          </p>
        </div>
        <div className="bg-white dark:bg-quantum-card/50 p-5 rounded-2xl border border-slate-200 dark:border-quantum-border shadow-sm">
          <p className="text-xs font-bold text-quantum-fgMuted uppercase tracking-wider mb-1">Total de Ativos</p>
          <p className="text-2xl font-black text-quantum-fg">{formatCurrency(totalAtivos)}</p>
        </div>
        <div className="bg-white dark:bg-quantum-card/50 p-5 rounded-2xl border border-slate-200 dark:border-quantum-border shadow-sm">
          <p className="text-xs font-bold text-quantum-fgMuted uppercase tracking-wider mb-1">Total de Passivos</p>
          <p className="text-2xl font-black text-quantum-fg">{formatCurrency(totalPassivos)}</p>
        </div>
      </div>

      {loadingAccounts ? (
        <div className="text-center py-10 text-quantum-fgMuted animate-pulse font-bold">A carregar os seus cofres...</div>
      ) : accounts.length === 0 ? (
        <div className="bg-white dark:bg-quantum-card/30 border-2 border-dashed border-slate-200 dark:border-quantum-border rounded-3xl p-10 text-center">
          <Wallet className="w-12 h-12 mx-auto text-quantum-fg dark:text-slate-700 mb-4" />
          <h3 className="text-lg font-bold text-quantum-fg">Nenhuma conta encontrada</h3>
          <p className="text-sm text-quantum-fgMuted mt-2">Comece por adicionar a sua conta à ordem ou os seus investimentos.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map(acc => (
            <div key={acc.id} className="bg-white dark:bg-quantum-card/60 p-5 rounded-2xl border border-slate-200 dark:border-quantum-border shadow-sm hover:border-indigo-500/30 transition-colors group relative overflow-hidden">
              <div className={`absolute -right-6 -bottom-6 w-24 h-24 rounded-full blur-2xl opacity-10 pointer-events-none ${
                ['cartao','divida'].includes(acc.type) ? 'bg-red-500' : 'bg-emerald-500'
              }`} />
              <div className="flex justify-between items-start mb-4 relative z-10">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-slate-50 dark:bg-quantum-bgSecondary rounded-xl border border-slate-100 dark:border-quantum-border">
                    {getIcon(acc.type)}
                  </div>
                  <div>
                    <h4 className="font-bold text-quantum-fg text-sm leading-tight">{acc.name}</h4>
                    <p className="text-[10px] uppercase font-bold text-quantum-fgMuted tracking-wider mt-0.5">{acc.type}</p>
                  </div>
                </div>
                <button
                  onClick={() => setAccountToDelete(acc)}
                  className="p-1.5 text-quantum-fgMuted hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                  title="Apagar Conta"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="relative z-10 mt-2">
                <p className="text-xs text-quantum-fgMuted mb-1">Saldo Atual</p>
                <p className={`text-xl font-black tracking-tight ${acc.balance < 0 ? 'text-red-500 dark:text-red-400' : 'text-quantum-fg'}`}>
                  {formatCurrency(acc.balance)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-quantum-card/60 backdrop-blur-sm" onClick={() => setIsModalOpen(false)} />
          <div className="bg-white dark:bg-quantum-card w-full max-w-md rounded-3xl p-6 relative z-10 shadow-2xl border dark:border-quantum-border animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-quantum-fg mb-6">Nova Conta</h3>
            <form onSubmit={e => void handleSave(e)} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-quantum-fgMuted uppercase tracking-wider mb-2">Nome da Instituição</label>
                <input
                  type="text" required value={name} onChange={e => setName(e.target.value)}
                  placeholder="Ex: Nubank, Binance, BPI..."
                  className="w-full bg-slate-50 dark:bg-quantum-bgSecondary border border-slate-200 dark:border-quantum-border rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none dark:text-quantum-fg"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-quantum-fgMuted uppercase tracking-wider mb-2">Tipo</label>
                  <select
                    value={type} onChange={e => setType(e.target.value as AccountType)}
                    className="w-full bg-slate-50 dark:bg-quantum-bgSecondary border border-slate-200 dark:border-quantum-border rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none dark:text-quantum-fg"
                  >
                    <option value="corrente">Conta Corrente</option>
                    <option value="poupanca">Poupança</option>
                    <option value="investimento">Investimento</option>
                    <option value="cartao">Cartão de Crédito</option>
                    <option value="divida">Empréstimo/Dívida</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-quantum-fgMuted uppercase tracking-wider mb-2">Saldo Atual</label>
                  <input
                    type="number" step="0.01" required value={balance} onChange={e => setBalance(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-slate-50 dark:bg-quantum-bgSecondary border border-slate-200 dark:border-quantum-border rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none dark:text-quantum-fg"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-8">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 rounded-xl font-bold text-quantum-fgMuted hover:bg-slate-100 dark:hover:bg-quantum-bgSecondary transition-colors text-sm">Cancelar</button>
                <button type="submit" className="px-5 py-2.5 rounded-xl font-bold bg-indigo-600 text-quantum-fg hover:bg-indigo-700 transition-colors text-sm">Salvar Conta</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
