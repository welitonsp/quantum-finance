import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecurringTask, Transaction } from '../shared/types/transaction';
import type { Centavos } from '../shared/types/money';
import { useSubscriptionAlerts } from './useSubscriptionAlerts';

// Datas fixas: "hoje" = 2026-06-15 → thisMonth=2026-06, prevMonth=2026-05, twoMonthsAgo=2026-04
const NOW = new Date('2026-06-15T12:00:00');

function makeTask(overrides: Partial<RecurringTask> = {}): RecurringTask {
  return {
    id:          'task-1',
    description: 'Netflix',
    value:       0,
    value_cents: 3990 as Centavos,
    category:    'Lazer',
    dueDay:      10,
    active:      true,
    frequency:   'mensal',
    ...overrides,
  };
}

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id:          `tx-${Math.random().toString(36).slice(2, 8)}`,
    description: 'Netflix',
    type:        'saida',
    category:    'Lazer',
    date:        '2026-06-10',
    value_cents: 3990 as Centavos,
    isRecurring: true,
    ...overrides,
  };
}

describe('useSubscriptionAlerts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('retorna lista vazia sem tasks ou transações', () => {
    const { result } = renderHook(() => useSubscriptionAlerts([], []));
    expect(result.current).toEqual([]);
  });

  // ─── price_increase ─────────────────────────────────────────────────────────

  it('alerta price_increase quando última execução excede 5% do esperado', () => {
    const tasks = [makeTask()];
    const txs = [
      makeTx({ date: '2026-05-10', value_cents: 3990 as Centavos }),
      makeTx({ date: '2026-06-10', value_cents: 4490 as Centavos }),
    ];
    const { result } = renderHook(() => useSubscriptionAlerts(tasks, txs));
    expect(result.current).toHaveLength(1);
    expect(result.current[0]).toMatchObject({
      taskId:        'task-1',
      type:          'price_increase',
      expectedCents: 3990,
      actualCents:   4490,
    });
    // (4490-3990)/3990 = 12.53...% → arredondado a 1 casa
    expect(result.current[0]?.increasePercent).toBeCloseTo(12.5, 1);
  });

  it('não alerta quando o aumento é menor ou igual a 5%', () => {
    const tasks = [makeTask()];
    const txs = [
      makeTx({ date: '2026-05-10', value_cents: 3990 as Centavos }),
      makeTx({ date: '2026-06-10', value_cents: 4100 as Centavos }), // +2.75%
    ];
    const { result } = renderHook(() => useSubscriptionAlerts(tasks, txs));
    expect(result.current).toEqual([]);
  });

  it('não verifica preço com apenas 1 execução materializada', () => {
    const tasks = [makeTask()];
    const txs = [makeTx({ date: '2026-06-10', value_cents: 9990 as Centavos })];
    const { result } = renderHook(() => useSubscriptionAlerts(tasks, txs));
    expect(result.current).toEqual([]);
  });

  it('não verifica preço quando value_cents esperado é 0/ausente', () => {
    const tasks = [makeTask({ value_cents: undefined })];
    const txs = [
      makeTx({ date: '2026-05-10', value_cents: 3990 as Centavos }),
      makeTx({ date: '2026-06-10', value_cents: 9990 as Centavos }),
    ];
    const { result } = renderHook(() => useSubscriptionAlerts(tasks, txs));
    expect(result.current).toEqual([]);
  });

  it('usa a execução mais recente por data (ordenação) na comparação', () => {
    const tasks = [makeTask()];
    const txs = [
      makeTx({ date: '2026-06-10', value_cents: 4490 as Centavos }), // mais recente, fora de ordem
      makeTx({ date: '2026-04-10', value_cents: 3990 as Centavos }),
      makeTx({ date: '2026-05-10', value_cents: 3990 as Centavos }),
    ];
    const { result } = renderHook(() => useSubscriptionAlerts(tasks, txs));
    expect(result.current[0]?.actualCents).toBe(4490);
  });

  // ─── missing_execution ──────────────────────────────────────────────────────

  it('alerta missing_execution quando 2+ meses sem execução', () => {
    const tasks = [makeTask({ lastExecutedMonth: '2026-03' })];
    const txs = [makeTx({ date: '2026-03-10' })]; // só execução antiga
    const { result } = renderHook(() => useSubscriptionAlerts(tasks, txs));
    expect(result.current).toHaveLength(1);
    expect(result.current[0]).toMatchObject({
      taskId:       'task-1',
      type:         'missing_execution',
      missedCycles: 2,
    });
  });

  it('não alerta missing_execution quando há execução no mês atual', () => {
    const tasks = [makeTask({ lastExecutedMonth: '2026-03' })];
    const txs = [makeTx({ date: '2026-06-10' })];
    const { result } = renderHook(() => useSubscriptionAlerts(tasks, txs));
    expect(result.current).toEqual([]);
  });

  it('não alerta missing_execution quando há execução no mês anterior', () => {
    const tasks = [makeTask({ lastExecutedMonth: '2026-03' })];
    const txs = [makeTx({ date: '2026-05-10' })];
    const { result } = renderHook(() => useSubscriptionAlerts(tasks, txs));
    expect(result.current).toEqual([]);
  });

  it('não alerta missing_execution quando lastExecutedMonth é recente', () => {
    const tasks = [makeTask({ lastExecutedMonth: '2026-05' })];
    const txs = [makeTx({ date: '2026-03-10' })];
    const { result } = renderHook(() => useSubscriptionAlerts(tasks, txs));
    expect(result.current).toEqual([]);
  });

  it('não alerta missing_execution sem lastExecutedMonth', () => {
    const tasks = [makeTask({ lastExecutedMonth: undefined })];
    const txs = [makeTx({ date: '2026-03-10' })];
    const { result } = renderHook(() => useSubscriptionAlerts(tasks, txs));
    expect(result.current).toEqual([]);
  });

  // ─── Filtros de task ────────────────────────────────────────────────────────

  it('ignora tasks inativas', () => {
    const tasks = [makeTask({ active: false, lastExecutedMonth: '2026-03' })];
    const txs = [
      makeTx({ date: '2026-02-10', value_cents: 3990 as Centavos }),
      makeTx({ date: '2026-03-10', value_cents: 9990 as Centavos }),
    ];
    const { result } = renderHook(() => useSubscriptionAlerts(tasks, txs));
    expect(result.current).toEqual([]);
  });

  it('ignora tasks anuais', () => {
    const tasks = [makeTask({ frequency: 'anual', lastExecutedMonth: '2026-03' })];
    const txs = [
      makeTx({ date: '2026-02-10', value_cents: 3990 as Centavos }),
      makeTx({ date: '2026-03-10', value_cents: 9990 as Centavos }),
    ];
    const { result } = renderHook(() => useSubscriptionAlerts(tasks, txs));
    expect(result.current).toEqual([]);
  });

  it('trata frequency ausente como mensal', () => {
    const tasks = [makeTask({ frequency: undefined })];
    const txs = [
      makeTx({ date: '2026-05-10', value_cents: 3990 as Centavos }),
      makeTx({ date: '2026-06-10', value_cents: 4490 as Centavos }),
    ];
    const { result } = renderHook(() => useSubscriptionAlerts(tasks, txs));
    expect(result.current).toHaveLength(1);
  });

  // ─── Filtros de transação ───────────────────────────────────────────────────

  it('ignora transações deletadas, não recorrentes e de outra descrição', () => {
    const tasks = [makeTask()];
    const txs = [
      makeTx({ date: '2026-05-10', value_cents: 3990 as Centavos }),
      makeTx({ date: '2026-06-09', value_cents: 9990 as Centavos, isDeleted: true }),
      makeTx({ date: '2026-06-10', value_cents: 9990 as Centavos, isRecurring: false }),
      makeTx({ date: '2026-06-11', value_cents: 9990 as Centavos, description: 'Spotify' }),
    ];
    // Resta só 1 matching válida → sem verificação de preço
    const { result } = renderHook(() => useSubscriptionAlerts(tasks, txs));
    expect(result.current).toEqual([]);
  });

  it('casa descrição com case e espaços diferentes', () => {
    const tasks = [makeTask({ description: '  NETFLIX ' })];
    const txs = [
      makeTx({ date: '2026-05-10', description: 'netflix', value_cents: 3990 as Centavos }),
      makeTx({ date: '2026-06-10', description: 'Netflix ', value_cents: 4490 as Centavos }),
    ];
    const { result } = renderHook(() => useSubscriptionAlerts(tasks, txs));
    expect(result.current).toHaveLength(1);
    expect(result.current[0]?.type).toBe('price_increase');
  });
});
