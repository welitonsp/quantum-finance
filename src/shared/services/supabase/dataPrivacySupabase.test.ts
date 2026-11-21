import { describe, it, expect, vi, beforeEach } from 'vitest';

const calls: Array<{ op: string; args: unknown[] }> = [];
let tableData: Record<string, unknown[][]> = {};
let tableError: Record<string, unknown> = {};
let rpcResult: { data: unknown; error: unknown } = { data: null, error: null };
let logResult: { data: unknown; error: unknown } = { data: [], error: null };

function builder(table: string) {
  const b: Record<string, unknown> = {};
  const record = (op: string) => (...args: unknown[]) => { calls.push({ op, args: [table, ...args] }); return b; };
  b['select'] = record('select');
  b['order'] = record('order');
  b['range'] = (...args: unknown[]) => {
    calls.push({ op: 'range', args: [table, ...args] });
    if (tableError[table]) return Promise.resolve({ data: null, error: tableError[table] });
    const pages = tableData[table] ?? [];
    return Promise.resolve({ data: pages.shift() ?? [], error: null });
  };
  b['limit'] = (...args: unknown[]) => { calls.push({ op: 'limit', args: [table, ...args] }); return Promise.resolve(logResult); };
  return b;
}

const signOut = vi.fn(() => Promise.resolve({ error: null }));
const client = {
  from: vi.fn((table: string) => builder(table)),
  rpc: vi.fn((...args: unknown[]) => { calls.push({ op: 'rpc', args }); return Promise.resolve(rpcResult); }),
  auth: { signOut },
};
const { mockLog, mockDownload } = vi.hoisted(() => ({ mockLog: vi.fn(), mockDownload: vi.fn(() => Promise.resolve()) }));

vi.mock('../../api/supabase/client', () => ({ getSupabase: () => client }));
vi.mock('../../lib/firebaseErrorHandling', () => ({ logSanitizedFirebaseError: mockLog }));
vi.mock('../DataPrivacyService', () => ({ downloadUserExport: mockDownload }));

import {
  exportAllUserDataSupabase, deleteUserAccountSupabase, logDataProcessingEventSupabase,
  getDataProcessingLogSupabase, sanitizeExportRow, EXPORTABLE_TABLES,
} from './dataPrivacySupabase';

beforeEach(() => {
  calls.length = 0;
  tableData = {};
  tableError = {};
  rpcResult = { data: null, error: null };
  logResult = { data: [], error: null };
  vi.clearAllMocks();
});

describe('sanitizeExportRow', () => {
  it('remove user_id e import_hash e mantém o resto', () => {
    expect(sanitizeExportRow({ id: 't1', user_id: 'u1', import_hash: 'h', value_cents: 100 }))
      .toEqual({ id: 't1', value_cents: 100 });
  });
});

describe('exportAllUserDataSupabase', () => {
  it('lê todas as tabelas, pagina de 1000 em 1000 e não exporta o uid', async () => {
    const big = Array.from({ length: 1000 }, (_, i) => ({ id: `t${i}`, user_id: 'u1', import_hash: 'h' }));
    tableData = { transactions: [big, [{ id: 't1000', user_id: 'u1' }]] };
    await exportAllUserDataSupabase('u1');

    const [uid, collections] = mockDownload.mock.calls[0] as unknown as [string, Record<string, unknown[]>];
    expect(uid).toBe('u1');
    expect(Object.keys(collections)).toEqual(EXPORTABLE_TABLES.map((t) => t.table));
    expect(collections['transactions']).toHaveLength(1001);
    expect(JSON.stringify(collections)).not.toContain('u1');
    expect(calls.filter((c) => c.op === 'range' && c.args[0] === 'transactions').map((c) => c.args.slice(1)))
      .toEqual([[0, 999], [1000, 1999]]);
  });

  it('tabela com erro vira lista vazia e registra log', async () => {
    tableError = { goals: { code: '42501' } };
    await exportAllUserDataSupabase('u1');
    const [, collections] = mockDownload.mock.calls[0] as unknown as [string, Record<string, unknown[]>];
    expect(collections['goals']).toEqual([]);
    expect(mockLog).toHaveBeenCalledWith('data_export', { code: '42501' });
  });
});

describe('deleteUserAccountSupabase', () => {
  it('exporta, chama a RPC e encerra a sessão local', async () => {
    await deleteUserAccountSupabase('u1');
    expect(mockDownload).toHaveBeenCalledTimes(1);
    expect(calls.find((c) => c.op === 'rpc')?.args).toEqual(['delete_my_account']);
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('sem login recente (QF401) pede novo login', async () => {
    rpcResult = { data: null, error: { code: 'QF401' } };
    await expect(deleteUserAccountSupabase('u1')).rejects.toThrow('REQUIRES_RECENT_LOGIN');
    expect(signOut).not.toHaveBeenCalled();
  });

  it('outro erro vira mensagem genérica com log', async () => {
    rpcResult = { data: null, error: { code: 'XX000' } };
    await expect(deleteUserAccountSupabase('u1')).rejects.toThrow('Não foi possível excluir a conta.');
    expect(mockLog).toHaveBeenCalledWith('data_delete_account', { code: 'XX000' });
  });
});

describe('registro LGPD', () => {
  it('pedidos vão pela RPC; consentimento fica com o gatilho do banco', async () => {
    await logDataProcessingEventSupabase('u1', 'export_requested', 'x'.repeat(300));
    expect(calls.find((c) => c.op === 'rpc')?.args).toEqual(['log_data_processing_event', {
      p_event_type: 'export_requested', p_details: 'x'.repeat(200),
    }]);
    calls.length = 0;
    await logDataProcessingEventSupabase('u1', 'consent_granted');
    expect(calls.some((c) => c.op === 'rpc')).toBe(false);
  });

  it('lê os últimos registros com data em toDate()', async () => {
    logResult = { data: [{ id: 7, event_type: 'export_requested', details: null, created_at: '2026-11-21T10:00:00Z' }], error: null };
    const entries = await getDataProcessingLogSupabase('u1', 10);
    expect(entries[0]?.id).toBe('7');
    expect(entries[0]?.eventType).toBe('export_requested');
    expect(entries[0]?.createdAt?.toDate().toISOString()).toBe('2026-11-21T10:00:00.000Z');
    expect(calls.find((c) => c.op === 'limit')?.args).toEqual(['data_processing_log', 10]);
  });
});
