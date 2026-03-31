// src/components/DashboardContent.jsx
import { useState } from 'react';
import { Activity, Landmark, CreditCard } from 'lucide-react';
import { useNavigation } from '../contexts/NavigationContext';
import { auth } from '../firebase'; 

// Componentes da Interface (Fase 7/8)
import DashboardCards from './DashboardCards';
import PortfolioChart from './PortfolioChart'; 
import MarketAssets from './MarketAssets';               
import AllocationChart from './AllocationChart';        
import RecentInvestments from './RecentInvestments';    
import BudgetProgress from './BudgetProgress';
import DashboardCharts from './DashboardCharts';
import TransactionsManager from './TransactionsManager';
import TransactionForm from './TransactionForm';
import TradeModal from './TradeModal';
import QuantumPredictions from './QuantumPredictions';
import BudgetModal from './BudgetModal';

// Componentes de Inteligência Financeira (Sprints 5, 12 e 14)
import ForecastWidget from './ForecastWidget'; 
import { useFinancialMetrics } from '../hooks/useFinancialMetrics';
import WealthKPIs from './WealthKPIs';
import QuantumInsights from './QuantumInsights';

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
  // Puxamos o contexto de navegação para sincronizar datas com os motores de cálculo
  const { activeModule, setActiveModule, currentMonth, currentYear } = useNavigation();
  const [activeDashboardTab, setActiveDashboardTab] = useState('overview');
  
  // Estados dos Modais
  const [isTradeModalOpen, setIsTradeModalOpen] = useState(false);
  const [selectedTradeAsset, setSelectedTradeAsset] = useState('');
  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);

  // ✅ INJEÇÃO DO CÉREBRO DE KPIs (Sprint 12)
  const { metrics, loadingMetrics } = useFinancialMetrics(
    auth.currentUser?.uid, 
    transactions, 
    currentMonth, 
    currentYear
  );

  const handleTradeClick = (symbol) => {
    setSelectedTradeAsset(symbol);
    setIsTradeModalOpen(true);
  };

  return (
    <div className="space-y-6 md:space-y-8 animate-in fade-in duration-500 relative z-10">
      
      {/* MODAIS */}
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

      {isFormOpen && (
        <div className="p-4 md:p-8 bg-quantum-card border-dashed border-2 border-quantum-border rounded-3xl animate-in slide-in-from-top-4 shadow-xl mb-6">
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

      {/* SELETOR DE MÓDULOS (CONTAS) */}
      <div className="flex flex-wrap gap-2 md:gap-3 bg-quantum-bgSecondary p-2 rounded-2xl border border-quantum-border w-fit shadow-sm">
        <button onClick={() => setActiveModule('geral')} className={`flex items-center gap-2 px-4 py-2 md:px-6 md:py-3 text-xs md:text-sm font-bold rounded-xl transition-all ${activeModule === 'geral' ? 'bg-quantum-card text-quantum-accent border border-quantum-border shadow-md' : 'text-quantum-fgMuted hover:text-white'}`}>
          <Activity className="w-4 h-4" /> Visão Geral
        </button>
        <button onClick={() => setActiveModule('conta_corrente')} className={`flex items-center gap-2 px-4 py-2 md:px-6 md:py-3 text-xs md:text-sm font-bold rounded-xl transition-all ${activeModule === 'conta_corrente' ? 'bg-quantum-accentDim text-quantum-accent shadow-md' : 'text-quantum-fgMuted hover:text-white'}`}>
          <Landmark className="w-4 h-4" /> Conta Corrente
        </button>
        <button onClick={() => setActiveModule('cartao_credito')} className={`flex items-center gap-2 px-4 py-2 md:px-6 md:py-3 text-xs md:text-sm font-bold rounded-xl transition-all ${activeModule === 'cartao_credito' ? 'bg-quantum-goldDim text-quantum-gold shadow-md' : 'text-quantum-fgMuted hover:text-white'}`}>
          <CreditCard className="w-4 h-4" /> Cartão de Crédito
        </button>
      </div>

      {/* ABAS DO DASHBOARD */}
      <div className="flex gap-4 md:gap-8 border-b border-quantum-border mt-4 overflow-x-auto custom-scrollbar">
        <button onClick={() => setActiveDashboardTab('overview')} className={`pb-4 text-sm md:text-base font-bold tracking-widest uppercase transition-all border-b-2 whitespace-nowrap ${activeDashboardTab === 'overview' ? 'border-quantum-accent text-quantum-accent' : 'border-transparent text-quantum-fgMuted hover:text-white'}`}>
          Dashboard Analítico
        </button>
        <button onClick={() => setActiveDashboardTab('transactions')} className={`pb-4 text-sm md:text-base font-bold tracking-widest uppercase transition-all border-b-2 whitespace-nowrap ${activeDashboardTab === 'transactions' ? 'border-cyan-500 text-cyan-400' : 'border-transparent text-quantum-fgMuted hover:text-white'}`}>
          Livro Razão (Busca)
        </button>
      </div>

      {activeDashboardTab === 'overview' ? (
        <div className="space-y-6 md:space-y-8 animate-in fade-in slide-in-from-bottom-4">
          
          {/* 1. Sumário de Saldos Brutos */}
          <DashboardCards balances={moduleBalances} />

          {/* 2. KPIs de Riqueza e Saúde Financeira (Sprint 12) */}
          <WealthKPIs metrics={metrics} loading={loadingMetrics} />

          {/* 3. Diagnóstico e Insights Inteligentes (Sprint 14) */}
          <QuantumInsights metrics={metrics} loading={loadingMetrics} />

          {/* 4. Radar de Previsão de Gastos (Sprint 5) */}
          <div className="w-full">
            <ForecastWidget transactions={transactions} currentMonth={currentMonth} currentYear={currentYear} />
          </div>

          {/* 5. Gráfico de Portefólio e Ativos */}
          <PortfolioChart />

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2 flex flex-col">
              <MarketAssets onTradeClick={handleTradeClick} />
            </div>
            
            <div className="xl:col-span-1 flex flex-col gap-6">
              <RecentInvestments />
              <AllocationChart />
            </div>
          </div>

          {/* 6. Análise de Categorias e Metas de Orçamento */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <DashboardCharts categoryData={categoryData} topExpensesData={topExpensesData} />
            <div className="flex flex-col h-full">
               <BudgetProgress 
                 totalExpenses={moduleBalances.saidas} 
                 monthlyGoal={monthlyGoal} 
                 onSetGoal={() => setIsBudgetModalOpen(true)} 
               />
            </div>
          </div>

          {/* 7. Predições de IA sobre o Mercado */}
          <QuantumPredictions />

        </div>
      ) : (
        /* ABA DO LIVRO RAZÃO (BUSCA) */
        <div className="animate-in fade-in slide-in-from-bottom-4 h-[600px] md:h-[700px]">
          <TransactionsManager 
            transactions={transactions} 
            loading={loading} 
            onEdit={onEditTransaction} 
            onDeleteRequest={onDeleteRequest} 
            onBatchDelete={handleBatchDelete} 
            onDeleteAll={handleBatchDelete} 
          />
        </div>
      )}
    </div>
  );
}