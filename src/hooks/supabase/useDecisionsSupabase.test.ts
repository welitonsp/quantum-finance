import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const calls: Array<{ op: string; args: unknown[] }> = [];
let selectResult: { data: unknown; error: unknown } = { data: [], error: null };

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
  from: vi.fn((table: string) => { calls.push({ op: 'from', args: [table] }); return builder(); }),
  channel: vi.fn(() => channel),
  removeChannel: vi.fn(() => Promise.resolve()),
};

vi.mock('../../shared/api/supabase/client', () => ({ getSupabase: () => client }));
vi.mock('../../shared/lib/firebaseErrorHandling', () => ({ logSanitizedFirebaseError: vi.fn() }));
vi.mock('../../shared/api/firebase/index', () => ({ db: {} }));

// Importa primeiro o módulo de entrada, na mesma ordem do app (import circular seguro).
import { useDecisions, decisionStats } from '../useDecisions';
import { useDecisionsSupabase, mapDecisionRow, DECISIONS_LIMIT, type DecisionRow } from './useDecisionsSupabase';

function row(over: Partial<DecisionRow> = {}): DecisionRow {
  return {
    id: 'd1', intent: 'register_purchase', question: 'Registrar compra?', user_decision: 'confirmed',
    outcome_status: 'applied', proposed_action: { kind: 'register_purchase', payload: { valueCents: 1000 } },
    created_at: '2026-11-21T10:00:00Z', ...over,
  };
}

beforeEach(() => {
  calls.length = 0;
  selectResult = { data: [], error: null };
  vi.clearAllMocks();
});

describe('mapDecisionRow', () => {
  it('mapeia a linha do banco para AIDecision', () => {
    expect(mapDecisionRow(row())).toEqual({
      id: 'd1', intent: 'register_purchase', question: 'Registrar compra?', userDecision: 'confirmed',
      outcomeStatus: 'applied', createdAt: new Date('2026-11-21T10:00:00Z'),
      proposedAction: { kind: 'register_purchase', payload: { valueCents: 1000 } },
    });
  });

  it('valores desconhecidos caem nos padrões seguros', () => {
    const d = mapDecisionRow(row({
      user_decision: 'lixo', outcome_status: null, proposed_action: null, created_at: 'x', intent: null,
    }));
    expect(d.userDecision).toBe('none');
    expect(d.outcomeStatus).toBe('pending');
    expect(d.proposedAction).toEqual({ kind: '', payload: {} });
    expect(d.createdAt).toBeNull();
    expect(d.intent).toBe('');
  });
});

describe('useDecisionsSupabase', () => {
  it('o módulo de entrada carrega sem erro de import circular', () => {
    expect(typeof useDecisions).toBe('function');
    expect(DECISIONS_LIMIT).toBe(50);
  });

  it('lê as 50 decisões mais recentes e calcula as contagens', async () => {
    selectResult = {
      data: [row(), row({ id: 'd2', user_decision: 'rejected', outcome_status: 'n/a' })],
      error: null,
    };
    const { result } = renderHook(() => useDecisionsSupabase('u1'));
    await waitFor(() => expect(result.current.decisions).toHaveLength(2));
    expect(calls.find((c) => c.op === 'from')?.args).toEqual(['ai_decisions']);
    expect(calls.find((c) => c.op === 'order')?.args).toEqual(['created_at', { ascending: false }]);
    expect(calls.find((c) => c.op === 'limit')?.args).toEqual([50]);
    expect(result.current.stats).toEqual({ total: 2, confirmed: 1, rejected: 1, applied: 1, reverted: 0 });
  });

  it('decisionStats conta revertidas', () => {
    expect(decisionStats([mapDecisionRow(row({ outcome_status: 'reverted' }))]).reverted).toBe(1);
  });
});
