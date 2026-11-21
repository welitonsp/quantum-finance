import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const calls: Array<{ op: string; args: unknown[] }> = [];
let pages: Array<{ data: unknown; error: unknown }> = [];

function builder() {
  const b: Record<string, unknown> = {};
  const record = (op: string) => (...args: unknown[]) => { calls.push({ op, args }); return b; };
  b['select'] = record('select');
  b['order'] = record('order');
  b['range'] = (...args: unknown[]) => {
    calls.push({ op: 'range', args });
    return Promise.resolve(pages.shift() ?? { data: [], error: null });
  };
  return b;
}

const client = { from: vi.fn((table: string) => { calls.push({ op: 'from', args: [table] }); return builder(); }) };
const { mockLog } = vi.hoisted(() => ({ mockLog: vi.fn() }));

vi.mock('../../shared/api/supabase/client', () => ({ getSupabase: () => client }));
vi.mock('../../shared/lib/firebaseErrorHandling', () => ({ logSanitizedFirebaseError: mockLog }));
vi.mock('../../shared/api/firebase/index', () => ({ db: {} }));

import { useAuditLogs } from '../useAuditLogs';
import {
  useAuditLogsSupabase, mapAuditTimelineRow, AUDIT_TIMELINE_PAGE_SIZE, type AuditTimelineRow,
} from './useAuditLogsSupabase';

function row(i: number, over: Partial<AuditTimelineRow> = {}): AuditTimelineRow {
  return {
    id: `tx-${i}`, entity: 'transactions', action: 'CREATE', origin: 'manual',
    label: `Compra ${i}`, created_at: '2026-11-21T10:00:00Z', ...over,
  };
}

const page = (start: number, n: number) => ({ data: Array.from({ length: n }, (_, k) => row(start + k)), error: null });

beforeEach(() => {
  calls.length = 0;
  pages = [];
  vi.clearAllMocks();
});

describe('mapAuditTimelineRow', () => {
  it('monta título por entidade/ação e subtítulo com rótulo e origem', () => {
    expect(mapAuditTimelineRow(row(1, { origin: 'ai' }))).toEqual({
      id: 'tx-1', title: 'Transação: criação', subtitle: 'Compra 1 • pelo Agente',
      timestamp: Date.parse('2026-11-21T10:00:00Z'),
    });
  });

  it('valores desconhecidos têm textos neutros', () => {
    const v = mapAuditTimelineRow(row(2, { entity: 'x', action: 'y', origin: 'manual', label: '  ', created_at: null }));
    expect(v).toMatchObject({ title: 'Registro: alteração', subtitle: 'Sem descrição', timestamp: 0 });
  });

  it('planejamento usa o nome da tabela', () => {
    expect(mapAuditTimelineRow(row(3, { entity: 'goals', action: 'DELETE', label: 'Viagem' })).title).toBe('Meta: exclusão');
  });
});

describe('useAuditLogsSupabase', () => {
  it('o módulo de entrada carrega na ordem do app', () => {
    expect(typeof useAuditLogs).toBe('function');
  });

  it('carrega a primeira página da view, mais recentes primeiro', async () => {
    pages = [page(0, 3)];
    const { result } = renderHook(() => useAuditLogsSupabase('u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.logs).toHaveLength(3);
    expect(result.current.hasMoreLogs).toBe(false);
    expect(calls.find((c) => c.op === 'from')?.args).toEqual(['audit_timeline']);
    expect(calls.filter((c) => c.op === 'order').map((c) => c.args)).toEqual([
      ['created_at', { ascending: false }], ['id', { ascending: false }],
    ]);
    expect(calls.find((c) => c.op === 'range')?.args).toEqual([0, AUDIT_TIMELINE_PAGE_SIZE - 1]);
  });

  it('página cheia permite carregar mais a partir do fim', async () => {
    pages = [page(0, AUDIT_TIMELINE_PAGE_SIZE), page(AUDIT_TIMELINE_PAGE_SIZE, 2)];
    const { result } = renderHook(() => useAuditLogsSupabase('u1'));
    await waitFor(() => expect(result.current.hasMoreLogs).toBe(true));
    await act(async () => { await result.current.loadMoreLogs(); });
    expect(calls.filter((c) => c.op === 'range').map((c) => c.args)[1])
      .toEqual([AUDIT_TIMELINE_PAGE_SIZE, 2 * AUDIT_TIMELINE_PAGE_SIZE - 1]);
    expect(result.current.logs).toHaveLength(AUDIT_TIMELINE_PAGE_SIZE + 2);
    expect(result.current.hasMoreLogs).toBe(false);
  });

  it('erro de leitura mostra mensagem e registra log sanitizado', async () => {
    pages = [{ data: null, error: { code: '42501' } }];
    const { result } = renderHook(() => useAuditLogsSupabase('u1'));
    await waitFor(() => expect(result.current.error).toBe('Não foi possível carregar o histórico.'));
    expect(mockLog).toHaveBeenCalledWith('audit_logs_load', { code: '42501' });
  });

  it('sem usuário não consulta o banco', async () => {
    const { result } = renderHook(() => useAuditLogsSupabase(''));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(client.from).not.toHaveBeenCalled();
  });
});
