// src/hooks/useRecurringAutoExecute.ts
// Scaffold client-side de materialização de recorrentes.
// Executa uma vez por sessão, após o carregamento inicial.
// Limitação Spark: sem Admin SDK; depende de Rules rigorosas para integridade.
import { useEffect, useRef } from 'react';
import { FirestoreService } from '../shared/services/FirestoreService';
import { logSanitizedFirebaseError } from '../shared/lib/firebaseErrorHandling';
import { updateRecurringWithHistory } from './useRecurring';
import type { RecurringTask } from '../shared/types/transaction';
import type { Centavos } from '../shared/types/money';

export function currentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function dueDateForTask(task: RecurringTask, yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number);
  const lastDay = new Date((y ?? 2000), (m ?? 1), 0).getDate();
  const day = Math.min(task.dueDay, lastDay);
  return `${yearMonth}-${String(day).padStart(2, '0')}`;
}

export function pendingTasks(tasks: RecurringTask[], yearMonth: string, today: string): RecurringTask[] {
  const [yearStr, monthStr] = yearMonth.split('-');
  const currentYear  = Number(yearStr);
  const currentMonth = Number(monthStr);

  return tasks.filter(t => {
    if (!t.active) return false;

    if (t.frequency === 'anual') {
      const targetMonth = t.dueMonth ?? 1;
      if (targetMonth !== currentMonth) return false;
      // Já executou neste ano se lastExecutedMonth começa com o ano atual
      if (t.lastExecutedMonth?.startsWith(yearStr ?? '')) return false;
      const due = dueDateForTask(t, yearMonth);
      return due <= today;
    }

    // Mensal
    if (t.lastExecutedMonth === yearMonth) return false;
    const due = dueDateForTask(t, yearMonth);
    return due <= today;
  });

  void currentYear; // usado implicitamente via yearStr
}

export function useRecurringAutoExecute(
  uid: string,
  tasks: RecurringTask[],
  loading: boolean,
): void {
  const executedRef = useRef(false);

  useEffect(() => {
    if (loading || !uid || executedRef.current || tasks.length === 0) return;
    executedRef.current = true;

    const yearMonth = currentYearMonth();
    const today     = todayISO();
    const pending   = pendingTasks(tasks, yearMonth, today);
    if (pending.length === 0) return;

    void (async () => {
      for (const task of pending) {
        try {
          const valueCents = task.value_cents ?? (Math.round((task.value ?? 0) * 100) as Centavos);
          if (!valueCents) continue;

          const txDate = dueDateForTask(task, yearMonth);
          await FirestoreService.createManualTransactionWithHistory(uid, {
            description: task.description,
            value_cents:  valueCents,
            type:         task.type ?? 'saida',
            category:     task.category,
            date:         txDate,
            source:       'manual',
          });

          // Use updateRecurringWithHistory to respect Modelo A (_lastOpId + history batch)
          await updateRecurringWithHistory(uid, task.id, { lastExecutedMonth: yearMonth });
        } catch (err) {
          logSanitizedFirebaseError('recurring_create', err);
        }
      }
    })();
  }, [uid, tasks, loading]);
}
