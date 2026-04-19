// src/components/QuantumAIPage.jsx
import React, { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BrainCircuit, AlertTriangle, TrendingDown, TrendingUp,
  Flame, ShieldAlert, Zap, ChevronRight, RefreshCw, Loader2,
  CheckCircle, Target, BarChart3
} from 'lucide-react';
import { aiProvider } from '../shared/ai/aiProvider';

// ─── Helpers ────────────────────────────────────────────────────────────────
function groupByCategory(transactions) {
  const map = {};
  transactions.forEach(tx => {
    if (tx.type !== 'saida' && tx.type !== 'despesa') return;
    const cat = tx.category || 'Outros';
    map[cat] = (map[cat] || 0) + Math.abs(Number(tx.value || 0));
  });
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, total]) => ({ cat, total }));
}

function calcBurnMetrics(transactions, currentMonth, currentYear) {
  const hoje = new Date();
  const diaAtual = hoje.getDate();
  const diasNoMes = new Date(currentYear, currentMonth, 0).getDate();

  const despesasMes = transactions
    .filter(tx => {
      if (tx.type !== 'saida' && tx.type !== 'despesa') return false;
      const d = new Date(tx.date || tx.createdAt);
      return d.getMonth() + 1 === currentMonth && d.getFullYear() === currentYear;
    })
    .reduce((acc, tx) => acc + Math.abs(Number(tx.value || 0)), 0);

  const receitasMes = transactions
    .filter(tx => {
      if (tx.type !== 'entrada' && tx.type !== 'receita') return false;
      const d = new Date(tx.date || tx.createdAt);
      return d.getMonth() + 1 === currentMonth && d.getFullYear() === currentYear;
    })
    .reduce((acc, tx) => acc + Math.abs(Number(tx.value || 0)), 0);

  const ritmoDiario = diaAtual > 0 ? despesasMes / diaAtual : 0;
  const projecaoFinal = ritmoDiario * diasNoMes;
  const saldoProjectado = receitasMes - projecaoFinal;

  return {
    despesasMes,
    receitasMes,
    ritmoDiario,
    projecaoFinal,
    saldoProjectado,
    diasRestantes: diasNoMes - diaAtual,
    percentualMes: Math.round((diaAtual / diasNoMes) * 100),
  };
}

// ─── Card KPI Quântico ───────────────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, sub, color, glow }) {
  const colorMap = {
    green:  { text: 'text-quantum-accent',  bg: 'bg-quantum-accentDim',  border: 'border-quantum-accent/20',  shadow: 'rgba(0,230,138,0.15)'  },
    red:    { text: 'text-quantum-red',     bg: 'bg-quantum-redDim',     border: 'border-quantum-red/20',     shadow: 'rgba(255,71,87,0.15)'   },
    gold:   { text: 'text-quantum-gold',    bg: 'bg-quantum-goldDim',    border: 'border-quantum-gold/20',    shadow: 'rgba(255,184,0,0.15)'   },
    purple: { text: 'text-quantum-purple',  bg: 'bg-quantum-purpleDim',  border: 'border-quantum-purple/20', shadow: 'rgba(168,85,247,0.15)'  },
  };
  const c = colorMap[color] || colorMap.green;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={`glass-card-quantum p-5 border ${c.border}`}
      style={{ boxShadow: `0 0 24px ${c.shadow}` }}
    >
      <div className="flex items-start justify-between mb-3">
        <div className={`p-2.5 rounded-xl ${c.bg} ${c.text}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <p className="text-xs text-quantum-fgMuted uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-2xl font-black font-mono ${c.text}`} style={{ textShadow: glow ? `0 0 20px ${c.shadow}` : 'none' }}>
        {value}
      </p>
      {sub && <p className="text-xs text-quantum-fgMuted mt-1">{sub}</p>}
    </motion.div>
  );
}

// ─── Painel de Anomalias ─────────────────────────────────────────────────────
function AnomaliesPanel({ transactions, currentMonth, currentYear }) {
  const anomalies = useMemo(() => {
    const mesesAnteriores = [];
    for (let i = 1; i <= 3; i++) {
      const d = new Date(currentYear, currentMonth - 1 - i, 1);
      mesesAnteriores.push({ month: d.getMonth() + 1, year: d.getFullYear() });
    }

    const catAtual = {};
    transactions.forEach(tx => {
      if (tx.type !== 'saida' && tx.type !== 'despesa') return;
      const d = new Date(tx.date || tx.createdAt);
      if (d.getMonth() + 1 !== currentMonth || d.getFullYear() !== currentYear) return;
      const cat = tx.category || 'Outros';
      catAtual[cat] = (catAtual[cat] || 0) + Math.abs(Number(tx.value || 0));
    });

    const catMedia = {};
    mesesAnteriores.forEach(({ month, year }) => {
      transactions.forEach(tx => {
        if (tx.type !== 'saida' && tx.type !== 'despesa') return;
        const d = new Date(tx.date || tx.createdAt);
        if (d.getMonth() + 1 !== month || d.getFullYear() !== year) return;
        const cat = tx.category || 'Outros';
        catMedia[cat] = (catMedia[cat] || 0) + Math.abs(Number(tx.value || 0));
      });
    });

    const alerts = [];
    Object.entries(catAtual).forEach(([cat, totalAtual]) => {
      const mediaHist = catMedia[cat] ? catMedia[cat] / 3 : 0;
      if (mediaHist > 0) {
        const desvio = ((totalAtual - mediaHist) / mediaHist) * 100;
        if (desvio > 20) {
          alerts.push({ cat, totalAtual, mediaHist, desvio: Math.round(desvio) });
        }
      }
    });

    return alerts.sort((a, b) => b.desvio - a.desvio);
  }, [transactions, currentMonth, currentYear]);

  if (anomalies.length === 0) {
    return (
      <div className="flex items-center gap-3 p-4 bg-quantum-accentDim border border-quantum-accent/20 rounded-xl">
        <CheckCircle className="w-5 h-5 text-quantum-accent shrink-0" />
        <span className="text-sm text-quantum-fg">Nenhuma anomalia detetada. Perfil de gastos estável.</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {anomalies.map((a, i) => (
        <motion.div
          key={a.cat}
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.06 }}
          className="flex items-center justify-between p-3.5 bg-quantum-redDim border border-quantum-red/20 rounded-xl"
        >
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-4 h-4 text-quantum-red shrink-0" />
            <div>
              <p className="text-sm font-bold text-white">{a.cat}</p>
              <p className="text-xs text-quantum-fgMuted">
                Média 3 meses: R$ {a.mediaHist.toFixed(2)}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-bold text-quantum-red">R$ {a.totalAtual.toFixed(2)}</p>
            <p className="text-xs text-quantum-red font-mono">+{a.desvio}%</p>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

// ─── Score de Risco das Despesas Fixas ──────────────────────────────────────
function FixedExpensesRisk({ balances, recurringTotal }) {
  const receitas = balances?.geral?.receitas || 0;
  const riskPct  = receitas > 0 ? Math.min((recurringTotal / receitas) * 100, 100) : 0;
  const level    = riskPct < 35 ? 'Seguro' : riskPct < 60 ? 'Atenção' : 'Crítico';
  const color    = riskPct < 35 ? 'quantum-accent' : riskPct < 60 ? 'quantum-gold' : 'quantum-red';

  return (
    <div className="glass-card-quantum p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ShieldAlert className={`w-5 h-5 text-${color}`} />
          <h4 className="text-sm font-bold text-white">Risco de Comprometimento Fixo</h4>
        </div>
        <span className={`badge-quantum-${riskPct < 35 ? 'green' : riskPct < 60 ? 'gold' : 'red'}`}>
          {level}
        </span>
      </div>

      <div className="mb-3">
        <div className="flex justify-between text-xs text-quantum-fgMuted mb-1.5">
          <span>Despesas Fixas vs Receitas</span>
          <span className={`font-bold text-${color}`}>{riskPct.toFixed(1)}%</span>
        </div>
        <div className="progress-quantum">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${riskPct}%` }}
            transition={{ duration: 1, ease: 'easeOut' }}
            className={`h-full rounded-full`}
            style={{
              background: riskPct < 35
                ? 'linear-gradient(90deg, #00E68A, #00B86E)'
                : riskPct < 60
                ? 'linear-gradient(90deg, #FFB800, #FF8C00)'
                : 'linear-gradient(90deg, #FF4757, #CC1A28)',
              boxShadow: `0 0 8px var(--tw-shadow-color)`,
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="bg-quantum-bgSecondary rounded-xl p-3">
          <p className="text-xs text-quantum-fgMuted mb-1">Fixas/Mês</p>
          <p className="font-bold font-mono text-white">R$ {recurringTotal.toFixed(2)}</p>
        </div>
        <div className="bg-quantum-bgSecondary rounded-xl p-3">
          <p className="text-xs text-quantum-fgMuted mb-1">Receitas/Mês</p>
          <p className="font-bold font-mono text-white">R$ {receitas.toFixed(2)}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Painel de Auditoria Automática ──────────────────────────────────────────
function AuditReportPanel({ transactions, balances, currentMonth, currentYear }) {
  const [report, setReport]   = useState('');
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);

  const generateReport = useCallback(async () => {
    setLoading(true);
    try {
      const contextJson = JSON.stringify({
        saldo:        balances?.geral?.saldo    ?? 0,
        entradas:     balances?.geral?.receitas ?? 0,
        saidas:       balances?.geral?.despesas ?? 0,
        transactions,
        currentMonth,
        currentYear,
      });
      const text = await aiProvider.chatCompletion([
        {
          role: 'system',
          content:
            'Você é um auditor financeiro CFO de elite. Analise os dados abaixo e gere um relatório ' +
            'completo em Markdown com riscos, burn rate, anomalias e recomendações.\n\nDados:\n' + contextJson,
        },
        { role: 'user', content: 'Gere o relatório de auditoria financeira.' },
      ]);
      setReport(text);
      setGenerated(true);
    } catch (e) {
      setReport('🚨 Falha ao gerar relatório. Verifique a configuração do motor de IA (VITE_GROQ_API_KEY / Ollama).');
    } finally {
      setLoading(false);
    }
  }, [transactions, balances, currentMonth, currentYear]);

  return (
    <div className="glass-card-quantum p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-quantum-purpleDim rounded-xl border border-quantum-purple/20">
            <BrainCircuit className="w-5 h-5 text-quantum-purple" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-white">Auditoria Automática</h4>
            <p className="text-xs text-quantum-fgMuted">Relatório CFO gerado por Motor Híbrido IA</p>
          </div>
        </div>
        <button
          onClick={generateReport}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 bg-quantum-purpleDim border border-quantum-purple/30 text-quantum-purple rounded-xl text-xs font-bold hover:bg-quantum-purple/20 transition-all disabled:opacity-50"
        >
          {loading
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <RefreshCw className="w-3.5 h-3.5" />
          }
          {generated ? 'Regenerar' : 'Gerar Auditoria'}
        </button>
      </div>

      <AnimatePresence>
        {loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center py-10 gap-3"
          >
            <div className="relative">
              <BrainCircuit className="w-10 h-10 text-quantum-purple animate-pulse" />
              <div className="absolute inset-0 bg-quantum-purple/20 rounded-full blur-xl animate-ping" />
            </div>
            <p className="text-xs text-quantum-fgMuted animate-pulse uppercase tracking-widest">
              Auditando dados financeiros...
            </p>
          </motion.div>
        )}

        {!loading && report && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="prose prose-invert prose-sm max-w-none text-quantum-fg bg-quantum-bg/50 rounded-xl p-4 border border-quantum-border text-sm leading-relaxed whitespace-pre-wrap"
          >
            {report}
          </motion.div>
        )}

        {!loading && !report && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center py-8 gap-3 text-center"
          >
            <BarChart3 className="w-10 h-10 text-quantum-fgMuted" />
            <p className="text-sm text-quantum-fgMuted">
              Clique em "Gerar Auditoria" para que o Motor Híbrido IA analise os seus dados e entregue um relatório CFO completo.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Página Principal ────────────────────────────────────────────────────────
export default function QuantumAIPage({ transactions = [], allTransactions = [], balances = {}, currentMonth, currentYear }) {
  const month = currentMonth || new Date().getMonth() + 1;
  const year  = currentYear  || new Date().getFullYear();

  const burn = useMemo(() => calcBurnMetrics(allTransactions, month, year), [allTransactions, month, year]);
  const topCats = useMemo(() => groupByCategory(transactions).slice(0, 5), [transactions]);

  const fmt = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const burnColor  = burn.ritmoDiario === 0 ? 'green' : burn.saldoProjectado >= 0 ? 'gold' : 'red';
  const riscoColor = burn.projecaoFinal <= burn.receitasMes ? 'green' : 'red';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6 relative z-10"
    >
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white mb-1 flex items-center gap-3">
            <div className="p-2 bg-quantum-purpleDim rounded-xl border border-quantum-purple/20">
              <BrainCircuit className="w-6 h-6 text-quantum-purple" />
            </div>
            Central Quantum AI
          </h1>
          <p className="text-sm text-quantum-fgMuted ml-14">Auditor Implacável — Baseado em dados reais</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-quantum-accent animate-pulse" />
          <span className="text-xs text-quantum-accent font-medium uppercase tracking-wider">Motor Ativo</span>
        </div>
      </div>

      {/* KPIs de Burn Rate */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={Flame}
          label="Ritmo Diário"
          value={fmt(burn.ritmoDiario)}
          sub={`${burn.diasRestantes} dias restantes`}
          color={burnColor}
          glow
        />
        <KpiCard
          icon={TrendingDown}
          label="Projeção Fim do Mês"
          value={fmt(burn.projecaoFinal)}
          sub={`Gasto atual: ${fmt(burn.despesasMes)}`}
          color={riscoColor}
          glow
        />
        <KpiCard
          icon={Target}
          label="Receitas do Mês"
          value={fmt(burn.receitasMes)}
          sub="Total entradas"
          color="green"
        />
        <KpiCard
          icon={burn.saldoProjectado >= 0 ? TrendingUp : TrendingDown}
          label="Saldo Projetado"
          value={fmt(burn.saldoProjectado)}
          sub={burn.saldoProjectado >= 0 ? 'Zona Segura' : '⚠️ Zona de Perigo'}
          color={burn.saldoProjectado >= 0 ? 'green' : 'red'}
          glow
        />
      </div>

      {/* Grid principal */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Anomalias */}
        <div className="glass-card-quantum p-5">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="w-5 h-5 text-quantum-red" />
            <h3 className="text-sm font-bold text-white">Anomalias Detetadas</h3>
            <span className="text-xs text-quantum-fgMuted ml-auto">vs. média 3 meses</span>
          </div>
          <AnomaliesPanel transactions={allTransactions} currentMonth={month} currentYear={year} />
        </div>

        {/* Top Categorias */}
        <div className="glass-card-quantum p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-5 h-5 text-quantum-accent" />
            <h3 className="text-sm font-bold text-white">Top Categorias do Mês</h3>
          </div>
          <div className="space-y-3">
            {topCats.length === 0 ? (
              <p className="text-sm text-quantum-fgMuted text-center py-4">Sem despesas registadas este mês.</p>
            ) : topCats.map((c, i) => {
              const maxVal = topCats[0]?.total || 1;
              const pct    = Math.round((c.total / maxVal) * 100);
              return (
                <motion.div
                  key={c.cat}
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-quantum-fg font-medium">{c.cat}</span>
                    <span className="text-quantum-accent font-mono font-bold">{fmt(c.total)}</span>
                  </div>
                  <div className="progress-quantum">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.8, delay: i * 0.05 }}
                      className="progress-quantum-fill"
                    />
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Risco Despesas Fixas */}
      <FixedExpensesRisk balances={balances} recurringTotal={balances?.geral?.despesas || 0} />

      {/* Relatório de Auditoria Gemini */}
      <AuditReportPanel
        transactions={allTransactions}
        balances={balances}
        currentMonth={month}
        currentYear={year}
      />
    </motion.div>
  );
}
