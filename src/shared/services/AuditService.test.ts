import { vi, describe, it, expect, beforeEach } from 'vitest';
import { AuditService, type TransactionHistoryEvent } from './AuditService';

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const { mockAddDoc, mockServerTimestamp, mockCollection, mockCallable, mockHttpsCallable } = vi.hoisted(() => {
  const mockAddDoc          = vi.fn().mockResolvedValue({ id: 'audit-log-id' });
  const mockServerTimestamp = vi.fn().mockReturnValue({ _serverTimestamp: true });
  const mockCollection      = vi.fn().mockReturnValue({ id: 'audit-col' });
  const mockCallable        = vi.fn().mockResolvedValue({ data: { logged: true } });
  const mockHttpsCallable   = vi.fn(() => mockCallable);
  return { mockAddDoc, mockServerTimestamp, mockCollection, mockCallable, mockHttpsCallable };
});

vi.mock('firebase/firestore', () => ({
  addDoc:          mockAddDoc,
  serverTimestamp: mockServerTimestamp,
  collection:      mockCollection,
}));

vi.mock('firebase/functions', () => ({
  httpsCallable: mockHttpsCallable,
}));

vi.mock('../api/firebase/index', () => ({ db: { _isMock: true }, functions: { _isMock: true } }));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

type LogInput = Parameters<typeof AuditService.logAction>[0];

// AuditService.logAction hoje só grava ações de recorrentes (ADD/UPDATE/DELETE_RECURRING)
// client-side — BULK_UPDATE/UNDO_BULK_UPDATE migraram para logTransactionAudit
// (callable server-trusted), ver suíte própria abaixo.
const mkLog = (overrides: Partial<LogInput> = {}): LogInput => ({
  userId:  'user-abc',
  action:  'ADD_RECURRING',
  entity:  'RECURRING_TASK',
  details: 'Aluguel mensal',
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockAddDoc.mockResolvedValue({ id: 'audit-log-id' });
  mockCallable.mockResolvedValue({ data: { logged: true } });
});

// ─── Suite: AuditService.logAction (recorrentes — client-side) ───────────────

describe('AuditService.logAction', () => {
  it('persiste em users/{userId}/audit_logs (path imutável)', async () => {
    await AuditService.logAction(mkLog({ userId: 'uid-xyz' }));
    expect(mockCollection).toHaveBeenCalledWith(
      expect.anything(),  // db instance
      'users',
      'uid-xyz',
      'audit_logs',
    );
  });

  it('injeta createdAt com serverTimestamp no documento (sem drift de cliente)', async () => {
    await AuditService.logAction(mkLog());
    const [, data] = mockAddDoc.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(data.createdAt).toEqual({ _serverTimestamp: true });
  });

  it('fail silent: erro do Firestore não lança exceção para o chamador', async () => {
    mockAddDoc.mockRejectedValueOnce(new Error('Firestore offline'));
    await expect(AuditService.logAction(mkLog())).resolves.toBeUndefined();
  });

  it('userId ausente → retorna sem chamar addDoc', async () => {
    await AuditService.logAction(mkLog({ userId: '' }));
    expect(mockAddDoc).not.toHaveBeenCalled();
  });

  it('grava payload compatível com firestore.rules', async () => {
    const log = mkLog({ action: 'UPDATE_RECURRING', entity: 'RECURRING_TASK' });
    await AuditService.logAction(log);
    const [, data] = mockAddDoc.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(data).toEqual({
      action:        'UPDATE_RECURRING',
      entity:        'RECURRING_TASK',
      details:       log.details,
      createdAt:     { _serverTimestamp: true },
      schemaVersion: 2,
    });
    expect(data).not.toHaveProperty('userId');
    expect(data).not.toHaveProperty('timestamp');
  });
});

// ─── Suite: AuditService.logTransactionAudit (BULK_UPDATE/UNDO_BULK_UPDATE) ──
// Migrado de escrita client-side direta para a callable server-trusted
// `logAuditEvent` (Admin SDK) — P2 hardening 2026-07-02.

type TransactionAuditLogInput = Parameters<typeof AuditService.logTransactionAudit>[0];

const mkTransactionAuditLog = (
  overrides: Partial<TransactionAuditLogInput> = {}
): TransactionAuditLogInput => ({
  action:  'BULK_UPDATE',
  entity:  'TRANSACTION',
  details: 'Alterou 3 categorias para Alimentação',
  metadata: {
    count:   3,
    changes: [
      { id: 'tx1', from: 'Outros', to: 'Alimentação' },
      { id: 'tx2', from: 'Outros', to: 'Alimentação' },
      { id: 'tx3', from: 'Outros', to: 'Alimentação' },
    ],
  },
  ...overrides,
});

describe('AuditService.logTransactionAudit', () => {
  it('chama a callable logAuditEvent com o payload informado', async () => {
    const log = mkTransactionAuditLog();
    await AuditService.logTransactionAudit(log);
    expect(mockHttpsCallable).toHaveBeenCalledWith(expect.anything(), 'logAuditEvent');
    expect(mockCallable).toHaveBeenCalledWith(log);
  });

  it('não escreve diretamente no Firestore (addDoc não é chamado)', async () => {
    await AuditService.logTransactionAudit(mkTransactionAuditLog());
    expect(mockAddDoc).not.toHaveBeenCalled();
  });

  it('fail silent: erro da callable não lança exceção para o chamador', async () => {
    mockCallable.mockRejectedValueOnce(new Error('internal'));
    await expect(
      AuditService.logTransactionAudit(mkTransactionAuditLog())
    ).resolves.toBeUndefined();
  });

  it('metadata.changes preservado integralmente no payload enviado', async () => {
    const changes = [
      { id: 'tx1', from: 'Lazer',  to: 'Saúde' },
      { id: 'tx2', from: 'Outros', to: 'Saúde' },
    ];
    await AuditService.logTransactionAudit(mkTransactionAuditLog({ metadata: { count: 2, changes } }));
    expect(mockCallable).toHaveBeenCalledWith(expect.objectContaining({
      metadata: { count: 2, changes },
    }));
  });

  it('funciona para UNDO_BULK_UPDATE', async () => {
    const log = mkTransactionAuditLog({ action: 'UNDO_BULK_UPDATE' });
    await AuditService.logTransactionAudit(log);
    expect(mockCallable).toHaveBeenCalledWith(expect.objectContaining({ action: 'UNDO_BULK_UPDATE' }));
  });
});

// ─── Suite: AuditService.logTransactionHistory ────────────────────────────────

const mkHistoryEvent = (overrides: Partial<TransactionHistoryEvent> = {}): TransactionHistoryEvent => ({
  action: 'UPDATE',
  txId:   'tx-abc',
  ...overrides,
});

describe('AuditService.logTransactionHistory', () => {
  it('grava em users/{uid}/transactions/{txId}/history (path correto)', async () => {
    await AuditService.logTransactionHistory('uid-xyz', 'tx-abc', mkHistoryEvent());
    expect(mockCollection).toHaveBeenCalledWith(
      expect.anything(),
      'users', 'uid-xyz', 'transactions', 'tx-abc', 'history',
    );
    expect(mockAddDoc).toHaveBeenCalledTimes(1);
  });

  it('payload contém action, txId, createdAt (serverTimestamp) e schemaVersion: 1', async () => {
    await AuditService.logTransactionHistory('u1', 'tx-1', mkHistoryEvent({ action: 'SOFT_DELETE', txId: 'tx-1' }));
    const [, data] = mockAddDoc.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(data['action']).toBe('SOFT_DELETE');
    expect(data['txId']).toBe('tx-1');
    expect(data['createdAt']).toEqual({ _serverTimestamp: true });
    expect(data['schemaVersion']).toBe(1);
  });

  it('payload NÃO contém userId nem uid (path já contém o usuário)', async () => {
    await AuditService.logTransactionHistory('u1', 'tx-1', mkHistoryEvent());
    const [, data] = mockAddDoc.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(data).not.toHaveProperty('userId');
    expect(data).not.toHaveProperty('uid');
  });

  it('preserva before, after, changedFields e origin quando fornecidos', async () => {
    const before = { category: 'Outros', value_cents: 1000 };
    const after  = { category: 'Alimentação', value_cents: 1000 };
    await AuditService.logTransactionHistory('u1', 'tx-2', mkHistoryEvent({
      before,
      after,
      changedFields: ['category'],
      origin: 'manual',
    }));
    const [, data] = mockAddDoc.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(data['before']).toEqual(before);
    expect(data['after']).toEqual(after);
    expect(data['changedFields']).toEqual(['category']);
    expect(data['origin']).toBe('manual');
  });

  it('correlationId e category incluídos quando presentes', async () => {
    const correlationId = 'batch_456_safe_trace';
    await AuditService.logTransactionHistory('u1', 'tx-3', mkHistoryEvent({
      action:        'BULK_UPDATE',
      correlationId,
      category:      'Saúde',
      amount_cents:  5000,
    }));
    const [, data] = mockAddDoc.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(data['correlationId']).toBe(correlationId);
    expect(data['category']).toBe('Saúde');
    expect(data['amount_cents']).toBe(5000);
  });

  it('omite correlationId inseguro em history', async () => {
    await AuditService.logTransactionHistory('u1', 'tx-3', mkHistoryEvent({
      action: 'UPDATE',
      correlationId: 'uid/user-abc/importHash',
    }));
    const [, data] = mockAddDoc.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(data).not.toHaveProperty('correlationId');
  });

  it('omite campos opcionais ausentes (before, after, changedFields, etc.)', async () => {
    await AuditService.logTransactionHistory('u1', 'tx-4', mkHistoryEvent());
    const [, data] = mockAddDoc.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(data).not.toHaveProperty('before');
    expect(data).not.toHaveProperty('after');
    expect(data).not.toHaveProperty('changedFields');
    expect(data).not.toHaveProperty('correlationId');
    expect(data).not.toHaveProperty('reason');
  });

  it('fail silent: erro do Firestore não lança exceção para o chamador', async () => {
    mockAddDoc.mockRejectedValueOnce(new Error('Firestore offline'));
    await expect(
      AuditService.logTransactionHistory('u1', 'tx-1', mkHistoryEvent())
    ).resolves.toBeUndefined();
  });

  it('uid ou txId ausente → retorna sem chamar addDoc', async () => {
    await AuditService.logTransactionHistory('', 'tx-1', mkHistoryEvent());
    await AuditService.logTransactionHistory('u1', '', mkHistoryEvent());
    expect(mockAddDoc).not.toHaveBeenCalled();
  });

  it('schemaVersion é 1 (distinto do audit_logs global que usa 2)', async () => {
    await AuditService.logTransactionHistory('u1', 'tx-1', mkHistoryEvent());
    const [, data] = mockAddDoc.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(data['schemaVersion']).toBe(1);
    expect(data['schemaVersion']).not.toBe(2);
  });
});
