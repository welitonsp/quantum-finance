import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockCollection, mockQuery, mockOrderBy, mockDoc, mockOnSnapshot,
  mockAddDoc, mockUpdateDoc, mockDeleteDoc, mockServerTimestamp, mockLog,
} = vi.hoisted(() => ({
  mockCollection: vi.fn((_db: unknown, ...s: string[]) => ({ path: s.join('/') })),
  mockQuery:      vi.fn((ref: unknown) => ref),
  mockOrderBy:    vi.fn(() => ({ _orderBy: true })),
  mockDoc:        vi.fn((_db: unknown, ...s: string[]) => ({ id: s[s.length - 1], path: s.join('/') })),
  mockOnSnapshot: vi.fn(),
  mockAddDoc:     vi.fn().mockResolvedValue({ id: 'new' }),
  mockUpdateDoc:  vi.fn().mockResolvedValue(undefined),
  mockDeleteDoc:  vi.fn().mockResolvedValue(undefined),
  mockServerTimestamp: vi.fn(() => ({ _ts: true })),
  mockLog:        vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: mockCollection, query: mockQuery, orderBy: mockOrderBy, doc: mockDoc, onSnapshot: mockOnSnapshot,
  addDoc: mockAddDoc, updateDoc: mockUpdateDoc, deleteDoc: mockDeleteDoc, serverTimestamp: mockServerTimestamp,
}));

vi.mock('../shared/api/firebase/index', () => ({ db: { _isMock: true } }));
vi.mock('../shared/lib/firebaseErrorHandling', () => ({ logSanitizedFirebaseError: mockLog }));

import { useChallenges, computeChallengeProgress, type Challenge } from './useChallenges';

const challenge = (over: Partial<Challenge> = {}): Challenge => ({
  id: 'c1', category: 'Alimentação', targetPct: 20, baselineCents: 100000,
  deadlineDays: 20, startDate: '2026-06-01', endDate: '2026-06-21',
  xp: 0, status: 'active', schemaVersion: 1, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockAddDoc.mockResolvedValue({ id: 'new' });
  mockOnSnapshot.mockImplementation((_q: unknown, onNext: (s: unknown) => void) => {
    onNext({ docs: [] });
    return () => {};
  });
});

describe('computeChallengeProgress', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-06-15T12:00:00Z')); });
  afterEach(() => vi.useRealTimers());

  it('boa redução → progresso alto, XP máximo e sem próximo marco', () => {
    const r = computeChallengeProgress(challenge(), 30000); // gasto baixo vs baseline pro-rateada
    expect(r.progressPct).toBe(100);
    expect(r.xpEarned).toBe(500);
    expect(r.nextMilestone).toBeNull();
    expect(r.isExpired).toBe(false);
  });

  it('sem redução → progresso 0, XP 0 e próximo marco em 25%', () => {
    const r = computeChallengeProgress(challenge(), 200000); // gastou mais que baseline
    expect(r.progressPct).toBe(0);
    expect(r.xpEarned).toBe(0);
    expect(r.nextMilestone?.pct).toBe(25);
    expect(r.currentReductionPct).toBeLessThanOrEqual(0);
  });

  it('marca isExpired quando hoje passou do endDate', () => {
    vi.setSystemTime(new Date('2026-07-01T12:00:00Z'));
    const r = computeChallengeProgress(challenge(), 10000);
    expect(r.isExpired).toBe(true);
  });

  it('targetPct 0 e janela degenerada não geram NaN', () => {
    const r = computeChallengeProgress(challenge({ targetPct: 0, startDate: '2026-06-15', endDate: '2026-06-15' }), 0);
    expect(r.progressPct).toBe(0);
    expect(Number.isFinite(r.currentReductionPct)).toBe(true);
  });
});

describe('useChallenges — carregamento', () => {
  it('sem uid encerra loading e não assina', () => {
    const { result } = renderHook(() => useChallenges(''));
    expect(result.current.loading).toBe(false);
    expect(mockOnSnapshot).not.toHaveBeenCalled();
  });

  it('carrega desafios do snapshot', () => {
    mockOnSnapshot.mockImplementation((_q: unknown, onNext: (s: unknown) => void) => {
      onNext({ docs: [{ id: 'c1', data: () => ({ category: 'Lazer', status: 'active' }) }] });
      return () => {};
    });
    const { result } = renderHook(() => useChallenges('u1'));
    expect(result.current.loading).toBe(false);
    expect(result.current.challenges).toHaveLength(1);
    expect(result.current.challenges[0]!.id).toBe('c1');
  });

  it('erro no snapshot registra log sanitizado', () => {
    mockOnSnapshot.mockImplementation((_q: unknown, _n: unknown, onErr: (e: unknown) => void) => {
      onErr(new Error('x'));
      return () => {};
    });
    const { result } = renderHook(() => useChallenges('u1'));
    expect(result.current.loading).toBe(false);
    expect(mockLog).toHaveBeenCalledWith('challenges_load', expect.any(Error));
  });
});

describe('useChallenges — CRUD', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-06-15T12:00:00Z')); });
  afterEach(() => vi.useRealTimers());

  it('createChallenge calcula endDate e grava; no-op sem uid', async () => {
    const { result } = renderHook(() => useChallenges('u1'));
    await act(async () => {
      await result.current.createChallenge({ category: 'Alimentação', targetPct: 20, baselineCents: 100000, deadlineDays: 10 });
    });
    expect(mockAddDoc).toHaveBeenCalledTimes(1);
    const payload = mockAddDoc.mock.calls[0]![1] as Record<string, unknown>;
    expect(payload['startDate']).toBe('2026-06-15');
    expect(payload['endDate']).toBe('2026-06-25');
    expect(payload['status']).toBe('active');

    const { result: r0 } = renderHook(() => useChallenges(''));
    await act(async () => {
      await r0.current.createChallenge({ category: 'X', targetPct: 1, baselineCents: 1, deadlineDays: 1 });
    });
    expect(mockAddDoc).toHaveBeenCalledTimes(1); // segundo é no-op
  });

  it('updateXP e deleteChallenge chamam o firestore; no-op sem uid', async () => {
    const { result } = renderHook(() => useChallenges('u1'));
    await act(async () => {
      await result.current.updateXP('c1', 200, 'won');
      await result.current.deleteChallenge('c1');
    });
    expect(mockUpdateDoc).toHaveBeenCalledWith(expect.anything(), { xp: 200, status: 'won' });
    expect(mockDeleteDoc).toHaveBeenCalledTimes(1);

    const { result: r0 } = renderHook(() => useChallenges(''));
    await act(async () => {
      await r0.current.updateXP('c1', 1, 'lost');
      await r0.current.deleteChallenge('c1');
    });
    expect(mockUpdateDoc).toHaveBeenCalledTimes(1); // no-op sem uid
    expect(mockDeleteDoc).toHaveBeenCalledTimes(1);
  });
});
