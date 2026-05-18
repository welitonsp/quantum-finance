import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FirestoreService } from './FirestoreService';
import { toCentavos } from '../types/money';
import type { Transaction } from '../types/transaction';

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
  mockWriteBatch,
} = vi.hoisted(() => {
  const getMockPath = (value: unknown): string => {
    if (value && typeof value === 'object' && 'path' in value && typeof value.path === 'string') {
      return value.path;
    }
    return 'mock/path';
  };

  const mockAddDoc = vi.fn().mockResolvedValue({ id: 'new-doc-id' });
  const mockBatchCommit = vi.fn().mockResolvedValue(undefined);
  const mockBatchSet = vi.fn();
  const mockBatchUpdate = vi.fn();
  const mockWriteBatch = vi.fn(() => ({
    set: mockBatchSet,
    update: mockBatchUpdate,
    commit: mockBatchCommit,
  }));
  const mockCollection = vi.fn((...args: unknown[]) => ({
    id: String(args[args.length - 1] ?? 'mock-col'),
    path: args.map(String).join('/'),
  }));
  const mockDoc = vi.fn((parent: unknown, explicitId?: string) => {
    const id = explicitId ?? 'mock-doc-id';
    const parentPath = getMockPath(parent);
    return { id, path: `${parentPath}/${id}` };
  });
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

const manualCreateAfter = {
  description: 'Supermercado ABC',
  value_cents: 12345,
  schemaVersion: 2,
  type: 'saida',
  category: 'Alimentação',
  date: '2026-04-01',
  source: 'manual',
  isRecurring: false,
} as const;

const manualCreateChangedFields = [
  'description',
  'value_cents',
  'schemaVersion',
  'type',
  'category',
  'date',
  'source',
  'isRecurring',
];

function existingSnap(data: Record<string, unknown> | undefined) {
  return {
    exists: () => data !== undefined,
    data: () => data ?? {},
  };
}

function compatibleManualTransaction(overrides: Record<string, unknown> = {}) {
  return {
    ...manualCreateAfter,
    createdAt: { seconds: 1 },
    updatedAt: { seconds: 1 },
    ...overrides,
  };
}

function compatibleManualHistory(txId: string, overrides: Record<string, unknown> = {}) {
  return {
    action: 'CREATE',
    txId,
    createdAt: { seconds: 1 },
    schemaVersion: 1,
    origin: 'manual',
    amount_cents: 12345,
    category: 'Alimentação',
    after: manualCreateAfter,
    changedFields: manualCreateChangedFields,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAddDoc.mockResolvedValue({ id: 'new-doc-id' });
  mockBatchCommit.mockResolvedValue(undefined);
  mockGetDoc.mockResolvedValue(existingSnap(compatibleManualTransaction()));
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
    }, 'tx-stable-1');

    expect(txId).toBe('tx-stable-1');
    expect(mockWriteBatch).toHaveBeenCalledTimes(1);
    expect(mockBatchSet).toHaveBeenCalledTimes(2);
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);

    const [txRef, txPayload] = mockBatchSet.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>];
    const [historyRef, historyPayload] = mockBatchSet.mock.calls[1] as [Record<string, unknown>, Record<string, unknown>];

    expect(txRef).toEqual(expect.objectContaining({ id: 'tx-stable-1' }));
    expect(historyRef).toEqual(expect.objectContaining({ id: 'create' }));

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
      txId: 'tx-stable-1',
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

  it('retorna sucesso com txId fornecido quando commit é ambíguo mas transaction + history já existem compatíveis', async () => {
    const ambiguousError = Object.assign(new Error('deadline exceeded after commit'), {
      code: 'deadline-exceeded',
    });
    mockBatchCommit.mockRejectedValueOnce(ambiguousError);
    mockGetDoc
      .mockResolvedValueOnce(existingSnap(compatibleManualTransaction()))
      .mockResolvedValueOnce(existingSnap(compatibleManualHistory('tx-stable-1')));

    await expect(FirestoreService.createManualTransactionWithHistory(
      'uid1',
      baseCreate,
      'tx-stable-1',
    )).resolves.toBe('tx-stable-1');

    expect(mockBatchCommit).toHaveBeenCalledTimes(1);
    expect(mockGetDoc).toHaveBeenCalledTimes(2);
  });

  it('propaga erro ambíguo quando transaction existente diverge do payload canônico', async () => {
    const ambiguousError = Object.assign(new Error('deadline exceeded after commit'), {
      code: 'deadline-exceeded',
    });
    mockBatchCommit.mockRejectedValueOnce(ambiguousError);
    mockGetDoc
      .mockResolvedValueOnce(existingSnap(compatibleManualTransaction({ value_cents: 9999 })))
      .mockResolvedValueOnce(existingSnap(compatibleManualHistory('tx-stable-1')));

    await expect(FirestoreService.createManualTransactionWithHistory(
      'uid1',
      baseCreate,
      'tx-stable-1',
    )).rejects.toThrow('deadline exceeded after commit');
  });

  it('propaga erro ambíguo quando history/create esperado está ausente', async () => {
    const ambiguousError = Object.assign(new Error('deadline exceeded after commit'), {
      code: 'deadline-exceeded',
    });
    mockBatchCommit.mockRejectedValueOnce(ambiguousError);
    mockGetDoc
      .mockResolvedValueOnce(existingSnap(compatibleManualTransaction()))
      .mockResolvedValueOnce(existingSnap(undefined));

    await expect(FirestoreService.createManualTransactionWithHistory(
      'uid1',
      baseCreate,
      'tx-stable-1',
    )).rejects.toThrow('deadline exceeded after commit');
  });
});

describe('FirestoreService.updateTransactionWithHistory', () => {
  it('monta batch com transaction update + history UPDATE sem campos proibidos', async () => {
    const historyEvent = {
      before: {
        id: 'tx-forged',
        uid: 'uid-forged',
        value: 20,
        importHash: 'x'.repeat(64),
        description: 'Antigo',
        category: 'Outros',
      },
      after: {
        id: 'tx-forged',
        uid: 'uid-forged',
        value: 20,
        importHash: 'x'.repeat(64),
        description: 'Novo',
        category: 'Alimentação',
        value_cents: 2000,
      },
      changedFields: ['description', 'category', 'value_cents'],
      amount_cents: 2000,
      category: 'Alimentação',
    };

    await FirestoreService.updateTransactionWithHistory('uid1', 'tx-1', {
      description: 'Novo',
      category: 'Alimentação',
      value_cents: 2000,
    }, historyEvent);

    expect(mockWriteBatch).toHaveBeenCalledTimes(1);
    expect(mockBatchUpdate).toHaveBeenCalledTimes(1);
    expect(mockBatchSet).toHaveBeenCalledTimes(1);
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);

    const [txRef, txPayload] = mockBatchUpdate.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>];
    const [historyRef, historyPayload] = mockBatchSet.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>];

    expect(txRef).toEqual(expect.objectContaining({ id: 'tx-1' }));
    expect(historyRef).toEqual(expect.objectContaining({ id: 'mock-doc-id' }));

    expect(txPayload).toEqual(expect.objectContaining({
      description: 'Novo',
      category: 'Alimentação',
      value_cents: 2000,
      updatedAt: { _serverTimestamp: true },
    }));
    expect(txPayload['uid']).toEqual({ _deleteField: true });
    expect(txPayload['id']).toEqual({ _deleteField: true });
    expect(txPayload['value']).toEqual({ _deleteField: true });

    expect(historyPayload).toEqual(expect.objectContaining({
      action: 'UPDATE',
      origin: 'manual',
      txId: 'tx-1',
      amount_cents: 2000,
      category: 'Alimentação',
      schemaVersion: 1,
      createdAt: { _serverTimestamp: true },
      before: { description: 'Antigo', category: 'Outros' },
      after: { description: 'Novo', category: 'Alimentação', value_cents: 2000 },
      changedFields: ['description', 'category', 'value_cents'],
    }));
    for (const forbidden of ['id', 'uid', 'value', 'importHash']) {
      expect(historyPayload['before']).not.toHaveProperty(forbidden);
      expect(historyPayload['after']).not.toHaveProperty(forbidden);
    }
  });

  it('usa origin manual por padrão quando origin não é informada', async () => {
    await FirestoreService.updateTransactionWithHistory('uid1', 'tx-1', { category: 'Alimentação' }, {
      before: { category: 'Outros' },
      after: { category: 'Alimentação' },
      changedFields: ['category'],
      amount_cents: 1500,
      category: 'Alimentação',
    });
    const [, historyPayload] = mockBatchSet.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>];
    expect(historyPayload['origin']).toBe('manual');
  });

  it('usa origin ai quando informada e preserva amount_cents e sanitiza snapshots', async () => {
    await FirestoreService.updateTransactionWithHistory('uid1', 'tx-1', { category: 'Alimentação' }, {
      before: { category: 'Outros', id: 'tx-forged', uid: 'uid-x', value: 10, importHash: 'abc' },
      after: { category: 'Alimentação', id: 'tx-forged', uid: 'uid-x', value: 10, importHash: 'abc' },
      changedFields: ['category'],
      origin: 'ai',
      amount_cents: 1500,
      category: 'Alimentação',
    });
    const [, historyPayload] = mockBatchSet.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>];
    expect(historyPayload['origin']).toBe('ai');
    expect(historyPayload['amount_cents']).toBe(1500);
    for (const forbidden of ['id', 'uid', 'value', 'importHash']) {
      expect(historyPayload['before']).not.toHaveProperty(forbidden);
      expect(historyPayload['after']).not.toHaveProperty(forbidden);
    }
  });

  it('usa origin reconcile quando informada (fluxo de reconciliação de importação)', async () => {
    await FirestoreService.updateTransactionWithHistory('uid1', 'tx-1', {
      category: 'Alimentação',
      reconciliationStatus: 'reconciled',
      reconciliationSource: 'import',
    }, {
      before: { category: 'Outros' },
      after: { category: 'Alimentação', reconciliationStatus: 'reconciled', reconciliationSource: 'import' },
      changedFields: ['category', 'reconciliationStatus', 'reconciliationSource'],
      origin: 'reconcile',
      amount_cents: 2000,
      category: 'Alimentação',
    });
    const [, historyPayload] = mockBatchSet.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>];
    expect(historyPayload['origin']).toBe('reconcile');
    expect(historyPayload['amount_cents']).toBe(2000);
    for (const forbidden of ['id', 'uid', 'value', 'importHash']) {
      expect(historyPayload['before']).not.toHaveProperty(forbidden);
      expect(historyPayload['after']).not.toHaveProperty(forbidden);
    }
  });

  it('rejeita quando o commit do batch falha', async () => {
    mockBatchCommit.mockRejectedValueOnce(new Error('batch failed'));

    await expect(FirestoreService.updateTransactionWithHistory('uid1', 'tx-1', {
      description: 'Novo',
      category: 'Alimentação',
      value_cents: 2000,
    }, {
      before: { description: 'Antigo', category: 'Outros' },
      after: { description: 'Novo', category: 'Alimentação', value_cents: 2000 },
      changedFields: ['description', 'category', 'value_cents'],
      amount_cents: 2000,
      category: 'Alimentação',
    })).rejects.toThrow('batch failed');

    expect(mockWriteBatch).toHaveBeenCalledTimes(1);
    expect(mockBatchUpdate).toHaveBeenCalledTimes(1);
    expect(mockBatchSet).toHaveBeenCalledTimes(1);
  });

  it('inclui _lastOpId no payload da transaction igual ao id do historyRef', async () => {
    await FirestoreService.updateTransactionWithHistory('uid1', 'tx-1', {
      category: 'Alimentação',
    }, {
      before: { category: 'Outros' },
      after: { category: 'Alimentação' },
      changedFields: ['category'],
    });

    const [, txPayload] = mockBatchUpdate.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>];
    const [historyRef] = mockBatchSet.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>];

    expect(txPayload['_lastOpId']).toBeDefined();
    expect(txPayload['_lastOpId']).toBe((historyRef as { id: string }).id);
    expect(txPayload['_lastOpId']).toBe('mock-doc-id');
  });

  it('repara shape legado seguro no update individual sem alterar importHash nem reintroduzir value', async () => {
    await FirestoreService.updateTransactionWithHistory('uid1', 'tx-legacy', {
      category: 'Alimentação',
    }, {
      before: {
        category: 'Outros',
        type: 'despesa',
        source: 'csv',
        schemaVersion: 1,
        value_cents: 1234,
        importHash: 'x'.repeat(64),
        value: 12.34,
      },
      after: { category: 'Alimentação', type: 'saida', source: 'csv', schemaVersion: 2, value_cents: 1234 },
      changedFields: ['category', 'type', 'schemaVersion'],
    });

    const [, txPayload] = mockBatchUpdate.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>];

    expect(txPayload).toEqual(expect.objectContaining({
      category: 'Alimentação',
      type: 'saida',
      source: 'csv',
      schemaVersion: 2,
      value_cents: 1234,
      _lastOpId: 'mock-doc-id',
    }));
    expect(txPayload['value']).toEqual({ _deleteField: true });
    expect(txPayload).not.toHaveProperty('importHash');
  });

  it('_lastOpId não interfere com importHash: importHash não aparece no updatePayload', async () => {
    await FirestoreService.updateTransactionWithHistory('uid1', 'tx-1', {
      category: 'Alimentação',
    }, {
      before: { category: 'Outros', importHash: 'x'.repeat(64) },
      after: { category: 'Alimentação' },
      changedFields: ['category'],
    });

    const [, txPayload] = mockBatchUpdate.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>];
    expect(txPayload).not.toHaveProperty('importHash');
    expect(txPayload['_lastOpId']).toBe('mock-doc-id');
  });

  it('_lastOpId está presente com origin manual padrão', async () => {
    await FirestoreService.updateTransactionWithHistory('uid1', 'tx-1', {
      description: 'Teste',
    }, {
      before: { description: 'Antigo' },
      after: { description: 'Teste' },
      changedFields: ['description'],
    });

    const [, txPayload] = mockBatchUpdate.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>];
    const [, historyPayload] = mockBatchSet.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>];
    expect(txPayload['_lastOpId']).toBe('mock-doc-id');
    expect(historyPayload['origin']).toBe('manual');
  });

  it('_lastOpId está presente com origin ai', async () => {
    await FirestoreService.updateTransactionWithHistory('uid1', 'tx-1', {
      category: 'Saúde',
    }, {
      before: { category: 'Outros' },
      after: { category: 'Saúde' },
      changedFields: ['category'],
      origin: 'ai',
    });

    const [, txPayload] = mockBatchUpdate.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>];
    const [, historyPayload] = mockBatchSet.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>];
    expect(txPayload['_lastOpId']).toBe('mock-doc-id');
    expect(historyPayload['origin']).toBe('ai');
  });
});

describe('FirestoreService.softDeleteTransactionWithHistory', () => {
  it('monta batch com soft delete + history SOFT_DELETE sem campos proibidos', async () => {
    mockGetDoc.mockResolvedValueOnce(existingSnap({
      description:   'Compra a apagar',
      value:         20.34,
      value_cents:   0,
      schemaVersion: 2,
      type:          'saida',
      category:      'Outros',
      date:          '2026-05-02',
      source:        'manual',
      createdAt:     { seconds: 1 },
      updatedAt:     { seconds: 1 },
      importHash:    'x'.repeat(64),
    }));

    await FirestoreService.softDeleteTransactionWithHistory('uid1', 'tx-delete-1', {
      before: {
        id:          'tx-delete-1',
        uid:         'uid1',
        value:       20.34,
        importHash:  'x'.repeat(64),
        description: 'Compra a apagar',
        value_cents: 2034,
        category:    'Outros',
      },
      amount_cents: 2034,
      category:     'Outros',
    });

    expect(mockWriteBatch).toHaveBeenCalledTimes(1);
    expect(mockBatchUpdate).toHaveBeenCalledTimes(1);
    expect(mockBatchSet).toHaveBeenCalledTimes(1);
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);

    const [txRef, txPayload] = mockBatchUpdate.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>];
    const [historyRef, historyPayload] = mockBatchSet.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>];

    expect(txRef).toEqual(expect.objectContaining({ id: 'tx-delete-1' }));
    expect(historyRef).toEqual(expect.objectContaining({ id: 'mock-doc-id' }));

    expect(txPayload).toEqual(expect.objectContaining({
      isDeleted:     true,
      deletedAt:     { _serverTimestamp: true },
      updatedAt:     { _serverTimestamp: true },
      schemaVersion: 2,
      type:          'saida',
      source:        'manual',
      value_cents:   2034,
    }));
    expect(txPayload['uid']).toEqual({ _deleteField: true });
    expect(txPayload['id']).toEqual({ _deleteField: true });
    expect(txPayload['value']).toEqual({ _deleteField: true });
    expect(txPayload).not.toHaveProperty('importHash');

    expect(historyPayload).toEqual(expect.objectContaining({
      action:       'SOFT_DELETE',
      origin:       'manual',
      txId:         'tx-delete-1',
      amount_cents: 2034,
      category:     'Outros',
      schemaVersion: 1,
      createdAt:    { _serverTimestamp: true },
      before: {
        description: 'Compra a apagar',
        value_cents: 2034,
        category:    'Outros',
      },
    }));
    for (const forbidden of ['id', 'uid', 'value', 'importHash']) {
      expect(historyPayload['before']).not.toHaveProperty(forbidden);
    }
  });

  it('rejeita quando o commit do batch falha', async () => {
    mockBatchCommit.mockRejectedValueOnce(new Error('batch failed'));

    await expect(FirestoreService.softDeleteTransactionWithHistory('uid1', 'tx-delete-1', {
      before: { description: 'Compra a apagar', value_cents: 1000, category: 'Outros' },
      amount_cents: 1000,
      category: 'Outros',
    })).rejects.toThrow('batch failed');

    expect(mockWriteBatch).toHaveBeenCalledTimes(1);
    expect(mockBatchUpdate).toHaveBeenCalledTimes(1);
    expect(mockBatchSet).toHaveBeenCalledTimes(1);
  });

  it('inclui _lastOpId no updatePayload do soft delete igual ao id do historyRef', async () => {
    await FirestoreService.softDeleteTransactionWithHistory('uid1', 'tx-delete-1', {
      before: { description: 'Compra a apagar', value_cents: 1000, category: 'Outros' },
      amount_cents: 1000,
      category: 'Outros',
    });

    const [, txPayload] = mockBatchUpdate.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>];
    const [historyRef] = mockBatchSet.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>];

    expect(txPayload['_lastOpId']).toBeDefined();
    expect(txPayload['_lastOpId']).toBe((historyRef as { id: string }).id);
    expect(txPayload['_lastOpId']).toBe('mock-doc-id');
  });

  it('soft delete mantém action SOFT_DELETE, origin manual e não vaza importHash no updatePayload', async () => {
    mockGetDoc.mockResolvedValueOnce(existingSnap({
      description: 'Compra',
      value_cents: 500,
      schemaVersion: 2,
      type: 'saida',
      category: 'Outros',
      date: '2026-01-01',
      source: 'manual',
      importHash: 'x'.repeat(64),
    }));

    await FirestoreService.softDeleteTransactionWithHistory('uid1', 'tx-delete-1', {
      before: { description: 'Compra', value_cents: 500, importHash: 'x'.repeat(64) },
      amount_cents: 500,
    });

    const [, txPayload] = mockBatchUpdate.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>];
    const [, historyPayload] = mockBatchSet.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>];

    expect(txPayload).not.toHaveProperty('importHash');
    expect(txPayload['_lastOpId']).toBe('mock-doc-id');
    expect(historyPayload['action']).toBe('SOFT_DELETE');
    expect(historyPayload['origin']).toBe('manual');
  });
});

describe('FirestoreService.deleteBatchTransactionsWithHistory', () => {
  it('grava transaction update + history SOFT_DELETE atômico em lote', async () => {
    const txA = { id: 'tx-a', value_cents: 1000, category: 'Lazer', description: 'Cinema', type: 'saida', date: '2026-05-12' } as Transaction;
    const txB = { id: 'tx-b', value_cents: 2000, category: 'Saúde', description: 'Médico', type: 'saida', date: '2026-05-12' } as Transaction;

    await FirestoreService.deleteBatchTransactionsWithHistory('uid1', [txA, txB]);

    expect(mockWriteBatch).toHaveBeenCalledTimes(1);
    expect(mockBatchUpdate).toHaveBeenCalledTimes(2);
    expect(mockBatchSet).toHaveBeenCalledTimes(2);
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);

    const [txRefA, txPayloadA] = mockBatchUpdate.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>];
    const [histRefA, histPayloadA] = mockBatchSet.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>];

    expect(txRefA['id']).toBe('tx-a');
    expect(txPayloadA['isDeleted']).toBe(true);
    expect(txPayloadA['deletedAt']).toEqual({ _serverTimestamp: true });

    expect(String(histRefA['path'])).toContain('tx-a/history');
    expect(histPayloadA).toEqual(expect.objectContaining({
      action: 'SOFT_DELETE',
      txId: 'tx-a',
      amount_cents: 1000,
      category: 'Lazer',
      origin: 'manual',
    }));
    const histBefore = histPayloadA['before'] as Record<string, unknown>;
    expect(histBefore).not.toHaveProperty('id');
    expect(histBefore['description']).toBe('Cinema');
  });

  it('respeita o chunk máximo de 240 transações (gera múltiplos commits)', async () => {
    const manyTxs = Array.from({ length: 241 }, (_, i) => ({
      id: `tx-${i}`,
      value_cents: 100,
      category: 'Teste',
      description: `Desc ${i}`,
      type: 'saida',
      date: '2026-05-12'
    } as Transaction));

    await FirestoreService.deleteBatchTransactionsWithHistory('uid1', manyTxs);

    // 241 itens:
    // Batch 1: 240 transações (240 updates + 240 sets = 480 writes)
    // Batch 2: 1 transação (1 update + 1 set = 2 writes)
    expect(mockBatchCommit).toHaveBeenCalledTimes(2);
    expect(mockBatchUpdate).toHaveBeenCalledTimes(241);
    expect(mockBatchSet).toHaveBeenCalledTimes(241);
  });

  it('inclui _lastOpId em cada updatePayload do delete batch, pareado com historyRef', async () => {
    const txA = { id: 'tx-a', value_cents: 1000, category: 'Lazer', description: 'Cinema', type: 'saida', date: '2026-05-12' } as Transaction;
    const txB = { id: 'tx-b', value_cents: 2000, category: 'Saúde', description: 'Médico', type: 'saida', date: '2026-05-12' } as Transaction;

    await FirestoreService.deleteBatchTransactionsWithHistory('uid1', [txA, txB]);

    const [, txPayloadA] = mockBatchUpdate.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>];
    const [, txPayloadB] = mockBatchUpdate.mock.calls[1] as [Record<string, unknown>, Record<string, unknown>];
    const [histRefA] = mockBatchSet.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>];
    const [histRefB] = mockBatchSet.mock.calls[1] as [Record<string, unknown>, Record<string, unknown>];

    expect(txPayloadA['_lastOpId']).toBeDefined();
    expect(txPayloadA['_lastOpId']).toBe((histRefA as { id: string }).id);

    expect(txPayloadB['_lastOpId']).toBeDefined();
    expect(txPayloadB['_lastOpId']).toBe((histRefB as { id: string }).id);
  });

  it('delete batch não vaza importHash no updatePayload', async () => {
    const txWithHash = {
      id: 'tx-hash',
      value_cents: 1500,
      category: 'Outros',
      description: 'Importada',
      type: 'saida',
      date: '2026-01-01',
      importHash: 'x'.repeat(64),
    } as Transaction;

    await FirestoreService.deleteBatchTransactionsWithHistory('uid1', [txWithHash]);

    const [, txPayload] = mockBatchUpdate.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>];
    expect(txPayload).not.toHaveProperty('importHash');
    expect(txPayload['_lastOpId']).toBe('mock-doc-id');
  });

  it('delete batch mantém action SOFT_DELETE e origin manual', async () => {
    const tx = { id: 'tx-c', value_cents: 500, category: 'Transporte', description: 'Ônibus', type: 'saida', date: '2026-01-01' } as Transaction;

    await FirestoreService.deleteBatchTransactionsWithHistory('uid1', [tx]);

    const [, historyPayload] = mockBatchSet.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>];
    expect(historyPayload['action']).toBe('SOFT_DELETE');
    expect(historyPayload['origin']).toBe('manual');
  });

  it('delete batch mantém chunking: 241 itens geram 2 commits com _lastOpId em todos', async () => {
    const manyTxs = Array.from({ length: 241 }, (_, i) => ({
      id: `tx-${i}`,
      value_cents: 100,
      category: 'Teste',
      description: `Desc ${i}`,
      type: 'saida',
      date: '2026-05-12',
    } as Transaction));

    await FirestoreService.deleteBatchTransactionsWithHistory('uid1', manyTxs);

    expect(mockBatchCommit).toHaveBeenCalledTimes(2);
    expect(mockBatchUpdate).toHaveBeenCalledTimes(241);
    expect(mockBatchSet).toHaveBeenCalledTimes(241);

    // verifica _lastOpId nos primeiros e no último item
    const firstPayload = (mockBatchUpdate.mock.calls[0] as [unknown, Record<string, unknown>])[1];
    const lastPayload = (mockBatchUpdate.mock.calls[240] as [unknown, Record<string, unknown>])[1];
    expect(firstPayload['_lastOpId']).toBeDefined();
    expect(lastPayload['_lastOpId']).toBeDefined();
  });
});

describe('FirestoreService.batchUpdateTransactionsWithHistory', () => {
  it('grava transaction update + history BULK_UPDATE atômico em lote', async () => {
    const snap = [
      {
        id: 'tx-1',
        oldCategory: 'Outros',
        before: {
          id: 'client-id',
          uid: 'u1',
          value: 10,
          importHash: 'x'.repeat(64),
          value_cents: 1000,
          category: 'Outros',
          description: 'T1',
        },
      },
      { id: 'tx-2', oldCategory: 'Lazer' }
    ];
    const updates = { category: 'Alimentação' };
    const correlationId = 'corr-123';

    await FirestoreService.batchUpdateTransactionsWithHistory('uid1', snap, updates, correlationId);

    expect(mockWriteBatch).toHaveBeenCalledTimes(1);
    expect(mockBatchUpdate).toHaveBeenCalledTimes(2);
    expect(mockBatchSet).toHaveBeenCalledTimes(2);
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);

    const [txRef1, txPayload1] = mockBatchUpdate.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>];
    const [histRef1, histPayload1] = mockBatchSet.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>];

    expect(txRef1['id']).toBe('tx-1');
    expect(txPayload1['category']).toBe('Alimentação');
    expect(txPayload1['updatedAt']).toEqual({ _serverTimestamp: true });
    expect(txPayload1['uid']).toEqual({ _deleteField: true });
    expect(txPayload1['id']).toEqual({ _deleteField: true });
    expect(txPayload1['value']).toEqual({ _deleteField: true });
    expect(txPayload1).not.toHaveProperty('importHash');

    expect(String(histRef1['path'])).toContain('tx-1/history');
    expect(histPayload1).toEqual(expect.objectContaining({
      action: 'BULK_UPDATE',
      origin: 'bulk',
      txId: 'tx-1',
      correlationId: 'corr-123',
      amount_cents: 1000,
      category: 'Alimentação',
      schemaVersion: 1,
      changedFields: ['category'],
    }));

    const before1 = histPayload1['before'] as Record<string, unknown>;
    const after1 = histPayload1['after'] as Record<string, unknown>;

    expect(before1['category']).toBe('Outros');
    expect(after1['category']).toBe('Alimentação');
    for (const forbidden of ['id', 'uid', 'value', 'importHash']) {
      expect(before1).not.toHaveProperty(forbidden);
      expect(after1).not.toHaveProperty(forbidden);
    }
  });

  it('repara shape legado seguro no bulk update antes de enviar category', async () => {
    const snap = [{
      id: 'tx-legacy',
      oldCategory: 'Outros',
      before: {
        category: 'Outros',
        type: 'despesa',
        source: 'csv',
        schemaVersion: 1,
        value_cents: 1234,
        importHash: 'x'.repeat(64),
        value: 12.34,
      },
    }];

    await FirestoreService.batchUpdateTransactionsWithHistory('uid1', snap, { category: 'Alimentação' }, 'corr-legacy');

    const [, txPayload] = mockBatchUpdate.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>];
    const [, histPayload] = mockBatchSet.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>];
    const after = histPayload['after'] as Record<string, unknown>;

    expect(txPayload).toEqual(expect.objectContaining({
      category: 'Alimentação',
      type: 'saida',
      source: 'csv',
      schemaVersion: 2,
      value_cents: 1234,
      _lastOpId: 'mock-doc-id',
    }));
    expect(txPayload['value']).toEqual({ _deleteField: true });
    expect(txPayload).not.toHaveProperty('importHash');
    expect(histPayload['changedFields']).toEqual(['category']);
    expect(after).toEqual(expect.objectContaining({
      category: 'Alimentação',
      type: 'saida',
      source: 'csv',
      schemaVersion: 2,
      value_cents: 1234,
    }));
    expect(after).not.toHaveProperty('importHash');
    expect(after).not.toHaveProperty('value');
  });

  it('não cria amount_cents a partir de value legado nem de value_cents inválido', async () => {
    const invalidValues = [100.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, -1];

    for (const value_cents of invalidValues) {
      vi.clearAllMocks();
      mockBatchCommit.mockResolvedValue(undefined);

      await FirestoreService.batchUpdateTransactionsWithHistory('uid1', [
        {
          id: `tx-invalid-${String(value_cents)}`,
          oldCategory: 'Outros',
          before: {
            category: 'Outros',
            value: 9999,
            value_cents,
          },
        },
      ], { category: 'Alimentação' }, 'corr-invalid');

      const [, histPayload] = mockBatchSet.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>];
      const before = histPayload['before'] as Record<string, unknown>;
      const after = histPayload['after'] as Record<string, unknown>;

      expect(histPayload).not.toHaveProperty('amount_cents');
      expect(before).not.toHaveProperty('value');
      expect(after).not.toHaveProperty('value');
    }
  });

  it('respeita o chunk máximo de 240 transações (gera múltiplos commits)', async () => {
    const manyItems = Array.from({ length: 241 }, (_, i) => ({
      id: `tx-${i}`,
      oldCategory: 'Outros',
      before: { value_cents: 100, category: 'Outros', description: `D${i}` }
    }));

    await FirestoreService.batchUpdateTransactionsWithHistory('uid1', manyItems, { category: 'X' }, 'c-1');

    // 241 itens:
    // Batch 1: 240 transações (240 updates + 240 sets = 480 writes)
    // Batch 2: 1 transação (1 update + 1 set = 2 writes)
    expect(mockBatchCommit).toHaveBeenCalledTimes(2);
    expect(mockBatchUpdate).toHaveBeenCalledTimes(241);
    expect(mockBatchSet).toHaveBeenCalledTimes(241);
  });

  it('inclui _lastOpId em cada updatePayload do bulk update, pareado com historyRef', async () => {
    const snap = [
      { id: 'tx-a', oldCategory: 'Outros', before: { category: 'Outros', value_cents: 500 } },
      { id: 'tx-b', oldCategory: 'Lazer',  before: { category: 'Lazer',  value_cents: 800 } },
    ];

    await FirestoreService.batchUpdateTransactionsWithHistory('uid1', snap, { category: 'Alimentação' }, 'corr-xyz');

    const [, payloadA] = mockBatchUpdate.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>];
    const [, payloadB] = mockBatchUpdate.mock.calls[1] as [Record<string, unknown>, Record<string, unknown>];
    const [histRefA] = mockBatchSet.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>];
    const [histRefB] = mockBatchSet.mock.calls[1] as [Record<string, unknown>, Record<string, unknown>];

    expect(payloadA['_lastOpId']).toBeDefined();
    expect(payloadA['_lastOpId']).toBe((histRefA as { id: string }).id);

    expect(payloadB['_lastOpId']).toBeDefined();
    expect(payloadB['_lastOpId']).toBe((histRefB as { id: string }).id);
  });

  it('bulk update mantém action BULK_UPDATE, origin bulk, correlationId e não vaza importHash', async () => {
    const snap = [{
      id: 'tx-1',
      oldCategory: 'Outros',
      before: { category: 'Outros', value_cents: 1000, importHash: 'x'.repeat(64) },
    }];

    await FirestoreService.batchUpdateTransactionsWithHistory('uid1', snap, { category: 'Saúde' }, 'corr-abc');

    const [, txPayload] = mockBatchUpdate.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>];
    const [, histPayload] = mockBatchSet.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>];

    expect(txPayload).not.toHaveProperty('importHash');
    expect(txPayload['_lastOpId']).toBe('mock-doc-id');
    expect(histPayload['action']).toBe('BULK_UPDATE');
    expect(histPayload['origin']).toBe('bulk');
    expect(histPayload['correlationId']).toBe('corr-abc');
  });

  it('bulk update mantém chunking: 241 itens geram 2 commits e _lastOpId está em todos', async () => {
    const manyItems = Array.from({ length: 241 }, (_, i) => ({
      id: `tx-${i}`,
      oldCategory: 'Outros',
      before: { value_cents: 100, category: 'Outros' },
    }));

    await FirestoreService.batchUpdateTransactionsWithHistory('uid1', manyItems, { category: 'X' }, 'c-chunk');

    expect(mockBatchCommit).toHaveBeenCalledTimes(2);
    expect(mockBatchUpdate).toHaveBeenCalledTimes(241);
    expect(mockBatchSet).toHaveBeenCalledTimes(241);

    const firstPayload = (mockBatchUpdate.mock.calls[0] as [unknown, Record<string, unknown>])[1];
    const lastPayload  = (mockBatchUpdate.mock.calls[240] as [unknown, Record<string, unknown>])[1];
    expect(firstPayload['_lastOpId']).toBeDefined();
    expect(lastPayload['_lastOpId']).toBeDefined();
  });
});

describe('FirestoreService.batchUndoBulkUpdateTransactionsWithHistory', () => {
  it('grava transaction update + history UNDO_BULK_UPDATE atômico em lote', async () => {
    const snapshot = [
      {
        id: 'tx-1',
        oldCategory: 'Lazer',
        newCategory: 'Alimentação',
        before: {
          id: 'client-id',
          uid: 'u1',
          value: 10,
          importHash: 'x'.repeat(64),
          value_cents: 1000,
          category: 'Lazer',
          description: 'T1',
        },
      },
      {
        id: 'tx-2',
        oldCategory: 'Moradia',
        newCategory: 'Alimentação',
      },
    ];

    await FirestoreService.batchUndoBulkUpdateTransactionsWithHistory('uid1', snapshot, 'undo-corr-123');

    expect(mockWriteBatch).toHaveBeenCalledTimes(1);
    expect(mockBatchUpdate).toHaveBeenCalledTimes(2);
    expect(mockBatchSet).toHaveBeenCalledTimes(2);
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);

    const [txRef1, txPayload1] = mockBatchUpdate.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>];
    const [histRef1, histPayload1] = mockBatchSet.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>];

    expect(txRef1['id']).toBe('tx-1');
    expect(txPayload1['category']).toBe('Lazer');
    expect(txPayload1['updatedAt']).toEqual({ _serverTimestamp: true });
    expect(txPayload1['uid']).toEqual({ _deleteField: true });
    expect(txPayload1['id']).toEqual({ _deleteField: true });
    expect(txPayload1['value']).toEqual({ _deleteField: true });
    expect(txPayload1).not.toHaveProperty('importHash');

    expect(String(histRef1['path'])).toContain('tx-1/history');
    expect(histPayload1).toEqual(expect.objectContaining({
      action: 'UNDO_BULK_UPDATE',
      origin: 'bulk',
      txId: 'tx-1',
      correlationId: 'undo-corr-123',
      amount_cents: 1000,
      category: 'Lazer',
      schemaVersion: 1,
      changedFields: ['category'],
      createdAt: { _serverTimestamp: true },
    }));

    const before1 = histPayload1['before'] as Record<string, unknown>;
    const after1 = histPayload1['after'] as Record<string, unknown>;
    expect(before1['category']).toBe('Alimentação');
    expect(after1['category']).toBe('Lazer');
    expect(before1['value_cents']).toBe(1000);
    expect(after1['value_cents']).toBe(1000);
    for (const forbidden of ['id', 'uid', 'value', 'importHash']) {
      expect(before1).not.toHaveProperty(forbidden);
      expect(after1).not.toHaveProperty(forbidden);
    }
  });

  it('não cria amount_cents a partir de value legado nem de value_cents inválido', async () => {
    const invalidValues = [100.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, -1];

    for (const value_cents of invalidValues) {
      vi.clearAllMocks();
      mockBatchCommit.mockResolvedValue(undefined);

      await FirestoreService.batchUndoBulkUpdateTransactionsWithHistory('uid1', [
        {
          id: `tx-invalid-${String(value_cents)}`,
          oldCategory: 'Outros',
          newCategory: 'Alimentação',
          before: {
            category: 'Outros',
            value: 9999,
            value_cents,
          },
        },
      ], 'undo-corr-invalid');

      const [, histPayload] = mockBatchSet.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>];
      const before = histPayload['before'] as Record<string, unknown>;
      const after = histPayload['after'] as Record<string, unknown>;

      expect(histPayload).not.toHaveProperty('amount_cents');
      expect(before).not.toHaveProperty('value');
      expect(after).not.toHaveProperty('value');
    }
  });

  it('respeita o chunk máximo de 240 transações (gera múltiplos commits)', async () => {
    const manyItems = Array.from({ length: 241 }, (_, i) => ({
      id: `tx-${i}`,
      oldCategory: 'Outros',
      newCategory: 'Alimentação',
      before: { value_cents: 100, category: 'Outros', description: `D${i}` },
    }));

    await FirestoreService.batchUndoBulkUpdateTransactionsWithHistory('uid1', manyItems, 'undo-c-1');

    // 241 itens:
    // Batch 1: 240 transações (240 updates + 240 sets = 480 writes)
    // Batch 2: 1 transação (1 update + 1 set = 2 writes)
    expect(mockBatchCommit).toHaveBeenCalledTimes(2);
    expect(mockBatchUpdate).toHaveBeenCalledTimes(241);
    expect(mockBatchSet).toHaveBeenCalledTimes(241);
  });

  it('inclui _lastOpId em cada updatePayload do undo bulk, pareado com historyRef', async () => {
    const snapshot = [
      { id: 'tx-a', oldCategory: 'Lazer',   newCategory: 'Alimentação', before: { category: 'Lazer',   value_cents: 500 } },
      { id: 'tx-b', oldCategory: 'Moradia', newCategory: 'Alimentação', before: { category: 'Moradia', value_cents: 800 } },
    ];

    await FirestoreService.batchUndoBulkUpdateTransactionsWithHistory('uid1', snapshot, 'undo-xyz');

    const [, payloadA] = mockBatchUpdate.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>];
    const [, payloadB] = mockBatchUpdate.mock.calls[1] as [Record<string, unknown>, Record<string, unknown>];
    const [histRefA] = mockBatchSet.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>];
    const [histRefB] = mockBatchSet.mock.calls[1] as [Record<string, unknown>, Record<string, unknown>];

    expect(payloadA['_lastOpId']).toBeDefined();
    expect(payloadA['_lastOpId']).toBe((histRefA as { id: string }).id);

    expect(payloadB['_lastOpId']).toBeDefined();
    expect(payloadB['_lastOpId']).toBe((histRefB as { id: string }).id);
  });

  it('undo bulk mantém action UNDO_BULK_UPDATE, origin bulk, correlationId e não vaza importHash', async () => {
    const snapshot = [{
      id: 'tx-1',
      oldCategory: 'Lazer',
      newCategory: 'Alimentação',
      before: { category: 'Lazer', value_cents: 1000, importHash: 'x'.repeat(64) },
    }];

    await FirestoreService.batchUndoBulkUpdateTransactionsWithHistory('uid1', snapshot, 'undo-abc');

    const [, txPayload] = mockBatchUpdate.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>];
    const [, histPayload] = mockBatchSet.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>];

    expect(txPayload).not.toHaveProperty('importHash');
    expect(txPayload['_lastOpId']).toBe('mock-doc-id');
    expect(histPayload['action']).toBe('UNDO_BULK_UPDATE');
    expect(histPayload['origin']).toBe('bulk');
    expect(histPayload['correlationId']).toBe('undo-abc');
  });

  it('undo bulk mantém chunking: 241 itens geram 2 commits e _lastOpId está em todos', async () => {
    const manyItems = Array.from({ length: 241 }, (_, i) => ({
      id: `tx-${i}`,
      oldCategory: 'Outros',
      newCategory: 'Alimentação',
      before: { value_cents: 100, category: 'Outros' },
    }));

    await FirestoreService.batchUndoBulkUpdateTransactionsWithHistory('uid1', manyItems, 'undo-chunk');

    expect(mockBatchCommit).toHaveBeenCalledTimes(2);
    expect(mockBatchUpdate).toHaveBeenCalledTimes(241);
    expect(mockBatchSet).toHaveBeenCalledTimes(241);

    const firstPayload = (mockBatchUpdate.mock.calls[0] as [unknown, Record<string, unknown>])[1];
    const lastPayload  = (mockBatchUpdate.mock.calls[240] as [unknown, Record<string, unknown>])[1];
    expect(firstPayload['_lastOpId']).toBeDefined();
    expect(lastPayload['_lastOpId']).toBeDefined();
  });
});
