import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCollection, mockQuery, mockOnSnapshot } = vi.hoisted(() => ({
  mockCollection: vi.fn((_db: unknown, ...s: string[]) => ({ path: s.join('/') })),
  mockQuery: vi.fn((ref: unknown) => ref),
  mockOnSnapshot: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: mockCollection,
  query: mockQuery,
  onSnapshot: mockOnSnapshot,
}));

vi.mock('../shared/api/firebase/index', () => ({ db: { _isMock: true } }));

import { useCategoryRules } from './useCategoryRules';

/** Instala um snapshot bem-sucedido a partir de docs {id, data}. */
function withSnapshot(docs: Array<{ id: string; data: Record<string, unknown> }>) {
  mockOnSnapshot.mockImplementation((_ref: unknown, onNext: (s: unknown) => void) => {
    onNext({ docs: docs.map(d => ({ id: d.id, data: () => d.data })) });
    return () => {};
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  withSnapshot([]);
});

describe('useCategoryRules', () => {
  it('uid vazio não assina e encerra loading com rules vazio', async () => {
    const { result } = renderHook(() => useCategoryRules(''));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockOnSnapshot).not.toHaveBeenCalled();
    expect(result.current.rules).toEqual([]);
    expect(result.current.asUserRules).toEqual([]);
  });

  it('mapeia docs válidos e encerra loading', async () => {
    withSnapshot([
      { id: 'r1', data: { keyword: 'uber', category: 'Transporte' } },
      { id: 'r2', data: { keyword: 'ifood', category: 'Alimentação' } },
    ]);
    const { result } = renderHook(() => useCategoryRules('u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.rules).toEqual([
      { id: 'r1', keyword: 'uber', category: 'Transporte' },
      { id: 'r2', keyword: 'ifood', category: 'Alimentação' },
    ]);
  });

  it('normaliza keyword para minúsculas', async () => {
    withSnapshot([{ id: 'r1', data: { keyword: 'FOOD', category: 'Alimentação' } }]);
    const { result } = renderHook(() => useCategoryRules('u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.rules[0].keyword).toBe('food');
  });

  it('descarta docs com keyword ou category vazios', async () => {
    withSnapshot([
      { id: 'ok', data: { keyword: 'uber', category: 'Transporte' } },
      { id: 'noKeyword', data: { keyword: '', category: 'Transporte' } },
      { id: 'noCategory', data: { keyword: 'uber', category: '' } },
      { id: 'empty', data: {} },
    ]);
    const { result } = renderHook(() => useCategoryRules('u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.rules).toEqual([
      { id: 'ok', keyword: 'uber', category: 'Transporte' },
    ]);
  });

  it('asUserRules expõe { keywords: [keyword], category }', async () => {
    withSnapshot([{ id: 'r1', data: { keyword: 'uber', category: 'Transporte' } }]);
    const { result } = renderHook(() => useCategoryRules('u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.asUserRules).toEqual([
      { keywords: ['uber'], category: 'Transporte' },
    ]);
  });

  it('callback de erro encerra loading e mantém rules vazio', async () => {
    mockOnSnapshot.mockImplementation(
      (_ref: unknown, _onNext: unknown, onErr: (e: unknown) => void) => {
        onErr(new Error('perm denied'));
        return () => {};
      },
    );
    const { result } = renderHook(() => useCategoryRules('u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.rules).toEqual([]);
    expect(result.current.asUserRules).toEqual([]);
  });
});
