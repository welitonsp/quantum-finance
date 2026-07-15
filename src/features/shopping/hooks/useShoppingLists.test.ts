import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockCollection, mockQuery, mockOrderBy, mockOnSnapshot,
  mockAddDoc, mockUpdateDoc, mockDeleteDoc, mockDoc, mockGetDoc,
  mockServerTimestamp, mockLog,
} = vi.hoisted(() => ({
  mockCollection:      vi.fn((_db: unknown, ...s: string[]) => ({ path: s.join('/') })),
  mockQuery:           vi.fn((ref: unknown) => ref),
  mockOrderBy:         vi.fn(() => ({ _orderBy: true })),
  mockOnSnapshot:      vi.fn(),
  mockAddDoc:          vi.fn(),
  mockUpdateDoc:       vi.fn().mockResolvedValue(undefined),
  mockDeleteDoc:       vi.fn().mockResolvedValue(undefined),
  mockDoc:             vi.fn((_db: unknown, ...s: string[]) => ({ path: s.join('/'), id: s[s.length - 1] })),
  mockGetDoc:          vi.fn(),
  mockServerTimestamp: vi.fn(() => ({ _ts: true })),
  mockLog:             vi.fn(),
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
  getDoc: mockGetDoc,
  serverTimestamp: mockServerTimestamp,
}));

vi.mock('../../../shared/api/firebase/index', () => ({ db: { _isMock: true } }));
vi.mock('../../../shared/lib/firebaseErrorHandling', () => ({ logSanitizedFirebaseError: mockLog }));

import { useShoppingLists } from './useShoppingLists';
import type { AddItemPayload, CheckItemPayload } from './useShoppingLists';
import type { ShoppingListItem } from '../../../shared/types/shopping';
import type { Centavos } from '../../../shared/types/money';

function item(over: Partial<ShoppingListItem> & { id: string }): ShoppingListItem {
  return {
    productName: 'Arroz',
    quantity: '2',
    unit: 'kg',
    estimatedUnitPriceCents: 500 as Centavos,
    estimatedTotalCents: 1000 as Centavos,
    checked: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...over,
  } as ShoppingListItem;
}

function getDocWith(data: unknown, exists = true) {
  return { exists: () => exists, data: () => data };
}

const lastUpdateArg = () =>
  mockUpdateDoc.mock.calls[mockUpdateDoc.mock.calls.length - 1]![1] as Record<string, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
  mockUpdateDoc.mockResolvedValue(undefined);
  mockDeleteDoc.mockResolvedValue(undefined);
  mockOnSnapshot.mockImplementation((_q: unknown, onNext: (s: unknown) => void) => {
    onNext({ docs: [] });
    return () => {};
  });
});

describe('useShoppingLists — carregamento', () => {
  it('sem uid não assina', () => {
    const { result } = renderHook(() => useShoppingLists(''));
    expect(mockOnSnapshot).not.toHaveBeenCalled();
    expect(result.current.lists).toEqual([]);
  });

  it('mapeia docs do snapshot para lists', async () => {
    mockOnSnapshot.mockImplementation((_q: unknown, onNext: (s: unknown) => void) => {
      onNext({ docs: [{ id: 'l1', data: () => ({ name: 'Feira', items: [] }) }] });
      return () => {};
    });
    const { result } = renderHook(() => useShoppingLists('u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.lists).toHaveLength(1);
    expect(result.current.lists[0]!.id).toBe('l1');
    expect(result.current.lists[0]!.name).toBe('Feira');
  });

  it('erro no snapshot registra log sanitizado e encerra loading', async () => {
    mockOnSnapshot.mockImplementation((_q: unknown, _n: unknown, onErr: (e: unknown) => void) => {
      onErr(new Error('perm denied'));
      return () => {};
    });
    const { result } = renderHook(() => useShoppingLists('u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockLog).toHaveBeenCalledWith('shopping_lists_load', expect.any(Error));
  });
});

describe('useShoppingLists — createList / deleteList', () => {
  it('createList valida schema, cria doc com uid/schemaVersion/status e retorna id', async () => {
    mockAddDoc.mockResolvedValue({ id: 'new-list' });
    const { result } = renderHook(() => useShoppingLists('u1'));
    let id = '';
    await act(async () => { id = await result.current.createList('  Feira  ', '2026-02-01'); });
    expect(id).toBe('new-list');
    const payload = mockAddDoc.mock.calls[0]![1] as Record<string, unknown>;
    expect(payload.uid).toBe('u1');
    expect(payload.schemaVersion).toBe(1);
    expect(payload.status).toBe('open');
    expect(payload.name).toBe('Feira');
    expect(payload.scheduledDate).toBe('2026-02-01');
  });

  it('deleteList chama deleteDoc no path da lista', async () => {
    const { result } = renderHook(() => useShoppingLists('u1'));
    await act(async () => { await result.current.deleteList('l1'); });
    expect(mockDeleteDoc).toHaveBeenCalledTimes(1);
    expect(mockDeleteDoc.mock.calls[0]![0]).toMatchObject({ path: 'users/u1/shoppingLists/l1' });
  });
});

describe('useShoppingLists — addItem', () => {
  const payload: AddItemPayload = {
    productName: 'Feijão',
    quantity: '3',
    unit: 'kg',
    estimatedUnitPriceCents: 800 as Centavos,
    estimatedTotalCents: 2500 as Centavos,
  };

  it('lança "Lista não encontrada" quando doc inexistente', async () => {
    mockGetDoc.mockResolvedValue(getDocWith(null, false));
    const { result } = renderHook(() => useShoppingLists('u1'));
    await expect(result.current.addItem('l1', payload)).rejects.toThrow('Lista não encontrada');
    expect(mockUpdateDoc).not.toHaveBeenCalled();
  });

  it('adiciona item e recomputa estimatedTotalCents (soma Decimal em centavos)', async () => {
    mockGetDoc.mockResolvedValue(getDocWith({ items: [item({ id: 'i1', estimatedTotalCents: 1000 as Centavos })] }));
    const { result } = renderHook(() => useShoppingLists('u1'));
    await act(async () => { await result.current.addItem('l1', payload); });
    const arg = lastUpdateArg();
    const items = arg.items as ShoppingListItem[];
    expect(items).toHaveLength(2);
    expect(items[1]!.productName).toBe('Feijão');
    expect(items[1]!.id).toBeTruthy();
    expect(arg.estimatedTotalCents).toBe(3500);
  });
});

describe('useShoppingLists — checkItem', () => {
  it('marca item com valores reais; lista soma só checked; status open → in_progress', async () => {
    mockGetDoc.mockResolvedValue(getDocWith({
      status: 'open',
      items: [
        item({ id: 'i1', checked: false }),
        item({ id: 'i2', checked: false }),
      ],
    }));
    const { result } = renderHook(() => useShoppingLists('u1'));
    const check: CheckItemPayload = {
      checked: true,
      actualUnitPriceCents: 500 as Centavos,
      actualTotalCents: 1000 as Centavos,
    };
    await act(async () => { await result.current.checkItem('l1', 'i1', check); });
    const arg = lastUpdateArg();
    const items = arg.items as ShoppingListItem[];
    const i1 = items.find((it) => it.id === 'i1')!;
    expect(i1.checked).toBe(true);
    expect(i1.checkedAt).toBeTruthy();
    expect(i1.actualTotalCents).toBe(1000);
    expect(arg.actualTotalCents).toBe(1000); // só i1 checked
    expect(arg.status).toBe('in_progress');
  });

  it('todos checked → status done', async () => {
    mockGetDoc.mockResolvedValue(getDocWith({
      status: 'in_progress',
      items: [
        item({ id: 'i1', checked: true, actualTotalCents: 1000 as Centavos, checkedAt: 'x' }),
        item({ id: 'i2', checked: false }),
      ],
    }));
    const { result } = renderHook(() => useShoppingLists('u1'));
    await act(async () => {
      await result.current.checkItem('l1', 'i2', { checked: true, actualTotalCents: 2000 as Centavos });
    });
    const arg = lastUpdateArg();
    expect(arg.status).toBe('done');
    expect(arg.actualTotalCents).toBe(3000);
  });

  it('desmarcar remove checkedAt/actualUnitPriceCents/actualTotalCents do item', async () => {
    mockGetDoc.mockResolvedValue(getDocWith({
      status: 'in_progress',
      items: [
        item({
          id: 'i1', checked: true, checkedAt: 'x',
          actualUnitPriceCents: 500 as Centavos, actualTotalCents: 1000 as Centavos,
        }),
      ],
    }));
    const { result } = renderHook(() => useShoppingLists('u1'));
    await act(async () => { await result.current.checkItem('l1', 'i1', { checked: false }); });
    const arg = lastUpdateArg();
    const i1 = (arg.items as ShoppingListItem[])[0]!;
    expect(i1.checked).toBe(false);
    expect(i1).not.toHaveProperty('checkedAt');
    expect(i1).not.toHaveProperty('actualUnitPriceCents');
    expect(i1).not.toHaveProperty('actualTotalCents');
    expect(arg.actualTotalCents).toBe(0);
    expect(arg.status).toBe('in_progress');
  });
});

describe('useShoppingLists — removeItem / finishList / linkTransaction', () => {
  it('removeItem filtra o item e recomputa estimatedTotalCents', async () => {
    mockGetDoc.mockResolvedValue(getDocWith({
      items: [
        item({ id: 'i1', estimatedTotalCents: 1000 as Centavos }),
        item({ id: 'i2', estimatedTotalCents: 2000 as Centavos }),
      ],
    }));
    const { result } = renderHook(() => useShoppingLists('u1'));
    await act(async () => { await result.current.removeItem('l1', 'i1'); });
    const arg = lastUpdateArg();
    const items = arg.items as ShoppingListItem[];
    expect(items).toHaveLength(1);
    expect(items[0]!.id).toBe('i2');
    expect(arg.estimatedTotalCents).toBe(2000);
  });

  it('finishList marca status done', async () => {
    const { result } = renderHook(() => useShoppingLists('u1'));
    await act(async () => { await result.current.finishList('l1'); });
    const arg = lastUpdateArg();
    expect(arg.status).toBe('done');
    expect(mockUpdateDoc.mock.calls[0]![0]).toMatchObject({ path: 'users/u1/shoppingLists/l1' });
  });

  it('linkTransaction grava linkedTransactionId', async () => {
    const { result } = renderHook(() => useShoppingLists('u1'));
    await act(async () => { await result.current.linkTransaction('l1', 'tx-9'); });
    const arg = lastUpdateArg();
    expect(arg.linkedTransactionId).toBe('tx-9');
  });
});
