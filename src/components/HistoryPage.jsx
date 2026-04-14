// src/components/HistoryPage.jsx
import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { ListChecks, TrendingUp, TrendingDown, Scale } from 'lucide-react';
import TransactionsManager from '../features/transactions/TransactionsManager';

// ─── Card de KPI compacto ──────────────────────────────────────────────────────
function StatPill({ icon: Icon, label, value, colorClass }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl border bg-slate-900/60 backdrop-blur-sm ${colorClass}`}
    >
      <Icon className="w-4 h-4 shrink-0" />
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 leading-none mb-0.5">{label}</p>
        <p className="text-sm font-bold text-white truncate">{value}</p>
      </div>
    </motion.div>
  );
}

function fmt(n) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
export default function HistoryPage({
  transactions = [],
  loading,
  onEdit,
  onDeleteRequest,
  onBatchDelete,
  onDeleteAll,
}) {
  const stats = useMemo(() => {
    let totalIn = 0, totalOut = 0;
    transactions.forEach(tx => {
      const v = (tx.value || 0) / 100;
      if (tx.type === 'entrada' || tx.type === 'receita') totalIn  += v;
      else                                                  totalOut += v;
    });
    return { count: transactions.length, totalIn, totalOut, net: totalIn - totalOut };
  }, [transactions]);

  const netPositive = stats.net >= 0;

  return (
    <div className="space-y-5 animate-in fade-in duration-500 relative z-10 flex flex-col h-full">

      {/* ── Cabeçalho ─────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-lg bg-quantum-accent/15 flex items-center justify-center">
              <ListChecks className="w-4 h-4 text-quantum-accent" />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Movimentações</h1>
          </div>
          <p className="text-sm text-slate-500 ml-10">
            Gestão completa e auditoria de todos os seus lançamentos financeiros.
          </p>
        </div>

        {/* Pills de stats — só aparecem com dados */}
        {!loading && stats.count > 0 && (
          <motion.div
            className="flex flex-wrap gap-2 sm:gap-2.5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
          >
            <StatPill
              icon={ListChecks}
              label="Total"
              value={`${stats.count} lançamentos`}
              colorClass="border-slate-700/60"
            />
            <StatPill
              icon={TrendingUp}
              label="Entradas"
              value={fmt(stats.totalIn)}
              colorClass="border-emerald-500/20 text-emerald-400"
            />
            <StatPill
              icon={TrendingDown}
              label="Saídas"
              value={fmt(stats.totalOut)}
              colorClass="border-red-500/20 text-red-400"
            />
            <StatPill
              icon={Scale}
              label="Saldo"
              value={`${netPositive ? '+' : ''}${fmt(stats.net)}`}
              colorClass={netPositive
                ? 'border-emerald-500/30 text-emerald-300'
                : 'border-red-500/30 text-red-300'}
            />
          </motion.div>
        )}
      </div>

      {/* ── Painel principal ──────────────────────────────────────── */}
      <motion.div
        className="flex-1 glass-card-quantum rounded-2xl overflow-hidden"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        style={{ boxShadow: '0 0 40px rgba(0,230,138,0.04), 0 8px 32px rgba(0,0,0,0.4)' }}
      >
        <TransactionsManager
          transactions={transactions}
          loading={loading}
          onEdit={onEdit}
          onDeleteRequest={onDeleteRequest}
          onBatchDelete={onBatchDelete}
          onDeleteAll={onDeleteAll}
        />
      </motion.div>
    </div>
  );
}
