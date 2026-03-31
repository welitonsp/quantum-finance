import React from 'react';
import TransactionsManager from './TransactionsManager';

export default function HistoryPage({ 
  transactions, loading, onEdit, onDeleteRequest, onBatchDelete, onDeleteAll 
}) {
  return (
    <div className="space-y-6 animate-in fade-in duration-500 relative z-10 flex flex-col h-full">
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">Livro Razão</h1>
        <p className="text-sm text-quantum-fgMuted">Gestão completa e auditoria de todas as suas movimentações.</p>
      </div>

      <div className="flex-1 bg-quantum-card border border-quantum-border rounded-2xl overflow-hidden shadow-xl">
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