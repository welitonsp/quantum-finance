import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const calls: Array<{ table?: string; op: string; args: unknown[] }> = [];
let selectResult: { data: unknown; error: unknown } = { data: [], error: null };
let writeResult: { data: unknown; error: unknown } = { data: null, error: null };
let rpcResult: { data: unknown; error: unknown } = { data: 'g-new', error: null };

function builder(table: string) {
  const b: Record<string, unknown> = {};
  const record = (op: string) => (...args: unknown[]) => { calls.push({ table, op, args }); return b; };
  for (const op of ['select', 'eq', 'order', 'limit']) b[op] = record(op);
  b['delete'] = (...args: unknown[]) => { calls.push({ table, op: 'delete', args }); b['__write'] = true; return b; };
  b['then'] = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(b['__write'] ? writeResult : selectResult).then(resolve, reject);
  return b;
}

const channel = { on: vi.fn(() => channel), subscribe: vi.fn(() => channel) };
const client = {
  from: vi.fn((table: string) => builder(table)),
  rpc: vi.fn((...args: unknown[]) => { calls.push({ op: 'rpc', args }); return Promise.resolve(rpcResult); }),
  channel: vi.fn(() => channel),
  removeChannel: vi.fn(() => Promise.resolve()),
};

vi.mock('../../../shared/api/supabase/client', () => ({ getSupabase: () => client }));
vi.mock('../../../shared/lib/firebaseErrorHandling', () => ({ logSanitizedFirebaseError: vi.fn() }));

// a tela importa pelo módulo de entrada: carrega-o primeiro, como no app
import './useGroups';
import {
  useGroupsSupabase, useGroupExpensesSupabase, useGroupInvitesSupabase,
  mapGroupRow, mapExpenseRow, type GroupRow, type ExpenseRow,
} from './useGroupsSupabase';
import type { Centavos } from '../../../shared/types/money';

const OWNER = '00000000-0000-0000-0000-0000000000a1';
const GUEST = '00000000-0000-0000-0000-0000000000a2';

function groupRow(over: Partial<GroupRow> = {}): GroupRow {
  return {
    id: 'g1', name: 'Casa', description: null, owner_id: OWNER,
    created_at: '2026-11-20T10:00:00Z', updated_at: '2026-11-20T10:00:00Z',
    group_members: [
      { user_id: OWNER, display_name: 'Dono', email: 'dono@exemplo.com' },
      { user_id: GUEST, display_name: 'Convidado', email: null },
    ],
    ...over,
  };
}

function expenseRow(over: Partial<ExpenseRow> = {}): ExpenseRow {
  return {
    id: 'e1', group_id: 'g1', description: 'Luz', total_cents: '1000', category: 'Casa', date: '2026-11-20',
    payer_id: OWNER, payer_display_name: 'Dono', split_method: 'igual',
    created_at: '2026-11-20T10:00:00Z', updated_at: '2026-11-20T10:00:00Z',
    group_expense_shares: [
      { user_id: OWNER, display_name: 'Dono', amount_cents: 500, paid: true, paid_at: '2026-11-20T10:00:00Z' },
      { user_id: GUEST, display_name: 'Convidado', amount_cents: '500', paid: false, paid_at: null },
    ],
    ...over,
  };
}

beforeEach(() => {
  calls.length = 0;
  selectResult = { data: [], error: null };
  writeResult = { data: null, error: null };
  rpcResult = { data: 'g-new', error: null };
  vi.clearAllMocks();
});

describe('mapeamento', () => {
  it('grupo traz membros e uids a partir de group_members', () => {
    const g = mapGroupRow(groupRow());
    expect(g.ownerUid).toBe(OWNER);
    expect(g.memberUids).toEqual([OWNER, GUEST]);
    expect(g.members[1]).toEqual({ uid: GUEST, displayName: 'Convidado', email: '' });
    expect(g).not.toHaveProperty('description');
    expect(mapGroupRow(groupRow({ description: 'Contas' })).description).toBe('Contas');
  });

  it('despesa em centavos inteiros, cotas com paidAt só quando paga', () => {
    const e = mapExpenseRow(expenseRow());
    expect(e.totalCents).toBe(1000);
    expect(e.shares[0]).toEqual({ uid: OWNER, displayName: 'Dono', amountCents: 500, paid: true, paidAt: '2026-11-20T10:00:00Z' });
    expect(e.shares[1]).toEqual({ uid: GUEST, displayName: 'Convidado', amountCents: 500, paid: false });
    expect(mapExpenseRow(expenseRow({ split_method: 'xyz' })).splitMethod).toBe('igual');
  });
});

describe('useGroupsSupabase', () => {
  it('carrega grupos e escuta só INSERT/UPDATE', async () => {
    selectResult = { data: [groupRow()], error: null };
    const { result } = renderHook(() => useGroupsSupabase(OWNER));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.groups).toHaveLength(1);
    const events = (channel.on.mock.calls as unknown as Array<[string, { event: string }]>).map((c) => c[1].event);
    expect(new Set(events)).toEqual(new Set(['INSERT', 'UPDATE']));
  });

  it('cria grupo pela função do servidor', async () => {
    const { result } = renderHook(() => useGroupsSupabase(OWNER));
    await waitFor(() => expect(result.current.loading).toBe(false));
    let id = '';
    await act(async () => { id = await result.current.createGroup('Casa'); });
    expect(id).toBe('g-new');
    expect(calls.find((c) => c.op === 'rpc')?.args).toEqual(['create_group', {
      p_name: 'Casa', p_description: null, p_display_name: null,
    }]);
  });

  it('convite normaliza e-mail e não manda nome do grupo', async () => {
    const { result } = renderHook(() => useGroupsSupabase(OWNER));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.createInvite('g1', 'Casa forjada', ' Ana@Exemplo.com ', 'Dono'); });
    expect(calls.find((c) => c.op === 'rpc')?.args).toEqual(['create_group_invite', {
      p_group_id: 'g1', p_invitee_email: 'ana@exemplo.com', p_inviter_display_name: 'Dono',
    }]);
  });

  it('aceite usa a função do servidor; erro vira mensagem genérica', async () => {
    const { result } = renderHook(() => useGroupsSupabase(GUEST));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.acceptInvite('g1', 'i1', 'Convidado', 'x@y.com'); });
    expect(calls.find((c) => c.op === 'rpc')?.args).toEqual(['accept_group_invite', {
      p_group_id: 'g1', p_invite_id: 'i1', p_display_name: 'Convidado',
    }]);
    rpcResult = { data: null, error: { code: '42501' } };
    await expect(result.current.acceptInvite('g1', 'i1', 'C', '')).rejects.toThrow('Não foi possível aceitar o convite.');
  });

  it('verifica convite pendente pelo e-mail no grupo', async () => {
    const { result } = renderHook(() => useGroupsSupabase(GUEST));
    await waitFor(() => expect(result.current.loading).toBe(false));
    selectResult = { data: [{
      id: 'i1', group_id: 'g1', group_name: 'Casa', inviter_id: OWNER, inviter_display_name: 'Dono',
      invitee_email: 'ana@exemplo.com', status: 'pending', created_at: 'x', expires_at: '2026-11-28T00:00:00Z',
    }], error: null };
    calls.length = 0;
    const inv = await result.current.checkGroupInvite('g1', ' ANA@exemplo.com');
    expect(inv?.groupName).toBe('Casa');
    expect(calls.filter((c) => c.op === 'eq').map((c) => c.args)).toEqual([
      ['group_id', 'g1'], ['invitee_email', 'ana@exemplo.com'], ['status', 'pending'],
    ]);
  });

  it('sem usuário não consulta', async () => {
    const { result } = renderHook(() => useGroupsSupabase(''));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(client.from).not.toHaveBeenCalled();
  });
});

describe('useGroupExpensesSupabase', () => {
  it('filtra pelo grupo e manda só uid, valor e situação das cotas', async () => {
    selectResult = { data: [expenseRow()], error: null };
    const { result } = renderHook(() => useGroupExpensesSupabase('g1'));
    await waitFor(() => expect(result.current.expenses).toHaveLength(1));
    expect(calls.find((c) => c.op === 'eq')?.args).toEqual(['group_id', 'g1']);

    await act(async () => {
      await result.current.addExpense('g1', {
        description: 'Água', totalCents: 300 as Centavos, category: 'Casa', date: '2026-11-21',
        payerUid: OWNER, payerDisplayName: 'Dono', splitMethod: 'personalizado',
        shares: [
          { uid: OWNER, displayName: 'forjado', amountCents: 100 as Centavos, paid: true },
          { uid: GUEST, displayName: 'Convidado', amountCents: 200 as Centavos, paid: false },
        ],
      });
    });
    expect(calls.find((c) => c.op === 'rpc')?.args).toEqual(['create_group_expense', {
      p_group_id: 'g1', p_description: 'Água', p_total_cents: 300, p_category: 'Casa', p_date: '2026-11-21',
      p_split_method: 'personalizado', p_payer_display_name: 'Dono',
      p_shares: [{ uid: OWNER, amountCents: 100, paid: true }, { uid: GUEST, amountCents: 200, paid: false }],
    }]);
  });

  it('quitação e exclusão', async () => {
    const { result } = renderHook(() => useGroupExpensesSupabase('g1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.markSharePaid('g1', 'e1', GUEST); });
    expect(calls.find((c) => c.op === 'rpc')?.args).toEqual(['settle_group_expense_share', {
      p_expense_id: 'e1', p_target_uid: GUEST,
    }]);
    writeResult = { data: null, error: { code: '42501' } };
    await expect(result.current.deleteExpense('g1', 'e1')).rejects.toThrow('Não foi possível excluir a despesa.');
  });

  it('sem grupo selecionado não consulta', async () => {
    const { result } = renderHook(() => useGroupInvitesSupabase(null));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.invites).toEqual([]);
    expect(client.from).not.toHaveBeenCalled();
  });
});
