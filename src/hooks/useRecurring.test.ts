import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecurringTask } from '../shared/types/transaction';

const {
  mockBatchCommit,
  mockBatchDelete,
  mockBatchSet,
  mockBatchUpdate,
  mockDoc,
  mockGenerateSafeOperationId,
  mockGetDoc,
  mockGetRecurringCollection,
  mockLogAction,
  mockOnSnapshot,
  mockServerTimestamp,
  mockWriteBatch,
} = vi.hoisted(() => {
  let generatedTaskId = 0;

  const getPath = (value: unknown): string => {
    if (value && typeof value === 'object' && 'path' in value && typeof value.path === 'string') {
      return value.path;
    }
    return 'mock/path';
  };

  const mockBatchCommit = vi.fn().mockResolvedValue(undefined);
  const mockBatchDelete = vi.fn();
  const mockBatchSet = vi.fn();
  const mockBatchUpdate = vi.fn();

  return {
    mockBatchCommit,
    mockBatchDelete,
    mockBatchSet,
    mockBatchUpdate,
    mockDoc: vi.fn((parentOrDb: unknown, ...segments: string[]) => {
      if (segments.length === 0) {
        const id = `recurring-created-${++generatedTaskId}`;
        return { id, path: `${getPath(parentOrDb)}/${id}` };
      }

      const id = segments[segments.length - 1] ?? 'doc-id';
      return { id, path: segments.join('/') };
    }),
    mockGenerateSafeOperationId: vi.fn(() => 'op_safe_recurring_0001'),
    mockGetDoc: vi.fn(),
    mockGetRecurringCollection: vi.fn((_uid: string) => ({
      id:   'recurringTasks',
      path: 'users/uid-1/recurringTasks',
    })),
    mockLogAction: vi.fn().mockResolvedValue(undefined),
    mockOnSnapshot: vi.fn(),
    mockServerTimestamp: vi.fn(() => ({ _serverTimestamp: true })),
    mockWriteBatch: vi.fn(() => ({
      set:    mockBatchSet,
      update: mockBatchUpdate,
      delete: mockBatchDelete,
      commit: mockBatchCommit,
    })),
  };
});

vi.mock('firebase/firestore', () => ({
  doc:             mockDoc,
  getDoc:          mockGetDoc,
  onSnapshot:      mockOnSnapshot,
  serverTimestamp: mockServerTimestamp,
  writeBatch:      mockWriteBatch,
}));

vi.mock('../shared/api/firebase/index', () => ({
  db: { _isMock: true },
}));

vi.mock('../shared/lib/operationTrace', () => ({
  generateSafeOperationId: mockGenerateSafeOperationId,
}));

vi.mock('../shared/services/FirestoreService', () => ({
  FirestoreService: {
    getRecurringCollection: mockGetRecurringCollection,
  },
}));

vi.mock('../shared/services/AuditService', () => ({
  AuditService: {
    logAction: mockLogAction,
  },
}));

import {
  computeRecurringChangedFields,
  sanitizeRecurringForHistory,
  useRecurring,
} from './useRecurring';

function recurringInput(overrides: Partial<RecurringTask> = {}): Omit<RecurringTask, 'id'> {
  return {
    description: 'Aluguel',
    value:       1200.50,
    category:    'Moradia',
    dueDay:      1,
    active:      true,
    frequency:   'mensal',
    ...overrides,
  };
}

function existingRecurring(overrides: Record<string, unknown> = {}) {
  return {
    description:  'Aluguel',
    value:        120050,
    category:     'Moradia',
    dueDay:       1,
    active:       true,
    frequency:    'mensal',
    schemaVersion: 2,
    createdAt:    { seconds: 1 },
    updatedAt:    { seconds: 1 },
    ...overrides,
  };
}

function existingSnap(data: Record<string, unknown> | undefined) {
  return {
    exists: () => data !== undefined,
    data:   () => data ?? {},
  };
}

function lastSetPayload(index: number): Record<string, unknown> {
  return (mockBatchSet.mock.calls[index] as [unknown, Record<string, unknown>])[1];
}

function lastUpdatePayload(index = 0): Record<string, unknown> {
  return (mockBatchUpdate.mock.calls[index] as [unknown, Record<string, unknown>])[1];
}

describe('recurring history helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sanitiza snapshots sem uid/id/path/correlationId/_lastOpId/value legado', () => {
    expect(sanitizeRecurringForHistory({
      ...existingRecurring(),
      uid:           'uid-1',
      id:            'recurring-1',
      path:          'users/uid-1/recurringTasks/recurring-1',
      correlationId: 'op_safe_recurring_0001',
      _lastOpId:     'op_safe_recurring_0001',
    })).toEqual({
      description:   'Aluguel',
      value_cents:   120050,
      category:      'Moradia',
      dueDay:        1,
      active:        true,
      frequency:     'mensal',
      schemaVersion: 2,
      createdAt:     { seconds: 1 },
      updatedAt:     { seconds: 1 },
    });
  });

  it('calcula changedFields sem metadados técnicos', () => {
    expect(computeRecurringChangedFields(
      sanitizeRecurringForHistory(existingRecurring()),
      sanitizeRecurringForHistory({ ...existingRecurring({ category: 'Assinaturas' }), updatedAt: { _serverTimestamp: true } }),
    )).toEqual(['category']);
  });
});

describe('useRecurring — history Modelo A leve', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBatchCommit.mockResolvedValue(undefined);
    mockGenerateSafeOperationId.mockReturnValue('op_safe_recurring_0001');
    mockGetDoc.mockResolvedValue(existingSnap(existingRecurring()));
    mockOnSnapshot.mockImplementation((_queryArg: unknown, onNext: (snap: { docs: never[] }) => void) => {
      onNext({ docs: [] });
      return vi.fn();
    });
  });

  it('cria recorrente com task + history CREATE no mesmo batch', async () => {
    const { result, unmount } = renderHook(() => useRecurring('uid-1'));

    let createdId: string | undefined;
    await act(async () => {
      createdId = await result.current.addRecurring(recurringInput());
    });

    expect(createdId).toBe('recurring-created-1');
    expect(mockWriteBatch).toHaveBeenCalledTimes(1);
    expect(mockBatchSet).toHaveBeenCalledTimes(2);
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);

    const taskPayload = lastSetPayload(0);
    const historyPayload = lastSetPayload(1);

    expect(taskPayload).toEqual(expect.objectContaining({
      description:   'Aluguel',
      value:         120050,
      category:      'Moradia',
      dueDay:        1,
      active:        true,
      frequency:     'mensal',
      schemaVersion: 2,
      createdAt:     { _serverTimestamp: true },
      updatedAt:     { _serverTimestamp: true },
    }));
    expect(taskPayload).not.toHaveProperty('correlationId');
    expect(taskPayload).not.toHaveProperty('_lastOpId');

    expect(historyPayload).toEqual(expect.objectContaining({
      action:          'CREATE',
      recurringTaskId: 'recurring-created-1',
      origin:          'manual',
      correlationId:   'op_safe_recurring_0001',
      schemaVersion:   1,
      after: expect.objectContaining({
        description:   'Aluguel',
        value_cents:   120050,
        category:      'Moradia',
        dueDay:        1,
        active:        true,
        frequency:     'mensal',
        schemaVersion: 2,
      }),
      changedFields: ['description', 'value_cents', 'category', 'dueDay', 'active', 'frequency', 'schemaVersion'],
    }));
    expect(historyPayload['after']).not.toHaveProperty('value');
    expect(historyPayload['after']).not.toHaveProperty('correlationId');

    unmount();
  });

  it('atualiza recorrente com _lastOpId técnico e history UPDATE sanitizado', async () => {
    const { result, unmount } = renderHook(() => useRecurring('uid-1'));

    await act(async () => {
      await result.current.updateRecurring('recurring-1', {
        category: 'Assinaturas',
        uid:      'forged-uid',
        id:       'forged-id',
      } as Partial<RecurringTask>);
    });

    expect(mockGetDoc).toHaveBeenCalledTimes(1);
    expect(mockBatchUpdate).toHaveBeenCalledTimes(1);
    expect(mockBatchSet).toHaveBeenCalledTimes(1);
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);

    const updatePayload = lastUpdatePayload();
    expect(updatePayload).toEqual(expect.objectContaining({
      category:  'Assinaturas',
      updatedAt: { _serverTimestamp: true },
      _lastOpId: 'op_safe_recurring_0001',
    }));
    expect(updatePayload).not.toHaveProperty('correlationId');
    expect(updatePayload).not.toHaveProperty('uid');
    expect(updatePayload).not.toHaveProperty('id');

    const historyPayload = lastSetPayload(0);
    expect(historyPayload).toEqual(expect.objectContaining({
      action:          'UPDATE',
      recurringTaskId: 'recurring-1',
      origin:          'manual',
      correlationId:   'op_safe_recurring_0001',
      before:          expect.objectContaining({ category: 'Moradia', value_cents: 120050 }),
      after:           expect.objectContaining({ category: 'Assinaturas', value_cents: 120050 }),
      changedFields:   ['category'],
    }));
    expect(historyPayload['before']).not.toHaveProperty('value');
    expect(historyPayload['after']).not.toHaveProperty('_lastOpId');

    unmount();
  });

  it('remove recorrente com history DELETE sanitizado no mesmo batch', async () => {
    const { result, unmount } = renderHook(() => useRecurring('uid-1'));

    await act(async () => {
      await result.current.removeRecurring('recurring-1');
    });

    expect(mockBatchSet).toHaveBeenCalledTimes(1);
    expect(mockBatchDelete).toHaveBeenCalledTimes(1);
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);

    const historyPayload = lastSetPayload(0);
    expect(historyPayload).toEqual(expect.objectContaining({
      action:          'DELETE',
      recurringTaskId: 'recurring-1',
      origin:          'manual',
      correlationId:   'op_safe_recurring_0001',
      before:          expect.objectContaining({ description: 'Aluguel', value_cents: 120050 }),
      changedFields:   ['description', 'value_cents', 'category', 'dueDay', 'active', 'frequency', 'schemaVersion'],
    }));
    expect(historyPayload).not.toHaveProperty('after');
    expect(historyPayload['before']).not.toHaveProperty('id');
    expect(historyPayload['before']).not.toHaveProperty('path');

    unmount();
  });

  it('não escreve history quando o recorrente não existe no update/delete', async () => {
    mockGetDoc.mockResolvedValue(existingSnap(undefined));
    const { result, unmount } = renderHook(() => useRecurring('uid-1'));

    await act(async () => {
      await result.current.updateRecurring('recurring-missing', { category: 'Outros' });
      await result.current.removeRecurring('recurring-missing');
    });

    expect(mockBatchSet).not.toHaveBeenCalled();
    expect(mockBatchUpdate).not.toHaveBeenCalled();
    expect(mockBatchDelete).not.toHaveBeenCalled();
    expect(mockBatchCommit).not.toHaveBeenCalled();

    unmount();
  });

  it('erro no onSnapshot preenche state de error (linhas 73-75)', async () => {
    const firebaseErr = Object.assign(new Error('permission-denied'), { code: 'permission-denied' });
    mockOnSnapshot.mockImplementation((_q: unknown, _onNext: unknown, onError: (e: Error) => void) => {
      onError(firebaseErr);
      return vi.fn();
    });

    const { result, unmount } = renderHook(() => useRecurring('uid-1'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('permission-denied');
    expect(result.current.recurringTasks).toEqual([]);

    unmount();
  });
});
