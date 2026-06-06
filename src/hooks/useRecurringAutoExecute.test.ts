import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecurringTask } from '../shared/types/transaction';
import type { Centavos } from '../shared/types/money';

const mockCreateManual = vi.fn().mockResolvedValue('tx-new');
const mockUpdateDoc    = vi.fn().mockResolvedValue(undefined);
const mockServerTs     = vi.fn().mockReturnValue({ _type: 'serverTimestamp' });
const mockDoc          = vi.fn().mockReturnValue({ id: 'task-doc-ref' });

vi.mock('firebase/firestore', () => ({
  doc:             mockDoc,
  updateDoc:       mockUpdateDoc,
  serverTimestamp: mockServerTs,
}));
vi.mock('../shared/api/firebase/index', () => ({ db: {} }));
vi.mock('../shared/services/FirestoreService', () => ({
  FirestoreService: { createManualTransactionWithHistory: mockCreateManual },
}));
vi.mock('../shared/lib/firebaseErrorHandling', () => ({
  logSanitizedFirebaseError: vi.fn(),
}));

const { useRecurringAutoExecute, pendingTasks, dueDateForTask } = await import('./useRecurringAutoExecute');

const cents = (n: number) => n as Centavos;

function task(overrides: Partial<RecurringTask>): RecurringTask {
  return {
    id:          'task-1',
    description: 'Aluguel',
    value_cents:  cents(150000),
    value:        1500,
    category:    'Moradia',
    dueDay:      1,
    active:      true,
    ...overrides,
  };
}

const TODAY      = '2026-06-06';
const YEARMONTH  = '2026-06';

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.setSystemTime(new Date(`${TODAY}T12:00:00.000Z`));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useRecurringAutoExecute', () => {
  it('nao executa enquanto loading=true', async () => {
    const tasks = [task({ dueDay: 1 })];
    renderHook(() => useRecurringAutoExecute('uid-1', tasks, true));
    await Promise.resolve();
    expect(mockCreateManual).not.toHaveBeenCalled();
  });

  it('nao executa sem uid', async () => {
    const tasks = [task({ dueDay: 1 })];
    renderHook(() => useRecurringAutoExecute('', tasks, false));
    await Promise.resolve();
    expect(mockCreateManual).not.toHaveBeenCalled();
  });

  it('nao executa com lista vazia', async () => {
    renderHook(() => useRecurringAutoExecute('uid-1', [], false));
    await Promise.resolve();
    expect(mockCreateManual).not.toHaveBeenCalled();
  });

  it('nao executa tarefa inativa', async () => {
    const tasks = [task({ dueDay: 1, active: false })];
    renderHook(() => useRecurringAutoExecute('uid-1', tasks, false));
    await Promise.resolve();
    expect(mockCreateManual).not.toHaveBeenCalled();
  });

  it('nao executa tarefa anual', async () => {
    const tasks = [task({ dueDay: 1, frequency: 'anual' })];
    renderHook(() => useRecurringAutoExecute('uid-1', tasks, false));
    await Promise.resolve();
    expect(mockCreateManual).not.toHaveBeenCalled();
  });

  it('nao executa tarefa ja executada no mes atual', async () => {
    const tasks = [task({ dueDay: 1, lastExecutedMonth: YEARMONTH })];
    renderHook(() => useRecurringAutoExecute('uid-1', tasks, false));
    await Promise.resolve();
    expect(mockCreateManual).not.toHaveBeenCalled();
  });

  it('nao executa tarefa cujo dueDay ainda nao chegou', async () => {
    // Hoje é dia 6 de junho; dueDay 20 ainda nao chegou
    const tasks = [task({ dueDay: 20 })];
    renderHook(() => useRecurringAutoExecute('uid-1', tasks, false));
    await Promise.resolve();
    expect(mockCreateManual).not.toHaveBeenCalled();
  });

  it('executa tarefa pendente cujo dueDay ja passou', async () => {
    const tasks = [task({ dueDay: 1 })]; // dia 1 <= dia 6 ✓
    const { unmount } = renderHook(() => useRecurringAutoExecute('uid-1', tasks, false));
    await vi.waitFor(() => expect(mockCreateManual).toHaveBeenCalledTimes(1));
    expect(mockCreateManual).toHaveBeenCalledWith(
      'uid-1',
      expect.objectContaining({
        description:  'Aluguel',
        value_cents:  cents(150000),
        category:     'Moradia',
        date:         `${YEARMONTH}-01`,
        source:       'manual',
      }),
    );
    unmount();
  });

  it('atualiza lastExecutedMonth no documento da tarefa apos execucao', async () => {
    const tasks = [task({ dueDay: 1 })];
    const { unmount } = renderHook(() => useRecurringAutoExecute('uid-1', tasks, false));
    await vi.waitFor(() => expect(mockUpdateDoc).toHaveBeenCalledTimes(1));
    expect(mockUpdateDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ lastExecutedMonth: YEARMONTH }),
    );
    unmount();
  });

  it('executa multiplas tarefas pendentes em sequencia', async () => {
    const tasks = [
      task({ id: 'a', dueDay: 1, description: 'A', value_cents: cents(1000) }),
      task({ id: 'b', dueDay: 2, description: 'B', value_cents: cents(2000) }),
    ];
    const { unmount } = renderHook(() => useRecurringAutoExecute('uid-1', tasks, false));
    await vi.waitFor(() => expect(mockCreateManual).toHaveBeenCalledTimes(2));
    unmount();
  });

  it('pula tarefa com value_cents zero e nao lanca excecao', async () => {
    const tasks = [task({ dueDay: 1, value_cents: cents(0), value: 0 })];
    renderHook(() => useRecurringAutoExecute('uid-1', tasks, false));
    await Promise.resolve();
    expect(mockCreateManual).not.toHaveBeenCalled();
  });

  it('executa apenas uma vez por montagem mesmo com re-renders', async () => {
    const tasks = [task({ dueDay: 1 })];
    const { rerender, unmount } = renderHook(
      ({ t }) => useRecurringAutoExecute('uid-1', t, false),
      { initialProps: { t: tasks } },
    );
    await vi.waitFor(() => expect(mockCreateManual).toHaveBeenCalledTimes(1));
    rerender({ t: [...tasks] }); // novo array, mesmos dados
    await Promise.resolve();
    expect(mockCreateManual).toHaveBeenCalledTimes(1); // sem nova chamada
    unmount();
  });

  it('usa dueDay truncado ao ultimo dia do mes em fevereiro', async () => {
    vi.setSystemTime(new Date('2026-02-28T12:00:00.000Z'));
    const tasks = [task({ dueDay: 31 })]; // fev nao tem dia 31
    const { unmount } = renderHook(() => useRecurringAutoExecute('uid-1', tasks, false));
    await vi.waitFor(() => expect(mockCreateManual).toHaveBeenCalledTimes(1));
    expect(mockCreateManual).toHaveBeenCalledWith(
      'uid-1',
      expect.objectContaining({ date: '2026-02-28' }),
    );
    unmount();
  });
});

describe('pendingTasks — tarefas anuais', () => {
  const YEARMONTH = '2026-06';
  const TODAY     = '2026-06-10';

  it('executa anual quando dueMonth bate com o mes atual e dueDay passou', () => {
    const t = [task({ frequency: 'anual', dueMonth: 6, dueDay: 5 })];
    expect(pendingTasks(t, YEARMONTH, TODAY)).toHaveLength(1);
  });

  it('nao executa anual quando dueMonth e diferente do mes atual', () => {
    const t = [task({ frequency: 'anual', dueMonth: 3, dueDay: 5 })];
    expect(pendingTasks(t, YEARMONTH, TODAY)).toHaveLength(0);
  });

  it('nao executa anual quando dueDay ainda nao chegou no mes certo', () => {
    const t = [task({ frequency: 'anual', dueMonth: 6, dueDay: 20 })];
    expect(pendingTasks(t, YEARMONTH, TODAY)).toHaveLength(0);
  });

  it('nao executa anual ja executado este ano (lastExecutedMonth comeca com ano atual)', () => {
    const t = [task({ frequency: 'anual', dueMonth: 6, dueDay: 5, lastExecutedMonth: '2026-06' })];
    expect(pendingTasks(t, YEARMONTH, TODAY)).toHaveLength(0);
  });

  it('executa anual se lastExecutedMonth e de ano anterior', () => {
    const t = [task({ frequency: 'anual', dueMonth: 6, dueDay: 5, lastExecutedMonth: '2025-06' })];
    expect(pendingTasks(t, YEARMONTH, TODAY)).toHaveLength(1);
  });

  it('anual sem dueMonth usa mes 1 como fallback', () => {
    // dueMonth ausente => fallback 1 (janeiro); mes atual e junho => nao executa
    const t = [task({ frequency: 'anual', dueDay: 5 })];
    expect(pendingTasks(t, YEARMONTH, TODAY)).toHaveLength(0);
  });

  it('anual sem dueMonth executa em janeiro', () => {
    const t = [task({ frequency: 'anual', dueDay: 5 })];
    expect(pendingTasks(t, '2026-01', '2026-01-10')).toHaveLength(1);
  });
});

describe('dueDateForTask', () => {
  it('retorna data correta para dia valido', () => {
    const t = task({ dueDay: 15 });
    expect(dueDateForTask(t, '2026-06')).toBe('2026-06-15');
  });

  it('trunca dueDay ao ultimo dia de fevereiro em ano nao bissexto', () => {
    const t = task({ dueDay: 31 });
    expect(dueDateForTask(t, '2026-02')).toBe('2026-02-28');
  });

  it('trunca dueDay ao ultimo dia de fevereiro em ano bissexto', () => {
    const t = task({ dueDay: 31 });
    expect(dueDateForTask(t, '2024-02')).toBe('2024-02-29');
  });

  it('trunca dueDay para abril (30 dias)', () => {
    const t = task({ dueDay: 31 });
    expect(dueDateForTask(t, '2026-04')).toBe('2026-04-30');
  });

  it('nao trunca dueDay valido em mes de 31 dias', () => {
    const t = task({ dueDay: 31 });
    expect(dueDateForTask(t, '2026-01')).toBe('2026-01-31');
  });
});
