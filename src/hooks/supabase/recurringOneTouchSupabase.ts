// src/hooks/supabase/recurringOneTouchSupabase.ts
// "Ações de 1 toque": depois que o Agente lança a conta, marca a recorrente como
// paga no mês. No Supabase last_executed_month é do servidor, então a marca (e o
// is_recurring da transação criada, com origem 'ai') vai pela RPC
// mark_recurring_executed, que confere dono, transação e janela de mês.
import { getSupabase } from '../../shared/api/supabase/client';

export async function markRecurringExecutedSupabase(
  taskId: string,
  transactionId: string,
  month: string,
): Promise<void> {
  const { error } = await getSupabase().rpc('mark_recurring_executed', {
    p_task_id: taskId,
    p_transaction_id: transactionId,
    p_month: month,
  });
  if (error) {
    throw Object.assign(new Error('Não foi possível marcar a recorrente como paga.'), {
      code: error.code === 'P0002' ? 'not-found' : error.code === '22023' ? 'invalid-argument' : 'internal',
    });
  }
}
