import { useMemo } from 'react';
import type { RecurringTask, Transaction } from '../shared/types/transaction';

export interface SubscriptionAlert {
  taskId: string;
  description: string;
  type: 'price_increase' | 'missing_execution';
  /** For price_increase: percentage increase (e.g. 8.5 means 8.5%). */
  increasePercent?: number;
  /** For price_increase: expected amount in cents. */
  expectedCents?: number;
  /** For price_increase: actual last amount in cents. */
  actualCents?: number;
  /** For missing_execution: number of cycles without execution. */
  missedCycles?: number;
}

/**
 * Analyzes recurring tasks against materialized transactions to detect:
 * 1. Price increases: last execution cost > expected × 1.05
 * 2. Missing executions: 2+ consecutive cycles without a matching transaction
 *
 * Only applies to 'mensal' frequency tasks.
 */
export function useSubscriptionAlerts(
  recurringTasks: RecurringTask[],
  transactions: Transaction[],
): SubscriptionAlert[] {
  return useMemo(() => {
    const alerts: SubscriptionAlert[] = [];

    const monthlyTasks = recurringTasks.filter(
      t => t.active !== false && (t.frequency === 'mensal' || !t.frequency),
    );

    for (const task of monthlyTasks) {
      const descLower = task.description.toLowerCase().trim();
      const expectedCents = task.value_cents ?? 0;

      // Find all materialized transactions matching this recurring task
      const matching = transactions
        .filter(tx => {
          if (!tx.date || tx.isDeleted || tx.deletedAt) return false;
          if (!tx.isRecurring) return false;
          return tx.description.toLowerCase().trim() === descLower;
        })
        .sort((a, b) => (a.date > b.date ? 1 : -1));

      if (matching.length === 0) continue;

      // Check last 2 executions for price increase
      if (matching.length >= 2 && expectedCents > 0) {
        const last = matching[matching.length - 1];
        const lastCents = last?.value_cents ?? 0;
        if (lastCents > expectedCents * 1.05) {
          const increasePercent =
            Math.round(((lastCents - expectedCents) / expectedCents) * 1000) / 10;
          alerts.push({
            taskId:          task.id,
            description:     task.description,
            type:            'price_increase',
            increasePercent,
            expectedCents,
            actualCents:     lastCents,
          });
        }
      }

      // Check for 2+ missed cycles: look at last 2 months
      if (task.lastExecutedMonth) {
        const now = new Date();
        const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const prevMonth = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;

        // Check if last executed month is older than 2 months ago
        const twoMonthsAgoDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
        const twoMonthsAgo = `${twoMonthsAgoDate.getFullYear()}-${String(twoMonthsAgoDate.getMonth() + 1).padStart(2, '0')}`;

        const hasThisMonth = matching.some(tx => tx.date?.startsWith(thisMonth));
        const hasPrevMonth = matching.some(tx => tx.date?.startsWith(prevMonth));

        if (!hasThisMonth && !hasPrevMonth && task.lastExecutedMonth <= twoMonthsAgo) {
          alerts.push({
            taskId:      task.id,
            description: task.description,
            type:        'missing_execution',
            missedCycles: 2,
          });
        }
      }
    }

    return alerts;
  }, [recurringTasks, transactions]);
}
