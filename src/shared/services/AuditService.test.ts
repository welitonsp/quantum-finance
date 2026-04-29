import { vi, describe, it, expect, beforeEach } from 'vitest';
import { AuditService } from './AuditService';

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const { mockAddDoc, mockServerTimestamp, mockCollection } = vi.hoisted(() => {
  const mockAddDoc          = vi.fn().mockResolvedValue({ id: 'audit-log-id' });
  const mockServerTimestamp = vi.fn().mockReturnValue({ _serverTimestamp: true });
  const mockCollection      = vi.fn().mockReturnValue({ id: 'audit-col' });
  return { mockAddDoc, mockServerTimestamp, mockCollection };
});

vi.mock('firebase/firestore', () => ({
  addDoc:          mockAddDoc,
  serverTimestamp: mockServerTimestamp,
  collection:      mockCollection,
}));

vi.mock('../api/firebase/index', () => ({ db: { _isMock: true } }));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

type LogInput = Parameters<typeof AuditService.logAction>[0];

const mkLog = (overrides: Partial<LogInput> = {}): LogInput => ({
  userId:   'user-abc',
  action:   'BULK_UPDATE',
  entity:   'TRANSACTION',
  details:  'Alterou 3 categorias para Alimentação',
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

beforeEach(() => {
  vi.clearAllMocks();
  mockAddDoc.mockResolvedValue({ id: 'audit-log-id' });
});

// ─── Suite: AuditService.logAction ────────────────────────────────────────────

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

  it('metadata.changes preservado integralmente para replay', async () => {
    const changes = [
      { id: 'tx1', from: 'Lazer',  to: 'Saúde' },
      { id: 'tx2', from: 'Outros', to: 'Saúde' },
    ];
    await AuditService.logAction(mkLog({ metadata: { count: 2, changes } }));
    const [, data] = mockAddDoc.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(data.metadata).toEqual({ count: 2, changes });
  });

  it('grava payload compatível com firestore.rules', async () => {
    const log = mkLog({ action: 'UNDO_BULK_UPDATE', entity: 'TRANSACTION' });
    await AuditService.logAction(log);
    const [, data] = mockAddDoc.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(data).toEqual({
      action:        'UNDO_BULK_UPDATE',
      entity:        'TRANSACTION',
      details:       log.details,
      metadata:      log.metadata,
      createdAt:     { _serverTimestamp: true },
      schemaVersion: 2,
    });
    expect(data).not.toHaveProperty('userId');
    expect(data).not.toHaveProperty('timestamp');
  });
});
