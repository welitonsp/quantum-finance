import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FirestoreService } from './FirestoreService';
import { toCentavos } from '../types/money';

const {
  mockAddDoc,
  mockBatchCommit,
  mockBatchSet,
  mockBatchUpdate,
  mockCollection,
  mockDoc,
  mockGetDoc,
  mockLedgerImport,
  mockServerTimestamp,
  mockUpdateDoc,
  mockWriteBatch,
} = vi.hoisted(() => {
  const mockAddDoc = vi.fn().mockResolvedValue({ id: 'new-doc-id' });
  const mockBatchCommit = vi.fn().mockResolvedValue(undefined);
  const mockBatchSet = vi.fn();
  const mockBatchUpdate = vi.fn();
  const mockWriteBatch = vi.fn(() => ({
    set: mockBatchSet,
    update: mockBatchUpdate,
    commit: mockBatchCommit,
  }));
  const mockCollection = vi.fn().mockReturnValue({ id: 'mock-col', path: 'mock-col/path' });
  const mockDoc = vi.fn().mockReturnValue({ id: 'mock-doc-id', path: 'mock/path' });
  const mockGetDoc = vi.fn().mockResolvedValue({
    exists: () => true,
    data: () => ({
      type: 'saida',
      source: 'manual',
      value_cents: 1000,
      schemaVersion: 2,
      description: 'Test',
      category: 'Outros',
      date: '2026-01-01',
    }),
  });
  const mockLedgerImport = vi.fn().mockResolvedValue({ added: 1, duplicates: 0, invalid: 0 });
  const mockServerTimestamp = vi.fn().mockReturnValue({ _serverTimestamp: true });
  const mockUpdateDoc = vi.fn().mockResolvedValue(undefined);

  return {
    mockAddDoc,
    mockBatchCommit,
    mockBatchSet,
    mockBatchUpdate,
    mockCollection,
    mockDoc,
    mockGetDoc,
    mockLedgerImport,
    mockServerTimestamp,
    mockUpdateDoc,
    mockWriteBatch,
  };
});

vi.mock('firebase/firestore', () => ({
  addDoc: mockAddDoc,
  collection: mockCollection,
  deleteDoc: vi.fn().mockResolvedValue(undefined),
  doc: mockDoc,
  getDoc: mockGetDoc,
  getDocs: vi.fn().mockResolvedValue({ docs: [] }),
  orderBy: vi.fn(),
  query: vi.fn((collectionRef: unknown) => collectionRef),
  serverTimestamp: mockServerTimestamp,
  updateDoc: mockUpdateDoc,
  writeBatch: mockWriteBatch,
  deleteField: vi.fn().mockReturnValue({ _deleteField: true }),
}));

vi.mock('../api/firebase/index', () => ({ db: { _isMock: true } }));

vi.mock('./LedgerService', () => ({
  LedgerService: {
    importTransactions: mockLedgerImport,
  },
  transactionToLedgerInput: (tx: Record<string, unknown>) => {
    const input: Record<string, unknown> = {};
    if (tx['description'] !== undefined) input['description'] = tx['description'];
    if (tx['value_cents'] !== undefined) input['value_cents'] = tx['value_cents'];
    if (tx['type'] !== undefined) input['type'] = tx['type'];
    if (tx['category'] !== undefined) input['category'] = tx['category'];
    if (tx['date'] !== undefined) input['date'] = tx['date'];
    if (tx['source'] !== undefined) input['source'] = tx['source'];
    return input;
  },
}));

const baseCreate = {
  description: 'Supermercado ABC',
  value_cents: toCentavos(123.45),
  type: 'saida',
  category: 'Alimentação',
  date: '2026-04-01',
  source: 'manual',
} as const;

beforeEach(() => {
  vi.clearAllMocks();
  mockAddDoc.mockResolvedValue({ id: 'new-doc-id' });
  mockBatchCommit.mockResolvedValue(undefined);
  mockLedgerImport.mockResolvedValue({ added: 1, duplicates: 0, invalid: 0 });
});

describe('FirestoreService.saveAllTransactions', () => {
  it('retorna cedo quando uid ou lista estão vazios', async () => {
    expect(await FirestoreService.saveAllTransactions('', [baseCreate])).toEqual({ added: 0, duplicates: 0, invalid: 0 });
    expect(await FirestoreService.saveAllTransactions('uid1', [])).toEqual({ added: 0, duplicates: 0, invalid: 0 });
    expect(mockLedgerImport).not.toHaveBeenCalled();
  });

  it('delega importações financeiras para LedgerService', async () => {
    const result = await FirestoreService.saveAllTransactions('uid1', [baseCreate]);

    expect(result).toEqual({ added: 1, duplicates: 0, invalid: 0 });
    expect(mockLedgerImport).toHaveBeenCalledWith('uid1', [
      expect.objectContaining({
        description: 'Supermercado ABC',
        value_cents: 12345,
        source: 'manual',
      }),
    ]);
    expect(mockAddDoc).not.toHaveBeenCalled();
  });
});

describe('FirestoreService.createManualTransactionWithHistory', () => {
  it('monta batch com transaction + history CREATE/manual sem campos proibidos', async () => {
    const txId = await FirestoreService.createManualTransactionWithHistory('uid1', {
      ...baseCreate,
      id: 'client-id',
      uid: 'forged-uid',
      value: 123.45,
      importHash: 'x'.repeat(64),
      fitId: null,
      tags: ['casa'],
      isRecurring: false,
      account: 'Conta principal',
      accountId: 'account-1',
      cardId: 'card-1',
    });

    expect(txId).toBe('mock-doc-id');
    expect(mockWriteBatch).toHaveBeenCalledTimes(1);
    expect(mockBatchSet).toHaveBeenCalledTimes(2);
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);

    const [, txPayload] = mockBatchSet.mock.calls[0] as [unknown, Record<string, unknown>];
    const [, historyPayload] = mockBatchSet.mock.calls[1] as [unknown, Record<string, unknown>];

    expect(txPayload).toEqual(expect.objectContaining({
      description: 'Supermercado ABC',
      value_cents: 12345,
      type: 'saida',
      category: 'Alimentação',
      date: '2026-04-01',
      source: 'manual',
      schemaVersion: 2,
      fitId: null,
      tags: ['casa'],
      isRecurring: false,
      createdAt: { _serverTimestamp: true },
      updatedAt: { _serverTimestamp: true },
    }));
    expect(txPayload).not.toHaveProperty('id');
    expect(txPayload).not.toHaveProperty('uid');
    expect(txPayload).not.toHaveProperty('value');
    expect(txPayload).not.toHaveProperty('importHash');

    expect(historyPayload).toEqual(expect.objectContaining({
      action: 'CREATE',
      origin: 'manual',
      txId: 'mock-doc-id',
      amount_cents: 12345,
      category: 'Alimentação',
      schemaVersion: 1,
      createdAt: { _serverTimestamp: true },
      changedFields: expect.arrayContaining([
        'description',
        'value_cents',
        'schemaVersion',
        'type',
        'category',
        'date',
        'source',
        'isRecurring',
      ]),
    }));
    expect(historyPayload).not.toHaveProperty('id');
    expect(historyPayload).not.toHaveProperty('uid');
    expect(historyPayload).not.toHaveProperty('value');
    expect(historyPayload).not.toHaveProperty('importHash');
    expect(historyPayload['after']).toEqual(expect.objectContaining({
      description: 'Supermercado ABC',
      value_cents: 12345,
      type: 'saida',
      category: 'Alimentação',
      date: '2026-04-01',
      source: 'manual',
      schemaVersion: 2,
      isRecurring: false,
    }));
  });
});

describe('FirestoreService.updateTransaction', () => {
  it('aceita contrato persistente opcional de conciliação', async () => {
    const reconciledAt = { _serverTimestamp: true };

    await FirestoreService.updateTransaction('uid1', 'tx-reconciled', {
      reconciliationStatus: 'reconciled',
      reconciliationSource: 'import',
      reconciledAt,
      reconciledBy: 'uid1',
    });

    const [, data] = mockUpdateDoc.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(data).toEqual(expect.objectContaining({
      reconciliationStatus: 'reconciled',
      reconciliationSource: 'import',
      reconciledAt,
      reconciledBy: 'uid1',
      updatedAt: { _serverTimestamp: true },
    }));
    expect(data['value']).toEqual({ _deleteField: true });
    expect(data['id']).toEqual({ _deleteField: true });
    expect(data['uid']).toEqual({ _deleteField: true });
  });
});

describe('FirestoreService.deleteBatchTransactions', () => {
  it('usa soft delete em lote para transações financeiras', async () => {
    await FirestoreService.deleteBatchTransactions('uid1', ['tx-a', 'tx-b']);

    expect(mockGetDoc).toHaveBeenCalledTimes(2);
    expect(mockBatchUpdate).toHaveBeenCalledTimes(2);
    expect(mockBatchUpdate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      isDeleted: true,
      deletedAt: { _serverTimestamp: true },
      updatedAt: { _serverTimestamp: true },
      schemaVersion: 2,
      type: 'saida',
      source: 'manual',
    }));
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);
  });

  it('ignora documentos que não existem no lote', async () => {
    mockGetDoc.mockResolvedValueOnce({ exists: () => false, data: () => ({}) });
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ type: 'entrada', source: 'csv', value_cents: 500, schemaVersion: 2, description: 'T', category: 'Outros', date: '2026-01-01' }),
    });

    await FirestoreService.deleteBatchTransactions('uid1', ['tx-missing', 'tx-exists']);

    expect(mockBatchUpdate).toHaveBeenCalledTimes(1);
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);
  });
});
