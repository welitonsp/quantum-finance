import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { httpsCallable } from 'firebase/functions';

const {
  mockCollection, mockQuery, mockOrderBy, mockLimit, mockOnSnapshot, mockLog,
} = vi.hoisted(() => ({
  mockCollection: vi.fn((_db: unknown, ...s: string[]) => ({ path: s.join('/') })),
  mockQuery:      vi.fn((ref: unknown) => ref),
  mockOrderBy:    vi.fn(() => ({ _orderBy: true })),
  mockLimit:      vi.fn(() => ({ _limit: true })),
  mockOnSnapshot: vi.fn(),
  mockLog:        vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: mockCollection,
  query: mockQuery,
  orderBy: mockOrderBy,
  limit: mockLimit,
  onSnapshot: mockOnSnapshot,
}));

vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
vi.mock('../../../shared/api/firebase/index', () => ({ db: { _isMock: true }, functions: { _isMock: true } }));
vi.mock('../../../shared/lib/firebaseErrorHandling', () => ({ logSanitizedFirebaseError: mockLog }));

import { usePriceObservations } from './usePriceObservations';
import type { PriceObservationCreateInput } from '../../../shared/schemas/shoppingSchemas';
import type { Centavos } from '../../../shared/types/money';

const callMock = vi.fn();

function obs(over: Record<string, unknown>) {
  return {
    id: 'o1',
    data: () => ({
      productName: 'arroz 5kg',
      store: 'Mercado',
      unitPriceCents: 2500,
      quantity: '1',
      unit: 'un',
      observedAt: '2026-01-10',
      ...over,
    }),
  };
}

const validInput = (over: Partial<PriceObservationCreateInput> = {}): PriceObservationCreateInput => ({
  productName: 'Arroz 5kg',
  store: 'Mercado',
  unitPriceCents: 2500 as Centavos,
  quantity: '1',
  unit: 'un',
  observedAt: '2026-01-10',
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  (httpsCallable as unknown as ReturnType<typeof vi.fn>).mockReturnValue(callMock);
  mockOnSnapshot.mockImplementation((_q: unknown, onNext: (s: unknown) => void) => {
    onNext({ docs: [] });
    return () => {};
  });
});

describe('usePriceObservations — carregamento', () => {
  it('sem uid não assina', () => {
    const { result } = renderHook(() => usePriceObservations(''));
    expect(mockOnSnapshot).not.toHaveBeenCalled();
    expect(result.current.observations).toEqual([]);
  });

  it('mapeia snapshot para observations', async () => {
    mockOnSnapshot.mockImplementation((_q: unknown, onNext: (s: unknown) => void) => {
      onNext({ docs: [obs({})] });
      return () => {};
    });
    const { result } = renderHook(() => usePriceObservations('u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.observations).toHaveLength(1);
    expect(result.current.observations[0]!.id).toBe('o1');
    expect(result.current.observations[0]!.productName).toBe('arroz 5kg');
  });

  it('erro no snapshot registra log sanitizado', async () => {
    mockOnSnapshot.mockImplementation((_q: unknown, _n: unknown, onErr: (e: unknown) => void) => {
      onErr(new Error('perm'));
      return () => {};
    });
    const { result } = renderHook(() => usePriceObservations('u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockLog).toHaveBeenCalledWith('price_observations_load', expect.any(Error));
  });
});

describe('usePriceObservations — addObservation', () => {
  it('normaliza productName/store, chama callable e retorna id', async () => {
    callMock.mockResolvedValue({ data: { id: 'obs-new' } });
    const { result } = renderHook(() => usePriceObservations('u1'));
    let id = '';
    await act(async () => {
      id = await result.current.addObservation(validInput({
        productName: '  Arroz   Branco  5kg ',
        store: '  Mercado Central  ',
      }));
    });
    expect(id).toBe('obs-new');
    expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), 'recordPriceObservation');
    const sent = callMock.mock.calls[0]![0] as PriceObservationCreateInput;
    expect(sent.productName).toBe('arroz branco 5kg');
    expect(sent.store).toBe('Mercado Central');
  });
});

describe('usePriceObservations — forProduct', () => {
  it('casa por nome normalizado e corta em 20 resultados', async () => {
    const docs = Array.from({ length: 25 }, (_, i) => obs({ productName: 'arroz 5kg', unitPriceCents: 2500 + i }));
    docs.push(obs({ productName: 'feijão 1kg' }));
    mockOnSnapshot.mockImplementation((_q: unknown, onNext: (s: unknown) => void) => {
      onNext({ docs });
      return () => {};
    });
    const { result } = renderHook(() => usePriceObservations('u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const found = result.current.forProduct('  Arroz   5kg ');
    expect(found).toHaveLength(20);
    expect(found.every((o) => o.productName === 'arroz 5kg')).toBe(true);
    expect(result.current.forProduct('inexistente')).toHaveLength(0);
  });
});
