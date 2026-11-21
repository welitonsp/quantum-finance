import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

type Result = { data: unknown; error: unknown };
const calls: Array<{ op: string; args: unknown[] }> = [];
let results: Result[] = [];
const next = (): Promise<Result> => Promise.resolve(results.shift() ?? { data: [], error: null });

function builder() {
  const b: Record<string, unknown> = {};
  const record = (op: string) => (...args: unknown[]) => { calls.push({ op, args }); return b; };
  for (const op of ['select', 'eq', 'is', 'gte', 'lte', 'order', 'limit']) b[op] = record(op);
  b['then'] = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => next().then(res, rej);
  return b;
}
const client = { from: vi.fn((t: string) => { calls.push({ op: 'from', args: [t] }); return builder(); }) };

vi.mock('../../shared/api/supabase/client', () => ({ getSupabase: () => client }));
vi.mock('../../shared/lib/firebaseErrorHandling', () => ({ logSanitizedFirebaseError: vi.fn() }));
vi.mock('../../shared/config/backend', () => ({ DATA_BACKEND: 'supabase' }));

import { mapTransactionHistoryRow, useTransactionHistorySupabase } from './useTransactionHistorySupabase';
import { findImportCandidateTransactions } from '../../features/transactions/importCandidateSearch';

const row = {
  id: 7, transaction_id: 't1', action: 'UPDATE', origin: 'ai',
  changed_fields: ['category', 'account_id'],
  before: { category: 'Outros', account_id: 'a1', value_cents: 2500 },
  after: { category: 'Transporte', account_id: 'a2', value_cents: 2500 },
  created_at: '2026-11-12T10:00:00Z',
};

beforeEach(() => {
  calls.length = 0;
  results = [];
  vi.clearAllMocks();
});

describe('mapTransactionHistoryRow', () => {
  it('converte colunas do banco para os campos do app', () => {
    expect(mapTransactionHistoryRow(row)).toEqual({
      id: '7', action: 'UPDATE', txId: 't1', timestamp: Date.parse('2026-11-12T10:00:00Z'),
      before: { category: 'Outros', accountId: 'a1', value_cents: 2500 },
      after: { category: 'Transporte', accountId: 'a2', value_cents: 2500 },
      changedFields: ['category', 'accountId'], origin: 'ai', amount_cents: 2500, category: 'Transporte',
      createdAt: '2026-11-12T10:00:00Z',
    });
  });

  it('CREATE sem before e exclusão lógica', () => {
    const ev = mapTransactionHistoryRow({ ...row, action: 'SOFT_DELETE', before: null, after: { deleted_at: '2026-11-13T00:00:00Z' }, changed_fields: ['deleted_at'] });
    expect(ev.before).toBeUndefined();
    expect(ev.after).toEqual({ deletedAt: '2026-11-13T00:00:00Z' });
    expect(ev.changedFields).toEqual(['deletedAt']);
  });
});

describe('useTransactionHistorySupabase', () => {
  it('carrega os eventos da transação, mais recentes primeiro', async () => {
    results = [{ data: [row], error: null }];
    const { result } = renderHook(() => useTransactionHistorySupabase('u1', 't1'));
    await waitFor(() => expect(result.current.events).toHaveLength(1));
    expect(result.current.loading).toBe(false);
    expect(calls).toContainEqual({ op: 'from', args: ['transaction_history'] });
    expect(calls).toContainEqual({ op: 'eq', args: ['transaction_id', 't1'] });
    expect(calls).toContainEqual({ op: 'order', args: ['created_at', { ascending: false }] });
  });

  it('erro mostra mensagem genérica; sem transação não consulta', async () => {
    results = [{ data: null, error: { code: '42501' } }];
    const { result } = renderHook(() => useTransactionHistorySupabase('u1', 't1'));
    await waitFor(() => expect(result.current.error).toBe('Falha ao carregar histórico da movimentação.'));
    calls.length = 0;
    renderHook(() => useTransactionHistorySupabase('u1', undefined));
    expect(calls).toHaveLength(0);
  });
});

describe('findImportCandidateTransactions (Supabase)', () => {
  it('busca ativas do período em ordem de data, com teto', async () => {
    results = [{ data: [], error: null }];
    await findImportCandidateTransactions({ uid: 'u1', periodStart: '2026-11-01', periodEnd: '2026-11-30', maxCandidates: 9999 });
    expect(calls).toContainEqual({ op: 'is', args: ['deleted_at', null] });
    expect(calls).toContainEqual({ op: 'gte', args: ['date', '2026-11-01'] });
    expect(calls).toContainEqual({ op: 'lte', args: ['date', '2026-11-30'] });
    expect(calls).toContainEqual({ op: 'limit', args: [500] });
  });

  it('erro devolve lista vazia', async () => {
    results = [{ data: null, error: { code: '500' } }];
    expect(await findImportCandidateTransactions({ uid: 'u1', periodStart: '2026-11-01', periodEnd: '2026-11-30' })).toEqual([]);
  });
});
