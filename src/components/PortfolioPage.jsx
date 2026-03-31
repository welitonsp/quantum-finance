import React from 'react';
import AllocationChart from './AllocationChart';
import RecentInvestments from './RecentInvestments';

export default function PortfolioPage({ moduleBalances }) {
  return (
    <div className="space-y-6 animate-in fade-in duration-500 relative z-10">
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">Portfólio de Investimentos</h1>
        <p className="text-sm text-quantum-fgMuted">Acompanhe os seus ativos e alocações detalhadas.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AllocationChart />
        <RecentInvestments />
      </div>

      <div className="glass-card-quantum p-6">
        <h3 className="text-lg font-bold text-white mb-4">Resumo Consolidado</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-quantum-bgSecondary p-4 rounded-xl border border-quantum-border">
            <p className="text-quantum-fgMuted text-xs font-bold uppercase tracking-wider mb-1">Saldo Líquido Atual</p>
            <p className="text-2xl font-mono font-bold text-quantum-accent">
              R$ {moduleBalances?.saldoAtual?.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) || '0,00'}
            </p>
          </div>
          <div className="bg-quantum-bgSecondary p-4 rounded-xl border border-quantum-border">
            <p className="text-quantum-fgMuted text-xs font-bold uppercase tracking-wider mb-1">Total Investido (Simulação)</p>
            <p className="text-2xl font-mono font-bold text-white">R$ 284.750,00</p>
          </div>
        </div>
      </div>
    </div>
  );
}