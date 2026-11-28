import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const backend = vi.hoisted(() => ({ DATA_BACKEND: 'supabase' as 'supabase' | 'firebase' }));
vi.mock('../../shared/config/backend', () => backend);

const rpc = vi.fn();
vi.mock('../../shared/api/supabase/client', () => ({ getSupabase: () => ({ rpc }) }));

import { monthRange, fetchDashboardTotals, useDashboardTotals } from './useDashboardTotalsSupabase';

beforeEach(() => {
  rpc.mockReset();
  backend.DATA_BACKEND = 'supabase';
});

describe('monthRange', () => {
  it('cobre o mês inteiro, inclusive fevereiro bissexto', () => {
    expect(monthRange(3, 2026)).toEqual({ from: '2026-03-01', to: '2026-03-31' });
    expect(monthRange(2, 2028)).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(monthRange(12, 2026)).toEqual({ from: '2026-12-01', to: '2026-12-31' });
  });
});

describe('fetchDashboardTotals', () => {
  it('chama a RPC com o período e converte bigint (número ou texto) em centavos', async () => {
    rpc.mockResolvedValue({ data: [{ income_cents: 500000, expense_cents: '12445', net_all_cents: -300 }], error: null });
    await expect(fetchDashboardTotals(3, 2026)).resolves.toEqual({
      incomeCents: 500000, expenseCents: 12445, netAllCents: -300,
    });
    expect(rpc).toHaveBeenCalledWith('dashboard_totals', { p_from: '2026-03-01', p_to: '2026-03-31' });
  });

  it('propaga o erro da RPC', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42883' } });
    await expect(fetchDashboardTotals(3, 2026)).rejects.toEqual({ code: '42883' });
  });
});

describe('useDashboardTotals', () => {
  it('devolve os totais do servidor', async () => {
    rpc.mockResolvedValue({ data: [{ income_cents: 100, expense_cents: 40, net_all_cents: 60 }], error: null });
    const { result } = renderHook(() => useDashboardTotals('u1', 3, 2026, 0));
    await waitFor(() => expect(result.current).toEqual({ incomeCents: 100, expenseCents: 40, netAllCents: 60 }));
  });

  it('em erro devolve null (o painel volta para a soma local)', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202' } });
    const { result } = renderHook(() => useDashboardTotals('u1', 3, 2026, 0));
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });

  it('ao trocar de mês não mostra o total do mês anterior', async () => {
    rpc.mockResolvedValueOnce({ data: [{ income_cents: 100, expense_cents: 0, net_all_cents: 100 }], error: null });
    let resolveApril: (v: unknown) => void = () => {};
    rpc.mockReturnValueOnce(new Promise((r) => { resolveApril = r; }));
    const { result, rerender } = renderHook(({ m }) => useDashboardTotals('u1', m, 2026, 0), { initialProps: { m: 3 } });
    await waitFor(() => expect(result.current?.incomeCents).toBe(100));
    rerender({ m: 4 });
    expect(result.current).toBeNull();
    resolveApril({ data: [{ income_cents: 7, expense_cents: 0, net_all_cents: 107 }], error: null });
    await waitFor(() => expect(result.current?.incomeCents).toBe(7));
  });

  it('refaz a soma quando as transações mudam', async () => {
    rpc.mockResolvedValue({ data: [{ income_cents: 1, expense_cents: 0, net_all_cents: 1 }], error: null });
    const { rerender } = renderHook(({ k }) => useDashboardTotals('u1', 3, 2026, k), { initialProps: { k: 'a' } });
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    rerender({ k: 'b' });
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(2));
  });

  it('no build Firebase não chama o servidor', () => {
    backend.DATA_BACKEND = 'firebase';
    const { result } = renderHook(() => useDashboardTotals('u1', 3, 2026, 0));
    expect(result.current).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });
});
