import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const calls: Array<{ op: string; args: unknown[] }> = [];
let selectResult: { data: unknown; error: unknown } = { data: [], error: null };
let writeResult: { error: unknown } = { error: null };

function builder() {
  const b: Record<string, unknown> = {};
  const record = (op: string) => (...args: unknown[]) => { calls.push({ op, args }); return b; };
  b['select'] = record('select');
  b['insert'] = record('insert');
  b['update'] = record('update');
  b['delete'] = record('delete');
  b['eq'] = record('eq');
  b['order'] = (...args: unknown[]) => { calls.push({ op: 'order', args }); return Promise.resolve(selectResult); };
  b['then'] = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(writeResult).then(res, rej);
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
vi.mock('../../shared/api/firebase/index', () => ({ db: {} }));

import { useChallengeStoreSupabase, mapChallengeRow, type ChallengeRow } from './useChallengesSupabase';
import { challengeDates } from '../useChallenges';

function row(over: Partial<ChallengeRow> = {}): ChallengeRow {
  return {
    id: 'c1', category: 'Lazer', target_pct: 20, baseline_cents: '50000', deadline_days: 30,
    start_date: '2026-11-01', end_date: '2026-12-01', xp: 100, status: 'active',
    created_at: '2026-11-01T00:00:00Z', ...over,
  };
}

async function renderReady() {
  const hook = renderHook(() => useChallengeStoreSupabase('u1'));
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
}

beforeEach(() => {
  calls.length = 0;
  selectResult = { data: [], error: null };
  writeResult = { error: null };
  vi.clearAllMocks();
});

describe('mapChallengeRow', () => {
  it('mapeia a linha em centavos', () => {
    expect(mapChallengeRow(row())).toEqual({
      id: 'c1', category: 'Lazer', targetPct: 20, baselineCents: 50000, deadlineDays: 30,
      startDate: '2026-11-01', endDate: '2026-12-01', xp: 100, status: 'active',
      schemaVersion: 1, createdAt: '2026-11-01T00:00:00Z',
    });
  });

  it('status desconhecido vira active', () => {
    expect(mapChallengeRow(row({ status: 'lixo' })).status).toBe('active');
  });
});

describe('useChallengeStoreSupabase', () => {
  it('carrega os desafios mais recentes primeiro', async () => {
    selectResult = { data: [row()], error: null };
    const { result } = await renderReady();
    await waitFor(() => expect(result.current.challenges).toHaveLength(1));
    expect(calls.find((c) => c.op === 'order')?.args).toEqual(['created_at', { ascending: false }]);
  });

  it('cria o desafio com a janela de datas e sem user_id', async () => {
    const { result } = await renderReady();
    await act(async () => {
      await result.current.createChallenge({ category: 'Lazer', targetPct: 20, baselineCents: 50000, deadlineDays: 30 });
    });
    const { startDate, endDate } = challengeDates(30);
    expect(calls.find((c) => c.op === 'insert')?.args[0]).toEqual({
      category: 'Lazer', target_pct: 20, baseline_cents: 50000, deadline_days: 30,
      start_date: startDate, end_date: endDate, xp: 0, status: 'active',
    });
  });

  it('atualiza XP/status e exclui pelo id', async () => {
    const { result } = await renderReady();
    await act(async () => { await result.current.updateXP('c1', 200, 'won'); });
    expect(calls.find((c) => c.op === 'update')?.args[0]).toEqual({ xp: 200, status: 'won' });
    await act(async () => { await result.current.deleteChallenge('c1'); });
    expect(calls.some((c) => c.op === 'delete')).toBe(true);
    expect(calls.filter((c) => c.op === 'eq').map((c) => c.args)).toEqual([['id', 'c1'], ['id', 'c1']]);
  });

  it('erro do banco vira mensagem genérica', async () => {
    const { result } = await renderReady();
    writeResult = { error: { code: '23514' } };
    await expect(result.current.updateXP('c1', -1, 'active')).rejects.toThrow('Não foi possível atualizar o desafio.');
  });
});
