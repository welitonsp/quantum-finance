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
}

/**
 * Motor puro (só useMemo) do "Posso gastar hoje?": saldo disponível real =
 * saldo − compromissos fixos mensais ainda não registrados neste mês.
 *
 * A fatura aberta é exposta separadamente para UI, mas não é subtraída aqui: as compras
 * no cartão já entram como transações de despesa no saldo consolidado recebido.
 */
export function useSpendingPower({
  saldo,
  recurringTasks,
  cardInvoiceCents,
  currentYYYYMM,
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

    // Disponível pode ser positivo ou negativo (sem clamp).
    const available = (saldoCents - pendingCommitmentsCents) as Centavos;

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
      cardInvoiceCents,
      zone,
    };
  }, [saldo, recurringTasks, cardInvoiceCents, currentYYYYMM]);
}
