import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockCollection, mockQuery, mockOrderBy, mockOnSnapshot,
  mockAddDoc, mockDeleteDoc, mockUpdateDoc, mockDoc, mockServerTimestamp,
} = vi.hoisted(() => ({
  mockCollection:    vi.fn((_db: unknown, ...s: string[]) => ({ path: s.join('/') })),
  mockQuery:         vi.fn((ref: unknown) => ref),
  mockOrderBy:       vi.fn(() => ({ _orderBy: true })),
  mockOnSnapshot:    vi.fn(),
  mockAddDoc:        vi.fn().mockResolvedValue({ id: 'new' }),
  mockDeleteDoc:     vi.fn().mockResolvedValue(undefined),
  mockUpdateDoc:     vi.fn().mockResolvedValue(undefined),
  mockDoc:           vi.fn((_db: unknown, ...s: string[]) => ({ path: s.join('/'), id: s[s.length - 1] })),
  mockServerTimestamp: vi.fn(() => ({ _ts: true })),
}));

vi.mock('firebase/firestore', () => ({
  collection: mockCollection, query: mockQuery, orderBy: mockOrderBy, onSnapshot: mockOnSnapshot,
  addDoc: mockAddDoc, deleteDoc: mockDeleteDoc, updateDoc: mockUpdateDoc, doc: mockDoc,
  serverTimestamp: mockServerTimestamp,
}));

vi.mock('../shared/api/firebase/index', () => ({ db: { _isMock: true } }));

import { useBudgets, prevMonthStr, currentMonthStr } from './useBudgets';
import type { Transaction } from '../shared/types/transaction';

const FIXED_NOW = new Date('2026-06-15T12:00:00Z');

let _id = 0;
function tx(over: Record<string, unknown>): Transaction {
  return {
    id: `tx-${++_id}`, description: 'Mov', type: 'saida', category: 'Alimentação',
    value_cents: 0, ...over,
  } as Transaction;
}

function budgetDoc(id: string, data: Record<string, unknown>) {
  return { id, data: () => data };
}

/** Configura o onSnapshot para emitir os budgets fornecidos. */
function withBudgets(docs: ReturnType<typeof budgetDoc>[]) {
  mockOnSnapshot.mockImplementation((_q: unknown, onNext: (s: unknown) => void) => {
    onNext({ docs });
    return () => {};
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  mockAddDoc.mockResolvedValue({ id: 'new' });
  mockUpdateDoc.mockResolvedValue(undefined);
  mockDeleteDoc.mockResolvedValue(undefined);
  withBudgets([]);
});
afterEach(() => vi.useRealTimers());

describe('helpers puros', () => {
  it('currentMonthStr usa a data corrente', () => {
    expect(currentMonthStr()).toBe('2026-06');
  });

  it('prevMonthStr calcula o mês anterior e trata virada de ano', () => {
    expect(prevMonthStr('2026-05')).toBe('2026-04');
    expect(prevMonthStr('2026-01')).toBe('2025-12');
  });

  it('prevMonthStr usa fallback de mês quando ausente', () => {
    // '2026' → sem componente de mês → fallback m=1 → mês anterior = dez/2025
    expect(prevMonthStr('2026')).toBe('2025-12');
  });
});

describe('useBudgets — carregamento e mapeamento', () => {
  it('sem uid encerra loading e não assina', async () => {
    const { result } = renderHook(() => useBudgets('', []));
    expect(result.current.loading).toBe(false);
    expect(mockOnSnapshot).not.toHaveBeenCalled();
  });

  it('mapeia targetAmount válido e trata createdAt Timestamp/number/ausente', async () => {
    withBudgets([
      budgetDoc('b1', { category: 'Alimentação', targetAmount: 100000, month: '2026-06', createdAt: 1_700_000 }),
      budgetDoc('b2', { category: 'Lazer', targetAmount: 1.5, month: '2026-06', createdAt: { toMillis: () => 42 } }),
      budgetDoc('b3', { category: 'Transporte', targetAmount: 50000 }), // sem month/createdAt → fallbacks
    ]);
    const { result } = renderHook(() => useBudgets('u1', []));
    expect(result.current.loading).toBe(false);
    const byId = Object.fromEntries(result.current.budgets.map(b => [b.id, b]));
    expect(byId['b1']!.targetAmountCents).toBe(100000);
    expect(byId['b1']!.targetAmount).toBe(1000);
    expect(byId['b2']!.targetAmountCents).toBe(0); // 1.5 não é inteiro seguro → 0
    expect(byId['b3']!.month).toBe('2026-06');      // fallback currentMonthStr
  });

  it('erro no snapshot encerra o loading mantendo estado', async () => {
    mockOnSnapshot.mockImplementation((_q: unknown, _n: unknown, onErr: () => void) => {
      onErr();
      return () => {};
    });
    const { result } = renderHook(() => useBudgets('u1', []));
    expect(result.current.loading).toBe(false);
  });
});

describe('useBudgets — insights', () => {
  it('soma despesas da categoria/mês, exclui pagamento de fatura e calcula vsLastMonth', async () => {
    withBudgets([budgetDoc('b1', { category: 'Alimentação', targetAmount: 100000, month: '2026-05', createdAt: 1 })]);
    const txs = [
      tx({ category: 'Alimentação', value_cents: 80000, date: '2026-05-10' }),
      // pagamento de fatura: excluído
      tx({ category: 'Alimentação', value_cents: 90000, date: '2026-05-11', paidInvoiceMonth: '2026-04' }),
      // outra categoria: excluída
      tx({ category: 'Lazer', value_cents: 99999, date: '2026-05-10' }),
      // mês anterior mesma categoria
      tx({ category: 'Alimentação', value_cents: 40000, date: '2026-04-05' }),
    ];
    const { result } = renderHook(() => useBudgets('u1', txs));
    expect(result.current.insights).toHaveLength(1);
    const ins = result.current.insights[0]!;
    expect(ins.spentCents).toBe(80000);
    expect(ins.status).toBe('warning'); // 80% (mês passado → projeção = gasto)
    expect(ins.prevMonthSpentCents).toBe(40000);
    expect(ins.vsLastMonthPct).toBe(100); // (80000-40000)/40000*100
  });

  it('target 0 e sem histórico: progress clampado e vsLastMonthPct null', async () => {
    withBudgets([budgetDoc('b1', { category: 'Alimentação', targetAmount: 0, month: '2026-05', createdAt: 1 })]);
    const txs = [tx({ category: 'Alimentação', value_cents: 5000, date: '2026-05-10' })];
    const { result } = renderHook(() => useBudgets('u1', txs));
    expect(result.current.insights).toHaveLength(1);
    const ins = result.current.insights[0]!;
    expect(ins.progress).toBe(1);          // clamp com safeTarget=1
    expect(ins.status).toBe('danger');
    expect(ins.vsLastMonthPct).toBeNull();
  });

  it('projeta o gasto até o fim do mês corrente', async () => {
    withBudgets([budgetDoc('b1', { category: 'Alimentação', targetAmount: 100000, month: '2026-06', createdAt: 1 })]);
    const txs = [tx({ category: 'Alimentação', value_cents: 10000, date: '2026-06-10' })];
    const { result } = renderHook(() => useBudgets('u1', txs));
    expect(result.current.insights).toHaveLength(1);
    // dia 15 de 30 → projeção ≈ 2x o gasto
    expect(result.current.insights[0]!.projectedSpendCents).toBeGreaterThan(10000);
  });

  it('ordena por severidade (danger antes de success)', async () => {
    withBudgets([
      budgetDoc('ok',  { category: 'Lazer', targetAmount: 100000, month: '2026-05', createdAt: 2 }),
      budgetDoc('bad', { category: 'Alimentação', targetAmount: 10000, month: '2026-05', createdAt: 1 }),
    ]);
    const txs = [
      tx({ category: 'Lazer', value_cents: 1000, date: '2026-05-10' }),        // 1% → success
      tx({ category: 'Alimentação', value_cents: 20000, date: '2026-05-10' }), // 200% → danger
    ];
    const { result } = renderHook(() => useBudgets('u1', txs));
    expect(result.current.insights).toHaveLength(2);
    expect(result.current.insights[0]!.status).toBe('danger');
    expect(result.current.insights[1]!.status).toBe('success');
  });
});

describe('useBudgets — CRUD', () => {
  it('addBudget converte targetAmount e grava; no-op sem uid', async () => {
    const { result } = renderHook(() => useBudgets('u1', []));
    await act(async () => {
      await result.current.addBudget({ category: 'Alimentação', targetAmount: 500, period: 'monthly', month: '2026-06' });
    });
    expect(mockAddDoc).toHaveBeenCalledTimes(1);

    const { result: r2 } = renderHook(() => useBudgets('', []));
    await act(async () => {
      await r2.current.addBudget({ category: 'X', targetAmount: 1, period: 'monthly', month: '2026-06' });
    });
    // ainda 1 (o segundo, sem uid, é no-op)
    expect(mockAddDoc).toHaveBeenCalledTimes(1);
  });

  it('updateBudget converte targetAmount só quando presente; removeBudget deleta', async () => {
    const { result } = renderHook(() => useBudgets('u1', []));
    await act(async () => {
      await result.current.updateBudget('b1', { targetAmount: 200 });
      await result.current.updateBudget('b1', { category: 'Nova' }); // sem targetAmount
      await result.current.removeBudget('b1');
    });
    expect(mockUpdateDoc).toHaveBeenCalledTimes(2);
    expect(mockDeleteDoc).toHaveBeenCalledTimes(1);
  });

  it('update/remove são no-op sem uid', async () => {
    const { result } = renderHook(() => useBudgets('', []));
    await act(async () => {
      await result.current.updateBudget('b1', { category: 'X' });
      await result.current.removeBudget('b1');
    });
    expect(mockUpdateDoc).not.toHaveBeenCalled();
    expect(mockDeleteDoc).not.toHaveBeenCalled();
  });
});

describe('useBudgets — guarda de value_cents', () => {
  it('ignora transações sem value_cents no cálculo de gasto e de mês anterior', async () => {
    withBudgets([budgetDoc('b1', { category: 'Alimentação', targetAmount: 100000, month: '2026-05', createdAt: 1 })]);
    const semValor = (date: string): Transaction => {
      const t = tx({ category: 'Alimentação', date });
      delete (t as { value_cents?: unknown }).value_cents;
      return t;
    };
    const { result } = renderHook(() => useBudgets('u1', [semValor('2026-05-10'), semValor('2026-04-10')]));
    expect(result.current.insights[0]!.spentCents).toBe(0);
    expect(result.current.insights[0]!.prevMonthSpentCents).toBe(0);
  });
});
