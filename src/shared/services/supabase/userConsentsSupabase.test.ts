import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const calls: Array<{ op: string; args: unknown[] }> = [];
let readResult: { data: unknown; error: unknown } = { data: null, error: null };
let listResult: { data: unknown; error: unknown } = { data: [], error: null };
let upsertResult: { error: unknown } = { error: null };

function builder() {
  const b: Record<string, unknown> = {};
  const record = (op: string) => (...args: unknown[]) => { calls.push({ op, args }); return b; };
  b['select'] = record('select');
  b['maybeSingle'] = () => Promise.resolve(readResult);
  b['order'] = (...args: unknown[]) => { calls.push({ op: 'order', args }); return Promise.resolve(listResult); };
  b['upsert'] = (...args: unknown[]) => { calls.push({ op: 'upsert', args }); return Promise.resolve(upsertResult); };
  return b;
}

const channel = { on: vi.fn(() => channel), subscribe: vi.fn(() => channel) };
const client = {
  from: vi.fn((table: string) => { calls.push({ op: 'from', args: [table] }); return builder(); }),
  channel: vi.fn(() => channel),
  removeChannel: vi.fn(() => Promise.resolve()),
};
const { mockLog } = vi.hoisted(() => ({ mockLog: vi.fn() }));

vi.mock('../../api/supabase/client', () => ({ getSupabase: () => client }));
vi.mock('../../lib/firebaseErrorHandling', () => ({ logSanitizedFirebaseError: mockLog }));
vi.mock('../../api/firebase/index', () => ({ db: {} }));

import { getUserConsentsSupabase, saveUserConsentsSupabase } from './userConsentsSupabase';
import { useAiConsentSupabase } from '../../../hooks/supabase/useAiConsentSupabase';

beforeEach(() => {
  calls.length = 0;
  readResult = { data: null, error: null };
  listResult = { data: [], error: null };
  upsertResult = { error: null };
  vi.clearAllMocks();
});

describe('getUserConsentsSupabase', () => {
  it('sem registro devolve nada consentido', async () => {
    expect(await getUserConsentsSupabase('u1')).toEqual({ analytics: false, ai: false, updatedAt: null });
  });

  it('lê o registro e expõe a data com toDate()', async () => {
    readResult = { data: { analytics: true, ai: true, updated_at: '2026-11-21T10:00:00Z' }, error: null };
    const consents = await getUserConsentsSupabase('u1');
    expect(consents.analytics).toBe(true);
    expect(consents.ai).toBe(true);
    expect(consents.updatedAt?.toDate().toISOString()).toBe('2026-11-21T10:00:00.000Z');
  });

  it('erro de leitura é fail-closed e só registra log', async () => {
    readResult = { data: null, error: { code: '42501' } };
    expect(await getUserConsentsSupabase('u1')).toEqual({ analytics: false, ai: false, updatedAt: null });
    expect(mockLog).toHaveBeenCalledWith('user_consents_read', { code: '42501' });
  });
});

describe('saveUserConsentsSupabase', () => {
  it('faz upsert do registro do usuário', async () => {
    await saveUserConsentsSupabase('u1', { analytics: false, ai: true });
    expect(calls.find((c) => c.op === 'upsert')?.args).toEqual([
      { user_id: 'u1', analytics: false, ai: true }, { onConflict: 'user_id' },
    ]);
  });

  it('erro ao salvar vira mensagem genérica', async () => {
    upsertResult = { error: { code: '23503' } };
    await expect(saveUserConsentsSupabase('u1', { analytics: true, ai: true }))
      .rejects.toThrow('Não foi possível salvar os consentimentos.');
    expect(mockLog).toHaveBeenCalledWith('user_consents_save', { code: '23503' });
  });
});

describe('useAiConsentSupabase', () => {
  it('consentido quando o registro tem ai = true', async () => {
    listResult = { data: [{ ai: true }], error: null };
    const { result } = renderHook(() => useAiConsentSupabase('u1'));
    await waitFor(() => expect(result.current.aiGranted).toBe(true));
    expect(calls.find((c) => c.op === 'from')?.args).toEqual(['user_consents']);
  });

  it('sem registro ou com erro fica sem consentimento', async () => {
    listResult = { data: null, error: { code: '42501' } };
    const { result } = renderHook(() => useAiConsentSupabase('u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.aiGranted).toBe(false);
  });
});
