import { useMemo } from 'react';
import { toCentavos } from '../../shared/types/money';
import type { Centavos } from '../../shared/types/money';
import type {
  RecurringTask,
  Transaction,
  CreditCardWithMetrics,
} from '../../shared/types/transaction';
import type { Debt } from '../../hooks/useDebts';
import { calcMonthlyPaymentCents } from '../../hooks/useDebts';
import { projectCardInvoices } from '../../lib/cardProjection';
import { isIncome } from '../../utils/transactionUtils';

export interface GemeloDNA {
  fixedIncomeCents: Centavos;
  fixedExpensesCents: Centavos;
  debtPaymentsCents: Centavos;
  cardCommittedCents: Centavos;
  discretionaryCents: Centavos;
  netMonthlyCents: Centavos;
  sources: {
    recurringCount: number;
    activeDebtCount: number;
    cardCount: number;
  };
}

interface Props {
  recurringTasks: RecurringTask[];
  debts: Debt[];
  creditCards: CreditCardWithMetrics[];
  transactions: Transaction[];
  historicalIncomeCents: Centavos;
  historicalExpenseCents: Centavos;
}

export function useGemeloData({
  recurringTasks,
  debts,
  creditCards,
  transactions,
  historicalIncomeCents,
  historicalExpenseCents,
}: Props): GemeloDNA {
  return useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);

    const fixedIncomeCents = recurringTasks
      .filter(t => t.active && isIncome(t.type ?? '') && t.frequency !== 'anual')
      .reduce((sum, t) => sum + (t.value_cents ?? toCentavos(t.value)), 0) as Centavos;

    const fixedExpensesCents = recurringTasks
      .filter(t => t.active && !isIncome(t.type ?? '') && t.frequency !== 'anual')
      .reduce((sum, t) => sum + (t.value_cents ?? toCentavos(t.value)), 0) as Centavos;

    const activeDebts = debts.filter(d => d.active);
    const debtPaymentsCents = activeDebts.reduce((sum, d) => {
      const remaining = Math.max(0, d.installments - d.paidInstallments);
      if (remaining === 0) return sum;
      return sum + calcMonthlyPaymentCents(d.remainingCents, d.interestRate, remaining);
    }, 0) as Centavos;

    let cardCommittedCents = 0 as Centavos;
    for (const card of creditCards) {
      const limitCents = card.metrics?.limitCents;
      if (!card.id || !limitCents || !card.closingDay) continue;
      const proj = projectCardInvoices({
        cardId: card.id,
        closingDay: card.closingDay,
        limitCents,
        transactions,
        referenceDateISO: today,
      });
      if (proj.futureInvoices.length > 0) {
        const avgFuture = Math.round(proj.committedFutureCents / proj.futureInvoices.length);
        cardCommittedCents = (cardCommittedCents + avgFuture) as Centavos;
      }
    }

    const netMonthlyCents = (
      fixedIncomeCents - fixedExpensesCents - debtPaymentsCents - cardCommittedCents
    ) as Centavos;

    const discretionaryCents = Math.max(
      0,
      historicalExpenseCents - fixedExpensesCents - debtPaymentsCents - cardCommittedCents,
    ) as Centavos;

    return {
      fixedIncomeCents,
      fixedExpensesCents,
      debtPaymentsCents,
      cardCommittedCents,
      discretionaryCents,
      netMonthlyCents,
      sources: {
        recurringCount: recurringTasks.filter(t => t.active && t.frequency !== 'anual').length,
        activeDebtCount: activeDebts.length,
        cardCount: creditCards.length,
      },
    };
  }, [recurringTasks, debts, creditCards, transactions, historicalIncomeCents, historicalExpenseCents]);
}
