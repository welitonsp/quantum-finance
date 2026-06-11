import { useMemo } from 'react';
import type { Transaction, RecurringTask } from '../shared/types/transaction';
import { formatBRL } from '../shared/types/money';
import type { Centavos } from '../shared/types/money';
import { getTransactionCentavos } from '../utils/transactionUtils';
import type { TimeRange } from './useFinancialData';

export type InsightSeverity = 'critical' | 'warning' | 'info' | 'positive';

export interface CopilotInsight {
  id:       string;
  severity: InsightSeverity;
  emoji:    string;
  title:    string;
  body:     string;
  metric?:  string;
}

interface Params {
  uid:            string;
  transactions:   Transaction[];
  recurringTasks: RecurringTask[];
  balance:        number;
  timeRange:      TimeRange;
  loading:        boolean;
}

const SEC = { 'Assinaturas': true, 'assinaturas': true };

function txCents(tx: Transaction): number {
  return Math.abs(getTransactionCentavos(tx) ?? 0);
}

function isExpense(tx: Transaction): boolean {
  return tx.type === 'saida' || tx.type === 'despesa';
}
function isIncome(tx: Transaction): boolean {
  return tx.type === 'entrada' || tx.type === 'receita';
}

function groupByCat(txs: Transaction[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const tx of txs) {
    if (!isExpense(tx)) continue;
    const c = tx.category ?? 'Outros';
    map[c] = (map[c] ?? 0) + txCents(tx);
  }
  return map;
}

function isoWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const wn = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(wn).padStart(2, '0')}`;
}

export function computeCopilotInsights(
  transactions: Transaction[],
  recurringTasks: RecurringTask[],
  balance: number,
): CopilotInsight[] {
  const insights: CopilotInsight[] = [];
  const now = new Date();
  const curMonth = now.getMonth();
  const curYear  = now.getFullYear();
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(curYear, curMonth + 1, 0).getDate();

  const thisMonthTxs = transactions.filter(tx => {
    const d = new Date(tx.date ?? '');
    return d.getMonth() === curMonth && d.getFullYear() === curYear;
  });

  // ── 1. Burn-rate / reserva ──────────────────────────────────────────────────
  const totalExpenseCents = thisMonthTxs.filter(isExpense).reduce((s, tx) => s + txCents(tx), 0);
  if (totalExpenseCents > 0 && dayOfMonth > 3) {
    const dailyBurnCents = totalExpenseCents / dayOfMonth;
    const reservaCents   = balance * 100; // balance em reais → centavos
    const daysLeft       = reservaCents > 0 ? Math.floor(reservaCents / dailyBurnCents) : 0;
    const projectedEnd   = totalExpenseCents / dayOfMonth * daysInMonth;

    if (daysLeft > 0 && daysLeft <= 60) {
      insights.push({
        id:       'burn-rate',
        severity: daysLeft <= 15 ? 'critical' : daysLeft <= 30 ? 'warning' : 'info',
        emoji:    '🔥',
        title:    'Burn Rate da Reserva',
        body:     `Ao ritmo atual de ${formatBRL(Math.round(dailyBurnCents) as Centavos)}/dia, sua reserva esgota em ${daysLeft} dias.`,
        metric:   `${daysLeft}d restantes`,
      });
    } else if (projectedEnd > 0) {
      const incomeCents = thisMonthTxs.filter(isIncome).reduce((s, tx) => s + txCents(tx), 0);
      if (incomeCents > 0) {
        const pct = Math.round((projectedEnd / incomeCents) * 100);
        if (pct > 90) {
          insights.push({
            id:       'burn-rate',
            severity: pct >= 100 ? 'critical' : 'warning',
            emoji:    '🔥',
            title:    'Projeção de Gastos',
            body:     `Projeção: ${formatBRL(Math.round(projectedEnd) as Centavos)} até fim do mês — ${pct}% da receita.`,
            metric:   `${pct}% da receita`,
          });
        }
      }
    }
  }

  // ── 2. Spike de categoria (vs. média dos 3 meses anteriores) ───────────────
  const prevMonthsTxs = transactions.filter(tx => {
    const d = new Date(tx.date ?? '');
    const age = (curYear - d.getFullYear()) * 12 + (curMonth - d.getMonth());
    return age >= 1 && age <= 3;
  });

  if (prevMonthsTxs.length >= 5) {
    const prevByCat   = groupByCat(prevMonthsTxs);
    const thisByCat   = groupByCat(thisMonthTxs);
    const adjustedDay = Math.max(dayOfMonth, 1);

    let topCat   = '';
    let topDelta = 0;

    for (const [cat, thisCents] of Object.entries(thisByCat)) {
      const prev = prevByCat[cat] ?? 0;
      if (prev < 100) continue; // ignore insignificant categories
      const months = 3;
      const avgMonthly = prev / months;
      const thisProjected = (thisCents / adjustedDay) * daysInMonth;
      const delta = avgMonthly > 0 ? ((thisProjected - avgMonthly) / avgMonthly) * 100 : 0;

      if (delta > topDelta) {
        topDelta = delta;
        topCat   = cat;
      }
    }

    if (topCat && topDelta >= 20) {
      insights.push({
        id:       `spike-${topCat}`,
        severity: topDelta >= 60 ? 'warning' : 'info',
        emoji:    '📈',
        title:    `Pico em ${topCat}`,
        body:     `Projeção de gasto em ${topCat} este mês está ${Math.round(topDelta)}% acima da sua média.`,
        metric:   `+${Math.round(topDelta)}% vs média`,
      });
    }
  }

  // ── 3. Assinaturas ativas ───────────────────────────────────────────────────
  const subTasks = recurringTasks.filter(t =>
    SEC[t.category as keyof typeof SEC] &&
    (t as { active?: boolean }).active !== false,
  );
  if (subTasks.length >= 2) {
    const totalSubCents = subTasks.reduce((s, t) => {
      const cents = typeof t.value_cents === 'number' ? t.value_cents : 0;
      return s + cents;
    }, 0);
    insights.push({
      id:       'subscriptions',
      severity: subTasks.length >= 5 ? 'warning' : 'info',
      emoji:    '📦',
      title:    `${subTasks.length} Assinaturas Ativas`,
      body:     `Você tem ${subTasks.length} assinaturas recorrentes totalizando ${formatBRL(totalSubCents as Centavos)}/mês.`,
      metric:   `${formatBRL(totalSubCents as Centavos)}/mês`,
    });
  }

  // ── 4. Semana atual vs semana anterior ─────────────────────────────────────
  const curWeek  = isoWeek(now);
  const prevDate = new Date(now.getTime() - 7 * 86400000);
  const prevWeek = isoWeek(prevDate);

  const curWeekTxs  = transactions.filter(tx => isoWeek(new Date(tx.date ?? '')) === curWeek  && isExpense(tx));
  const prevWeekTxs = transactions.filter(tx => isoWeek(new Date(tx.date ?? '')) === prevWeek && isExpense(tx));

  const curWeekCents  = curWeekTxs.reduce((s, tx) => s + txCents(tx), 0);
  const prevWeekCents = prevWeekTxs.reduce((s, tx) => s + txCents(tx), 0);

  if (prevWeekCents > 0 && curWeekCents > 0) {
    const weekDelta = ((curWeekCents - prevWeekCents) / prevWeekCents) * 100;
    if (Math.abs(weekDelta) >= 20) {
      const isUp = weekDelta > 0;
      insights.push({
        id:       'week-delta',
        severity: isUp && weekDelta >= 40 ? 'warning' : isUp ? 'info' : 'positive',
        emoji:    isUp ? '📊' : '✅',
        title:    isUp ? 'Gastos Semanais Acima' : 'Ótima Semana!',
        body:     isUp
          ? `Esta semana você gastou ${Math.round(weekDelta)}% mais que na semana passada (${formatBRL(curWeekCents as Centavos)} vs ${formatBRL(prevWeekCents as Centavos)}).`
          : `Esta semana você gastou ${Math.round(Math.abs(weekDelta))}% menos que na semana passada — boa contenção!`,
        metric:   `${isUp ? '+' : '-'}${Math.round(Math.abs(weekDelta))}% semana`,
      });
    }
  }

  // ── 5. Taxa de poupança ─────────────────────────────────────────────────────
  const totalIncomeCents = thisMonthTxs.filter(isIncome).reduce((s, tx) => s + txCents(tx), 0);
  if (totalIncomeCents > 0 && totalExpenseCents > 0 && dayOfMonth >= 10) {
    const savedCents   = totalIncomeCents - totalExpenseCents;
    const savingsRate  = (savedCents / totalIncomeCents) * 100;
    if (savingsRate >= 20) {
      insights.push({
        id:       'savings-rate',
        severity: 'positive',
        emoji:    '🏆',
        title:    'Taxa de Poupança Excelente',
        body:     `Você está poupando ${savingsRate.toFixed(0)}% da sua renda este mês — acima da meta recomendada de 20%.`,
        metric:   `${savingsRate.toFixed(0)}% poupado`,
      });
    } else if (savingsRate < 0) {
      insights.push({
        id:       'savings-rate',
        severity: 'critical',
        emoji:    '🚨',
        title:    'Despesas Superam Receitas',
        body:     `Seus gastos já superam a renda em ${formatBRL(Math.abs(savedCents) as Centavos)} este mês.`,
        metric:   `−${formatBRL(Math.abs(savedCents) as Centavos)}`,
      });
    }
  }

  // Limit to 5 most relevant, prioritizing critical/warning
  const priority: Record<InsightSeverity, number> = { critical: 0, warning: 1, info: 2, positive: 3 };
  return insights
    .sort((a, b) => priority[a.severity] - priority[b.severity])
    .slice(0, 5);
}

export function useQuantumCopilot({
  uid,
  transactions,
  recurringTasks,
  balance,
  timeRange,
  loading,
}: Params): { insights: CopilotInsight[]; hasInsights: boolean } {
  const insights = useMemo(() => {
    if (!uid || loading || transactions.length === 0) return [];
    return computeCopilotInsights(transactions, recurringTasks, balance);
  }, [uid, loading, transactions, recurringTasks, balance, timeRange]); // timeRange triggers refresh

  return { insights, hasInsights: insights.length > 0 };
}
