import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockCollection,
  mockDoc,
  mockSetDoc,
  mockGetDocs,
  mockQuery,
  mockOrderBy,
  mockLimit,
  mockServerTimestamp,
  mockLog,
} = vi.hoisted(() => ({
  mockCollection: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') })),
  mockDoc: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join('/'), id: segments[segments.length - 1] })),
  mockSetDoc: vi.fn().mockResolvedValue(undefined),
  mockGetDocs: vi.fn().mockResolvedValue({ docs: [] }),
  mockQuery: vi.fn((ref: unknown) => ref),
  mockOrderBy: vi.fn(() => ({ _orderBy: true })),
  mockLimit: vi.fn(() => ({ _limit: true })),
  mockServerTimestamp: vi.fn(() => ({ _ts: true })),
  mockLog: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection:      mockCollection,
  doc:             mockDoc,
  setDoc:          mockSetDoc,
  getDocs:         mockGetDocs,
  query:           mockQuery,
  orderBy:         mockOrderBy,
  limit:           mockLimit,
  serverTimestamp: mockServerTimestamp,
}));

vi.mock('../shared/api/firebase/index', () => ({ db: { _isMock: true } }));

vi.mock('../shared/lib/firebaseErrorHandling', () => ({
  logSanitizedFirebaseError: mockLog,
}));

import { useScoreHistory } from './useScoreHistory';
import type { FinancialMetrics } from './useFinancialMetrics';

const metrics = (over: Partial<FinancialMetrics>): FinancialMetrics =>
  ({ taxaPoupanca: 0, endividamento: 0, reservaMeses: 0, comprometimento: 0, ...over }) as FinancialMetrics;

function docSnap(id: string, data: Record<string, unknown>) {
  return { id, data: () => data };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetDocs.mockResolvedValue({ docs: [] });
  mockSetDoc.mockResolvedValue(undefined);
});

describe('useScoreHistory — carregamento', () => {
  it('sem uid não consulta e encerra o loading', async () => {
    const { result } = renderHook(() => useScoreHistory('', null));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockGetDocs).not.toHaveBeenCalled();
    expect(result.current.history).toEqual([]);
  });

  it('carrega histórico e ordena do mais antigo para o mais recente', async () => {
    mockGetDocs.mockResolvedValue({
      docs: [
        docSnap('2026-03', { score: 80, taxaPoupanca: 25, endividamento: 10, reservaMeses: 6, comprometimento: 15 }),
        docSnap('2026-01', { score: 50 }), // campos ausentes → Number(undefined ?? 0) = 0
      ],
    });
    const { result } = renderHook(() => useScoreHistory('u1', null));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.history.map(h => h.month)).toEqual(['2026-01', '2026-03']);
    expect(result.current.history[0]!.score).toBe(50);
    expect(result.current.history[0]!.taxaPoupanca).toBe(0); // fallback
    expect(result.current.history[1]!.reservaMeses).toBe(6);
  });

  it('em erro de leitura registra log sanitizado e encerra o loading', async () => {
    mockGetDocs.mockRejectedValue(new Error('firestore down'));
    const { result } = renderHook(() => useScoreHistory('u1', null));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockLog).toHaveBeenCalledWith('score_history_load', expect.any(Error));
  });
});

describe('useScoreHistory — persistência', () => {
  it('não persiste quando metrics é null', async () => {
    const { result } = renderHook(() => useScoreHistory('u1', null));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it('persiste o score do mês corrente com merge', async () => {
    renderHook(() => useScoreHistory('u1', metrics({ taxaPoupanca: 30, endividamento: 5, reservaMeses: 6, comprometimento: 10 })));
    await waitFor(() => expect(mockSetDoc).toHaveBeenCalled());
    const [, payload, options] = mockSetDoc.mock.calls[0]!;
    expect(options).toEqual({ merge: true });
    expect(payload.score).toBe(100); // 25+25+25+25
    expect(payload.schemaVersion).toBe(1);
  });

  it('em erro de escrita registra log sanitizado', async () => {
    mockSetDoc.mockRejectedValue(new Error('write failed'));
    renderHook(() => useScoreHistory('u1', metrics({ taxaPoupanca: 10 })));
    await waitFor(() => expect(mockLog).toHaveBeenCalledWith('score_history_persist', expect.any(Error)));
  });
});

describe('useScoreHistory — computeScore (todos os ramos)', () => {
  const casos: Array<{ m: Partial<FinancialMetrics>; score: number }> = [
    { m: { taxaPoupanca: 30, endividamento: 5,  reservaMeses: 6, comprometimento: 10 }, score: 100 }, // 25+25+25+25
    { m: { taxaPoupanca: 20, endividamento: 30, reservaMeses: 3, comprometimento: 35 }, score: 76 },  // 20+20+18+18
    { m: { taxaPoupanca: 10, endividamento: 50, reservaMeses: 1, comprometimento: 50 }, score: 40 },  // 12+12+8+8
    { m: { taxaPoupanca: 5,  endividamento: 70, reservaMeses: 0, comprometimento: 100 }, score: 12 }, // 6+6+0+0
    { m: { taxaPoupanca: 0,  endividamento: 100, reservaMeses: 0, comprometimento: 0 }, score: 25 },  // 0+0+0+25
  ];

  it.each(casos)('metrics %j → score $score', async ({ m, score }) => {
    renderHook(() => useScoreHistory('u1', metrics(m)));
    await waitFor(() => expect(mockSetDoc).toHaveBeenCalled());
    expect(mockSetDoc.mock.calls[0]![1].score).toBe(score);
  });
});
