// src/components/DashboardContent.jsx
import { useState } from 'react';
import { Activity, Landmark, CreditCard } from 'lucide-react';
import { useNavigation } from '../contexts/NavigationContext';

// Importação dos subcomponentes
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

// O NOVO MODAL DA FASE 7
import BudgetModal from './BudgetModal';

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
  const { activeModule, setActiveModule } = useNavigation();
  const [activeDashboardTab, setActiveDashboardTab] = useState('overview');
  
  // Estado para o Modal de Trade (Fase 5)
  const [isTradeModalOpen, setIsTradeModalOpen] = useState(false);
  const [selectedTradeAsset, setSelectedTradeAsset] = useState('');

  // Estado para o Modal de Teto Mensal (Fase 7)
  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);

  // Função que será chamada pelo MarketAssets
  const handleTradeClick = (symbol) => {
    setSelectedTradeAsset(symbol);
    setIsTradeModalOpen(true);
  };

  return (
    <div className="space-y-6 md:space-y-8 animate-in fade-in duration-500 relative z-10">
      
      {/* MODAL DE TETO MENSAL (Fase 7) */}
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
          
          <DashboardCards balances={moduleBalances} />
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

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <DashboardCharts categoryData={categoryData} topExpensesData={topExpensesData} />
            <div className="flex flex-col h-full">
               {/* Substituímos o onSetGoal antigo (que tinha o prompt) 
                 pela abertura do nosso novo Modal!
               */}
               <BudgetProgress 
                 totalExpenses={moduleBalances.saidas} 
                 monthlyGoal={monthlyGoal} 
                 onSetGoal={() => setIsBudgetModalOpen(true)} 
               />
            </div>
          </div>

          <QuantumPredictions />

        </div>
      ) : (
        <div className="animate-in fade-in slide-in-from-bottom-4 h-[600px] md:h-[700px]">
          <TransactionsManager transactions={transactions} loading={loading} onEdit={onEditTransaction} onDeleteRequest={onDeleteRequest} onBatchDelete={onBatchDelete} onDeleteAll={onDeleteAll} />
        </div>
      )}
    </div>
  );
}