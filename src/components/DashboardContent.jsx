import React, { useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import CountUp from 'react-countup';
import {
  ArrowRightLeft, TrendingUp, TrendingDown, AlertTriangle,
  CheckCircle2, Activity, Landmark, Info
} from 'lucide-react';

import { useNavigation } from '../contexts/NavigationContext';
import { formatCurrency } from '../utils/formatters';

// Componentes Principais
import ForecastWidget from './ForecastWidget';
import TransactionForm from '../features/transactions/TransactionForm';

// Componentes Modulares
import { calcStatus } from '../utils/dashboardUtils';
import { HealthGauge } from './HealthGauge';
import { SparkLine } from './SparkLine';
import { IntelStrip } from './IntelStrip';
import { CategoryBreakdown } from './CategoryBreakdown';

// ─── ANIMAÇÕES (Framer Motion) ───────────────────────────────
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.15, delayChildren: 0.1 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1, y: 0,
    transition: { type: 'spring', stiffness: 80, damping: 15 }
  }
};

export default function DashboardContent({
  user, transactions, allTransactions, loading, moduleBalances,
  monthlyGoal, setMonthlyGoal, onSaveTransaction,
  isFormOpen, setIsFormOpen, transactionToEdit, setTransactionToEdit
}) {
  const { currentMonth, currentYear } = useNavigation();

  // Foco no Fluxo de Caixa
  const saldo      = moduleBalances?.geral?.saldo      || 0;
  const receitas   = moduleBalances?.geral?.receitas   || 0;
  const despesas   = moduleBalances?.geral?.despesas   || 0;
  
  // Parâmetros mantidos apenas para o motor de cálculo (dashboardUtils) não quebrar
  const patrimonio = saldo; 
  const dividas    = 0;
  const metaEcon   = monthlyGoal?.percent || 20;

  const st = useMemo(
    () => calcStatus(saldo, receitas, despesas, patrimonio, dividas, metaEcon),
    [saldo, receitas, despesas, patrimonio, dividas, metaEcon]
  );
  
  const { status, color, rec, score, savingsRate, debtRatio, goalProgress } = st;

  const StatusIcon = status === 'CRÍTICO' ? AlertTriangle : status === 'ATENÇÃO' ? Activity : CheckCircle2;
  const incomeDelta = receitas > 0 ? ((receitas - despesas) / receitas * 100) : 0;

  const badgeColor = {
    emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    red: 'bg-red-500/10 text-red-400 border-red-500/20'
  }[color];

  const glowColor = { emerald: 'bg-emerald-500', amber: 'bg-amber-500', red: 'bg-red-500' }[color];

  const handleEditTx = useCallback((t) => {
    setTransactionToEdit(t);
    setIsFormOpen(true);
  }, [setTransactionToEdit, setIsFormOpen]);

  return (
    <motion.div 
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="max-w-[1800px] mx-auto px-4 md:px-6 py-8 space-y-6"
    >
      {/* ── HERO (FOCO EM SALDO E CAIXA MENSAL) ─────────────── */}
      <motion.div variants={itemVariants} className="relative bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-3xl p-6 md:p-8 overflow-hidden transition-all hover:shadow-2xl">
        <div className={`absolute top-0 right-0 w-[500px] h-[500px] blur-[100px] opacity-20 rounded-full ${glowColor} -translate-y-1/2 translate-x-1/3 animate-slow-rotate`} />
        
        <div className="relative z-10 flex flex-col xl:flex-row gap-8">
          <div className="flex items-start gap-6 flex-1">
            <HealthGauge score={score} color={color} />
            <div className="flex-1">
              <p className="text-slate-400 font-bold uppercase text-xs tracking-wider mb-1">Saldo em Caixa</p>
              <div className="flex flex-wrap items-baseline gap-3 mb-3">
                <h1 className="text-4xl md:text-5xl font-black text-white tracking-tighter font-mono">
                  <CountUp end={saldo} duration={2} separator="." decimal="," decimals={2} prefix="R$ " />
                </h1>
                <div className={`flex items-center gap-1 text-sm font-bold px-3 py-1.5 rounded-xl ${incomeDelta >= 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                  {incomeDelta >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                  {Math.abs(incomeDelta).toFixed(1)}% retidos
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 mb-4">
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold border ${badgeColor}`}>
                  <StatusIcon className="w-4 h-4" />
                  {status}
                </div>
              </div>

              <div className={`p-3 bg-slate-950/80 border border-white/10 rounded-xl border-l-4 ${color === 'emerald' ? 'border-l-emerald-500' : color === 'amber' ? 'border-l-amber-500' : 'border-l-red-500'}`}>
                <span className="font-bold text-white uppercase text-[10px] tracking-wider mr-2">Status Operacional:</span>
                <span className="text-slate-300 text-sm">{rec}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-end gap-3 xl:min-w-[260px]">
            <div className="flex flex-col items-end gap-1">
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Tendência 6M</span>
              <SparkLine transactions={allTransactions || transactions} />
            </div>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setIsFormOpen(true)}
              aria-label="Nova transação"
              className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 rounded-xl font-bold text-white text-sm transition-shadow focus:outline-none focus:ring-2 focus:ring-cyan-500/50 shadow-lg shadow-cyan-500/20"
            >
              <ArrowRightLeft className="w-4 h-4" />
              Nova Movimentação
            </motion.button>
            <div className="grid grid-cols-2 gap-3 w-full">
              <div className="bg-slate-900 border border-white/10 rounded-xl p-3 text-center">
                <p className="text-[9px] uppercase text-slate-500 mb-1">Entradas (Mês)</p>
                <p className="text-sm font-bold text-emerald-400 font-mono">
                  <CountUp end={receitas} duration={2} separator="." decimal="," decimals={2} prefix="R$ " />
                </p>
              </div>
              <div className="bg-slate-900 border border-white/10 rounded-xl p-3 text-center">
                <p className="text-[9px] uppercase text-slate-500 mb-1">Saídas (Mês)</p>
                <p className="text-sm font-bold text-red-400 font-mono">
                  <CountUp end={despesas} duration={2} separator="." decimal="," decimals={2} prefix="R$ " />
                </p>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── FORMULÁRIO TRANSAÇÃO ────────────────────────────── */}
      {isFormOpen && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
          <TransactionForm
            onSave={onSaveTransaction}
            editingTransaction={transactionToEdit}
            onCancelEdit={() => { setTransactionToEdit(null); setIsFormOpen(false); }}
          />
        </motion.div>
      )}

      {/* ── INTEL STRIP (MÉTRICAS DE FLUXO) ─────────────────── */}
      <motion.div variants={itemVariants}>
        <IntelStrip savingsRate={savingsRate} debtRatio={debtRatio} goalProgress={goalProgress} />
      </motion.div>

      {/* ── PROJEÇÃO QUÂNTICA ───────────────────────────────── */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 gap-6">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Landmark className="w-5 h-5 text-cyan-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-widest">Projeção de Fluxo de Caixa</h2>
            <Info className="w-4 h-4 text-slate-500 cursor-help" title="Projeção de fluxo de caixa baseada nas suas transações atuais e despesas fixas." />
          </div>
          <div className="bg-slate-900/40 backdrop-blur-sm rounded-2xl p-5 border border-white/10 min-h-[400px]">
            <ForecastWidget transactions={allTransactions || transactions} currentMonth={currentMonth} currentYear={currentYear} />
          </div>
        </div>
      </motion.div>
      
      {/* ── DISTRIBUIÇÃO POR CATEGORIA ──────────────────────── */}
      <motion.div variants={itemVariants}>
        <CategoryBreakdown transactions={transactions} />
      </motion.div>

      {/* ── FAB MOBILE ──────────────────────────────────────── */}
      <button
        onClick={() => setIsFormOpen(true)}
        className="fixed bottom-6 right-6 lg:hidden w-14 h-14 bg-gradient-to-br from-cyan-500 to-violet-500 rounded-full flex items-center justify-center shadow-2xl shadow-cyan-500/50 z-50 active:scale-95 transition-transform"
        aria-label="Nova transação"
      >
        <ArrowRightLeft className="w-6 h-6 text-white" />
      </button>

      {/* ── ANIMAÇÕES CSS GLOBAIS ───────────────────────────── */}
      <style>{`
        @keyframes slowRotate { 0% { transform: translate(-30%, -30%) rotate(0deg); } 100% { transform: translate(-30%, -30%) rotate(360deg); } }
        .animate-slow-rotate { animation: slowRotate 20s infinite linear; }
      `}</style>
    </motion.div>
  );
}