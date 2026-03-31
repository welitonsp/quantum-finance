// src/components/DashboardContent.jsx
import { useState } from 'react';
import { Activity, Landmark, CreditCard } from 'lucide-react';
import { useNavigation } from '../contexts/NavigationContext';
import DashboardCards from './DashboardCards';
import DashboardCharts from './DashboardCharts';
import BudgetProgress from './BudgetProgress';
import TransactionsManager from './TransactionsManager';
import TransactionForm from './TransactionForm';

// ✅ IMPORTANDO O NOSSO RADAR QUÂNTICO
import ForecastWidget from './ForecastWidget';

export default function DashboardContent({
  transactions,
  loading,
  moduleBalances,
  categoryData,
  topExpensesData,
  monthlyGoal,
  setMonthlyGoal,
  onSaveTransaction,
  onEditTransaction,
  onDeleteRequest,
  onBatchDelete,
  onDeleteAll,
  isFormOpen,
  setIsFormOpen,
  transactionToEdit,
  setTransactionToEdit,
}) {
  // ✅ Puxando o mês e ano do Contexto para alimentar o Forecast
  const { activeModule, setActiveModule, currentMonth, currentYear } = useNavigation();
  const [activeDashboardTab, setActiveDashboardTab] = useState('overview');

  return (
    <div className="space-y-6 md:space-y-8 animate-in fade-in duration-500">
      {/* Modal do Formulário */}
      {isFormOpen && (
        <div className="p-4 md:p-8 bg-white dark:bg-slate-900/40 border-dashed border-2 border-indigo-200 dark:border-cyan-500/30 rounded-3xl animate-in slide-in-from-top-4 shadow-xl">
          <TransactionForm
            onSave={onSaveTransaction}
            editingTransaction={transactionToEdit}
            onCancelEdit={() => {
              setTransactionToEdit(null);
              setIsFormOpen(false);
            }}
          />
        </div>
      )}

      {/* Seletor de Contas */}
      <div className="flex flex-wrap gap-2 md:gap-3 bg-white dark:bg-slate-900/50 p-2 rounded-2xl border border-slate-200 dark:border-white/5 w-fit shadow-sm">
        <button
          onClick={() => setActiveModule('geral')}
          className={`flex items-center gap-2 px-4 py-2 md:px-6 md:py-3 text-xs md:text-sm font-bold rounded-xl transition-all ${
            activeModule === 'geral' ? 'bg-slate-800 text-white shadow-md' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
          }`}
        >
          <Activity className="w-4 h-4" /> Visão Geral
        </button>
        <button
          onClick={() => setActiveModule('conta_corrente')}
          className={`flex items-center gap-2 px-4 py-2 md:px-6 md:py-3 text-xs md:text-sm font-bold rounded-xl transition-all ${
            activeModule === 'conta_corrente' ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 shadow-md' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
          }`}
        >
          <Landmark className="w-4 h-4" /> Conta Corrente
        </button>
        <button
          onClick={() => setActiveModule('cartao_credito')}
          className={`flex items-center gap-2 px-4 py-2 md:px-6 md:py-3 text-xs md:text-sm font-bold rounded-xl transition-all ${
            activeModule === 'cartao_credito' ? 'bg-orange-100 dark:bg-orange-500/20 text-orange-700 dark:text-orange-400 shadow-md' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
          }`}
        >
          <CreditCard className="w-4 h-4" /> Cartão de Crédito
        </button>
      </div>

      {/* Abas Dashboard vs Livro Razão */}
      <div className="flex gap-4 md:gap-8 border-b border-slate-200 dark:border-white/10 mt-4 overflow-x-auto custom-scrollbar">
        <button
          onClick={() => setActiveDashboardTab('overview')}
          className={`pb-4 text-sm md:text-base font-bold tracking-widest uppercase transition-all border-b-2 whitespace-nowrap ${
            activeDashboardTab === 'overview' ? 'border-indigo-600 dark:border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
          }`}
        >
          Dashboard Analítico
        </button>
        <button
          onClick={() => setActiveDashboardTab('transactions')}
          className={`pb-4 text-sm md:text-base font-bold tracking-widest uppercase transition-all border-b-2 whitespace-nowrap ${
            activeDashboardTab === 'transactions' ? 'border-cyan-600 dark:border-cyan-500 text-cyan-600 dark:text-cyan-400' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
          }`}
        >
          Livro Razão (Busca)
        </button>
      </div>

      {/* Conteúdo das Abas */}
      {activeDashboardTab === 'overview' ? (
        <div className="space-y-6 md:space-y-8 animate-in fade-in slide-in-from-bottom-4">
          <DashboardCards balances={moduleBalances} />
          
          <BudgetProgress
            totalExpenses={moduleBalances.saidas}
            monthlyGoal={monthlyGoal}
            onSetGoal={() => {
              const newGoal = prompt("Defina o Teto Mensal de Gastos (Ex: 3500):", monthlyGoal || "");
              if (newGoal && !isNaN(newGoal)) setMonthlyGoal(Number(newGoal));
            }}
          />

          {/* ✅ WIDGET DE PREVISÃO ADICIONADO AQUI */}
          <div className="w-full">
            <ForecastWidget 
              transactions={transactions} 
              currentMonth={currentMonth} 
              currentYear={currentYear} 
            />
          </div>

          <DashboardCharts categoryData={categoryData} topExpensesData={topExpensesData} />
        </div>
      ) : (
        <div className="animate-in fade-in slide-in-from-bottom-4 h-[600px] md:h-[700px]">
          <TransactionsManager
            transactions={transactions}
            loading={loading}
            onEdit={onEditTransaction}
            onDeleteRequest={onDeleteRequest}
            onBatchDelete={onBatchDelete}
            onDeleteAll={onDeleteAll}
          />
        </div>
      )}
    </div>
  );
}