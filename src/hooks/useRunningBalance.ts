import { useMemo } from 'react';
import type { Transaction } from '../shared/types/transaction';
import type { Centavos } from '../shared/types/money';

export type RunningBalanceResult = {
  /** txId → saldo acumulado em centavos até e incluindo aquela transação (ordem cronológica). */
  balances: Map<string, number>;
  /** true se a soma ultrapassou Number.MAX_SAFE_INTEGER — exibir aviso ao usuário. */
  overflowWarning: boolean;
};

function byDateAsc(a: Transaction, b: Transaction): number {
  if (a.date < b.date) return -1;
  if (a.date > b.date) return 1;
  return 0;
}

/**
 * Calcula o saldo acumulado por transação em ordem cronológica.
 * Usa apenas value_cents (inteiros) — proibido operar em float.
 * Memoizado: recalcula somente quando a referência de `transactions` muda.
 */
export function useRunningBalance(transactions: Transaction[]): RunningBalanceResult {
  return useMemo(() => {
    const sorted = [...transactions].sort(byDateAsc);
    const balances = new Map<string, number>();
    let running = 0;

    for (const tx of sorted) {
      const cents = tx.value_cents;
      if (typeof cents !== 'number' || !Number.isSafeInteger(cents)) continue;

      // Transfers move money between accounts — they don't change the net balance.
      if (tx.type === 'transferencia') { balances.set(tx.id, running); continue; }
      const delta = tx.type === 'entrada' ? (cents as Centavos) : -(cents as Centavos);
      const next  = running + delta;

      if (!Number.isSafeInteger(next)) {
        return { balances, overflowWarning: true };
      }

      running = next;
      balances.set(tx.id, running);
    }

    return { balances, overflowWarning: false };
  }, [transactions]);
}
