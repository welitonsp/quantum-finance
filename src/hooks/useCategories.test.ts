import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockCollection, mockQuery, mockDoc, mockOnSnapshot, mockAddDoc, mockUpdateDoc, mockServerTimestamp,
} = vi.hoisted(() => ({
  mockCollection: vi.fn((_db: unknown, ...s: string[]) => ({ path: s.join('/') })),
  mockQuery:      vi.fn((ref: unknown) => ref),
  mockDoc:        vi.fn((ref: unknown, id: string) => ({ id, _ref: ref })),
  mockOnSnapshot: vi.fn(),
  mockAddDoc:     vi.fn().mockResolvedValue({ id: 'new-cat' }),
  mockUpdateDoc:  vi.fn().mockResolvedValue(undefined),
  mockServerTimestamp: vi.fn(() => ({ _ts: true })),
}));

vi.mock('firebase/firestore', () => ({
  collection: mockCollection, query: mockQuery, doc: mockDoc, onSnapshot: mockOnSnapshot,
  addDoc: mockAddDoc, updateDoc: mockUpdateDoc, serverTimestamp: mockServerTimestamp,
}));

vi.mock('../shared/api/firebase/index', () => ({ db: { _isMock: true } }));

import { useCategories } from './useCategories';

function catDoc(id: string, data: Record<string, unknown>) {
  return { id, data: () => data };
}

function withUserCats(docs: ReturnType<typeof catDoc>[]) {
  mockOnSnapshot.mockImplementation((_q: unknown, onNext: (s: unknown) => void) => {
    onNext({ docs });
    return () => {};
  });
}

const pet = (over: Record<string, unknown> = {}) => ({
  name: 'Pets', normalizedName: 'pets', type: 'saida', color: '#111827',
  isDefault: false, isActive: true, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockAddDoc.mockResolvedValue({ id: 'new-cat' });
  mockUpdateDoc.mockResolvedValue(undefined);
  withUserCats([]);
});

describe('useCategories — carregamento e merge', () => {
  it('sem uid: só categorias de sistema, ordenadas e ativas', () => {
    const { result } = renderHook(() => useCategories(''));
    expect(result.current.loading).toBe(false);
    expect(mockOnSnapshot).not.toHaveBeenCalled();
    expect(result.current.categories.length).toBeGreaterThan(0);
    expect(result.current.categories.every(c => c.isActive)).toBe(true);
    // ordenação alfabética pt-BR
    const names = result.current.categories.map(c => c.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' })));
  });

  it('mescla categorias do usuário (ativa inclui, inativa exclui, inválida ignora)', () => {
    withUserCats([
      catDoc('u1', pet({ name: 'Pets', normalizedName: 'pets' })),
      catDoc('u2', pet({ name: 'Oculta', normalizedName: 'oculta', isActive: false })),
      catDoc('u3', { name: '' }), // inválida → schema falha → ignorada
    ]);
    const { result } = renderHook(() => useCategories('u1'));
    expect(result.current.loading).toBe(false);
    const norms = result.current.categories.map(c => c.normalizedName);
    expect(norms).toContain('pets');
    expect(norms).not.toContain('oculta');
  });

  it('erro no snapshot popula error e encerra loading', () => {
    mockOnSnapshot.mockImplementation((_q: unknown, _n: unknown, onErr: (e: unknown) => void) => {
      onErr(new Error('perm'));
      return () => {};
    });
    const { result } = renderHook(() => useCategories('u1'));
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeInstanceOf(Error);
  });
});

describe('useCategories — addCategory', () => {
  it('lança sem uid ou com nome vazio', async () => {
    const { result } = renderHook(() => useCategories(''));
    await expect(result.current.addCategory('Pets')).rejects.toThrow(/autenticado/);

    const { result: r2 } = renderHook(() => useCategories('u1'));
    await expect(r2.current.addCategory('   ')).rejects.toThrow(/nome/);
  });

  it('deduplica: nome de categoria existente retorna a existente sem gravar', async () => {
    const { result } = renderHook(() => useCategories('u1'));
    const created = await result.current.addCategory('Alimentação', 'saida');
    expect(created.normalizedName).toBe('alimentacao');
    expect(mockAddDoc).not.toHaveBeenCalled();
  });

  it('cria nova categoria e retorna com id gerado', async () => {
    const { result } = renderHook(() => useCategories('u1'));
    let created!: Awaited<ReturnType<typeof result.current.addCategory>>;
    await act(async () => { created = await result.current.addCategory('Pets', 'saida'); });
    expect(mockAddDoc).toHaveBeenCalledTimes(1);
    expect(created.id).toBe('new-cat');
    expect(created.name).toBe('Pets');
  });
});

describe('useCategories — updateCategory / deactivateCategory', () => {
  it('updateCategory rejeita default, inexistente e duplicata; aceita rename válido', async () => {
    withUserCats([
      catDoc('u-pets', pet({ name: 'Pets', normalizedName: 'pets' })),
      catDoc('u-viagem', pet({ name: 'Viagem', normalizedName: 'viagem' })),
    ]);
    const { result } = renderHook(() => useCategories('u1'));

    // default (id começa com "default-")
    await expect(result.current.updateCategory('default-alimentacao', { name: 'X' })).rejects.toThrow(/padrão/);
    // inexistente
    await expect(result.current.updateCategory('nope', { name: 'X' })).rejects.toThrow(/não encontrada/);
    // duplicata (renomear Pets para "Viagem")
    await expect(result.current.updateCategory('u-pets', { name: 'Viagem' })).rejects.toThrow(/já existe/);

    // rename válido
    await act(async () => { await result.current.updateCategory('u-pets', { name: 'Animais', color: '#abc123' }); });
    expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
  });

  it('updateCategory rejeita nome vazio e persiste type/icon/isActive', async () => {
    withUserCats([catDoc('u-pets', pet())]);
    const { result } = renderHook(() => useCategories('u1'));

    await expect(result.current.updateCategory('u-pets', { name: '   ' })).rejects.toThrow(/nome/);

    await act(async () => {
      await result.current.updateCategory('u-pets', { type: 'entrada', icon: '🐾', isActive: true });
    });
    expect(mockUpdateDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'entrada', icon: '🐾', isActive: true }),
    );
  });

  it('mutações sem uid lançam; deactivate inexistente lança', async () => {
    const { result: r0 } = renderHook(() => useCategories(''));
    await expect(r0.current.updateCategory('x', {})).rejects.toThrow(/autenticado/);
    await expect(r0.current.deactivateCategory('x')).rejects.toThrow(/autenticado/);

    const { result } = renderHook(() => useCategories('u1'));
    await expect(result.current.deactivateCategory('nope')).rejects.toThrow(/não encontrada/);
  });

  it('deactivateCategory rejeita default e desativa categoria do usuário', async () => {
    withUserCats([catDoc('u-pets', pet())]);
    const { result } = renderHook(() => useCategories('u1'));

    await expect(result.current.deactivateCategory('default-alimentacao')).rejects.toThrow(/padrão/);
    await act(async () => { await result.current.deactivateCategory('u-pets'); });
    expect(mockUpdateDoc).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ isActive: false }));
  });
});
