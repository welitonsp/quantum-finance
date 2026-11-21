import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const calls: Array<{ op: string; args: unknown[] }> = [];
let selectResult: { data: unknown; error: unknown } = { data: [], error: null };
let readResult: { data: unknown; error: unknown } = { data: null, error: null };
let writeResult: { data: unknown; error: unknown } = { data: { id: 'new-id' }, error: null };

function builder() {
  const b: Record<string, unknown> = {};
  const record = (op: string) => (...args: unknown[]) => { calls.push({ op, args }); return b; };
  b['select'] = record('select');
  b['insert'] = record('insert');
  b['update'] = record('update');
  b['delete'] = record('delete');
  b['eq'] = record('eq');
  b['order'] = (...args: unknown[]) => { calls.push({ op: 'order', args }); return Promise.resolve(selectResult); };
  b['single'] = () => Promise.resolve(writeResult);
  b['maybeSingle'] = () => Promise.resolve(readResult);
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

vi.mock('../../../shared/api/supabase/client', () => ({ getSupabase: () => client }));
vi.mock('../../../shared/lib/firebaseErrorHandling', () => ({ logSanitizedFirebaseError: vi.fn() }));

import { useShoppingListsSupabase, mapShoppingListRow, type ShoppingListRow } from './useShoppingListsSupabase';
import type { Centavos } from '../../../shared/types/money';
import type { ShoppingListItem } from '../../../shared/types/shopping';

const ITEM: ShoppingListItem = {
  id: 'i1', productName: 'Arroz', quantity: '2', unit: 'un',
  estimatedUnitPriceCents: 1000 as Centavos, estimatedTotalCents: 2000 as Centavos,
  checked: false, createdAt: '2026-11-20T00:00:00Z',
};

function row(over: Partial<ShoppingListRow> = {}): ShoppingListRow {
  return {
    id: 'l1', user_id: 'u1', name: 'Mercado', scheduled_date: null,
    estimated_total_cents: '2000', actual_total_cents: null, status: 'open',
    linked_transaction_id: null, items: [ITEM],
    created_at: '2026-11-20T00:00:00Z', updated_at: '2026-11-20T00:00:00Z', ...over,
  };
}

function lastUpdate(): Record<string, unknown> {
  const u = [...calls].reverse().find((c) => c.op === 'update');
  return u?.args[0] as Record<string, unknown>;
}

async function renderReady() {
  const hook = renderHook(() => useShoppingListsSupabase('u1'));
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
}

beforeEach(() => {
  calls.length = 0;
  selectResult = { data: [], error: null };
  readResult = { data: { items: [ITEM], status: 'open' }, error: null };
  writeResult = { data: { id: 'new-id' }, error: null };
  vi.clearAllMocks();
});

describe('mapShoppingListRow', () => {
  it('mapeia a linha em centavos e omite campos vazios', () => {
    expect(mapShoppingListRow(row())).toEqual({
      id: 'l1', uid: 'u1', name: 'Mercado', estimatedTotalCents: 2000, status: 'open',
      items: [ITEM], createdAt: '2026-11-20T00:00:00Z', updatedAt: '2026-11-20T00:00:00Z', schemaVersion: 1,
    });
  });

  it('inclui data, total real e transação vinculada quando existem', () => {
    const list = mapShoppingListRow(row({
      scheduled_date: '2026-11-25', actual_total_cents: 1890, linked_transaction_id: 'tx1',
    }));
    expect(list.scheduledDate).toBe('2026-11-25');
    expect(list.actualTotalCents).toBe(1890);
    expect(list.linkedTransactionId).toBe('tx1');
  });

  it('protege contra status desconhecido e itens que não são lista', () => {
    const list = mapShoppingListRow(row({ status: 'lixo', items: { a: 1 } }));
    expect(list.status).toBe('open');
    expect(list.items).toEqual([]);
  });
});

describe('useShoppingListsSupabase', () => {
  it('carrega as listas mais recentes primeiro', async () => {
    selectResult = { data: [row()], error: null };
    const { result } = await renderReady();
    await waitFor(() => expect(result.current.lists).toHaveLength(1));
    expect(calls.find((c) => c.op === 'order')?.args).toEqual(['created_at', { ascending: false }]);
  });

  it('cria a lista com nome aparado e sem enviar user_id', async () => {
    const { result } = await renderReady();
    let id = '';
    await act(async () => { id = await result.current.createList('  Feira  ', '2026-11-25'); });
    expect(id).toBe('new-id');
    const insert = calls.find((c) => c.op === 'insert')?.args[0] as Record<string, unknown>;
    expect(insert).toEqual({
      name: 'Feira', scheduled_date: '2026-11-25', estimated_total_cents: 0, status: 'open', items: [],
    });
  });

  it('adiciona item e recalcula o total estimado', async () => {
    const { result } = await renderReady();
    await act(async () => {
      await result.current.addItem('l1', {
        productName: 'Feijão', quantity: '1', unit: 'un',
        estimatedUnitPriceCents: 850 as Centavos, estimatedTotalCents: 850 as Centavos,
      });
    });
    const cols = lastUpdate();
    expect((cols['items'] as ShoppingListItem[]).map((i) => i.productName)).toEqual(['Arroz', 'Feijão']);
    expect(cols['estimated_total_cents']).toBe(2850);
  });

  it('marcar o único item conclui a lista e grava o total real', async () => {
    const { result } = await renderReady();
    await act(async () => {
      await result.current.checkItem('l1', 'i1', {
        checked: true, actualUnitPriceCents: 950 as Centavos, actualTotalCents: 1900 as Centavos,
      });
    });
    const cols = lastUpdate();
    expect(cols['status']).toBe('done');
    expect(cols['actual_total_cents']).toBe(1900);
  });

  it('remove item e recalcula o total', async () => {
    const { result } = await renderReady();
    await act(async () => { await result.current.removeItem('l1', 'i1'); });
    expect(lastUpdate()).toEqual({ items: [], estimated_total_cents: 0 });
  });

  it('lista inexistente recusa a alteração', async () => {
    readResult = { data: null, error: null };
    const { result } = await renderReady();
    await expect(result.current.removeItem('lx', 'i1')).rejects.toThrow('Lista não encontrada');
  });

  it('finaliza, vincula transação e exclui', async () => {
    const { result } = await renderReady();
    await act(async () => { await result.current.finishList('l1'); });
    expect(lastUpdate()).toEqual({ status: 'done' });
    await act(async () => { await result.current.linkTransaction('l1', 'tx9'); });
    expect(lastUpdate()).toEqual({ linked_transaction_id: 'tx9' });
    await act(async () => { await result.current.deleteList('l1'); });
    expect(calls.some((c) => c.op === 'delete')).toBe(true);
  });

  it('erro do banco vira mensagem genérica', async () => {
    const { result } = await renderReady();
    writeResult = { data: null, error: { code: '42501' } };
    await expect(result.current.finishList('l1')).rejects.toThrow('Não foi possível atualizar a lista.');
  });
});
