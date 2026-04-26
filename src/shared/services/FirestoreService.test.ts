import { vi, describe, it, expect, beforeEach } from 'vitest';
import { FirestoreService } from './FirestoreService';

// ─── Hoisted mocks (vi.hoisted runs before vi.mock) ───────────────────────────

const {
  mockBatchCommit, mockBatchSet, mockBatchDelete,
  mockWriteBatch, mockAddDoc, mockServerTimestamp,
  mockDoc, mockCollection,
} = vi.hoisted(() => {
  const mockBatchCommit  = vi.fn().mockResolvedValue(undefined);
  const mockBatchSet     = vi.fn();
  const mockBatchDelete  = vi.fn();
  const mockBatchUpdate  = vi.fn();
  const mockWriteBatch   = vi.fn(() => ({
    set:    mockBatchSet,
    delete: mockBatchDelete,
    update: mockBatchUpdate,
    commit: mockBatchCommit,
  }));
  const mockAddDoc           = vi.fn().mockResolvedValue({ id: 'new-doc-id' });
  const mockServerTimestamp  = vi.fn().mockReturnValue({ _serverTimestamp: true });
  const mockDoc              = vi.fn().mockReturnValue({ id: 'mock-doc-id', path: 'mock/path' });
  const mockCollection       = vi.fn().mockReturnValue({ id: 'mock-col', path: 'mock-col/path' });
  return {
    mockBatchCommit, mockBatchSet, mockBatchDelete,
    mockWriteBatch, mockAddDoc, mockServerTimestamp,
    mockDoc, mockCollection,
  };
});

vi.mock('firebase/firestore', () => ({
  writeBatch:     mockWriteBatch,
  serverTimestamp: mockServerTimestamp,
  addDoc:         mockAddDoc,
  doc:            mockDoc,
  collection:     mockCollection,
  updateDoc:      vi.fn().mockResolvedValue(undefined),
  deleteDoc:      vi.fn().mockResolvedValue(undefined),
  getDocs:        vi.fn().mockResolvedValue({ docs: [] }),
  query:          vi.fn((col: unknown) => col),
  orderBy:        vi.fn(),
}));

vi.mock('../api/firebase/index', () => ({ db: { _isMock: true } }));

// ─── Helpers ──────────────────────────────────────────────────────────────────

const mkPartialTx = (overrides: Record<string, unknown> = {}) => ({
  value:       100,
  type:        'saida' as const,
  description: 'Test tx',
  date:        '2026-04-01',
  category:    'Alimentação',
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  // Re-apply mockResolvedValue after clearAllMocks (only clears call history)
  mockBatchCommit.mockResolvedValue(undefined);
  mockAddDoc.mockResolvedValue({ id: 'new-doc-id' });
});

// ─── Suite 1: saveAllTransactions ─────────────────────────────────────────────

describe('FirestoreService.saveAllTransactions', () => {
  it('array vazio → retorna early sem writeBatch', async () => {
    const result = await FirestoreService.saveAllTransactions('uid1', []);
    expect(result).toEqual({ added: 0, duplicates: 0, invalid: 0 });
    expect(mockWriteBatch).not.toHaveBeenCalled();
  });

  it('uid ausente → retorna early sem writeBatch', async () => {
    const result = await FirestoreService.saveAllTransactions('', [mkPartialTx()]);
    expect(result).toEqual({ added: 0, duplicates: 0, invalid: 0 });
    expect(mockWriteBatch).not.toHaveBeenCalled();
  });

  it('deduplicação: transação duplicada → 1 adicionada, 1 duplicata', async () => {
    const tx = mkPartialTx({ date: '2026-04-01', description: 'Cafe', value: 10 });
    const result = await FirestoreService.saveAllTransactions('uid1', [tx, tx]);
    expect(result.added).toBe(1);
    expect(result.duplicates).toBe(1);
    expect(result.invalid).toBe(0);
  });

  it('valor zero → contado como inválido', async () => {
    const tx = mkPartialTx({ value: 0 });
    const result = await FirestoreService.saveAllTransactions('uid1', [tx]);
    expect(result.invalid).toBe(1);
    expect(result.added).toBe(0);
    expect(mockBatchSet).not.toHaveBeenCalled();
  });

  it('valor NaN → contado como inválido', async () => {
    const tx = mkPartialTx({ value: NaN });
    const result = await FirestoreService.saveAllTransactions('uid1', [tx]);
    expect(result.invalid).toBe(1);
    expect(result.added).toBe(0);
  });

  it('atomicidade: batch.commit chamado exatamente 1 vez por importação', async () => {
    const txs = [
      mkPartialTx({ description: 'tx1', value: 10 }),
      mkPartialTx({ description: 'tx2', value: 20 }),
      mkPartialTx({ description: 'tx3', value: 30 }),
    ];
    await FirestoreService.saveAllTransactions('uid1', txs);
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);
  });

  it('campos default: account, tags, source, isRecurring, fitId', async () => {
    const tx = mkPartialTx({ value: 50 });
    await FirestoreService.saveAllTransactions('uid1', [tx]);
    const [, data] = mockBatchSet.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(data.account).toBe('conta_corrente');
    expect(data.tags).toEqual([]);
    expect(data.source).toBe('csv');
    expect(data.isRecurring).toBe(false);
    expect(data.fitId).toBeNull();
    expect(data.createdAt).toEqual({ _serverTimestamp: true });
    expect(data.updatedAt).toEqual({ _serverTimestamp: true });
  });

  it('conversão de valor: rawVal em reais → centavos (Math.round(abs * 100))', async () => {
    const tx = mkPartialTx({ value: 12.5, type: 'saida' });
    await FirestoreService.saveAllTransactions('uid1', [tx]);
    const [, data] = mockBatchSet.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(data.value).toBe(1250);  // 12.5 * 100 = 1250 centavos
  });

  it('TODO PR12.B: rawVal inteiro ≥ 100 é multiplicado por 100 novamente (bug heurística centavos)', async () => {
    // Se o input já chegar em centavos (ex: 10000 = R$100,00), o código trata
    // como 10000 reais e multiplica → 1_000_000 centavos. Corrigir em PR12.B
    // com heurística isInteger (valor inteiro e ≥ 1000 → provavelmente centavos).
    const tx = mkPartialTx({ value: 10_000 });  // 10000 reais OU 10000 centavos?
    await FirestoreService.saveAllTransactions('uid1', [tx]);
    const [, data] = mockBatchSet.mock.calls[0] as [unknown, Record<string, unknown>];
    // Comportamento ATUAL (incorreto para inputs já em centavos):
    expect(data.value).toBe(1_000_000); // TODO PR12.B: devia ser 10_000 se input era centavos
  });
});

// ─── Suite 2: deleteBatchTransactions ─────────────────────────────────────────

describe('FirestoreService.deleteBatchTransactions', () => {
  it('ids vazio → retorna sem criar batch', async () => {
    await FirestoreService.deleteBatchTransactions('uid1', []);
    expect(mockWriteBatch).not.toHaveBeenCalled();
  });

  it('uid ausente → retorna sem criar batch', async () => {
    await FirestoreService.deleteBatchTransactions('', ['id1', 'id2']);
    expect(mockWriteBatch).not.toHaveBeenCalled();
  });

  it('ids válidos: batch.delete chamado para cada id e commit executado uma vez', async () => {
    const ids = ['tx-a', 'tx-b', 'tx-c'];
    await FirestoreService.deleteBatchTransactions('uid1', ids);
    expect(mockBatchDelete).toHaveBeenCalledTimes(3);
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);
  });
});

// ─── Suite 3: addTransaction ──────────────────────────────────────────────────

describe('FirestoreService.addTransaction', () => {
  it('uid ausente → lança erro', async () => {
    await expect(
      FirestoreService.addTransaction('', { value: 100, type: 'entrada' })
    ).rejects.toThrow('[Firestore][addTransaction] UID ausente.');
  });

  it('strips id/uid/createdAt/updatedAt do payload de entrada', async () => {
    // Cast to any to simulate caller bypassing the type (runtime guard)
    await FirestoreService.addTransaction('uid1', {
      value:     100,
      type:      'entrada',
      uid:       'old-uid-to-override',
      createdAt: 12345 as unknown as undefined,
    } as Parameters<typeof FirestoreService.addTransaction>[1]);
    const [, data] = mockAddDoc.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(data.uid).toBe('uid1');                                   // own uid wins
    expect(data.createdAt).toEqual({ _serverTimestamp: true });      // serverTimestamp injected
  });

  it('adiciona uid + serverTimestamp ao documento', async () => {
    const result = await FirestoreService.addTransaction('uid1', { value: 50, type: 'saida' });
    const [, data] = mockAddDoc.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(data.uid).toBe('uid1');
    expect(data.createdAt).toEqual({ _serverTimestamp: true });
    expect(data.updatedAt).toEqual({ _serverTimestamp: true });
    expect(result).toBe('new-doc-id');
  });
});