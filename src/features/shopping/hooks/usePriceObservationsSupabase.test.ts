import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const calls: Array<{ op: string; args: unknown[] }> = [];
let selectResult: { data: unknown; error: unknown } = { data: [], error: null };
let rpcResult: { data: unknown; error: unknown } = { data: 'obs-id', error: null };

function builder() {
  const b: Record<string, unknown> = {};
  const record = (op: string) => (...args: unknown[]) => { calls.push({ op, args }); return b; };
  b['select'] = record('select');
  b['order'] = record('order');
  b['limit'] = (...args: unknown[]) => { calls.push({ op: 'limit', args }); return Promise.resolve(selectResult); };
  return b;
}

const channel = { on: vi.fn(() => channel), subscribe: vi.fn(() => channel) };
const client = {
  from: vi.fn(() => builder()),
  rpc: vi.fn((...args: unknown[]) => { calls.push({ op: 'rpc', args }); return Promise.resolve(rpcResult); }),
  channel: vi.fn(() => channel),
  removeChannel: vi.fn(() => Promise.resolve()),
};

vi.mock('../../../shared/api/supabase/client', () => ({ getSupabase: () => client }));
vi.mock('../../../shared/lib/firebaseErrorHandling', () => ({ logSanitizedFirebaseError: vi.fn() }));

import { usePriceObservationsSupabase, mapPriceObservationRow, type PriceObservationRow } from './usePriceObservationsSupabase';
import { observationsForProduct, normalizeProductName } from './priceObservationRules';
import type { Centavos } from '../../../shared/types/money';

function row(over: Partial<PriceObservationRow> = {}): PriceObservationRow {
  return {
    id: 'o1', user_id: 'u1', product_name: 'arroz 5kg', store: 'Mercado', unit_price_cents: '2590',
    quantity: '1.5', unit: 'kg', observed_at: '2026-11-20', source_list_id: null,
    created_at: '2026-11-20T10:00:00Z', ...over,
  };
}

async function renderReady() {
  const hook = renderHook(() => usePriceObservationsSupabase('u1'));
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
}

beforeEach(() => {
  calls.length = 0;
  selectResult = { data: [], error: null };
  rpcResult = { data: 'obs-id', error: null };
  vi.clearAllMocks();
});

describe('mapPriceObservationRow', () => {
  it('mapeia em centavos e omite lista de origem vazia', () => {
    expect(mapPriceObservationRow(row())).toEqual({
      id: 'o1', uid: 'u1', productName: 'arroz 5kg', store: 'Mercado', unitPriceCents: 2590,
      quantity: '1.5', unit: 'kg', observedAt: '2026-11-20', createdAt: '2026-11-20T10:00:00Z', schemaVersion: 1,
    });
    expect(mapPriceObservationRow(row({ source_list_id: 'l1' })).sourceListId).toBe('l1');
  });
});

describe('regras de produto', () => {
  it('normaliza nome e filtra até 20 do mesmo produto', () => {
    expect(normalizeProductName('  Arroz   5KG ')).toBe('arroz 5kg');
    const many = Array.from({ length: 25 }, (_, i) => mapPriceObservationRow(row({ id: `o${i}` })));
    const other = mapPriceObservationRow(row({ id: 'x', product_name: 'feijão' }));
    expect(observationsForProduct([...many, other], 'ARROZ 5kg')).toHaveLength(20);
    expect(observationsForProduct([...many, other], 'feijão')).toEqual([other]);
  });
});

describe('usePriceObservationsSupabase', () => {
  it('carrega as 500 mais recentes por data', async () => {
    selectResult = { data: [row()], error: null };
    const { result } = await renderReady();
    await waitFor(() => expect(result.current.observations).toHaveLength(1));
    expect(calls.find((c) => c.op === 'order')?.args).toEqual(['observed_at', { ascending: false }]);
    expect(calls.find((c) => c.op === 'limit')?.args).toEqual([500]);
  });

  it('registra pela RPC com nome normalizado e loja aparada', async () => {
    const { result } = await renderReady();
    let id = '';
    await act(async () => {
      id = await result.current.addObservation({
        productName: '  Arroz  5KG ', store: ' Atacadão ', unitPriceCents: 2590 as Centavos,
        quantity: '2', unit: 'un', observedAt: '2026-11-21',
      });
    });
    expect(id).toBe('obs-id');
    expect(calls.find((c) => c.op === 'rpc')?.args).toEqual(['record_price_observation', {
      p_product_name: 'arroz 5kg', p_store: 'Atacadão', p_unit_price_cents: 2590, p_quantity: '2',
      p_unit: 'un', p_observed_at: '2026-11-21', p_source_list_id: null,
    }]);
  });

  it('erro da RPC vira mensagem genérica', async () => {
    rpcResult = { data: null, error: { code: '23514' } };
    const { result } = await renderReady();
    await expect(result.current.addObservation({
      productName: 'arroz', store: 'Mercado', unitPriceCents: 100 as Centavos,
      quantity: '1', unit: 'un', observedAt: '2026-11-21',
    })).rejects.toThrow('Não foi possível registrar o preço.');
  });

  it('payload inválido é recusado antes de chamar o banco', async () => {
    const { result } = await renderReady();
    await expect(result.current.addObservation({
      productName: 'arroz', store: 'Mercado', unitPriceCents: 0 as Centavos,
      quantity: '1', unit: 'un', observedAt: '2026-11-21',
    })).rejects.toThrow();
    expect(calls.some((c) => c.op === 'rpc')).toBe(false);
  });
});
