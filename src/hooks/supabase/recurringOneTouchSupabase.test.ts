import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
vi.mock('../../shared/api/supabase/client', () => ({ getSupabase: () => ({ rpc }) }));

import { markRecurringExecutedSupabase } from './recurringOneTouchSupabase';

describe('markRecurringExecutedSupabase', () => {
  beforeEach(() => rpc.mockReset());

  it('chama a RPC com tarefa, transação e mês', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await markRecurringExecutedSupabase('t1', 'x1', '2026-12');
    expect(rpc).toHaveBeenCalledWith('mark_recurring_executed', {
      p_task_id: 't1', p_transaction_id: 'x1', p_month: '2026-12',
    });
  });

  it('traduz os erros do servidor sem ecoar a mensagem do banco', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'P0002', message: 'recorrente não encontrada' } });
    await expect(markRecurringExecutedSupabase('t1', 'x1', '2026-12')).rejects.toMatchObject({ code: 'not-found' });
    rpc.mockResolvedValue({ data: null, error: { code: '22023', message: 'mês inválido' } });
    await expect(markRecurringExecutedSupabase('t1', 'x1', '2030-01')).rejects.toMatchObject({ code: 'invalid-argument' });
    rpc.mockResolvedValue({ data: null, error: { code: 'XX000', message: 'boom' } });
    await expect(markRecurringExecutedSupabase('t1', 'x1', '2026-12')).rejects.toMatchObject({
      code: 'internal', message: 'Não foi possível marcar a recorrente como paga.',
    });
  });
});
