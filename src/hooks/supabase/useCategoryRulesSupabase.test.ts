import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const calls: Array<{ op: string; args: unknown[] }> = [];
let selectResult: { data: unknown; error: unknown } = { data: [], error: null };
let writeResult: { data: unknown; error: unknown } = { data: null, error: null };

function builder() {
  const b: Record<string, unknown> = {};
  const record = (op: string) => (...args: unknown[]) => { calls.push({ op, args }); return b; };
  b['select'] = record('select');
  b['insert'] = record('insert');
  b['delete'] = record('delete');
  b['eq'] = record('eq');
  b['order'] = (...args: unknown[]) => { calls.push({ op: 'order', args }); return Promise.resolve(selectResult); };
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

import { useCategoryRuleStoreSupabase, mapCategoryRuleRow, normalizeRules } from './useCategoryRulesSupabase';

beforeEach(() => {
  calls.length = 0;
  selectResult = { data: [], error: null };
  writeResult = { data: null, error: null };
  vi.clearAllMocks();
});

describe('mapCategoryRuleRow / normalizeRules', () => {
  it('mapeia nulos para texto vazio', () => {
    expect(mapCategoryRuleRow({ id: 'r1', keyword: null, category: 'Lazer' }))
      .toEqual({ id: 'r1', keyword: '', category: 'Lazer' });
  });

  it('põe a palavra-chave em minúsculas e descarta regras incompletas, mantendo a ordem', () => {
    expect(normalizeRules([
      { id: 'a', keyword: 'UBER', category: 'Transporte' },
      { id: 'b', keyword: '', category: 'Lazer' },
      { id: 'c', keyword: 'ifood', category: '' },
      { id: 'd', keyword: 'Netflix', category: 'Assinaturas' },
    ])).toEqual([
      { id: 'a', keyword: 'uber', category: 'Transporte' },
      { id: 'd', keyword: 'netflix', category: 'Assinaturas' },
    ]);
  });
});

describe('useCategoryRuleStoreSupabase', () => {
  it('carrega regras e assina tempo real', async () => {
    selectResult = { data: [{ id: 'r1', keyword: 'Uber', category: 'Transporte' }], error: null };
    const { result } = renderHook(() => useCategoryRuleStoreSupabase('u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.rules).toEqual([{ id: 'r1', keyword: 'uber', category: 'Transporte' }]);
    expect(client.from).toHaveBeenCalledWith('category_rules');
    expect(client.channel).toHaveBeenCalledWith('category_rules:u1');
  });

  it('ordena por prioridade: palavra mais específica primeiro, depois ordem de criação', async () => {
    selectResult = { data: [
      { id: 'r1', keyword: 'uber', category: 'Transporte' },
      { id: 'r2', keyword: 'uber eats', category: 'Alimentação' },
      { id: 'r3', keyword: 'pix', category: 'Transferência' },
    ], error: null };
    const { result } = renderHook(() => useCategoryRuleStoreSupabase('u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.rules.map(r => r.id)).toEqual(['r2', 'r1', 'r3']);
    expect(calls).toContainEqual({ op: 'order', args: ['created_at', { ascending: true }] });
  });

  it('addRule insere sem user_id (o banco preenche pelo login)', async () => {
    const { result } = renderHook(() => useCategoryRuleStoreSupabase('u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.addRule('uber', 'Transporte'); });
    expect(calls).toContainEqual({ op: 'insert', args: [{ keyword: 'uber', category: 'Transporte' }] });
  });

  it('removeRule apaga pelo id', async () => {
    const { result } = renderHook(() => useCategoryRuleStoreSupabase('u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.removeRule('r9'); });
    expect(calls).toContainEqual({ op: 'delete', args: [] });
    expect(calls).toContainEqual({ op: 'eq', args: ['id', 'r9'] });
  });

  it('erro ao gravar vira mensagem amigável', async () => {
    writeResult = { data: null, error: { code: '42501', message: 'permission denied' } };
    const { result } = renderHook(() => useCategoryRuleStoreSupabase('u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await expect(result.current.addRule('uber', 'Transporte')).rejects.toThrow('Não foi possível salvar a regra.');
  });

  it('sem usuário não grava', async () => {
    const { result } = renderHook(() => useCategoryRuleStoreSupabase(''));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await expect(result.current.addRule('uber', 'Transporte')).rejects.toThrow();
    expect(client.from).not.toHaveBeenCalled();
  });
});
