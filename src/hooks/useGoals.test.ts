import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockCollection, mockQuery, mockOrderBy, mockOnSnapshot,
  mockAddDoc, mockUpdateDoc, mockDeleteDoc, mockDoc, mockServerTimestamp, mockLog,
} = vi.hoisted(() => ({
  mockCollection:    vi.fn((_db: unknown, ...s: string[]) => ({ path: s.join('/') })),
  mockQuery:         vi.fn((ref: unknown) => ref),
  mockOrderBy:       vi.fn(() => ({ _orderBy: true })),
  mockOnSnapshot:    vi.fn(),
  mockAddDoc:        vi.fn(),
  mockUpdateDoc:     vi.fn().mockResolvedValue(undefined),
  mockDeleteDoc:     vi.fn().mockResolvedValue(undefined),
  mockDoc:           vi.fn((_db: unknown, ...s: string[]) => ({ path: s.join('/'), id: s[s.length - 1] })),
  mockServerTimestamp: vi.fn(() => ({ _ts: true })),
  mockLog:           vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: mockCollection,
  query: mockQuery,
  orderBy: mockOrderBy,
  onSnapshot: mockOnSnapshot,
  addDoc: mockAddDoc,
  updateDoc: mockUpdateDoc,
  deleteDoc: mockDeleteDoc,
  doc: mockDoc,
  serverTimestamp: mockServerTimestamp,
}));

vi.mock('../shared/api/firebase/index', () => ({ db: { _isMock: true } }));
vi.mock('../shared/lib/firebaseErrorHandling', () => ({ logSanitizedFirebaseError: mockLog }));

import { enrichGoal, useGoals } from './useGoals';
import type { SavingsGoal } from '../shared/types/transaction';
import type { Centavos } from '../shared/types/money';

const goal = (over: Record<string, unknown>): SavingsGoal =>
  ({ id: 'g1', name: 'Meta', targetCents: 100000, currentCents: 0, ...over }) as SavingsGoal;

const TODAY = Date.UTC(2026, 0, 1); // 2026-01-01

beforeEach(() => {
  vi.clearAllMocks();
  mockUpdateDoc.mockResolvedValue(undefined);
  mockDeleteDoc.mockResolvedValue(undefined);
  // default: snapshot vazio
  mockOnSnapshot.mockImplementation((_q: unknown, onNext: (s: unknown) => void) => {
    onNext({ docs: [] });
    return () => {};
  });
});

describe('enrichGoal', () => {
  it('sem prazo → daysRemaining null e contribuição 0', () => {
    const r = enrichGoal(goal({ deadline: undefined }), TODAY);
    expect(r.daysRemaining).toBeNull();
    expect(r.monthlyContributionNeeded).toBe(0);
  });

  it('prazo futuro com déficit → contribuição mensal positiva', () => {
    const r = enrichGoal(goal({ targetCents: 100000, currentCents: 20000, deadline: '2026-03-02' }), TODAY);
    expect(r.daysRemaining).toBeGreaterThan(0);
    expect(r.monthlyContributionNeeded).toBeGreaterThan(0);
  });

  it('prazo expirado → daysRemaining negativo e contribuição 0', () => {
    const r = enrichGoal(goal({ targetCents: 100000, currentCents: 0, deadline: '2025-12-01' }), TODAY);
    expect(r.daysRemaining).toBeLessThan(0);
    expect(r.monthlyContributionNeeded).toBe(0);
  });

  it('meta já atingida → contribuição 0 mesmo com prazo futuro', () => {
    const r = enrichGoal(goal({ targetCents: 100000, currentCents: 120000, deadline: '2026-06-01' }), TODAY);
    expect(r.monthlyContributionNeeded).toBe(0);
  });
});

describe('useGoals — carregamento', () => {
  it('sem uid não assina e encerra loading', async () => {
    const { result } = renderHook(() => useGoals(''));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockOnSnapshot).not.toHaveBeenCalled();
    expect(result.current.goals).toEqual([]);
  });

  it('carrega e enriquece metas do snapshot', async () => {
    mockOnSnapshot.mockImplementation((_q: unknown, onNext: (s: unknown) => void) => {
      onNext({
        docs: [{ id: 'g1', data: () => ({ targetCents: 100000, currentCents: 50000, deadline: '2027-01-01' }) }],
      });
      return () => {};
    });
    const { result } = renderHook(() => useGoals('u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.goals).toHaveLength(1);
    expect(result.current.goals[0]!.id).toBe('g1');
    expect(result.current.goals[0]!).toHaveProperty('daysRemaining');
  });

  it('erro no snapshot registra log sanitizado', async () => {
    mockOnSnapshot.mockImplementation((_q: unknown, _n: unknown, onErr: (e: unknown) => void) => {
      onErr(new Error('perm denied'));
      return () => {};
    });
    const { result } = renderHook(() => useGoals('u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockLog).toHaveBeenCalledWith('goals_load', expect.any(Error));
  });
});

describe('useGoals — mutações', () => {
  it('addGoal cria documento e retorna o id', async () => {
    mockAddDoc.mockResolvedValue({ id: 'new-goal' });
    const { result } = renderHook(() => useGoals('u1'));
    let id = '';
    await act(async () => { id = await result.current.addGoal(goal({}) as never); });
    expect(id).toBe('new-goal');
    expect(mockAddDoc).toHaveBeenCalled();
  });

  it('addGoal sem uid lança erro', async () => {
    const { result } = renderHook(() => useGoals(''));
    await expect(result.current.addGoal(goal({}) as never)).rejects.toThrow(/autenticado/);
  });

  it('updateGoal / removeGoal / setProgress no-op sem id', async () => {
    const { result } = renderHook(() => useGoals('u1'));
    await act(async () => {
      await result.current.updateGoal('', {});
      await result.current.removeGoal('');
      await result.current.setProgress('', 100 as Centavos);
    });
    expect(mockUpdateDoc).not.toHaveBeenCalled();
    expect(mockDeleteDoc).not.toHaveBeenCalled();
  });

  it('updateGoal / removeGoal / setProgress chamam o firestore com id', async () => {
    const { result } = renderHook(() => useGoals('u1'));
    await act(async () => {
      await result.current.updateGoal('g1', { targetCents: 200000 as Centavos });
      await result.current.setProgress('g1', 5000 as Centavos);
      await result.current.removeGoal('g1');
    });
    expect(mockUpdateDoc).toHaveBeenCalledTimes(2);
    expect(mockDeleteDoc).toHaveBeenCalledTimes(1);
  });
});
