// src/components/HistoryPage.jsx
import React from 'react';
// ✅ CORREÇÃO: Apontando para a feature de transações
import TransactionsManager from '../features/transactions/TransactionsManager';

export default function HistoryPage({ 
  transactions, loading, onEdit, onDeleteRequest, onBatchDelete, onDeleteAll 
}) {
  return (
    <div className="space-y-6 animate-in fade-in duration-500 relative z-10 flex flex-col h-full">
      <div>
        {/* Título modernizado e focado na operação */}
        <h1 className="text-2xl font-bold text-white mb-1">Movimentações</h1>
        <p className="text-sm text-slate-400">Gestão completa e auditoria de todas as suas movimentações financeiras.</p>
      </div>

      <div className="flex-1 bg-slate-900/40 backdrop-blur-md border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <TransactionsManager
          transactions={transactions}
          loading={loading}
          onEdit={onEdit}
          onDeleteRequest={onDeleteRequest}
          onBatchDelete={onBatchDelete}
          onDeleteAll={onDeleteAll}
        />
      </div>
    </div>
  );
}