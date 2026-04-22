import { useMemo } from 'react';
import type { Transaction } from '../shared/types/transaction';
import { calculateForecast } from '../utils/forecastEngine';
import { generateHash } from '../utils/hashGenerator';
import type { ForecastResult } from '../utils/forecastEngine';

export type { ForecastResult, ForecastHealth, ForecastPoint } from '../utils/forecastEngine';

/**
 * Memoized forecast hook.
 *
 * Dependency strategy:
 *  - `txHash`  — stable content hash; avoids re-running when the array
 *                reference changes but content did not (prevents drift on
 *                parent re-renders).
 *  - `currentBalance` — scalar, always stable in memo comparison.
 *
 * NOTE: `transactions` is intentionally omitted from the second useMemo's
 * dependency array. `txHash` is a faithful proxy for its content.
 */
export function useForecast(
  transactions: Transaction[],
  currentBalance: number,
  days = 30,
): ForecastResult {
  // Content-stable hash — changes only when id/value/date actually change
  const txHash = useMemo(
    () => generateHash(transactions.map(t => t.id + String(t.value ?? 0) + (t.date ?? ''))),
    [transactions],
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(
    () => calculateForecast(transactions, currentBalance, days),
    [txHash, currentBalance, days],
  );
}
