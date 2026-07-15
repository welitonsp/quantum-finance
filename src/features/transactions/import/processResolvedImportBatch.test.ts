import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockServerTimestamp, mockUpdateTxWithHistory, mockLog } = vi.hoisted(() => ({
  mockServerTimestamp:      vi.fn(() => ({ _serverTimestamp: true })),
  mockUpdateTxWithHistory:  vi.fn().mockResolvedValue(undefined),
  mockLog:                  vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  serverTimestamp: mockServerTimestamp,
}));

vi.mock('../../../shared/services/FirestoreService', () => ({
  FirestoreService: { updateTransactionWithHistory: mockUpdateTxWithHistory },
}));

vi.mock('../../../shared/lib/firebaseErrorHandling', () => ({
  logSanitizedFirebaseError: mockLog,
}));

import { processResolvedImportBatch } from './processResolvedImportBatch';
import type { ParsedTransaction, ImportResult } from './importTypes';
import type { Transaction } from '../../../shared/types/transaction';
import type { Centavos } from '../../../shared/types/money';

// Minimal valid parsed transaction (schema-clean). Extra preview fields are stripped by the SUT.
function parsed(over: Partial<ParsedTransaction> & { id: string }): ParsedTransaction {
  return {
    description: 'Compra Mercado',
    value_cents: 1500 as Centavos,
    type:        'saida',
    category:    'Alimentação',
    date:        '2026-01-10',
    ...over,
  } as ParsedTransaction;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUpdateTxWithHistory.mockResolvedValue(undefined);
});

describe('processResolvedImportBatch — importação (toImport)', () => {
  it('transação válida sem _reconciled → payload limpo com schemaVersion 2 e source csv default', async () => {
    const onImport = vi.fn<(txs: ParsedTransaction[]) => Promise<ImportResult>>()
      .mockResolvedValue({ added: 1, duplicates: 0 });

    const result = await processResolvedImportBatch(
      'u1',
      [parsed({ id: '__temp_1', _selected: true, _aiCategorized: true, value: 99 })],
      onImport,
    );

    expect(onImport).toHaveBeenCalledTimes(1);
    const payload = onImport.mock.calls[0]![0]![0] as unknown as Record<string, unknown>;

    // preview + legacy fields stripped
    expect(payload).not.toHaveProperty('_selected');
    expect(payload).not.toHaveProperty('_aiCategorized');
    expect(payload).not.toHaveProperty('_reconciled');
    expect(payload).not.toHaveProperty('_mergedWith');
    expect(payload).not.toHaveProperty('id');
    expect(payload).not.toHaveProperty('value');

    expect(payload).toMatchObject({
      description:   'Compra Mercado',
      value_cents:   1500,
      type:          'saida',
      category:      'Alimentação',
      date:          '2026-01-10',
      source:        'csv',
      schemaVersion: 2,
    });

    expect(result.added).toBe(1);
    expect(result.duplicates).toBe(0);
    expect(result.validCount).toBe(1);
    expect(result.reconciledCount).toBe(0);
    expect(result.invalidCount).toBe(0);
  });

  it('added cai para toImport.length quando o callback retorna void', async () => {
    const onImport = vi.fn<(txs: ParsedTransaction[]) => Promise<void>>().mockResolvedValue(undefined);

    const result = await processResolvedImportBatch(
      'u1',
      [parsed({ id: '__temp_1' }), parsed({ id: '__temp_2' })],
      onImport,
    );

    expect(result.added).toBe(2);
    expect(result.duplicates).toBeUndefined();
  });

  it('propaga duplicates vindos do resultado', async () => {
    const onImport = vi.fn<(txs: ParsedTransaction[]) => Promise<ImportResult>>()
      .mockResolvedValue({ added: 0, duplicates: 3 });

    const result = await processResolvedImportBatch('u1', [parsed({ id: '__temp_1' })], onImport);

    expect(result.added).toBe(0);
    expect(result.duplicates).toBe(3);
  });

  it('fallback de centavos: sem value_cents usa toCentavos(value legado)', async () => {
    const onImport = vi.fn<(txs: ParsedTransaction[]) => Promise<ImportResult>>()
      .mockResolvedValue({ added: 1 });

    const withLegacyValue = parsed({ id: '__temp_1', value: 12.34 });
    delete (withLegacyValue as { value_cents?: Centavos }).value_cents;

    await processResolvedImportBatch('u1', [withLegacyValue], onImport);

    const payload = onImport.mock.calls[0]![0]![0] as unknown as Record<string, unknown>;
    expect(payload['value_cents']).toBe(1234);
  });

  it('preserva source explícito (ofx) em vez do default csv', async () => {
    const onImport = vi.fn<(txs: ParsedTransaction[]) => Promise<ImportResult>>()
      .mockResolvedValue({ added: 1 });

    await processResolvedImportBatch(
      'u1',
      [parsed({ id: '__temp_1', source: 'ofx' })],
      onImport,
    );

    const payload = onImport.mock.calls[0]![0]![0] as unknown as Record<string, unknown>;
    expect(payload['source']).toBe('ofx');
  });

  it('campos opcionais ausentes não aparecem como chaves no payload', async () => {
    const onImport = vi.fn<(txs: ParsedTransaction[]) => Promise<ImportResult>>()
      .mockResolvedValue({ added: 1 });

    await processResolvedImportBatch('u1', [parsed({ id: '__temp_1' })], onImport);

    const payload = onImport.mock.calls[0]![0]![0] as unknown as Record<string, unknown>;
    for (const key of ['account', 'accountId', 'cardId', 'fitId', 'tags', 'isRecurring']) {
      expect(payload).not.toHaveProperty(key);
    }
  });

  it('campos opcionais definidos são propagados', async () => {
    const onImport = vi.fn<(txs: ParsedTransaction[]) => Promise<ImportResult>>()
      .mockResolvedValue({ added: 1 });

    await processResolvedImportBatch(
      'u1',
      [parsed({
        id: '__temp_1',
        account: 'Conta X',
        accountId: 'acc-1',
        cardId: 'card-1',
        fitId: 'fit-1',
        tags: ['mercado'],
        isRecurring: false,
      })],
      onImport,
    );

    const payload = onImport.mock.calls[0]![0]![0] as unknown as Record<string, unknown>;
    expect(payload).toMatchObject({
      account: 'Conta X',
      accountId: 'acc-1',
      cardId: 'card-1',
      fitId: 'fit-1',
      tags: ['mercado'],
      isRecurring: false,
    });
  });
});

describe('processResolvedImportBatch — inválidas', () => {
  it('item rejeitado pelo schema (data malformada) incrementa invalidCount e loga, sem entrar em toImport', async () => {
    const onImport = vi.fn<(txs: ParsedTransaction[]) => Promise<ImportResult>>()
      .mockResolvedValue({ added: 0 });

    const result = await processResolvedImportBatch(
      'u1',
      [parsed({ id: '__temp_1', date: '2026-13-40' })],
      onImport,
    );

    expect(result.invalidCount).toBe(1);
    expect(result.validCount).toBe(0);
    expect(onImport).not.toHaveBeenCalled();
    expect(mockLog).toHaveBeenCalledWith('transaction_import', expect.any(Error));
  });

  it('item sem description válida (menos de 2 chars) é rejeitado', async () => {
    const onImport = vi.fn<(txs: ParsedTransaction[]) => Promise<ImportResult>>()
      .mockResolvedValue({ added: 0 });

    const result = await processResolvedImportBatch(
      'u1',
      [parsed({ id: '__temp_1', description: 'x' })],
      onImport,
    );

    expect(result.invalidCount).toBe(1);
    expect(onImport).not.toHaveBeenCalled();
  });
});

describe('processResolvedImportBatch — reconciliação (toUpdate)', () => {
  const existing = (over: Partial<Transaction>): Transaction => ({
    id:          'real-tx-1',
    description: 'Compra Mercado',
    value_cents: 1500 as Centavos,
    type:        'saida',
    category:    'Outros',
    date:        '2026-01-10',
    ...over,
  }) as Transaction;

  it('_reconciled com previewId real e uid → updateTransactionWithHistory com origin reconcile e delta', async () => {
    const onImport = vi.fn<(txs: ParsedTransaction[]) => Promise<ImportResult>>()
      .mockResolvedValue({ added: 0 });

    const result = await processResolvedImportBatch(
      'u1',
      [parsed({ id: 'real-tx-1', _reconciled: true, category: 'Alimentação' })],
      onImport,
      [existing({ id: 'real-tx-1', category: 'Outros' })],
    );

    expect(onImport).not.toHaveBeenCalled();
    expect(mockUpdateTxWithHistory).toHaveBeenCalledTimes(1);

    const [uidArg, idArg, dataArg, historyArg] = mockUpdateTxWithHistory.mock.calls[0] as [
      string, string, Record<string, unknown>, Record<string, unknown>,
    ];
    expect(uidArg).toBe('u1');
    expect(idArg).toBe('real-tx-1');
    expect(dataArg).toMatchObject({
      reconciliationStatus: 'reconciled',
      reconciliationSource: 'import',
      reconciledBy:         'u1',
    });
    expect(historyArg['origin']).toBe('reconcile');
    expect(historyArg['changedFields']).toEqual(expect.arrayContaining(['category']));

    expect(result.reconciledCount).toBe(1);
    expect(result.validCount).toBe(1);
    expect(result.added).toBe(0);
  });

  it('_reconciled com previewId __temp_ cai em toImport (não faz update)', async () => {
    const onImport = vi.fn<(txs: ParsedTransaction[]) => Promise<ImportResult>>()
      .mockResolvedValue({ added: 1 });

    const result = await processResolvedImportBatch(
      'u1',
      [parsed({ id: '__temp_abc', _reconciled: true })],
      onImport,
    );

    expect(mockUpdateTxWithHistory).not.toHaveBeenCalled();
    expect(onImport).toHaveBeenCalledTimes(1);
    expect(result.reconciledCount).toBe(0);
    expect(result.added).toBe(1);
  });

  it('_reconciled sem uid cai em toImport (não faz update)', async () => {
    const onImport = vi.fn<(txs: ParsedTransaction[]) => Promise<ImportResult>>()
      .mockResolvedValue({ added: 1 });

    const result = await processResolvedImportBatch(
      undefined,
      [parsed({ id: 'real-tx-1', _reconciled: true })],
      onImport,
    );

    expect(mockUpdateTxWithHistory).not.toHaveBeenCalled();
    expect(onImport).toHaveBeenCalledTimes(1);
    expect(result.reconciledCount).toBe(0);
  });
});

describe('processResolvedImportBatch — lote misto', () => {
  it('agrega added/reconciledCount/invalidCount/validCount corretamente', async () => {
    const onImport = vi.fn<(txs: ParsedTransaction[]) => Promise<ImportResult>>()
      .mockResolvedValue({ added: 1, duplicates: 0 });

    const existing: Transaction = {
      id:          'real-tx-1',
      description: 'Recon',
      value_cents: 2000 as Centavos,
      type:        'saida',
      category:    'Outros',
      date:        '2026-01-05',
    } as Transaction;

    const result = await processResolvedImportBatch(
      'u1',
      [
        parsed({ id: '__temp_new' }),                                      // válida nova
        parsed({ id: 'real-tx-1', _reconciled: true, category: 'Lazer' }), // reconciliada
        parsed({ id: '__temp_bad', date: '2026-13-40' }),                  // inválida
      ],
      onImport,
      [existing],
    );

    expect(result).toEqual({
      added:           1,
      reconciledCount: 1,
      invalidCount:    1,
      duplicates:      0,
      validCount:      2,
    });
    expect(onImport).toHaveBeenCalledTimes(1);
    expect(onImport.mock.calls[0]![0]).toHaveLength(1);
    expect(mockUpdateTxWithHistory).toHaveBeenCalledTimes(1);
  });
});
