import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const calls: Array<{ op: string; args: unknown[] }> = [];
let selectResult: { data: unknown; error: unknown } = { data: [], error: null };
let writeResult: { data: unknown; error: unknown } = { data: { id: 'new-id' }, error: null };

function builder() {
  const b: Record<string, unknown> = {};
  const record = (op: string) => (...args: unknown[]) => { calls.push({ op, args }); return b; };
  b['select'] = record('select');
  b['upsert'] = record('upsert');
  b['update'] = record('update');
  b['eq'] = record('eq');
  b['order'] = (...args: unknown[]) => { calls.push({ op: 'order', args }); return Promise.resolve(selectResult); };
  b['single'] = () => Promise.resolve(writeResult);
  b['then'] = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve({ error: writeResult.error }).then(res, rej);
  return b;
}

const channel = { on: vi.fn(() => channel), subscribe: vi.fn(() => channel) };
const client = {
  from: vi.fn(() => builder()),
  channel: vi.fn(() => channel),
  removeChannel: vi.fn(() => Promise.resolve()),
};

vi.mock('../../shared/api/supabase/client', () => ({ getSupabase: () => client }));
vi.mock('../../shared/lib/firebaseErrorHandling', () => ({ logSanitizedFirebaseError: vi.fn() }));

import { useCategoryStoreSupabase, mapCategoryRow, toCategoryColumns } from './useCategoriesSupabase';

const petsRow = {
  id: 'c1', name: 'Pets', normalized_name: 'pets', type: 'saida', color: '#111827',
  icon: '🐾', is_default: false, is_active: true,
};

beforeEach(() => {
  calls.length = 0;
  selectResult = { data: [], error: null };
  writeResult = { data: { id: 'new-id' }, error: null };
  vi.clearAllMocks();
});

describe('mapCategoryRow / toCategoryColumns', () => {
  it('mapeia a linha validada pelo schema do app', () => {
    expect(mapCategoryRow(petsRow, 'u1')).toEqual({
      id: 'c1', uid: 'u1', name: 'Pets', normalizedName: 'pets', type: 'saida',
      color: '#111827', icon: '🐾', isDefault: false, isActive: true,
    });
  });

  it('linha inválida vira null e ícone vazio é omitido', () => {
    expect(mapCategoryRow({ ...petsRow, type: 'xyz' }, 'u1')).toBeNull();
    expect(mapCategoryRow({ ...petsRow, icon: null }, 'u1')).not.toHaveProperty('icon');
  });

  it('converte só os campos informados para colunas', () => {
    expect(toCategoryColumns({ name: 'Animais', normalizedName: 'animais', isActive: false }))
      .toEqual({ name: 'Animais', normalized_name: 'animais', is_active: false });
  });
});

describe('useCategoryStoreSupabase', () => {
  it('carrega categorias válidas e assina tempo real', async () => {
    selectResult = { data: [petsRow, { ...petsRow, id: 'bad', type: 'xyz' }], error: null };
    const { result } = renderHook(() => useCategoryStoreSupabase('u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.userCategories.map(c => c.id)).toEqual(['c1']);
    expect(client.channel).toHaveBeenCalledWith('categories:u1');
  });

  it('insertCategory faz upsert por nome normalizado (reativa a desativada)', async () => {
    const { result } = renderHook(() => useCategoryStoreSupabase('u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    let id = '';
    await act(async () => {
      id = await result.current.insertCategory({
        name: 'Pets', normalizedName: 'pets', type: 'saida', color: '#64748b', icon: '•',
        isDefault: false, isActive: true,
      });
    });
    expect(id).toBe('new-id');
    expect(calls).toContainEqual({
      op: 'upsert',
      args: [
        { name: 'Pets', normalized_name: 'pets', type: 'saida', color: '#64748b', icon: '•', is_default: false, is_active: true },
        { onConflict: 'user_id,normalized_name' },
      ],
    });
  });

  it('patchCategory atualiza pelo id e traduz duplicata', async () => {
    const { result } = renderHook(() => useCategoryStoreSupabase('u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.patchCategory('c1', { isActive: false }); });
    expect(calls).toContainEqual({ op: 'update', args: [{ is_active: false }] });
    expect(calls).toContainEqual({ op: 'eq', args: ['id', 'c1'] });

    writeResult = { data: null, error: { code: '23505' } };
    await expect(result.current.patchCategory('c1', { name: 'X', normalizedName: 'x' }))
      .rejects.toThrow('Essa categoria já existe.');
  });

  it('erro ao criar vira mensagem amigável; sem usuário não grava', async () => {
    writeResult = { data: null, error: { code: '42501' } };
    const { result } = renderHook(() => useCategoryStoreSupabase('u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const payload = { name: 'A', normalizedName: 'a', type: 'ambos' as const, color: '#000', isDefault: false, isActive: true };
    await expect(result.current.insertCategory(payload)).rejects.toThrow('Não foi possível criar a categoria.');

    vi.clearAllMocks();
    const { result: r0 } = renderHook(() => useCategoryStoreSupabase(''));
    await waitFor(() => expect(r0.current.loading).toBe(false));
    await expect(r0.current.insertCategory(payload)).rejects.toThrow(/autenticado/);
    expect(client.from).not.toHaveBeenCalled();
  });
});
