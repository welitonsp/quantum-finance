import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockCollection, mockQuery, mockOrderBy, mockOnSnapshot,
  mockWriteBatch, mockBatchSet, mockBatchUpdate, mockBatchDelete, mockBatchCommit,
  mockDoc, mockServerTimestamp, mockLog,
} = vi.hoisted(() => {
  let gen = 0;
  const mockBatchSet = vi.fn();
  const mockBatchUpdate = vi.fn();
  const mockBatchDelete = vi.fn();
  const mockBatchCommit = vi.fn().mockResolvedValue(undefined);
  return {
    mockCollection: vi.fn((_db: unknown, ...s: string[]) => ({ path: s.join('/'), _isCol: true })),
    mockQuery:      vi.fn((ref: unknown) => ref),
    mockOrderBy:    vi.fn(() => ({ _orderBy: true })),
    mockOnSnapshot: vi.fn(),
    mockWriteBatch: vi.fn(() => ({
      set: mockBatchSet, update: mockBatchUpdate, delete: mockBatchDelete, commit: mockBatchCommit,
    })),
    mockBatchSet, mockBatchUpdate, mockBatchDelete, mockBatchCommit,
    mockDoc: vi.fn((_first: unknown, ...s: string[]) => {
      if (s.length === 0) return { id: `gen-${++gen}` }; // doc(collectionRef)
      return { id: s[s.length - 1], path: s.join('/') };
    }),
    mockServerTimestamp: vi.fn(() => ({ _ts: true })),
    mockLog: vi.fn(),
  };
});

vi.mock('firebase/firestore', () => ({
  collection: mockCollection, query: mockQuery, orderBy: mockOrderBy, onSnapshot: mockOnSnapshot,
  writeBatch: mockWriteBatch, doc: mockDoc, serverTimestamp: mockServerTimestamp,
}));

vi.mock('../shared/api/firebase/index', () => ({ db: { _isMock: true } }));
vi.mock('../shared/lib/firebaseErrorHandling', () => ({ logSanitizedFirebaseError: mockLog }));

import {
  useDebts, calcMonthlyPaymentCents, nextDueDateStr, daysUntilDue,
} from './useDebts';
import type { Centavos } from '../shared/types/money';

function debtDoc(id: string, data: Record<string, unknown>) {
  return { id, data: () => data };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockBatchCommit.mockResolvedValue(undefined);
  mockOnSnapshot.mockImplementation((_q: unknown, onNext: (s: unknown) => void) => {
    onNext({ docs: [] });
    return () => {};
  });
});

describe('calcMonthlyPaymentCents', () => {
  it('retorna 0 quando não há parcelas restantes ou saldo', () => {
    expect(calcMonthlyPaymentCents(100000 as Centavos, 0.02, 0)).toBe(0);
    expect(calcMonthlyPaymentCents(0 as Centavos, 0.02, 12)).toBe(0);
  });

  it('taxa zero → divisão simples arredondada', () => {
    expect(calcMonthlyPaymentCents(100000 as Centavos, 0, 10)).toBe(10000);
  });

  it('taxa positiva → PMT maior que a divisão simples', () => {
    const pmt = calcMonthlyPaymentCents(100000 as Centavos, 0.02, 12);
    expect(pmt).toBeGreaterThan(Math.round(100000 / 12));
    expect(pmt).toBeLessThan(100000);
    expect(Number.isInteger(pmt)).toBe(true);
  });
});

describe('nextDueDateStr / daysUntilDue', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-06-15T12:00:00Z')); });
  afterEach(() => vi.useRealTimers());

  it('dia ainda não passou → vencimento neste mês', () => {
    expect(nextDueDateStr(20)).toBe('2026-06-20');
    expect(daysUntilDue(20)).toBe(5);
  });

  it('dia já passou → vencimento no mês seguinte', () => {
    expect(nextDueDateStr(10)).toBe('2026-07-10');
  });

  it('limita o dia alvo a 28 (meses curtos)', () => {
    expect(nextDueDateStr(31)).toBe('2026-06-28');
  });

  it('vira o ano em dezembro', () => {
    vi.setSystemTime(new Date('2026-12-20T12:00:00Z'));
    expect(nextDueDateStr(10)).toBe('2027-01-10');
  });
});

describe('useDebts — carregamento e mapeamento', () => {
  it('sem uid encerra loading e não assina', () => {
    const { result } = renderHook(() => useDebts(''));
    expect(result.current.loading).toBe(false);
    expect(mockOnSnapshot).not.toHaveBeenCalled();
  });

  it('mapeia documento completo e aplica defaults em campos ausentes', () => {
    mockOnSnapshot.mockImplementation((_q: unknown, onNext: (s: unknown) => void) => {
      onNext({
        docs: [
          debtDoc('d1', {
            uid: 'u1', name: 'Empréstimo', creditor: 'Banco', totalCents: 500000, remainingCents: 300000,
            interestRate: 0.02, installments: 24, paidInstallments: 6, dueDayOfMonth: 10,
            startDate: '2026-01-01', category: 'emprestimo', active: true,
            createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-06-01T00:00:00Z',
          }),
          // campos ausentes/errados → defaults; active omitido → true; createdAt Timestamp
          debtDoc('d2', { createdAt: { toDate: () => new Date('2026-02-02T00:00:00Z') } }),
        ],
      });
      return () => {};
    });
    const { result } = renderHook(() => useDebts('u1'));
    expect(result.current.loading).toBe(false);
    const byId = Object.fromEntries(result.current.debts.map(d => [d.id, d]));
    expect(byId['d1']!.remainingCents).toBe(300000);
    expect(byId['d1']!.category).toBe('emprestimo');
    expect(byId['d2']!.installments).toBe(1);      // default
    expect(byId['d2']!.category).toBe('outro');    // default
    expect(byId['d2']!.active).toBe(true);         // omitido → true
    expect(byId['d2']!.createdAt).toContain('2026-02-02'); // Timestamp.toDate → ISO
  });

  it('erro no snapshot registra log sanitizado', () => {
    mockOnSnapshot.mockImplementation((_q: unknown, _n: unknown, onErr: (e: unknown) => void) => {
      onErr(new Error('denied'));
      return () => {};
    });
    const { result } = renderHook(() => useDebts('u1'));
    expect(result.current.loading).toBe(false);
    expect(mockLog).toHaveBeenCalledWith('debt_load', expect.any(Error));
  });
});

describe('useDebts — CRUD (writeBatch)', () => {
  const dto = {
    name: 'X', creditor: 'C', totalCents: 100000 as Centavos, remainingCents: 100000 as Centavos,
    interestRate: 0.02, installments: 12, paidInstallments: 0, dueDayOfMonth: 5,
    startDate: '2026-06-01', category: 'emprestimo' as const, active: true,
  };

  it('addDebt grava via batch e retorna id gerado', async () => {
    const { result } = renderHook(() => useDebts('u1'));
    let id = '';
    await act(async () => { id = await result.current.addDebt(dto); });
    expect(id).toMatch(/^gen-/);
    expect(mockBatchSet).toHaveBeenCalledTimes(1);
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);
  });

  it('updateDebt e deleteDebt usam batch.update/delete + commit', async () => {
    const { result } = renderHook(() => useDebts('u1'));
    await act(async () => {
      await result.current.updateDebt('d1', { paidInstallments: 7 });
      await result.current.deleteDebt('d1');
    });
    expect(mockBatchUpdate).toHaveBeenCalledTimes(1);
    expect(mockBatchDelete).toHaveBeenCalledTimes(1);
    expect(mockBatchCommit).toHaveBeenCalledTimes(2);
  });
});
