import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LedgerService,
  generateTransactionImportHash,
  normalizeImportTransaction,
} from './LedgerService';
import { toCentavos } from '../types/money';

const {
  mockCollection,
  mockDoc,
  mockRunTransaction,
  mockServerTimestamp,
  mockTransactionGet,
  mockTransactionSet,
} = vi.hoisted(() => {
  const mockCollection = vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }));
  const mockDoc = vi.fn((_dbOrCollection: { path?: string } | unknown, ...segments: string[]) => {
    const base = typeof _dbOrCollection === 'object' && _dbOrCollection && 'path' in _dbOrCollection
      ? String((_dbOrCollection as { path?: string }).path)
      : '';
    return { path: [base, ...segments].filter(Boolean).join('/') };
  });
  const mockServerTimestamp = vi.fn().mockReturnValue({ _serverTimestamp: true });
  const mockTransactionGet = vi.fn().mockResolvedValue({ exists: () => false });
  const mockTransactionSet = vi.fn();
  const mockRunTransaction = vi.fn(async (_db: unknown, callback: (tx: unknown) => unknown) => callback({
    get: mockTransactionGet,
    set: mockTransactionSet,
  }));

  return {
    mockCollection,
    mockDoc,
    mockRunTransaction,
    mockServerTimestamp,
    mockTransactionGet,
    mockTransactionSet,
  };
});

vi.mock('firebase/firestore', () => ({
  collection: mockCollection,
  doc: mockDoc,
  runTransaction: mockRunTransaction,
  serverTimestamp: mockServerTimestamp,
}));

vi.mock('../api/firebase/index', () => ({ db: { _isMock: true } }));

const baseInput = {
  description: '  Supermercado   ABC  ',
  value_cents: toCentavos('1.234,56'),
  type: 'saida',
  category: 'Alimentação',
  date: '2026-04-01',
  source: 'csv',
  fitId: 'FIT-1',
} as const;

beforeEach(() => {
  vi.clearAllMocks();
  mockTransactionGet.mockResolvedValue({ exists: () => false });
});

describe('LedgerService.normalizeImportTransaction', () => {
  it('normaliza dados importados para contrato v2 em centavos', () => {
    const normalized = normalizeImportTransaction(baseInput);

    expect(normalized).toEqual(expect.objectContaining({
      description: 'Supermercado ABC',
      value_cents: 123456,
      type: 'saida',
      category: baseInput.category,
      source: 'csv',
      schemaVersion: 2,
      fitId: 'FIT-1',
    }));
  });

  it('preserva categoria personalizada válida na importação', () => {
    const normalized = normalizeImportTransaction({ ...baseInput, category: 'Petshop' });

    expect(normalized).toEqual(expect.objectContaining({
      category: 'Petshop',
      value_cents: 123456,
      schemaVersion: 2,
    }));
  });

  it('rejeita valor zero e data inválida', () => {
    expect(normalizeImportTransaction({ ...baseInput, value_cents: 0 })).toBeNull();
    expect(normalizeImportTransaction({ ...baseInput, date: '01/04/2026' })).toBeNull();
  });
});

describe('LedgerService hash de importação', () => {
  it('gera hash determinístico com descrição normalizada', async () => {
    const tx1 = normalizeImportTransaction(baseInput);
    const tx2 = normalizeImportTransaction({
      ...baseInput,
      description: 'SUPERMERCADO ABC',
    });

    expect(tx1).not.toBeNull();
    expect(tx2).not.toBeNull();
    if (!tx1 || !tx2) return;

    const h1 = await generateTransactionImportHash('uid1', tx1);
    const h2 = await generateTransactionImportHash('uid1', tx2);

    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[a-f0-9]{64}$/);
  });

  it('altera hash quando fitId muda', async () => {
    const tx1 = normalizeImportTransaction(baseInput);
    const tx2 = normalizeImportTransaction({ ...baseInput, fitId: 'FIT-2' });

    expect(tx1).not.toBeNull();
    expect(tx2).not.toBeNull();
    if (!tx1 || !tx2) return;

    await expect(generateTransactionImportHash('uid1', tx1))
      .resolves.not.toBe(await generateTransactionImportHash('uid1', tx2));
  });
});

describe('LedgerService.importTransactions', () => {
  it('não descarta transação importada com categoria personalizada válida', async () => {
    const result = await LedgerService.importTransactions('uid1', [
      { ...baseInput, category: 'Academia' },
    ]);

    expect(result).toEqual({ added: 1, duplicates: 0, invalid: 0 });
    const transactionPayload = mockTransactionSet.mock.calls[0]?.[1] as Record<string, unknown>;
    const historyRef = mockTransactionSet.mock.calls[1]?.[0] as { path?: string };
    const historyPayload = mockTransactionSet.mock.calls[1]?.[1] as Record<string, unknown>;
    const auditPayload = mockTransactionSet.mock.calls[2]?.[1] as Record<string, unknown>;

    expect(transactionPayload).toEqual(expect.objectContaining({
      category: 'Academia',
      value_cents: 123456,
      importHash: expect.any(String),
    }));
    expect(transactionPayload).not.toHaveProperty('correlationId');
    expect(String(historyRef.path)).toContain(`transactions/${String(transactionPayload.importHash)}/history/create`);
    expect(historyPayload).toEqual(expect.objectContaining({
      action: 'CREATE',
      origin: 'import',
      txId: transactionPayload.importHash,
      correlationId: expect.stringMatching(/^bulk_[A-Za-z0-9_-]{11,75}$/),
      amount_cents: 123456,
      category: 'Academia',
      schemaVersion: 1,
      after: expect.objectContaining({
        description: 'Supermercado ABC',
        category: 'Academia',
        value_cents: 123456,
        source: 'csv',
      }),
    }));
    expect(historyPayload).not.toHaveProperty('before');
    expect(historyPayload).not.toHaveProperty('importHash');
    for (const forbidden of ['id', 'uid', 'value', 'importHash', '_lastOpId', 'correlationId']) {
      expect(historyPayload.after as Record<string, unknown>).not.toHaveProperty(forbidden);
    }
    expect(auditPayload).toEqual(expect.objectContaining({
      action: 'IMPORT_TRANSACTION',
      entity: 'TRANSACTION',
      txId: transactionPayload.importHash,
      source: 'csv',
      amount_cents: 123456,
      amount_display: 1234.56,
      schemaVersion: 2,
    }));
    expect(auditPayload).not.toHaveProperty('importHash');
  });

  it('importação duplicada no mesmo lote não cria duplicidade', async () => {
    const result = await LedgerService.importTransactions('uid1', [baseInput, { ...baseInput }]);

    expect(result).toEqual({ added: 1, duplicates: 1, invalid: 0 });
    expect(mockRunTransaction).toHaveBeenCalledTimes(1);
    expect(mockTransactionSet).toHaveBeenCalledTimes(3);
    expect(mockTransactionSet.mock.calls[0]?.[1]).toEqual(expect.objectContaining({
      value_cents: 123456,
      importHash: expect.any(String),
      createdAt: { _serverTimestamp: true },
    }));
  });

  it('compartilha correlationId de lote entre histories da mesma importação', async () => {
    const result = await LedgerService.importTransactions('uid1', [
      baseInput,
      { ...baseInput, fitId: 'FIT-2' },
    ]);

    expect(result).toEqual({ added: 2, duplicates: 0, invalid: 0 });
    expect(mockTransactionSet).toHaveBeenCalledTimes(6);

    const firstHistory = mockTransactionSet.mock.calls[1]?.[1] as Record<string, unknown>;
    const secondHistory = mockTransactionSet.mock.calls[4]?.[1] as Record<string, unknown>;

    expect(firstHistory['correlationId']).toMatch(/^bulk_[A-Za-z0-9_-]{11,75}$/);
    expect(secondHistory['correlationId']).toBe(firstHistory['correlationId']);
    expect(firstHistory['after']).not.toHaveProperty('importHash');
    expect(secondHistory['after']).not.toHaveProperty('importHash');
  });

  it('duplicata existente no Firestore preserva createdAt original', async () => {
    mockTransactionGet.mockResolvedValue({ exists: () => true });

    const result = await LedgerService.importTransactions('uid1', [baseInput]);

    expect(result).toEqual({ added: 0, duplicates: 1, invalid: 0 });
    expect(mockTransactionSet).not.toHaveBeenCalled();
  });
});
