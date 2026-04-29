import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FirestoreService } from './FirestoreService';
import { toCentavos } from '../types/money';

const {
  mockAddDoc,
  mockBatchCommit,
  mockBatchUpdate,
  mockCollection,
  mockDoc,
  mockGetDoc,
  mockLedgerImport,
  mockServerTimestamp,
  mockWriteBatch,
} = vi.hoisted(() => {
  const mockAddDoc = vi.fn().mockResolvedValue({ id: 'new-doc-id' });
  const mockBatchCommit = vi.fn().mockResolvedValue(undefined);
  const mockBatchUpdate = vi.fn();
  const mockWriteBatch = vi.fn(() => ({
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

  return {
    mockAddDoc,
    mockBatchCommit,
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
  updateDoc: vi.fn().mockResolvedValue(undefined),
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

describe('FirestoreService.addTransaction', () => {
  it('não grava value como fonte primária em criação manual', async () => {
    await FirestoreService.addTransaction('uid1', {
      ...baseCreate,
      value: 999999,
    });

    const [, data] = mockAddDoc.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(data['value']).toBeUndefined();
    expect(data['value_cents']).toBe(12345);
    expect(data['schemaVersion']).toBe(2);
    expect(data['createdAt']).toEqual({ _serverTimestamp: true });
    expect(data['updatedAt']).toEqual({ _serverTimestamp: true });
  });

  it('converte value legado para value_cents apenas na borda de criação manual', async () => {
    await FirestoreService.addTransaction('uid1', {
      description: 'Freela',
      value: '1.234,56',
      type: 'entrada',
      category: 'Freelance',
      date: '2026-04-02',
      source: 'manual',
    });

    const [, data] = mockAddDoc.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(data['value']).toBeUndefined();
    expect(data['value_cents']).toBe(123456);
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
