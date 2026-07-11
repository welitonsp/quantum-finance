import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCollection, mockDoc, mockAddDoc, mockDeleteDoc, mockServerTimestamp } = vi.hoisted(() => ({
  mockCollection: vi.fn((_db: unknown, ...s: string[]) => ({ path: s.join('/'), _isCol: true })),
  mockDoc:        vi.fn((_db: unknown, ...s: string[]) => ({ id: s[s.length - 1], path: s.join('/') })),
  mockAddDoc:     vi.fn().mockResolvedValue({ id: 'rt-new' }),
  mockDeleteDoc:  vi.fn().mockResolvedValue(undefined),
  mockServerTimestamp: vi.fn(() => ({ _ts: true })),
}));

vi.mock('firebase/firestore', () => ({
  collection: mockCollection, doc: mockDoc, addDoc: mockAddDoc, deleteDoc: mockDeleteDoc,
  serverTimestamp: mockServerTimestamp,
}));

vi.mock('../api/firebase/index', () => ({ db: { _isMock: true } }));

import { recurringRepo } from './recurringRepo';

beforeEach(() => {
  vi.clearAllMocks();
  mockAddDoc.mockResolvedValue({ id: 'rt-new' });
  mockDeleteDoc.mockResolvedValue(undefined);
});

describe('recurringRepo.getRecurringCollection', () => {
  it('exige uid', () => {
    expect(() => recurringRepo.getRecurringCollection('')).toThrow(/UID obrigatório/);
  });

  it('retorna a coleção do usuário', () => {
    const col = recurringRepo.getRecurringCollection('u1') as unknown as { path: string };
    expect(col.path).toBe('users/u1/recurringTasks');
  });
});

describe('recurringRepo.addRecurringTask', () => {
  it('exige uid', async () => {
    await expect(recurringRepo.addRecurringTask('', {})).rejects.toThrow(/UID ausente/);
  });

  it('grava com schemaVersion e timestamps, retornando o id', async () => {
    const id = await recurringRepo.addRecurringTask('u1', { description: 'Aluguel' });
    expect(id).toBe('rt-new');
    const payload = mockAddDoc.mock.calls[0]![1] as Record<string, unknown>;
    expect(payload['description']).toBe('Aluguel');
    expect(payload['schemaVersion']).toBe(2);
    expect(payload['createdAt']).toEqual({ _ts: true });
  });
});

describe('recurringRepo.deleteRecurringTask', () => {
  it('exige id', async () => {
    await expect(recurringRepo.deleteRecurringTask('u1', '')).rejects.toThrow(/ID ausente/);
  });

  it('deleta o documento pelo id', async () => {
    await recurringRepo.deleteRecurringTask('u1', 'r1');
    expect(mockDeleteDoc).toHaveBeenCalledTimes(1);
    expect(mockDoc).toHaveBeenCalledWith(expect.anything(), 'users', 'u1', 'recurringTasks', 'r1');
  });
});
