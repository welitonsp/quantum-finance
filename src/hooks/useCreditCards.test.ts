import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockAddDoc,
  mockCollection,
  mockDeleteDoc,
  mockDoc,
  mockOnSnapshot,
  mockQuery,
  mockServerTimestamp,
  mockUpdateDoc,
} = vi.hoisted(() => ({
  mockAddDoc:          vi.fn(),
  mockCollection:      vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') })),
  mockDeleteDoc:       vi.fn(),
  mockDoc:             vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') })),
  mockOnSnapshot:      vi.fn(),
  mockQuery:           vi.fn((ref: unknown) => ref),
  mockServerTimestamp: vi.fn(() => ({ _serverTimestamp: true })),
  mockUpdateDoc:       vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  addDoc:          mockAddDoc,
  collection:      mockCollection,
  deleteDoc:       mockDeleteDoc,
  doc:             mockDoc,
  onSnapshot:      mockOnSnapshot,
  query:           mockQuery,
  serverTimestamp: mockServerTimestamp,
  updateDoc:       mockUpdateDoc,
}));

vi.mock('../shared/api/firebase/index', () => ({
  db: { _isMock: true },
}));

import { useCreditCards } from './useCreditCards';

function cardInput(limit: string) {
  return {
    name:       'Nubank Platinum',
    limit,
    closingDay: 5,
    dueDay:     15,
    color:      '#00E68A',
    active:     true,
  };
}

function addPayload(): Record<string, unknown> {
  return mockAddDoc.mock.calls[0]?.[1] as Record<string, unknown>;
}

function updatePayload(): Record<string, unknown> {
  return mockUpdateDoc.mock.calls[0]?.[1] as Record<string, unknown>;
}

describe('useCreditCards - limite em centavos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAddDoc.mockResolvedValue({ id: 'card-created' });
    mockUpdateDoc.mockResolvedValue(undefined);
    mockDeleteDoc.mockResolvedValue(undefined);
    mockOnSnapshot.mockImplementation((_queryArg: unknown, onNext: (snap: { docs: never[] }) => void) => {
      onNext({ docs: [] });
      return vi.fn();
    });
  });

  it('cria cartão com limite 5000 persistindo 500000 centavos', async () => {
    const { result, unmount } = renderHook(() => useCreditCards('uid-1'));

    await act(async () => {
      await result.current.addCard(cardInput('5000'));
    });

    const payload = addPayload();
    expect(payload['limit']).toBe(500000);
    expect(Object.keys(payload).filter(key => key.toLowerCase().includes('limit'))).toEqual(['limit']);
    expect(payload['schemaVersion']).toBe(2);
    expect(mockAddDoc).toHaveBeenCalledTimes(1);

    unmount();
  });

  it('cria cartão com limite 1234.56 persistindo 123456 centavos', async () => {
    const { result, unmount } = renderHook(() => useCreditCards('uid-1'));

    await act(async () => {
      await result.current.addCard(cardInput('1234.56'));
    });

    expect(addPayload()['limit']).toBe(123456);

    unmount();
  });

  it('edita cartão já carregado em centavos sem multiplicar o limite por 100', async () => {
    mockOnSnapshot.mockImplementation((_queryArg: unknown, onNext: (snap: { docs: Array<{ id: string; data: () => Record<string, unknown> }> }) => void) => {
      onNext({
        docs: [{
          id:   'card-1',
          data: () => ({
            name:       'Visa',
            limit:      123456,
            closingDay: 5,
            dueDay:     15,
            color:      '#00E68A',
            active:     true,
          }),
        }],
      });
      return vi.fn();
    });
    const { result, unmount } = renderHook(() => useCreditCards('uid-1'));

    await waitFor(() => expect(result.current.cards).toHaveLength(1));
    expect(result.current.cards[0]?.limit).toBe(123456);
    expect(result.current.cards[0]?.metrics.limitVal).toBe(1234.56);
    expect(result.current.cards[0]?.metrics.disponivel).toBe(1234.56);

    await act(async () => {
      await result.current.updateCard('card-1', { limit: '1234.56' });
    });

    expect(updatePayload()['limit']).toBe(123456);
    expect(updatePayload()['limit']).not.toBe(12345600);
    expect(Object.keys(updatePayload()).filter(key => key.toLowerCase().includes('limit'))).toEqual(['limit']);

    unmount();
  });
});
