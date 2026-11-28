import { useMemo } from 'react';
import { toCentavos } from '../shared/types/money';
import type { Centavos } from '../shared/types/money';
import type { RecurringTask } from '../shared/types/transaction';
import { isIncome } from '../utils/transactionUtils';

export type SpendingZone = 'safe' | 'caution' | 'danger';

export interface SpendingPower {
  availableCents: Centavos;
  saldoCents: Centavos;
  pendingCommitmentsCents: Centavos;
  cardInvoiceCents: Centavos;
  zone: SpendingZone;
}

interface Props {
  /** Saldo em float BRL (de moduleBalances). */
  saldo: number;
  recurringTasks: RecurringTask[];
  /** Fatura corrente do cartão — já em Centavos (totalFaturaCents de DashboardContent). */
  cardInvoiceCents: Centavos;
  /** Competência corrente no formato YYYY-MM (ex.: '2026-07'). */
  currentYYYYMM: string;
  /**
   * true quando `saldo` é o saldo de CAIXA (Supabase, cash_position): compra no
   * cartão só sai da conta quando a fatura é paga, então a fatura aberta ainda
   * vai sair e precisa ser descontada para chegar ao saldo livre. false no modo
   * legado, em que as compras no cartão já foram subtraídas do saldo.
   */
  subtractCardInvoice?: boolean;
}

/**
 * Motor puro (só useMemo) do "Posso gastar hoje?" — o saldo livre:
 * saldo − compromissos fixos mensais ainda não registrados neste mês
 * − fatura aberta dos cartões (só quando o saldo é de caixa; ver subtractCardInvoice).
 *
 * `cardInvoiceCents` devolvido é o valor efetivamente descontado (0 quando não é).
 */
export function useSpendingPower({
  saldo,
  recurringTasks,
  cardInvoiceCents,
  currentYYYYMM,
  subtractCardInvoice = false,
}: Props): SpendingPower {
  return useMemo(() => {
    const saldoCents = toCentavos(saldo);

    // Soma apenas saídas fixas mensais que ainda não foram registradas este mês.
    const pendingCommitmentsCents = recurringTasks
      .filter(t =>
        t.active &&
        !isIncome(t.type ?? '') &&
        t.frequency !== 'anual' &&
        t.lastExecutedMonth !== currentYYYYMM,
      )
      .reduce((sum, t) => sum + (t.value_cents ?? toCentavos(t.value)), 0) as Centavos;

    const invoiceCents = (
      subtractCardInvoice && Number.isSafeInteger(cardInvoiceCents) && cardInvoiceCents > 0
        ? cardInvoiceCents
        : 0
    ) as Centavos;

    // Disponível pode ser positivo ou negativo (sem clamp).
    const available = (saldoCents - pendingCommitmentsCents - invoiceCents) as Centavos;

    // Zona: safe = disponível ≥ 20% do saldo; caution = 0–20%; danger = ≤ 0.
    let zone: SpendingZone = 'safe';
    if (available <= 0) {
      zone = 'danger';
    } else if (saldoCents > 0 && available < saldoCents * 0.2) {
      zone = 'caution';
    }

    return {
      availableCents: available,
      saldoCents,
      pendingCommitmentsCents,
      cardInvoiceCents: invoiceCents,
      zone,
    };
  }, [saldo, recurringTasks, cardInvoiceCents, currentYYYYMM, subtractCardInvoice]);
}
