import React, { useState, useMemo, useEffect, useCallback, memo } from 'react';
import {
  ArrowRightLeft, TrendingUp, TrendingDown, AlertTriangle,
  CheckCircle2, Activity, ShieldCheck, Zap, Target,
  ArrowUpRight, ArrowDownRight, Clock, BarChart2,
  Landmark, Sparkles, ListChecks, ChevronsUp, Minus
} from 'lucide-react';
import { useNavigation } from '../contexts/NavigationContext';
import { formatCurrency } from '../utils/formatters';
import DashboardCards from './DashboardCards';
import ForecastWidget from './ForecastWidget';
import TransactionForm from '../features/transactions/TransactionForm';

// ─── Fonte mono para números financeiros ─────────────────────
const MONO = "'JetBrains Mono','Fira Code','SF Mono',ui-monospace,monospace";

// ─── Engine de pontuação e status ────────────────────────────
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

// ─── Health Gauge SVG ────────────────────────────────────────
const HealthGauge = memo(({ score, color }) => {
  const r = 46;
  const circ = 2 * Math.PI * r;
  const arc  = circ * 0.72;
  const fill = (Math.max(0, score) / 100) * arc;
  const C    = { emerald: '#10b981', amber: '#f59e0b', red: '#ef4444' }[color] || '#10b981';
  const lbl  = color === 'red' ? 'CRÍTICO' : color === 'amber' ? 'ATENÇÃO' : score >= 80 ? 'EXCELENTE' : 'SAUDÁVEL';
  return (
    <div style={{ position: 'relative', width: 128, height: 128, flexShrink: 0 }}>
      <svg viewBox="0 0 120 120" width="128" height="128"
           style={{ display: 'block', transform: 'rotate(-230deg)' }}>
        <circle cx="60" cy="60" r={r} fill="none" stroke="#1e293b" strokeWidth="7"
          strokeDasharray={`${arc} ${circ - arc}`} strokeLinecap="round" />
        <circle cx="60" cy="60" r={r} fill="none" stroke={C} strokeWidth="7"
          strokeDasharray={`${fill} ${circ - fill}`} strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 1.6s cubic-bezier(.4,0,.2,1)', filter: `drop-shadow(0 0 5px ${C}55)` }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
        <span style={{ fontFamily: MONO, fontSize: 26, fontWeight: 700, color: '#f1f5f9', lineHeight: 1 }}>{score}</span>
        <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.12em', color: C }}>{lbl}</span>
      </div>
    </div>
  );
});

// ─── Sparkline SVG ───────────────────────────────────────────
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

  if (pts.every(v => v === 0)) return <div style={{height: 36, width: 140, display: 'flex', alignItems: 'center', color: '#334155', fontSize: 10}}>Sem histórico</div>;
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
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ overflow: 'visible' }}>
      <polyline points={points} fill="none" stroke={C} strokeWidth="1.5"
        strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly.toFixed(1)} r="3.5" fill={C} />
    </svg>
  );
});

// ─── Intel Strip ─────────────────────────────────────────────
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

  const CC = {
    red:    { border: '#ef444440', bg: '#ef444408', text: '#f87171', accent: '#ef4444' },
    amber:  { border: '#f59e0b40', bg: '#f59e0b08', text: '#fbbf24', accent: '#f59e0b' },
    emerald:{ border: '#10b98140', bg: '#10b98108', text: '#34d399', accent: '#10b981' },
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
      {items.map((item, i) => {
        const c = CC[item.c];
        return (
          <div key={i} style={{ background: c.bg, border: `1px solid ${c.border}`, borderLeft: `3px solid ${c.accent}`, borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <item.Icon style={{ width: 13, height: 13, color: c.text, flexShrink: 0 }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: c.text, letterSpacing: '0.07em', textTransform: 'uppercase' }}>{item.title}</span>
            </div>
            <p style={{ fontSize: 12, color: '#94a3b8', margin: 0, lineHeight: 1.55 }}>{item.body}</p>
          </div>
        );
      })}
    </div>
  );
});

// ─── KPI Row ─────────────────────────────────────────────────
const KpiRow = memo(({ savingsRate, debtRatio, goalProgress, patrimonyRisk }) => {
  const kpis = [
    { label: 'Taxa de Poupança',  val: Math.min(savingsRate, 100),   disp: `${savingsRate.toFixed(1)}%`,   good: savingsRate >= 20,   warn: savingsRate >= 10 },
    { label: 'Comprometimento',   val: Math.min(debtRatio, 100),     disp: `${debtRatio.toFixed(0)}%`,     good: debtRatio <= 40,      warn: debtRatio <= 70 },
    { label: 'Progresso da Meta', val: Math.min(goalProgress, 100),  disp: `${goalProgress.toFixed(0)}%`,  good: goalProgress >= 80,  warn: goalProgress >= 50 },
    { label: 'Risco Patrimonial', val: Math.min(patrimonyRisk, 100), disp: `${patrimonyRisk.toFixed(0)}%`, good: patrimonyRisk <= 30, warn: patrimonyRisk <= 80 },
  ];
  const C = (g, w) => g ? '#10b981' : w ? '#f59e0b' : '#ef4444';
  const T = (g, w) => g ? '#34d399' : w ? '#fbbf24' : '#f87171';

  return (
    <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 16, padding: '20px 28px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <Activity style={{ width: 13, height: 13, color: '#22d3ee' }} />
        <span style={{ fontSize: 9, fontWeight: 700, color: '#475569', letterSpacing: '0.14em', textTransform: 'uppercase' }}>Indicadores de Saúde Financeira</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 28 }}>
        {kpis.map((k, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 11, color: '#64748b', fontWeight: 500 }}>{k.label}</span>
              <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: T(k.good, k.warn) }}>{k.disp}</span>
            </div>
            <div style={{ height: 3, background: '#1e293b', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${k.val}%`, background: C(k.good, k.warn), borderRadius: 99, transition: `width ${1.2 + i*0.1}s cubic-bezier(.4,0,.2,1)` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

// ─── Spending Bars ────────────────────────────────────────────
const SpendingBars = memo(({ transactions }) => {
  const cats = useMemo(() => {
    const map = {};
    (transactions || []).filter(t => t.type === 'despesa' || t.amount < 0 || t.type === 'saida')
      .forEach(t => { const c = t.category || 'Outros'; map[c] = (map[c]||0) + Math.abs(t.value || t.amount||0); });
    const total = Object.values(map).reduce((a,b)=>a+b,0) || 1;
    const colors = ['#22d3ee','#818cf8','#f472b6','#34d399','#fbbf24'];
    return Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,5)
      .map(([name,value],i) => ({ name, value, pct: (value/total)*100, color: colors[i % colors.length] }));
  }, [transactions]);

  return (
    <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 16, padding: '20px', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
        <BarChart2 style={{ width: 13, height: 13, color: '#22d3ee' }} />
        <span style={{ fontSize: 9, fontWeight: 700, color: '#475569', letterSpacing: '0.14em', textTransform: 'uppercase' }}>Distribuição de Gastos</span>
      </div>
      {cats.length === 0
        ? <p style={{ color: '#334155', fontSize: 12, margin: 'auto', textAlign: 'center' }}>Sem despesas registradas</p>
        : <div style={{ display: 'flex', flexDirection: 'column', gap: 13, flex: 1, justifyContent: 'center' }}>
            {cats.map((c,i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: c.color, flexShrink: 0, display: 'inline-block' }} />
                    <span style={{ fontSize: 12, color: '#94a3b8' }}>{c.name}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                    <span style={{ fontFamily: MONO, fontSize: 10, color: '#475569' }}>{formatCurrency(c.value)}</span>
                    <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: '#cbd5e1', minWidth: 32, textAlign: 'right' }}>{c.pct.toFixed(0)}%</span>
                  </div>
                </div>
                <div style={{ height: 3, background: '#1e293b', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${c.pct}%`, background: c.color, borderRadius: 99, transition: `width ${1+i*0.15}s cubic-bezier(.4,0,.2,1)` }} />
                </div>
              </div>
            ))}
          </div>
      }
    </div>
  );
});

// ─── Goals Panel ─────────────────────────────────────────────
const GoalsPanel = memo(({ receitas, despesas, monthlyGoal }) => {
  const saved  = Math.max(receitas - despesas, 0);
  const target = monthlyGoal?.value > 0 ? monthlyGoal.value : (receitas * 0.2) || 1;
  const goals  = [
    { label: 'Meta do Mês',           current: saved,        target,        color: '#22d3ee' },
    { label: 'Reserva de Emergência', current: saved * 0.4, target: target*3, color: '#818cf8' },
    { label: 'Fundo de Férias',       current: saved * 0.1, target: target*2, color: '#f472b6' },
  ];

  return (
    <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 16, padding: '20px', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
        <Target style={{ width: 13, height: 13, color: '#22d3ee' }} />
        <span style={{ fontSize: 9, fontWeight: 700, color: '#475569', letterSpacing: '0.14em', textTransform: 'uppercase' }}>Metas Financeiras</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1, justifyContent: 'center' }}>
        {goals.map((g,i) => {
          const p = Math.min((g.current/g.target)*100, 100);
          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: '#94a3b8' }}>{g.label}</span>
                <div style={{ display: 'flex', gap: 4, alignItems: 'baseline' }}>
                  <span style={{ fontFamily: MONO, fontSize: 10, color: '#475569' }}>{formatCurrency(g.current)}</span>
                  <span style={{ fontSize: 10, color: '#1e293b' }}>/</span>
                  <span style={{ fontFamily: MONO, fontSize: 10, color: '#334155' }}>{formatCurrency(g.target)}</span>
                  <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: g.color, minWidth: 34, textAlign: 'right' }}>{p.toFixed(0)}%</span>
                </div>
              </div>
              <div style={{ height: 4, background: '#1e293b', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${p}%`, background: g.color, borderRadius: 99, transition: `width ${1.2+i*0.2}s cubic-bezier(.4,0,.2,1)` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

// ─── Transaction Feed ─────────────────────────────────────────
const TxFeed = memo(({ transactions, onEdit, loading }) => {
  const recent = useMemo(
    () => [...(transactions||[])].sort((a,b) => new Date(b.date||b.createdAt) - new Date(a.date||a.createdAt)).slice(0,6),
    [transactions]
  );

  return (
    <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 16, padding: '20px', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <ListChecks style={{ width: 13, height: 13, color: '#22d3ee' }} />
        <span style={{ fontSize: 9, fontWeight: 700, color: '#475569', letterSpacing: '0.14em', textTransform: 'uppercase' }}>Últimas Movimentações</span>
      </div>
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[1,2,3,4].map(i => <div key={i} style={{ height: 44, background: '#1e293b', borderRadius: 10 }} />)}
        </div>
      ) : recent.length === 0 ? (
        <p style={{ color: '#334155', fontSize: 12, margin: 'auto', textAlign: 'center' }}>Nenhuma transação</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          {recent.map((t,i) => {
            const income = t.type === 'receita' || t.type === 'entrada' || t.amount > 0;
            const amt    = Math.abs(t.value || t.amount || 0);
            const bg     = income ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)';
            const ic     = income ? '#34d399' : '#f87171';
            return (
              <div key={t.id||i}
                role="button"
                tabIndex={0}
                aria-label={`Editar transação ${t.description || 'sem nome'}`}
                onClick={() => onEdit && onEdit(t)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { onEdit(t); } }}
                style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 8px', cursor: 'pointer', borderRadius: 10, borderBottom: i<recent.length-1 ? '1px solid #1e293b' : 'none', transition: 'background 0.12s' }}
                onMouseEnter={e => e.currentTarget.style.background = '#1e293b'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{ width: 34, height: 34, borderRadius: 8, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {income ? <ArrowUpRight style={{ width: 15, height: 15, color: ic }} /> : <ArrowDownRight style={{ width: 15, height: 15, color: ic }} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.description || t.name || 'Transação'}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                    <Clock style={{ width: 9, height: 9, color: '#334155' }} />
                    <span style={{ fontSize: 10, color: '#475569' }}>
                      {t.date ? new Date(t.date).toLocaleDateString('pt-BR',{day:'2-digit',month:'short'}) : '—'}
                    </span>
                    {t.category && (
                      <span style={{ fontSize: 9, color: '#334155', background: '#1e293b', padding: '1px 5px', borderRadius: 4 }}>{t.category}</span>
                    )}
                  </div>
                </div>
                <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: ic, flexShrink: 0 }}>
                  {income ? '+' : '-'}{formatCurrency(amt)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});

// ─── DASHBOARD PRINCIPAL ──────────────────────────────────────
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

  const GC = { emerald: '#10b981', amber: '#f59e0b', red: '#ef4444' };
  const TC = { emerald: '#34d399', amber: '#fbbf24', red: '#f87171' };
  const BadgeStyle = {
    emerald: { bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.25)', text: '#34d399' },
    amber:   { bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)', text: '#fbbf24' },
    red:     { bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.25)',  text: '#f87171' },
  };
  const badge = BadgeStyle[color];
  const StatusIcon = status === 'CRÍTICO' ? AlertTriangle : status === 'ATENÇÃO' ? Activity : CheckCircle2;
  const incomeDelta = receitas > 0 ? ((receitas - despesas) / receitas * 100) : 0;

  const handleEditTx = useCallback((t) => {
    setTransactionToEdit(t);
    setIsFormOpen(true);
  }, [setTransactionToEdit, setIsFormOpen]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 96, maxWidth: 1800, margin: '0 auto', padding: '0 24px' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap');`}</style>

      {/* ── HERO ──────────────────────────────────────────── */}
      <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 20, padding: '26px 30px', display: 'flex', alignItems: 'stretch', gap: 28, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -100, right: -100, width: 400, height: 400, borderRadius: '50%', background: GC[color], opacity: 0.06, filter: 'blur(100px)', pointerEvents: 'none' }} />

        <HealthGauge score={score} color={color} />

        {/* Saldo + status */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 11 }}>
          <div>
            <span style={{ fontSize: 9, fontWeight: 700, color: '#475569', letterSpacing: '0.15em', textTransform: 'uppercase', display: 'block', marginBottom: 5 }}>Caixa Consolidado</span>
            <div style={{ display: 'flex', alignItems: 'end', gap: 14, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: MONO, fontSize: 44, fontWeight: 700, color: '#f1f5f9', letterSpacing: '-0.03em', lineHeight: 1 }}>
                {formatCurrency(saldo)}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 7, background: incomeDelta >= 0 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', marginBottom: 3 }}>
                {incomeDelta >= 0
                  ? <TrendingUp style={{ width: 12, height: 12, color: '#34d399' }} />
                  : <TrendingDown style={{ width: 12, height: 12, color: '#f87171' }} />}
                <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: incomeDelta >= 0 ? '#34d399' : '#f87171' }}>
                  {Math.abs(incomeDelta).toFixed(1)}% poupança
                </span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 7, background: badge.bg, border: `1px solid ${badge.border}` }}>
              <StatusIcon style={{ width: 12, height: 12, color: badge.text }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: badge.text, letterSpacing: '0.08em' }}>{status}</span>
            </div>
            {[
              { label: 'RISCO',       value: risk,                        vc: TC[color] },
              { label: 'DÍV/RECEITA', value: `${debtRatio.toFixed(0)}%`, vc: '#94a3b8' },
              { label: 'PATRIMÔNIO',  value: formatCurrency(patrimonio),  vc: '#94a3b8' },
            ].map(({ label, value, vc }) => (
              <div key={label} style={{ display: 'flex', flexDirection: 'column', padding: '4px 10px', background: '#080d16', border: '1px solid #1e293b', borderRadius: 7 }}>
                <span style={{ fontSize: 7, fontWeight: 700, color: '#334155', letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 1 }}>{label}</span>
                <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: vc }}>{value}</span>
              </div>
            ))}
          </div>

          <div style={{ padding: '9px 14px', background: '#080d16', borderLeft: `3px solid ${GC[color]}`, borderRadius: '0 8px 8px 0', maxWidth: 560 }}>
            <span style={{ fontSize: 8, fontWeight: 700, color: GC[color], letterSpacing: '0.14em', textTransform: 'uppercase', marginRight: 8 }}>DECISÃO TÁTICA</span>
            <span style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.6 }}>{rec}</span>
          </div>
        </div>

        {/* Coluna direita: sparkline + CTA + receitas/despesas */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11, alignItems: 'flex-end', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
            <span style={{ fontSize: 8, fontWeight: 700, color: '#334155', letterSpacing: '0.14em', textTransform: 'uppercase' }}>TENDÊNCIA 6M</span>
            <SparkLine transactions={transactions} />
          </div>
          <button
            onClick={() => setIsFormOpen(true)}
            aria-label="Nova transação"
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 20px', background: '#0891b2', border: 'none', borderRadius: 11, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.02em', transition: 'all 0.18s', boxShadow: '0 0 20px rgba(8,145,178,0.18)', whiteSpace: 'nowrap' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#06b6d4'; e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 28px rgba(6,182,212,0.3)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#0891b2'; e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 0 20px rgba(8,145,178,0.18)'; }}
          >
            <ArrowRightLeft style={{ width: 15, height: 15 }} />
            Nova Transação
          </button>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, width: '100%' }}>
            {[{ label: 'RECEITAS', value: formatCurrency(receitas), c: '#34d399' }, { label: 'DESPESAS', value: formatCurrency(despesas), c: '#f87171' }].map(m => (
              <div key={m.label} style={{ background: '#080d16', border: '1px solid #1e293b', borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 7, fontWeight: 700, color: '#334155', letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 4 }}>{m.label}</div>
                <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: m.c }}>{m.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── FORMULÁRIO ────────────────────────────────────── */}
      {isFormOpen && (
        <TransactionForm
          onSave={onSaveTransaction}
          editingTransaction={transactionToEdit}
          onCancelEdit={() => { setTransactionToEdit(null); setIsFormOpen(false); }}
        />
      )}

      {/* ── INTEL STRIP ───────────────────────────────────── */}
      <IntelStrip savingsRate={savingsRate} debtRatio={debtRatio} goalProgress={goalProgress} />

      {/* ── FORECAST + MÉTRICAS ───────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr lg:grid-cols-12 xl:grid-cols-12 gap-12' }}>
        <div style={{ gridColumn: 'span 8', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <Landmark style={{ width: 12, height: 12, color: '#22d3ee' }} />
            <span style={{ fontSize: 9, fontWeight: 700, color: '#475569', letterSpacing: '0.14em', textTransform: 'uppercase' }}>Projeção — 6 Meses</span>
          </div>
          <div style={{ flex: 1, background: '#0f172a', border: '1px solid #1e293b', borderRadius: 16, padding: '20px', minHeight: 400 }}>
            <ForecastWidget transactions={transactions} currentMonth={currentMonth} currentYear={currentYear} />
          </div>
        </div>
        <div style={{ gridColumn: 'span 4', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <Sparkles style={{ width: 12, height: 12, color: '#22d3ee' }} />
            <span style={{ fontSize: 9, fontWeight: 700, color: '#475569', letterSpacing: '0.14em', textTransform: 'uppercase' }}>Métricas Executivas</span>
          </div>
          <div style={{ flex: 1 }}>
            <DashboardCards balances={moduleBalances?.geral} loading={loading} />
          </div>
        </div>
      </div>

      {/* ── INDICADORES DE SAÚDE ──────────────────────────── */}
      <KpiRow savingsRate={savingsRate} debtRatio={debtRatio} goalProgress={goalProgress} patrimonyRisk={patrimonyRisk} />

      {/* ── BOTTOM ROW ────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
        <SpendingBars transactions={transactions} />
        <GoalsPanel receitas={receitas} despesas={despesas} monthlyGoal={monthlyGoal} />
        <TxFeed transactions={transactions} loading={loading} onEdit={handleEditTx} />
      </div>
    </div>
  );
}