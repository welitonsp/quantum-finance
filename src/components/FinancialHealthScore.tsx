// src/components/FinancialHealthScore.tsx
// Painel de decomposição do score de saúde financeira por pilar.
// Mostra contribuição individual de cada dimensão (0–25 pts cada) e recomendação por pilar.
import { motion } from 'framer-motion';
import { TrendingUp, ShieldCheck, PiggyBank, CreditCard, Star } from 'lucide-react';
import type { FinancialMetrics } from '../hooks/useFinancialMetrics';

interface Props {
  metrics: FinancialMetrics | null;
  loading: boolean;
}

interface Pillar {
  label:    string;
  icon:     React.ComponentType<{ className?: string }>;
  value:    string;
  score:    number;  // 0–25
  maxScore: number;  // always 25
  status:   'great' | 'ok' | 'warn' | 'critical';
  tip:      string;
}

function computePillars(m: FinancialMetrics): Pillar[] {
  // ── 1. Taxa de poupança (0-25) ─────────────────────────────────
  const savingsScore = m.taxaPoupanca >= 30 ? 25
    : m.taxaPoupanca >= 20 ? 20
    : m.taxaPoupanca >= 10 ? 12
    : m.taxaPoupanca >= 5  ? 6
    : 0;

  const savingsStatus: Pillar['status'] = m.taxaPoupanca >= 20 ? 'great'
    : m.taxaPoupanca >= 10 ? 'ok'
    : m.taxaPoupanca >= 5  ? 'warn'
    : 'critical';

  // ── 2. Endividamento (0-25; menor = melhor) ─────────────────────
  const debtScore = m.endividamento <= 10 ? 25
    : m.endividamento <= 30 ? 20
    : m.endividamento <= 50 ? 12
    : m.endividamento <= 70 ? 6
    : 0;

  const debtStatus: Pillar['status'] = m.endividamento <= 20 ? 'great'
    : m.endividamento <= 40 ? 'ok'
    : m.endividamento <= 60 ? 'warn'
    : 'critical';

  // ── 3. Reserva de emergência em meses (0-25) ────────────────────
  const reserveScore = m.reservaMeses >= 6 ? 25
    : m.reservaMeses >= 3 ? 18
    : m.reservaMeses >= 1 ? 8
    : 0;

  const reserveStatus: Pillar['status'] = m.reservaMeses >= 6 ? 'great'
    : m.reservaMeses >= 3 ? 'ok'
    : m.reservaMeses >= 1 ? 'warn'
    : 'critical';

  // ── 4. Comprometimento de renda (0-25; menor = melhor) ─────────
  const commitScore = m.comprometimento <= 20 ? 25
    : m.comprometimento <= 35 ? 18
    : m.comprometimento <= 50 ? 8
    : 0;

  const commitStatus: Pillar['status'] = m.comprometimento <= 25 ? 'great'
    : m.comprometimento <= 40 ? 'ok'
    : m.comprometimento <= 55 ? 'warn'
    : 'critical';

  return [
    {
      label:    'Taxa de Poupança',
      icon:     PiggyBank,
      value:    m.receita > 0 ? `${m.taxaPoupanca.toFixed(1)}%` : '—',
      score:    savingsScore,
      maxScore: 25,
      status:   savingsStatus,
      tip: m.taxaPoupanca >= 20
        ? 'Excelente! Manter acima de 20% é o padrão das finanças saudáveis.'
        : m.taxaPoupanca >= 10
        ? 'Razoável, mas tente chegar a 20% para construir patrimônio mais rápido.'
        : 'Crítico: quase nada está sendo guardado. Revise suas despesas variáveis.',
    },
    {
      label:    'Endividamento',
      icon:     CreditCard,
      value:    `${m.endividamento.toFixed(1)}%`,
      score:    debtScore,
      maxScore: 25,
      status:   debtStatus,
      tip: m.endividamento <= 20
        ? 'Dívida controlada. Seu patrimônio está saudável.'
        : m.endividamento <= 40
        ? 'Dívida moderada. Evite assumir novos compromissos.'
        : 'Endividamento alto. Priorize a quitação das dívidas antes de investir.',
    },
    {
      label:    'Reserva de Emergência',
      icon:     ShieldCheck,
      value:    m.despesa > 0 ? `${m.reservaMeses.toFixed(1)} meses` : '—',
      score:    reserveScore,
      maxScore: 25,
      status:   reserveStatus,
      tip: m.reservaMeses >= 6
        ? 'Reserva sólida! Você tem 6+ meses de sobrevivência acumulados.'
        : m.reservaMeses >= 3
        ? 'Reserva parcial. Meta: chegar a 6 meses de custo de vida.'
        : 'Reserva insuficiente. Em caso de imprevisto, você ficaria vulnerável.',
    },
    {
      label:    'Comprometimento de Renda',
      icon:     TrendingUp,
      value:    m.receita > 0 ? `${m.comprometimento.toFixed(1)}%` : '—',
      score:    commitScore,
      maxScore: 25,
      status:   commitStatus,
      tip: m.comprometimento <= 25
        ? 'Ótimo! Menos de 1/4 da renda está presa em despesas fixas.'
        : m.comprometimento <= 40
        ? 'Moderate. Considere revisar assinaturas e contratos fixos.'
        : 'Sua renda está muito comprometida. Cancele o que não é essencial.',
    },
  ];
}

const STATUS_COLORS = {
  great:    { bar: 'bg-emerald-500', text: 'text-emerald-400', badge: 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400' },
  ok:       { bar: 'bg-blue-500',    text: 'text-blue-400',    badge: 'bg-blue-500/10 border-blue-500/25 text-blue-400'       },
  warn:     { bar: 'bg-amber-500',   text: 'text-amber-400',   badge: 'bg-amber-500/10 border-amber-500/25 text-amber-400'    },
  critical: { bar: 'bg-red-500',     text: 'text-red-400',     badge: 'bg-red-500/10 border-red-500/25 text-red-400'         },
};

const STATUS_LABEL = { great: 'Ótimo', ok: 'Bom', warn: 'Atenção', critical: 'Crítico' };

export default function FinancialHealthScore({ metrics, loading }: Props) {
  if (loading || !metrics) return null;

  const pillars = computePillars(metrics);
  const totalScore = pillars.reduce((s, p) => s + p.score, 0);
  const overallStatus: Pillar['status'] = totalScore >= 85 ? 'great' : totalScore >= 60 ? 'ok' : totalScore >= 35 ? 'warn' : 'critical';
  const oc = STATUS_COLORS[overallStatus];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-quantum-card border border-quantum-border rounded-3xl p-6 shadow-lg"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-yellow-500/15 flex items-center justify-center border border-yellow-500/25">
            <Star className="w-5 h-5 text-yellow-400" />
          </div>
          <div>
            <h3 className="text-base font-black text-quantum-fg">Score de Saúde Financeira</h3>
            <p className="text-[11px] text-quantum-fgMuted">Decomposição por pilar · máximo 100 pts</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className={`text-3xl font-black font-mono ${oc.text}`}>{totalScore}</p>
            <p className="text-[10px] text-quantum-fgMuted">/ 100</p>
          </div>
          <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-lg border ${oc.badge}`}>
            {STATUS_LABEL[overallStatus]}
          </span>
        </div>
      </div>

      {/* Score bar */}
      <div className="h-2 rounded-full bg-quantum-bgSecondary mb-6 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${totalScore}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className={`h-full rounded-full ${oc.bar}`}
        />
      </div>

      {/* Pillars */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {pillars.map(p => {
          const c = STATUS_COLORS[p.status];
          const pct = (p.score / p.maxScore) * 100;
          return (
            <div key={p.label} className="bg-quantum-bgSecondary/60 border border-quantum-border rounded-2xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <p.icon className={`w-4 h-4 ${c.text}`} />
                  <span className="text-xs font-bold text-quantum-fg">{p.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-black uppercase px-1.5 py-0.5 rounded-md border ${c.badge}`}>
                    {STATUS_LABEL[p.status]}
                  </span>
                  <span className={`text-sm font-black font-mono ${c.text}`}>{p.score}<span className="text-quantum-fgMuted font-normal text-[10px]">/{p.maxScore}</span></span>
                </div>
              </div>

              <div className="h-1.5 rounded-full bg-quantum-card mb-2 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.7, ease: 'easeOut', delay: 0.1 }}
                  className={`h-full rounded-full ${c.bar}`}
                />
              </div>

              <div className="flex items-center justify-between">
                <p className="text-[10px] text-quantum-fgMuted leading-snug">{p.tip}</p>
                <span className={`text-[11px] font-bold ml-3 shrink-0 ${c.text}`}>{p.value}</span>
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
