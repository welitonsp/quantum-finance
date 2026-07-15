import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { httpsCallable } from 'firebase/functions';

const {
  mockCollection, mockQuery, mockWhere, mockOnSnapshot, mockDoc,
  mockAddDoc, mockDeleteDoc, mockUpdateDoc, mockGetDocs, mockServerTimestamp, mockLog,
} = vi.hoisted(() => ({
  mockCollection:      vi.fn((_db: unknown, ...s: string[]) => ({ path: s.join('/') })),
  mockQuery:           vi.fn((ref: unknown) => ref),
  mockWhere:           vi.fn((...a: unknown[]) => ({ _where: a })),
  mockOnSnapshot:      vi.fn(),
  mockDoc:             vi.fn((_db: unknown, ...s: string[]) => ({ path: s.join('/'), id: s[s.length - 1] })),
  mockAddDoc:          vi.fn(),
  mockDeleteDoc:       vi.fn().mockResolvedValue(undefined),
  mockUpdateDoc:       vi.fn().mockResolvedValue(undefined),
  mockGetDocs:         vi.fn(),
  mockServerTimestamp: vi.fn(() => ({ _ts: true })),
  mockLog:             vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: mockCollection,
  query: mockQuery,
  where: mockWhere,
  onSnapshot: mockOnSnapshot,
  doc: mockDoc,
  addDoc: mockAddDoc,
  deleteDoc: mockDeleteDoc,
  updateDoc: mockUpdateDoc,
  getDocs: mockGetDocs,
  serverTimestamp: mockServerTimestamp,
}));

vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
vi.mock('../../../shared/api/firebase', () => ({ db: { _isMock: true }, functions: { _isMock: true } }));
vi.mock('../../../shared/lib/firebaseErrorHandling', () => ({ logSanitizedFirebaseError: mockLog }));

import { useGroups, useGroupInvites, useGroupExpenses } from './useGroups';
import type { SharedExpenseCreatePayload } from '../../../shared/types/shared';
import type { Centavos } from '../../../shared/types/money';

const callMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  mockDeleteDoc.mockResolvedValue(undefined);
  mockUpdateDoc.mockResolvedValue(undefined);
  (httpsCallable as unknown as ReturnType<typeof vi.fn>).mockReturnValue(callMock);
  mockOnSnapshot.mockImplementation((_q: unknown, onNext: (s: unknown) => void) => {
    onNext({ docs: [] });
    return () => {};
  });
});

// ── useGroups ────────────────────────────────────────────────
describe('useGroups — carregamento', () => {
  it('assina com where(memberUids array-contains uid) e popula groups', async () => {
    mockOnSnapshot.mockImplementation((_q: unknown, onNext: (s: unknown) => void) => {
      onNext({ docs: [{ id: 'g1', data: () => ({ name: 'Casa', memberUids: ['u1'] }) }] });
      return () => {};
    });
    const { result } = renderHook(() => useGroups('u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockWhere).toHaveBeenCalledWith('memberUids', 'array-contains', 'u1');
    expect(result.current.groups).toHaveLength(1);
    expect(result.current.groups[0]!.id).toBe('g1');
  });

  it('sem uid não assina', async () => {
    const { result } = renderHook(() => useGroups(''));
    await waitFor(() => expect(result.current.groups).toEqual([]));
    expect(mockOnSnapshot).not.toHaveBeenCalled();
  });

  it('erro no snapshot registra log shared_groups_load', async () => {
    mockOnSnapshot.mockImplementation((_q: unknown, _n: unknown, onErr: (e: unknown) => void) => {
      onErr(new Error('perm'));
      return () => {};
    });
    const { result } = renderHook(() => useGroups('u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockLog).toHaveBeenCalledWith('shared_groups_load', expect.any(Error));
  });
});

describe('useGroups — mutações', () => {
  it('createGroup cria doc com ownerUid/memberUids/schemaVersion e retorna id', async () => {
    mockAddDoc.mockResolvedValue({ id: 'g-new' });
    const { result } = renderHook(() => useGroups('u1'));
    let id = '';
    await act(async () => { id = await result.current.createGroup('Casa', 'desc'); });
    expect(id).toBe('g-new');
    const payload = mockAddDoc.mock.calls[0]![1] as Record<string, unknown>;
    expect(payload.ownerUid).toBe('u1');
    expect(payload.memberUids).toEqual(['u1']);
    expect(payload.schemaVersion).toBe(1);
    expect(payload.description).toBe('desc');
  });

  it('createGroup em erro loga shared_group_create e propaga', async () => {
    mockAddDoc.mockRejectedValue(new Error('denied'));
    const { result } = renderHook(() => useGroups('u1'));
    await expect(result.current.createGroup('Casa')).rejects.toThrow('denied');
    expect(mockLog).toHaveBeenCalledWith('shared_group_create', expect.any(Error));
  });

  it('deleteGroup chama deleteDoc no path do grupo', async () => {
    const { result } = renderHook(() => useGroups('u1'));
    await act(async () => { await result.current.deleteGroup('g1'); });
    expect(mockDeleteDoc.mock.calls[0]![0]).toMatchObject({ path: 'groups/g1' });
  });

  it('createInvite lowercase/trim e-mail, status pending e expiresAt ~7 dias', async () => {
    mockAddDoc.mockResolvedValue({ id: 'inv-1' });
    const { result } = renderHook(() => useGroups('u1'));
    const before = Date.now();
    await act(async () => {
      await result.current.createInvite('g1', 'Casa', '  Alguem@Email.COM  ', 'Weliton');
    });
    const payload = mockAddDoc.mock.calls[0]![1] as Record<string, unknown>;
    expect(payload.inviteeEmail).toBe('alguem@email.com');
    expect(payload.status).toBe('pending');
    expect(payload.inviterUid).toBe('u1');
    const expiresMs = Date.parse(payload.expiresAt as string);
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    expect(expiresMs).toBeGreaterThanOrEqual(before + sevenDays - 5000);
    expect(expiresMs).toBeLessThanOrEqual(Date.now() + sevenDays + 5000);
  });

  it('createInvite com e-mail vazio é no-op (não chama addDoc)', async () => {
    const { result } = renderHook(() => useGroups('u1'));
    await act(async () => { await result.current.createInvite('g1', 'Casa', '   ', 'Weliton'); });
    expect(mockAddDoc).not.toHaveBeenCalled();
  });

  it('checkGroupInvite retorna primeiro convite pendente', async () => {
    mockGetDocs.mockResolvedValue({
      docs: [{ id: 'inv-1', data: () => ({ status: 'pending', inviteeEmail: 'a@b.com' }) }],
    });
    const { result } = renderHook(() => useGroups('u1'));
    let invite: unknown;
    await act(async () => { invite = await result.current.checkGroupInvite('g1', 'A@B.com'); });
    expect(invite).toMatchObject({ id: 'inv-1', status: 'pending' });
  });

  it('checkGroupInvite retorna null quando não há convite', async () => {
    mockGetDocs.mockResolvedValue({ docs: [] });
    const { result } = renderHook(() => useGroups('u1'));
    let invite: unknown = 'x';
    await act(async () => { invite = await result.current.checkGroupInvite('g1', 'a@b.com'); });
    expect(invite).toBeNull();
  });

  it('checkGroupInvite em erro retorna null (não lança)', async () => {
    mockGetDocs.mockRejectedValue(new Error('perm'));
    const { result } = renderHook(() => useGroups('u1'));
    let invite: unknown = 'x';
    await act(async () => { invite = await result.current.checkGroupInvite('g1', 'a@b.com'); });
    expect(invite).toBeNull();
    expect(mockLog).toHaveBeenCalledWith('shared_group_invite_check', expect.any(Error));
  });

  it('acceptInvite chama callable acceptGroupInvite com groupId/inviteId/displayName', async () => {
    callMock.mockResolvedValue({ data: { joined: true } });
    const { result } = renderHook(() => useGroups('u1'));
    await act(async () => { await result.current.acceptInvite('g1', 'inv-1', 'Weliton', 'a@b.com'); });
    expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), 'acceptGroupInvite');
    expect(callMock).toHaveBeenCalledWith({ groupId: 'g1', inviteId: 'inv-1', displayName: 'Weliton' });
  });

  it('rejectInvite grava status rejected', async () => {
    const { result } = renderHook(() => useGroups('u1'));
    await act(async () => { await result.current.rejectInvite('g1', 'inv-1'); });
    const arg = mockUpdateDoc.mock.calls[0]![1] as Record<string, unknown>;
    expect(arg.status).toBe('rejected');
    expect(mockUpdateDoc.mock.calls[0]![0]).toMatchObject({ path: 'groups/g1/invites/inv-1' });
  });
});

// ── useGroupInvites ──────────────────────────────────────────
describe('useGroupInvites', () => {
  it('groupId null → loading false sem assinar', async () => {
    const { result } = renderHook(() => useGroupInvites(null));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockOnSnapshot).not.toHaveBeenCalled();
  });

  it('popula invites do snapshot', async () => {
    mockOnSnapshot.mockImplementation((_q: unknown, onNext: (s: unknown) => void) => {
      onNext({ docs: [{ id: 'inv-1', data: () => ({ status: 'pending' }) }] });
      return () => {};
    });
    const { result } = renderHook(() => useGroupInvites('g1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.invites).toHaveLength(1);
    expect(result.current.invites[0]!.id).toBe('inv-1');
  });
});

// ── useGroupExpenses ─────────────────────────────────────────
describe('useGroupExpenses', () => {
  const payload: SharedExpenseCreatePayload = {
    description: 'Jantar',
    totalCents: 6000 as Centavos,
    category: 'Alimentação',
    date: '2026-02-01',
    payerUid: 'u1',
    payerDisplayName: 'Weliton',
    splitMethod: 'igual',
    shares: [{ uid: 'u1', displayName: 'Weliton', amountCents: 3000 as Centavos, paid: true }],
  };

  it('groupId null → loading false sem assinar', async () => {
    const { result } = renderHook(() => useGroupExpenses(null));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockOnSnapshot).not.toHaveBeenCalled();
  });

  it('ordena despesas por date desc', async () => {
    mockOnSnapshot.mockImplementation((_q: unknown, onNext: (s: unknown) => void) => {
      onNext({
        docs: [
          { id: 'e1', data: () => ({ date: '2026-01-05' }) },
          { id: 'e2', data: () => ({ date: '2026-03-10' }) },
          { id: 'e3', data: () => ({ date: '2026-02-01' }) },
        ],
      });
      return () => {};
    });
    const { result } = renderHook(() => useGroupExpenses('g1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.expenses.map((e) => e.id)).toEqual(['e2', 'e3', 'e1']);
  });

  it('erro no snapshot registra log shared_expenses_load', async () => {
    mockOnSnapshot.mockImplementation((_q: unknown, _n: unknown, onErr: (e: unknown) => void) => {
      onErr(new Error('perm'));
      return () => {};
    });
    const { result } = renderHook(() => useGroupExpenses('g1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockLog).toHaveBeenCalledWith('shared_expenses_load', expect.any(Error));
  });

  it('addExpense chama callable createGroupExpense com payload mapeado', async () => {
    callMock.mockResolvedValue({ data: { id: 'e-new' } });
    const { result } = renderHook(() => useGroupExpenses('g1'));
    await act(async () => { await result.current.addExpense('g1', payload); });
    expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), 'createGroupExpense');
    expect(callMock).toHaveBeenCalledWith({
      groupId: 'g1',
      description: 'Jantar',
      totalCents: 6000,
      category: 'Alimentação',
      date: '2026-02-01',
      splitMethod: 'igual',
      payerDisplayName: 'Weliton',
      shares: payload.shares,
    });
  });

  it('addExpense em erro loga shared_expense_add e propaga', async () => {
    callMock.mockRejectedValue(new Error('denied'));
    const { result } = renderHook(() => useGroupExpenses('g1'));
    await expect(result.current.addExpense('g1', payload)).rejects.toThrow('denied');
    expect(mockLog).toHaveBeenCalledWith('shared_expense_add', expect.any(Error));
  });

  it('markSharePaid chama callable settleGroupExpenseShare com targetUid', async () => {
    callMock.mockResolvedValue({ data: { settled: true } });
    const { result } = renderHook(() => useGroupExpenses('g1'));
    await act(async () => { await result.current.markSharePaid('g1', 'e1', 'u2'); });
    expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), 'settleGroupExpenseShare');
    expect(callMock).toHaveBeenCalledWith({ groupId: 'g1', expenseId: 'e1', targetUid: 'u2' });
  });

  it('deleteExpense chama deleteDoc no path da despesa', async () => {
    const { result } = renderHook(() => useGroupExpenses('g1'));
    await act(async () => { await result.current.deleteExpense('g1', 'e1'); });
    expect(mockDeleteDoc.mock.calls[0]![0]).toMatchObject({ path: 'groups/g1/expenses/e1' });
  });

  it('deleteExpense em erro loga shared_expense_delete e propaga', async () => {
    mockDeleteDoc.mockRejectedValue(new Error('denied'));
    const { result } = renderHook(() => useGroupExpenses('g1'));
    await expect(result.current.deleteExpense('g1', 'e1')).rejects.toThrow('denied');
    expect(mockLog).toHaveBeenCalledWith('shared_expense_delete', expect.any(Error));
  });
});
