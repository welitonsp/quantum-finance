import type { Transaction } from '../shared/types/transaction';
import { absCentavos, addCentavos, type Centavos } from '../shared/types/money';
import { isExpense as checkExpense, isInvoicePayment } from './transactionUtils';

export const MONO = "'JetBrains Mono','Fira Code','SF Mono',ui-monospace,monospace";

export interface StatusResult {
  status: string;
  risk: string;
  color: string;
  rec: string;
  score: number;
  savingsRate: number;
  debtRatio: number;
  goalProgress: number;
  patrimonyRisk: number;
}

export const DEFAULT_SAVINGS_GOAL_PERCENT = 20;

export type SavingsGoalInput = { percent?: number } | number | null | undefined;

export function resolveSavingsGoalPercent(goal: SavingsGoalInput): number {
  const rawPercent = typeof goal === 'object' && goal !== null ? goal.percent : goal;

  if (typeof rawPercent !== 'number' || !Number.isFinite(rawPercent)) {
    return DEFAULT_SAVINGS_GOAL_PERCENT;
  }

  if (rawPercent <= 0 || rawPercent > 100) {
    return DEFAULT_SAVINGS_GOAL_PERCENT;
  }

  return rawPercent;
}

export const calcStatus = (
  saldo: number,
  receitas: number,
  despesas: number,
  patrimonio: number,
  dividas: number,
  meta: number
): StatusResult => {
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

export type BudgetAlertStatus = 'attention' | 'critical';

export interface DashboardBudgetAlertSource {
  id: string;
  category: string;
  month: string;
  targetAmountCents: Centavos | number;
}

export interface DashboardBudgetAlert {
  id: string;
  category: string;
  month: string;
  spentCents: Centavos;
  limitCents: Centavos;
  percentUsed: number;
  status: BudgetAlertStatus;
}

function normalizeCategory(category: string | undefined): string {
  return (category ?? '').trim().toLowerCase();
}

function safeCentavos(value: Centavos | number | undefined): Centavos {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    return 0 as Centavos;
  }

  return value as Centavos;
}

export function calculateBudgetAlerts(
  budgets: DashboardBudgetAlertSource[],
  transactions: Transaction[],
): DashboardBudgetAlert[] {
  return budgets
    .map(budget => {
      const limitCents = safeCentavos(budget.targetAmountCents);
      const budgetMonth = budget.month;
      const budgetCategory = normalizeCategory(budget.category);

      const spentCents = transactions.reduce((sum, tx) => {
        if (tx.isDeleted === true) return sum;
        if (!checkExpense(tx.type) || isInvoicePayment(tx)) return sum;
        if ((tx.date ?? '').slice(0, 7) !== budgetMonth) return sum;
        if (normalizeCategory(tx.category) !== budgetCategory) return sum;
        if (tx.value_cents === undefined) return sum;

        return addCentavos(sum, absCentavos(tx.value_cents));
      }, 0 as Centavos);

      const percentUsed = limitCents > 0 ? (spentCents / limitCents) * 100 : 0;
      const status: BudgetAlertStatus | null =
        percentUsed >= 100 ? 'critical' :
        percentUsed >= 80  ? 'attention' :
        null;

      if (status === null) return null;

      return {
        id: budget.id,
        category: budget.category,
        month: budget.month,
        spentCents,
        limitCents,
        percentUsed,
        status,
      };
    })
    .filter((alert): alert is DashboardBudgetAlert => alert !== null)
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'critical' ? -1 : 1;
      if (b.percentUsed !== a.percentUsed) return b.percentUsed - a.percentUsed;
      return a.category.localeCompare(b.category, 'pt-BR', { sensitivity: 'base' });
    });
}
