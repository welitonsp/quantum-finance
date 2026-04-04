// src/components/DashboardContent.jsx
import { useState } from 'react';
import { Activity, Landmark, CreditCard, Sparkles, ArrowRightLeft, TrendingUp } from 'lucide-react';
import { useNavigation } from '../contexts/NavigationContext';

import DashboardCards from './DashboardCards';
import BudgetProgress from './BudgetProgress';
import TradeModal from './TradeModal';
import BudgetModal from './BudgetModal';
import ForecastWidget from './ForecastWidget'; 
import QuantumInsights from './QuantumInsights';

import TransactionForm from '../features/transactions/TransactionForm';
import { useFinancialMetrics } from '../hooks/useFinancialMetrics';

export default function DashboardContent({
  user,
  transactions,
  loading,
  moduleBalances,
  monthlyGoal,
  setMonthlyGoal,
  onSaveTransaction,
  isFormOpen,
  setIsFormOpen,
  transactionToEdit,
  setTransactionToEdit,
}) {
  const { activeModule, setActiveModule, currentMonth, currentYear } = useNavigation();
  
  const [isTradeModalOpen, setIsTradeModalOpen] = useState(false);
  const [selectedTradeAsset, setSelectedTradeAsset] = useState('');
  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);

  const { metrics, loadingMetrics } = useFinancialMetrics(
    user?.uid, 
    transactions, 
    currentMonth, 
    currentYear
  );

  const handleTradeClick = () => {
    setSelectedTradeAsset('Ativo Quântico');
    setIsTradeModalOpen(true);
  };

  return (
    <div className="space-y-6 md:space-y-10 animate-in fade-in duration-700 relative z-10 pb-10">
      
      {/* MODAIS (Ocultos até serem chamados) */}
      <BudgetModal 
        isOpen={isBudgetModalOpen} 
        onClose={() => setIsBudgetModalOpen(false)} 
        currentGoal={monthlyGoal}
        onSave={(newGoal) => setMonthlyGoal(newGoal)}
      />

      <TradeModal 
        isOpen={isTradeModalOpen} 
        onClose={() => setIsTradeModalOpen(false)} 
        assetSymbol={selectedTradeAsset} 
      />

      {/* FORMULÁRIO DE NOVA TRANSAÇÃO */}
      {isFormOpen && (
        <div className="p-4 md:p-8 bg-slate-900/80 backdrop-blur-xl border border-indigo-500/30 rounded-3xl animate-in slide-in-from-top-4 shadow-[0_0_40px_rgba(99,102,241,0.15)] mb-8">
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

      {/* SELETOR DE MÓDULOS (Conta Corrente / Cartão) */}
      <div className="flex flex-wrap gap-2 md:gap-3 bg-slate-900/50 p-2 rounded-2xl border border-white/5 w-fit shadow-sm backdrop-blur-md">
        <button onClick={() => setActiveModule('geral')} className={`flex items-center gap-2 px-4 py-2.5 text-xs md:text-sm font-bold rounded-xl transition-all ${activeModule === 'geral' ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 shadow-md' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
          <Activity className="w-4 h-4" /> Visão Geral
        </button>
        <button onClick={() => setActiveModule('conta_corrente')} className={`flex items-center gap-2 px-4 py-2.5 text-xs md:text-sm font-bold rounded-xl transition-all ${activeModule === 'conta_corrente' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-md' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
          <Landmark className="w-4 h-4" /> Conta Corrente
        </button>
        <button onClick={() => setActiveModule('cartao_credito')} className={`flex items-center gap-2 px-4 py-2.5 text-xs md:text-sm font-bold rounded-xl transition-all ${activeModule === 'cartao_credito' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30 shadow-md' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
          <CreditCard className="w-4 h-4" /> Cartão de Crédito
        </button>
      </div>

      {/* HERO SECTION & QUICK ACTIONS BAR (Nova Interface Premium) */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6 mt-4">
        <div className="animate-in slide-in-from-left-4 duration-500">
          <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight flex items-center gap-3">
            Visão Global
            <span className="px-3 py-1 bg-gradient-to-r from-cyan-500/20 to-indigo-500/20 text-cyan-400 border border-cyan-500/30 rounded-full text-[10px] md:text-xs tracking-widest uppercase font-mono flex items-center gap-1.5 shadow-[0_0_15px_rgba(6,182,212,0.2)]">
              <Sparkles className="w-3 h-3" /> Layout de Foco AI
            </span>
          </h1>
          <p className="text-slate-400 mt-3 text-sm max-w-xl leading-relaxed">
            O seu património centralizado. A arquitetura quântica adaptou esta vista para maximizar o seu foco financeiro. Navegue no menu lateral para vistas detalhadas.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 bg-slate-900/60 p-2 md:p-2.5 rounded-2xl border border-white/5 backdrop-blur-xl shadow-2xl w-full lg:w-auto animate-in slide-in-from-right-4 duration-500">
          <button onClick={() => setIsFormOpen(true)} className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-5 py-3 text-sm font-bold text-white bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 rounded-xl transition-all shadow-lg shadow-indigo-500/25 hover:scale-[1.02] active:scale-95">
            <ArrowRightLeft className="w-4 h-4" /> <span className="hidden sm:inline">Nova Transação</span><span className="sm:hidden">Nova</span>
          </button>
          <button onClick={handleTradeClick} className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-5 py-3 text-sm font-bold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors border border-white/5">
            <TrendingUp className="w-4 h-4" /> <span className="hidden sm:inline">Operar Ativo</span><span className="sm:hidden">Operar</span>
          </button>
        </div>
      </div>

      {/* 4 KPIs PRINCIPAIS */}
      <div className="animate-in fade-in zoom-in-95 duration-700 delay-100">
        <DashboardCards balances={moduleBalances} />
      </div>

      {/* ÁREA DE CONTEÚDO PRINCIPAL (Grid 2/3 + 1/3) */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 md:gap-8 mt-4">
        
        {/* Esquerda: Gráfico Principal de Previsão */}
        <div className="xl:col-span-2 flex flex-col gap-6 md:gap-8 animate-in slide-in-from-bottom-4 duration-700 delay-200">
          <div className="glass-card-quantum p-1 relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-cyan-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none"></div>
            <ForecastWidget transactions={transactions} currentMonth={currentMonth} currentYear={currentYear} />
          </div>
        </div>
        
        {/* Direita: Insights da IA e Teto de Gastos */}
        <div className="xl:col-span-1 flex flex-col gap-6 md:gap-8 animate-in slide-in-from-bottom-4 duration-700 delay-300">
          <div className="glass-card-quantum p-1 h-full relative overflow-hidden group">
             <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-pink-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none"></div>
             <QuantumInsights metrics={metrics} loading={loadingMetrics} />
          </div>
          <div className="h-full">
             <BudgetProgress 
               totalExpenses={moduleBalances?.saidas || 0} 
               monthlyGoal={monthlyGoal} 
               onSetGoal={() => setIsBudgetModalOpen(true)} 
             />
          </div>
        </div>

      </div>

    </div>
  );
}