import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const calls: Array<{ op: string; args: unknown[] }> = [];
let selectResult: { data: unknown; error: unknown } = { data: [], error: null };
let upsertResult: { error: unknown } = { error: null };

function builder() {
  const b: Record<string, unknown> = {};
  const record = (op: string) => (...args: unknown[]) => { calls.push({ op, args }); return b; };
  b['select'] = record('select');
  b['order'] = record('order');
  b['limit'] = (...args: unknown[]) => { calls.push({ op: 'limit', args }); return Promise.resolve(selectResult); };
  b['upsert'] = (...args: unknown[]) => { calls.push({ op: 'upsert', args }); return Promise.resolve(upsertResult); };
  return b;
}

const client = { from: vi.fn(() => builder()) };
const { mockLog } = vi.hoisted(() => ({ mockLog: vi.fn() }));

vi.mock('../../shared/api/supabase/client', () => ({ getSupabase: () => client }));
vi.mock('../../shared/lib/firebaseErrorHandling', () => ({ logSanitizedFirebaseError: mockLog }));
vi.mock('../../shared/api/firebase/index', () => ({ db: {} }));

import { useScoreHistorySupabase, mapScoreHistoryRow, clampMetric } from './useScoreHistorySupabase';
import { currentMonthKey } from '../useScoreHistory';
import type { FinancialMetrics } from '../useFinancialMetrics';

const METRICS = {
  taxaPoupanca: 25.5, endividamento: 10, reservaMeses: 6, comprometimento: 30,
} as unknown as FinancialMetrics;

beforeEach(() => {
  calls.length = 0;
  selectResult = { data: [], error: null };
  upsertResult = { error: null };
  vi.clearAllMocks();
});

describe('clampMetric / mapScoreHistoryRow', () => {
  it('limita ao que numeric(12,4) guarda e zera NaN', () => {
    expect(clampMetric(Number.POSITIVE_INFINITY)).toBe(99_999_999);
    expect(clampMetric(Number.NEGATIVE_INFINITY)).toBe(-99_999_999);
    expect(clampMetric(Number.NaN)).toBe(0);
    expect(clampMetric(1.234567)).toBe(1.2346);
  });

  it('converte numeric (texto ou número) e protege valores inválidos', () => {
    expect(mapScoreHistoryRow({
      month: '2026-11', score: 72, taxa_poupanca: '25.5000', endividamento: 10,
      reserva_meses: 'lixo', comprometimento: null,
    })).toEqual({
      month: '2026-11', score: 72, taxaPoupanca: 25.5, endividamento: 10, reservaMeses: 0, comprometimento: 0,
    });
  });
});

describe('useScoreHistorySupabase', () => {
  it('carrega os 6 meses mais recentes e devolve do mais antigo ao mais novo', async () => {
    selectResult = {
      data: [
        { month: '2026-11', score: 80, taxa_poupanca: 0, endividamento: 0, reserva_meses: 0, comprometimento: 0 },
        { month: '2026-10', score: 70, taxa_poupanca: 0, endividamento: 0, reserva_meses: 0, comprometimento: 0 },
      ],
      error: null,
    };
    const { result } = renderHook(() => useScoreHistorySupabase('u1', null));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.history.map((h) => h.month)).toEqual(['2026-10', '2026-11']);
    expect(calls.find((c) => c.op === 'order')?.args).toEqual(['month', { ascending: false }]);
    expect(calls.find((c) => c.op === 'limit')?.args).toEqual([6]);
  });

  it('grava o score do mês atual com upsert por usuário e mês', async () => {
    renderHook(() => useScoreHistorySupabase('u1', METRICS));
    await waitFor(() => expect(calls.some((c) => c.op === 'upsert')).toBe(true));
    const [payload, opts] = calls.find((c) => c.op === 'upsert')!.args as [Record<string, unknown>, unknown];
    expect(payload).toMatchObject({
      user_id: 'u1', month: currentMonthKey(),
      taxa_poupanca: 25.5, endividamento: 10, reserva_meses: 6, comprometimento: 30,
    });
    expect(Number.isInteger(payload['score'])).toBe(true);
    expect(opts).toEqual({ onConflict: 'user_id,month' });
  });

  it('falha ao gravar só registra log sanitizado', async () => {
    upsertResult = { error: { code: '42501' } };
    renderHook(() => useScoreHistorySupabase('u1', METRICS));
    await waitFor(() => expect(mockLog).toHaveBeenCalledWith('score_history_persist', { code: '42501' }));
  });

  it('sem usuário não consulta o banco', async () => {
    const { result } = renderHook(() => useScoreHistorySupabase('', null));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(client.from).not.toHaveBeenCalled();
  });
});
