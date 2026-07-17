// src/lib/healthScore.ts
// Motor puro (zero I/O) do Score de Saúde Financeira — fonte canônica única.
// Extraído de FinancialHealthScore.tsx (computePillars) e ScoreHeroCard.tsx
// (computeScore/nextLevelHint), sem alterar thresholds nem textos.
//
// Percentuais e scores são number puro — aqui NÃO há dinheiro (centavos),
// então usar number é correto e esperado.
import type { ComponentType } from 'react';
import { TrendingUp, ShieldCheck, PiggyBank, CreditCard } from 'lucide-react';
import type { FinancialMetrics } from '../hooks/useFinancialMetrics';

export type PillarStatus = 'great' | 'ok' | 'warn' | 'critical';

export interface Pillar {
  label:    string;
  icon:     ComponentType<{ className?: string }>;
  value:    string;
  score:    number;
  maxScore: number;
  status:   PillarStatus;
  tip:      string;
  /** Dica de próximo nível — usada por nextLevelHint (pilar de menor score). */
  hint:     string;
}

export function computePillars(m: FinancialMetrics): Pillar[] {
  const savingsScore = m.taxaPoupanca >= 30 ? 25 : m.taxaPoupanca >= 20 ? 20 : m.taxaPoupanca >= 10 ? 12 : m.taxaPoupanca >= 5 ? 6 : 0;
  const savingsStatus: PillarStatus = m.taxaPoupanca >= 20 ? 'great' : m.taxaPoupanca >= 10 ? 'ok' : m.taxaPoupanca >= 5 ? 'warn' : 'critical';

  const debtScore = m.endividamento <= 10 ? 25 : m.endividamento <= 30 ? 20 : m.endividamento <= 50 ? 12 : m.endividamento <= 70 ? 6 : 0;
  const debtStatus: PillarStatus = m.endividamento <= 20 ? 'great' : m.endividamento <= 40 ? 'ok' : m.endividamento <= 60 ? 'warn' : 'critical';

  const reserveScore = m.reservaMeses >= 6 ? 25 : m.reservaMeses >= 3 ? 18 : m.reservaMeses >= 1 ? 8 : 0;
  const reserveStatus: PillarStatus = m.reservaMeses >= 6 ? 'great' : m.reservaMeses >= 3 ? 'ok' : m.reservaMeses >= 1 ? 'warn' : 'critical';

  const commitScore = m.comprometimento <= 20 ? 25 : m.comprometimento <= 35 ? 18 : m.comprometimento <= 50 ? 8 : 0;
  const commitStatus: PillarStatus = m.comprometimento <= 25 ? 'great' : m.comprometimento <= 40 ? 'ok' : m.comprometimento <= 55 ? 'warn' : 'critical';

  return [
    {
      label: 'Taxa de Poupança', icon: PiggyBank, value: m.receita > 0 ? `${m.taxaPoupanca.toFixed(1)}%` : '—',
      score: savingsScore, maxScore: 25, status: savingsStatus,
      tip: m.taxaPoupanca >= 20 ? 'Excelente! Manter acima de 20% é o padrão das finanças saudáveis.'
        : m.taxaPoupanca >= 10 ? 'Razoável, mas tente chegar a 20% para construir patrimônio mais rápido.'
        : 'Crítico: quase nada está sendo guardado. Revise suas despesas variáveis.',
      hint: 'Aumente a poupança para 20% da renda',
    },
    {
      label: 'Endividamento', icon: CreditCard, value: `${m.endividamento.toFixed(1)}%`,
      score: debtScore, maxScore: 25, status: debtStatus,
      tip: m.endividamento <= 20 ? 'Dívida controlada. Seu patrimônio está saudável.'
        : m.endividamento <= 40 ? 'Dívida moderada. Evite assumir novos compromissos.'
        : 'Endividamento alto. Priorize a quitação das dívidas antes de investir.',
      hint: 'Reduza dívidas abaixo de 30% do patrimônio',
    },
    {
      label: 'Reserva de Emergência', icon: ShieldCheck, value: m.despesa > 0 ? `${m.reservaMeses.toFixed(1)} meses` : '—',
      score: reserveScore, maxScore: 25, status: reserveStatus,
      tip: m.reservaMeses >= 6 ? 'Reserva sólida! Você tem 6+ meses de sobrevivência acumulados.'
        : m.reservaMeses >= 3 ? 'Reserva parcial. Meta: chegar a 6 meses de custo de vida.'
        : 'Reserva insuficiente. Em caso de imprevisto, você ficaria vulnerável.',
      hint: 'Construa 3 meses de reserva de emergência',
    },
    {
      label: 'Comprometimento de Renda', icon: TrendingUp, value: m.receita > 0 ? `${m.comprometimento.toFixed(1)}%` : '—',
      score: commitScore, maxScore: 25, status: commitStatus,
      tip: m.comprometimento <= 25 ? 'Ótimo! Menos de 1/4 da renda está presa em despesas fixas.'
        : m.comprometimento <= 40 ? 'Moderate. Considere revisar assinaturas e contratos fixos.'
        : 'Sua renda está muito comprometida. Cancele o que não é essencial.',
      hint: 'Reduza custos fixos abaixo de 35% da renda',
    },
  ];
}

/** Soma dos 4 pilares (0–100). Idêntico ao computeScore legado do ScoreHeroCard. */
export function computeHealthScore(m: FinancialMetrics): number {
  return computePillars(m).reduce((sum, p) => sum + p.score, 0);
}

/** Dica de próximo nível: hint do pilar de menor score. */
export function nextLevelHint(m: FinancialMetrics): string {
  const pillars = computePillars(m);
  const lowest = pillars.reduce((a, b) => (b.score < a.score ? b : a));
  return lowest.hint;
}
