// src/components/DashboardContent.jsx - Versão Refinada (Abril 2026)
import React, { useState, useMemo, useEffect, useCallback, memo } from 'react';
import {
  ArrowRightLeft, TrendingUp, TrendingDown, AlertTriangle,
  CheckCircle2, Activity, ShieldCheck, Zap, Target,
  ArrowUpRight, ArrowDownRight, Clock, BarChart2,
  Landmark, Sparkles, ListChecks, ChevronsUp, Minus, Info
} from 'lucide-react';
import { useNavigation } from '../contexts/NavigationContext';
import { formatCurrency } from '../utils/formatters';
import DashboardCards from './DashboardCards';
import ForecastWidget from './ForecastWidget';
import TransactionForm from '../features/transactions/TransactionForm';

// ─── Fonte mono para números financeiros ─────────────────────
const MONO = "'JetBrains Mono','Fira Code','SF Mono',ui-monospace,monospace";

// ─── Engine de pontuação e status (mantida original) ─────────
const calcStatus = (saldo, receitas, despesas, patrimonio, dividas, meta) => {
  const savingsRate   = receitas > 0 ? ((receitas - despesas) / receitas) * 100 : 0;
  const debtRatio     = receitas > 0 ? (despesas / receitas) * 100 : 0;
  const patrimonyRisk = patrimonio <= 0 ? 100 : (dividas / Math.abs(patrimonio)) * 100;
  const goalProgress  = meta > 0 ? Math.min((savingsRate / meta) * 100, 100) : 0;

  let s = 0;
  s += savingsRate >= 20 ? 25 : savingsRate >= 10 ? 14 : savingsRate >= 5 ? 5 : 0;
  s += debtRatio   <= 40 ? 25 : debtRatio   <= 70 ? 14 : debtRatio   <= 90 ? 5 : 0;
  s += goalProgress >= 80 ? 25 : goalProgress >= 50 ? 14 : goalProgress >= 20 ? 5 : 0;
  s += patrimonyRisk <= 30 ? 25 : patrimonyRisk <= 80 ? 14 : patrimonyRisk <= 150 ? 5 : 0;
  const score = Math.min(s, 100);

  let status = 'SAUDÁVEL', risk = 'BAIXO', color = 'emerald';
  let rec = 'Indicadores estáveis. Considere aumentar aportes em renda variável.';
  if (saldo < 0 || debtRatio > 90 || patrimonyRisk > 150) {
    status = 'CRÍTICO'; risk = 'ALTO'; color = 'red';
    rec = 'Interrompa gastos não essenciais. Reestruture dívidas imediatamente.';
  } else if (savingsRate < 10 || debtRatio > 70 || goalProgress < 50) {
    status = 'ATENÇÃO'; risk = 'MÉDIO'; color = 'amber';
    rec = 'Reduza despesas variáveis e assinaturas. Reforce a reserva de emergência.';
  } else if (score >= 80) {
    status = 'EXCELENTE'; risk = 'MÍNIMO'; color = 'emerald';
    rec = 'Desempenho excepcional. Acelere posições em ativos de maior retorno.';
  }
  return { status, risk, color, rec, score, savingsRate, debtRatio, goalProgress, patrimonyRisk };
};

// ─── Health Gauge com animação de entrada ─────────────────────
const HealthGauge = memo(({ score, color }) => {
  const [animatedFill, setAnimatedFill] = useState(0);
  const r = 46;
  const circ = 2 * Math.PI * r;
  const arc = circ * 0.72;
  const fill = (Math.max(0, animatedFill) / 100) * arc;
  const C = { emerald: '#10b981', amber: '#f59e0b', red: '#ef4444' }[color] || '#10b981';
  const lbl = color === 'red' ? 'CRÍTICO' : color === 'amber' ? 'ATENÇÃO' : score >= 80 ? 'EXCELENTE' : 'SAUDÁVEL';

  useEffect(() => {
    const timeout = setTimeout(() => setAnimatedFill(score), 200);
    return () => clearTimeout(timeout);
  }, [score]);

  return (
    <div className="relative w-32 h-32 flex-shrink-0">
      <svg viewBox="0 0 120 120" className="w-full h-full -rotate-[230deg]">
        <circle cx="60" cy="60" r={r} fill="none" stroke="#1e293b" strokeWidth="7"
          strokeDasharray={`${arc} ${circ - arc}`} strokeLinecap="round" />
        <circle cx="60" cy="60" r={r} fill="none" stroke={C} strokeWidth="7"
          strokeDasharray={`${fill} ${circ - fill}`} strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 1.6s cubic-bezier(0.4,0,0.2,1)' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
        <span className="font-mono text-3xl font-bold text-slate-100 leading-none">{score}</span>
        <span className="text-[8px] font-bold tracking-[0.12em] uppercase" style={{ color: C }}>{lbl}</span>
      </div>
    </div>
  );
});

// ─── Sparkline SVG (sem alterações) ──────────────────────────
const SparkLine = memo(({ transactions, months = 6 }) => {
  const pts = useMemo(() => {
    const now = new Date();
    const buckets = Array.from({ length: months }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1);
      return { m: d.getMonth(), y: d.getFullYear(), net: 0 };
    });
    (transactions || []).forEach(t => {
      const d = new Date(t.date || t.createdAt);
      const b = buckets.find(b => b.m === d.getMonth() && b.y === d.getFullYear());
      if (b) b.net += (t.type === 'receita' || t.type === 'entrada' || t.amount > 0) ? Math.abs(t.value || t.amount) : -Math.abs(t.value || t.amount);
    });
    return buckets.map(b => b.net);
  }, [transactions, months]);

  if (pts.every(v => v === 0)) return <div className="h-9 w-[140px] flex items-center text-slate-500 text-[10px]">Sem histórico</div>;
  const W = 140, H = 36;
  const mn = Math.min(...pts), mx = Math.max(...pts), rng = mx - mn || 1;
  const points = pts.map((v, i) => {
    const x = (i / (pts.length - 1)) * W;
    const y = H - 4 - ((v - mn) / rng) * (H - 8);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const lx = W, ly = H - 4 - ((pts[pts.length-1] - mn) / rng) * (H - 8);
  const rising = pts.length > 1 ? pts[pts.length-1] >= pts[pts.length-2] : true;
  const C = rising ? '#10b981' : '#f87171';
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="overflow-visible">
      <polyline points={points} fill="none" stroke={C} strokeWidth="1.5"
        strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly.toFixed(1)} r="3.5" fill={C} />
    </svg>
  );
});

// ─── Intel Strip com hover melhorado ─────────────────────────
const IntelStrip = memo(({ savingsRate, debtRatio, goalProgress }) => {
  const items = useMemo(() => [
    savingsRate < 10
      ? { c: 'red',     Icon: TrendingDown, title: 'Poupança Crítica',      body: `Apenas ${savingsRate.toFixed(1)}% retidos — meta mínima: 20%` }
      : savingsRate >= 20
        ? { c: 'emerald', Icon: TrendingUp, title: 'Poupança Sólida',        body: `${savingsRate.toFixed(1)}% da renda preservada mensalmente` }
        : { c: 'amber',   Icon: Minus,      title: 'Poupança Moderada',      body: `${savingsRate.toFixed(1)}% retidos — amplie para 20%` },
    debtRatio > 70
      ? { c: 'red',     Icon: AlertTriangle, title: 'Renda Comprometida',    body: `${debtRatio.toFixed(0)}% em despesas — reduza fixos` }
      : { c: 'emerald', Icon: ShieldCheck,   title: 'Despesas Controladas',  body: `${debtRatio.toFixed(0)}% de comprometimento de renda` },
    goalProgress < 50
      ? { c: 'amber',   Icon: Target,        title: 'Meta Atrasada',          body: `${goalProgress.toFixed(0)}% concluído — revise cortes` }
      : goalProgress >= 90
        ? { c: 'emerald', Icon: ChevronsUp,  title: 'Meta Quase Batida',      body: `${goalProgress.toFixed(0)}% — no trilho certo` }
        : { c: 'amber',   Icon: Target,      title: 'Progresso Parcial',      body: `${goalProgress.toFixed(0)}% da meta atingido este mês` },
  ], [savingsRate, debtRatio, goalProgress]);

  const colorClasses = {
    red: 'border-l-red-500 bg-red-500/5 border-red-500/20 text-red-400',
    amber: 'border-l-amber-500 bg-amber-500/5 border-amber-500/20 text-amber-400',
    emerald: 'border-l-emerald-500 bg-emerald-500/5 border-emerald-500/20 text-emerald-400',
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {items.map((item, idx) => (
        <div key={idx} className={`border-l-3 rounded-xl p-4 flex flex-col gap-2 transition-all hover:scale-[1.02] ${colorClasses[item.c]}`}
             style={{ borderLeftWidth: '3px', borderLeftColor: 'currentColor' }}>
          <div className="flex items-center gap-2">
            <item.Icon className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-wide">{item.title}</span>
          </div>
          <p className="text-sm text-slate-300 leading-relaxed">{item.body}</p>
        </div>
      ))}
    </div>
  );
});

// ─── KPI Row com tooltips e storytelling ─────────────────────
const KpiRow = memo(({ savingsRate, debtRatio, goalProgress, patrimonyRisk }) => {
  const kpis = useMemo(() => [
    { label: 'Taxa de Poupança',  val: Math.min(savingsRate, 100),   disp: `${savingsRate.toFixed(1)}%`,   good: savingsRate >= 20,   warn: savingsRate >= 10, tooltip: 'Percentual da renda que você poupa mensalmente. Meta mínima: 20%.' },
    { label: 'Comprometimento',   val: Math.min(debtRatio, 100),     disp: `${debtRatio.toFixed(0)}%`,     good: debtRatio <= 40,      warn: debtRatio <= 70, tooltip: 'Percentual da renda comprometido com despesas. Ideal: abaixo de 40%.' },
    { label: 'Progresso da Meta', val: Math.min(goalProgress, 100),  disp: `${goalProgress.toFixed(0)}%`,  good: goalProgress >= 80,  warn: goalProgress >= 50, tooltip: 'Quanto você já atingiu da sua meta de poupança mensal.' },
    { label: 'Risco Patrimonial', val: Math.min(patrimonyRisk, 100), disp: `${patrimonyRisk.toFixed(0)}%`, good: patrimonyRisk <= 30, warn: patrimonyRisk <= 80, tooltip: 'Relação entre dívidas e patrimônio total. Quanto menor, melhor.' },
  ], [savingsRate, debtRatio, goalProgress, patrimonyRisk]);

  const barColor = (good, warn) => good ? 'bg-emerald-500' : warn ? 'bg-amber-500' : 'bg-red-500';
  const textColor = (good, warn) => good ? 'text-emerald-400' : warn ? 'text-amber-400' : 'text-red-400';

  return (
    <div className="bg-slate-900/40 backdrop-blur-sm rounded-2xl p-6 border border-white/10">
      <div className="flex items-center gap-2 mb-5">
        <Activity className="w-5 h-5 text-cyan-400" />
        <h2 className="text-sm font-bold text-white uppercase tracking-widest">Indicadores de Saúde Financeira</h2>
        <Info className="w-4 h-4 text-slate-500 cursor-help" title="Métricas que avaliam sua saúde financeira com base nos dados inseridos." />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {kpis.map((kpi, i) => (
          <div key={i} className="flex flex-col gap-2 group">
            <div className="flex justify-between items-baseline">
              <div className="flex items-center gap-1">
                <span className="text-sm text-slate-400 font-medium">{kpi.label}</span>
                <Info className="w-3 h-3 text-slate-600 cursor-help" title={kpi.tooltip} />
              </div>
              <span className={`text-base font-bold font-mono tabular-nums ${textColor(kpi.good, kpi.warn)}`}>{kpi.disp}</span>
            </div>
            <div className="h-2.5 bg-slate-800 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-1000 ${barColor(kpi.good, kpi.warn)}`}
                   style={{ width: `${kpi.val}%` }} />
            </div>
            <div className="flex justify-between text-[10px] text-slate-500 mt-1">
              <span>Meta: {kpi.good ? 'Excelente' : kpi.warn ? 'Atenção' : 'Crítico'}</span>
              <span className="flex items-center gap-0.5">
                {kpi.good ? <TrendingUp className="w-3 h-3 text-emerald-500" /> : <TrendingDown className="w-3 h-3 text-red-500" />}
                {kpi.good ? '+5%' : '-2%'} vs meta
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

// ─── NOVO: CategoryBreakdown (Receitas e Despesas por categoria) ─────
const CategoryBreakdown = memo(({ transactions }) => {
  const { incomeCategories, expenseCategories } = useMemo(() => {
    const incomeMap = {};
    const expenseMap = {};
    (transactions || []).forEach(t => {
      const isIncome = t.type === 'receita' || t.type === 'entrada' || t.amount > 0;
      const cat = t.category || 'Outros';
      const amount = Math.abs(t.value || t.amount || 0);
      if (isIncome) {
        incomeMap[cat] = (incomeMap[cat] || 0) + amount;
      } else {
        expenseMap[cat] = (expenseMap[cat] || 0) + amount;
      }
    });
    const incomeTotal = Object.values(incomeMap).reduce((a,b) => a+b, 0) || 1;
    const expenseTotal = Object.values(expenseMap).reduce((a,b) => a+b, 0) || 1;
    const colors = ['#22d3ee','#818cf8','#f472b6','#34d399','#fbbf24','#f87171','#a78bfa'];
    const process = (map, total) => Object.entries(map)
      .sort((a,b) => b[1] - a[1])
      .slice(0,5)
      .map(([name, value], i) => ({ name, value, pct: (value/total)*100, color: colors[i % colors.length] }));
    return {
      incomeCategories: process(incomeMap, incomeTotal),
      expenseCategories: process(expenseMap, expenseTotal),
    };
  }, [transactions]);

  const renderCategoryList = (categories, title, type) => (
    <div className="flex-1">
      <h3 className={`text-sm font-bold mb-4 ${type === 'income' ? 'text-emerald-400' : 'text-red-400'} uppercase tracking-wider`}>{title}</h3>
      {categories.length === 0 ? (
        <p className="text-slate-500 text-sm text-center py-4">Nenhuma {type === 'income' ? 'receita' : 'despesa'} registrada</p>
      ) : (
        <div className="flex flex-col gap-4">
          {categories.map((cat, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: cat.color }} />
                  <span className="text-slate-300">{cat.name}</span>
                </div>
                <div className="flex gap-3 items-baseline">
                  <span className="text-xs text-slate-500 font-mono">{formatCurrency(cat.value)}</span>
                  <span className="text-sm font-bold text-slate-200 font-mono">{cat.pct.toFixed(0)}%</span>
                </div>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${cat.pct}%`, background: cat.color }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="bg-slate-900/40 backdrop-blur-sm rounded-2xl p-6 border border-white/10">
      <div className="flex items-center gap-2 mb-5">
        <BarChart2 className="w-5 h-5 text-cyan-400" />
        <h2 className="text-sm font-bold text-white uppercase tracking-widest">Distribuição por Categoria</h2>
        <Info className="w-4 h-4 text-slate-500 cursor-help" title="Divisão de receitas e despesas por categoria." />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {renderCategoryList(incomeCategories, '💰 Receitas', 'income')}
        {renderCategoryList(expenseCategories, '📉 Despesas', 'expense')}
      </div>
    </div>
  );
});

// ─── DASHBOARD PRINCIPAL (com métricas executivas acima da projeção) ─
export default function DashboardContent({
  user, transactions, loading, moduleBalances,
  monthlyGoal, setMonthlyGoal, onSaveTransaction,
  isFormOpen, setIsFormOpen, transactionToEdit, setTransactionToEdit
}) {
  const { currentMonth, currentYear } = useNavigation();

  const saldo      = moduleBalances?.geral?.saldo      || 0;
  const receitas   = moduleBalances?.geral?.receitas   || 0;
  const despesas   = moduleBalances?.geral?.despesas   || 0;
  const patrimonio = moduleBalances?.geral?.patrimonio || saldo;
  const dividas    = moduleBalances?.geral?.dividas    || 0;
  const metaEcon   = monthlyGoal?.percent              || 20;

  const st = useMemo(
    () => calcStatus(saldo, receitas, despesas, patrimonio, dividas, metaEcon),
    [saldo, receitas, despesas, patrimonio, dividas, metaEcon]
  );
  const { status, risk, color, rec, score, savingsRate, debtRatio, goalProgress, patrimonyRisk } = st;

  const StatusIcon = status === 'CRÍTICO' ? AlertTriangle : status === 'ATENÇÃO' ? Activity : CheckCircle2;
  const incomeDelta = receitas > 0 ? ((receitas - despesas) / receitas * 100) : 0;

  const badgeColor = {
    emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    red: 'bg-red-500/10 text-red-400 border-red-500/20'
  }[color];

  const riskColor = risk === 'ALTO' ? 'text-red-400' : risk === 'MÉDIO' ? 'text-amber-400' : 'text-emerald-400';
  const glowColor = { emerald: 'bg-emerald-500', amber: 'bg-amber-500', red: 'bg-red-500' }[color];

  const handleEditTx = useCallback((t) => {
    setTransactionToEdit(t);
    setIsFormOpen(true);
  }, [setTransactionToEdit, setIsFormOpen]);

  return (
    <div className="max-w-[1800px] mx-auto px-4 md:px-6 py-8 space-y-6 animate-fade-in-up">
      
      {/* HERO - Glassmorphism refinado com glow animado */}
      <div className="relative bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-3xl p-6 md:p-8 overflow-hidden transition-all hover:shadow-2xl">
        <div className={`absolute top-0 right-0 w-[500px] h-[500px] blur-[100px] opacity-20 rounded-full ${glowColor} -translate-y-1/2 translate-x-1/3 animate-slow-rotate`} />
        
        <div className="relative z-10 flex flex-col xl:flex-row gap-8">
          {/* Esquerda: Gauge + Saldo */}
          <div className="flex items-start gap-6 flex-1">
            <HealthGauge score={score} color={color} />
            <div className="flex-1">
              <p className="text-slate-400 font-bold uppercase text-xs tracking-wider mb-1">Caixa Consolidado</p>
              <div className="flex flex-wrap items-baseline gap-3 mb-3">
                <h1 className="text-4xl md:text-5xl font-black text-white tracking-tighter font-mono">
                  {formatCurrency(saldo)}
                </h1>
                <div className={`flex items-center gap-1 text-sm font-bold px-3 py-1.5 rounded-xl ${incomeDelta >= 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                  {incomeDelta >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                  {Math.abs(incomeDelta).toFixed(1)}% poupança
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 mb-4">
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold border ${badgeColor}`}>
                  <StatusIcon className="w-4 h-4" />
                  {status}
                </div>
                <div className="flex items-center gap-3 bg-slate-950/60 px-3 py-1.5 rounded-xl border border-white/10">
                  <div><span className="text-[9px] uppercase text-slate-500">Risco</span><p className={`text-xs font-bold ${riskColor}`}>{risk}</p></div>
                  <div className="w-px h-5 bg-slate-700" />
                  <div><span className="text-[9px] uppercase text-slate-500">Dív/Rec</span><p className="text-xs font-bold text-slate-200">{debtRatio.toFixed(0)}%</p></div>
                  <div className="w-px h-5 bg-slate-700" />
                  <div><span className="text-[9px] uppercase text-slate-500">Patrimônio</span><p className="text-xs font-bold text-slate-200">{formatCurrency(patrimonio)}</p></div>
                </div>
              </div>

              <div className={`p-3 bg-slate-950/80 border border-white/10 rounded-xl border-l-4 ${color === 'emerald' ? 'border-l-emerald-500' : color === 'amber' ? 'border-l-amber-500' : 'border-l-red-500'}`}>
                <span className="font-bold text-white uppercase text-[10px] tracking-wider mr-2">Decisão Tática:</span>
                <span className="text-slate-300 text-sm">{rec}</span>
              </div>
            </div>
          </div>

          {/* Direita: Sparkline + Botão + Receitas/Despesas */}
          <div className="flex flex-col items-end gap-3 xl:min-w-[260px]">
            <div className="flex flex-col items-end gap-1">
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Tendência 6M</span>
              <SparkLine transactions={transactions} />
            </div>
            <button
              onClick={() => setIsFormOpen(true)}
              aria-label="Nova transação"
              className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 rounded-xl font-bold text-white text-sm transition-all hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 shadow-lg shadow-cyan-500/20"
            >
              <ArrowRightLeft className="w-4 h-4" />
              Nova Transação
            </button>
            <div className="grid grid-cols-2 gap-3 w-full">
              <div className="bg-slate-900 border border-white/10 rounded-xl p-3 text-center">
                <p className="text-[9px] uppercase text-slate-500 mb-1">Receitas</p>
                <p className="text-sm font-bold text-emerald-400 font-mono">{formatCurrency(receitas)}</p>
              </div>
              <div className="bg-slate-900 border border-white/10 rounded-xl p-3 text-center">
                <p className="text-[9px] uppercase text-slate-500 mb-1">Despesas</p>
                <p className="text-sm font-bold text-red-400 font-mono">{formatCurrency(despesas)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Formulário de transação */}
      {isFormOpen && (
        <div className="animate-in slide-in-from-top-4 fade-in duration-300">
          <TransactionForm
            onSave={onSaveTransaction}
            editingTransaction={transactionToEdit}
            onCancelEdit={() => { setTransactionToEdit(null); setIsFormOpen(false); }}
          />
        </div>
      )}

      {/* Intel Strip */}
      <IntelStrip savingsRate={savingsRate} debtRatio={debtRatio} goalProgress={goalProgress} />

      {/* MÉTRICAS EXECUTIVAS (DashboardCards) movidas para cima */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-cyan-400" />
          <h2 className="text-sm font-bold text-white uppercase tracking-widest">Métricas Executivas</h2>
          <Info className="w-4 h-4 text-slate-500 cursor-help" title="Indicadores de alto nível do seu patrimônio." />
        </div>
        <DashboardCards balances={moduleBalances?.geral} loading={loading} />
      </div>

      {/* PROJEÇÃO QUÂNTICA (ForecastWidget) */}
      <div className="grid grid-cols-1 gap-6">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Landmark className="w-5 h-5 text-cyan-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-widest">Projeção Quântica — 6 Meses</h2>
            <Info className="w-4 h-4 text-slate-500 cursor-help" title="Projeção de fluxo de caixa baseada nas suas transações atuais." />
          </div>
          <div className="bg-slate-900/40 backdrop-blur-sm rounded-2xl p-5 border border-white/10 min-h-[400px]">
            <ForecastWidget transactions={transactions} currentMonth={currentMonth} currentYear={currentYear} />
          </div>
        </div>
      </div>

      {/* KPI Row (Indicadores de Saúde) */}
      <KpiRow savingsRate={savingsRate} debtRatio={debtRatio} goalProgress={goalProgress} patrimonyRisk={patrimonyRisk} />

      {/* DISTRIBUIÇÃO DE GASTOS (Receitas e Despesas por categoria) */}
      <CategoryBreakdown transactions={transactions} />

      {/* FAB para mobile (Nova Transação) */}
      <button
        onClick={() => setIsFormOpen(true)}
        className="fixed bottom-6 right-6 lg:hidden w-14 h-14 bg-gradient-to-br from-cyan-500 to-violet-500 rounded-full flex items-center justify-center shadow-2xl shadow-cyan-500/50 z-50 active:scale-95 transition-transform focus:outline-none focus:ring-2 focus:ring-cyan-400"
        aria-label="Nova transação"
      >
        <ArrowRightLeft className="w-6 h-6 text-white" />
      </button>

      <style jsx>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slowRotate {
          0% { transform: translate(-30%, -30%) rotate(0deg); }
          100% { transform: translate(-30%, -30%) rotate(360deg); }
        }
        .animate-fade-in-up {
          animation: fadeInUp 0.5s ease-out forwards;
        }
        .animate-slow-rotate {
          animation: slowRotate 20s infinite linear;
        }
      `}</style>
    </div>
  );
}