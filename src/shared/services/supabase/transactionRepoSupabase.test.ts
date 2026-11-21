import { describe, it, expect, vi, beforeEach } from 'vitest';

type Result = { data: unknown; error: unknown };
const calls: Array<{ op: string; args: unknown[] }> = [];
/** Respostas consumidas em ordem, uma por consulta concluída. */
let results: Result[] = [];
const next = (): Promise<Result> => Promise.resolve(results.shift() ?? { data: [], error: null });

function builder() {
  const b: Record<string, unknown> = {};
  const record = (op: string) => (...args: unknown[]) => { calls.push({ op, args }); return b; };
  for (const op of ['select', 'insert', 'update', 'eq', 'in', 'is', 'order']) b[op] = record(op);
  b['single'] = () => next();
  b['maybeSingle'] = () => next();
  b['then'] = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => next().then(res, rej);
  return b;
}

const client = { from: vi.fn((table: string) => { calls.push({ op: 'from', args: [table] }); return builder(); }) };

vi.mock('../../api/supabase/client', () => ({ getSupabase: () => client }));
vi.mock('../../lib/firebaseErrorHandling', () => ({ logSanitizedFirebaseError: vi.fn() }));

import {
  mapTransactionRow,
  toTransactionColumns,
  transactionRepoSupabase as repo,
  type TransactionRow,
} from './transactionRepoSupabase';

const baseRow: TransactionRow = {
  id: 't1', description: 'Mercado', value_cents: '12345', type: 'saida', category: 'Alimentação',
  date: '2026-11-10', account_id: 'a1', card_id: null, from_account_id: null, to_account_id: null,
  installment_group_id: null, installment_index: null, installment_count: null,
  installment_total_cents: null, is_recurring: false, tags: ['casa'], source: 'manual', fit_id: null,
  import_hash: null, competencia: null, paid_invoice_month: null, reconciliation_status: null,
  reconciled_at: null, deleted_at: null, created_at: '2026-11-10T12:00:00Z', updated_at: '2026-11-10T12:00:00Z',
};

beforeEach(() => {
  calls.length = 0;
  results = [];
  vi.clearAllMocks();
});

describe('mapTransactionRow', () => {
  it('converte para o formato do app com centavos inteiros', () => {
    expect(mapTransactionRow(baseRow)).toEqual({
      id: 't1', description: 'Mercado', value_cents: 12345, value: 123.45, schemaVersion: 2,
      type: 'saida', category: 'Alimentação', date: '2026-11-10', isRecurring: false, tags: ['casa'],
      source: 'manual', accountId: 'a1',
      createdAt: Date.parse('2026-11-10T12:00:00Z'), updatedAt: Date.parse('2026-11-10T12:00:00Z'),
    });
  });

  it('parcelas, fatura e exclusão lógica', () => {
    const tx = mapTransactionRow({
      ...baseRow, card_id: 'c1', installment_group_id: 'g1', installment_index: 2, installment_count: 3,
      installment_total_cents: 30000, competencia: '2026-12', paid_invoice_month: '2026-11',
      deleted_at: '2026-11-11T00:00:00Z',
    });
    expect(tx).toMatchObject({
      cardId: 'c1', installmentGroupId: 'g1', installmentIndex: 2, installmentCount: 3,
      installmentTotalCents: 30000, competencia: '2026-12', paidInvoiceMonth: '2026-11', isDeleted: true,
    });
  });
});

describe('toTransactionColumns', () => {
  it('traduz campos e descarta os que só existem no Firestore', () => {
    expect(toTransactionColumns({
      description: 'Uber', descriptionLower: 'uber', value_cents: 2500, schemaVersion: 2, type: 'saida',
      category: 'Transporte', date: '2026-11-12', account: 'Nubank', accountId: '', cardId: 'c1',
      isRecurring: false, uid: 'x', _lastOpId: 'y', paidInvoiceMonth: '2026-11',
    })).toEqual({
      description: 'Uber', value_cents: 2500, type: 'saida', category: 'Transporte', date: '2026-11-12',
      account_id: null, card_id: 'c1', is_recurring: false, paid_invoice_month: '2026-11',
    });
  });

  it('isDeleted vira deleted_at', () => {
    expect(toTransactionColumns({ isDeleted: false })).toEqual({ deleted_at: null });
    expect(toTransactionColumns({ isDeleted: true, deletedAt: 0 })).toEqual({ deleted_at: '1970-01-01T00:00:00.000Z' });
  });
});

describe('transactionRepoSupabase', () => {
  it('getTransactions lê só as ativas, mais recentes primeiro', async () => {
    results = [{ data: [baseRow], error: null }];
    const txs = await repo.getTransactions('u1');
    expect(txs).toHaveLength(1);
    expect(calls).toContainEqual({ op: 'is', args: ['deleted_at', null] });
    expect(calls).toContainEqual({ op: 'order', args: ['created_at', { ascending: false }] });
  });

  it('cria transação validada e sem user_id', async () => {
    results = [{ data: { id: 'new' }, error: null }];
    const id = await repo.createManualTransactionWithHistory('u1', {
      description: 'Café', value_cents: 850 as never, type: 'saida', category: 'Alimentação', date: '2026-11-12',
    });
    expect(id).toBe('new');
    const insert = calls.find(c => c.op === 'insert')!.args[0] as Record<string, unknown>;
    expect(insert).toMatchObject({ description: 'Café', value_cents: 850, type: 'saida', source: 'manual' });
    expect(insert).not.toHaveProperty('user_id');
    expect(insert).not.toHaveProperty('descriptionLower');
  });

  it('reenvio com o mesmo id da fila offline devolve a linha já gravada', async () => {
    const txId = '6f1c2a8e-1b2c-4d3e-8f90-123456789abc';
    results = [
      { data: null, error: { code: '23505' } },
      { data: { id: txId }, error: null },
    ];
    const id = await repo.createManualTransactionWithHistory('u1', {
      description: 'Café', value_cents: 850 as never, type: 'saida', category: 'Alimentação', date: '2026-11-12',
    }, txId);
    expect(id).toBe(txId);
    const insert = calls.find(c => c.op === 'insert')!.args[0] as Record<string, unknown>;
    expect(insert).toMatchObject({ id: txId, idempotency_key: txId });
    expect(calls).toContainEqual({ op: 'eq', args: ['idempotency_key', txId] });
  });

  it('valor inválido é recusado antes de ir ao banco', async () => {
    await expect(repo.createManualTransactionWithHistory('u1', { description: '', value_cents: 0 as never }))
      .rejects.toThrow();
    expect(calls.find(c => c.op === 'insert')).toBeUndefined();
  });

  it('update e exclusão lógica', async () => {
    await repo.updateTransactionWithHistory('u1', 't1', { category: 'Lazer' });
    expect(calls).toContainEqual({ op: 'update', args: [{ category: 'Lazer' }] });
    calls.length = 0;
    await repo.softDeleteTransactionWithHistory('u1', 't1');
    const upd = calls.find(c => c.op === 'update')!.args[0] as Record<string, unknown>;
    expect(typeof upd['deleted_at']).toBe('string');
    expect(calls).toContainEqual({ op: 'eq', args: ['id', 't1'] });
  });

  it('erro do banco vira mensagem amigável', async () => {
    results = [{ data: null, error: { code: '42501', message: 'permission denied' } }];
    await expect(repo.updateTransactionWithHistory('u1', 't1', { category: 'Lazer' }))
      .rejects.toThrow('Não foi possível atualizar a transação.');
  });

  it('desfazer lote agrupa por categoria anterior', async () => {
    await repo.batchUndoBulkUpdateTransactionsWithHistory('u1', [
      { id: 'a', oldCategory: 'Lazer' }, { id: 'b', oldCategory: 'Lazer' }, { id: 'c', oldCategory: 'Saúde' },
    ]);
    expect(calls).toContainEqual({ op: 'update', args: [{ category: 'Lazer' }] });
    expect(calls).toContainEqual({ op: 'in', args: ['id', ['a', 'b']] });
    expect(calls).toContainEqual({ op: 'in', args: ['id', ['c']] });
  });

  it('importação ignora hashes já gravados e repetidos no arquivo', async () => {
    results = [
      { data: [{ import_hash: 'h1' }], error: null },   // já existe no banco
      { data: [{ id: 'n1' }], error: null },            // insere só h2
    ];
    const tx = (h: string) => ({ description: 'Compra', value_cents: 100 as never, type: 'saida' as const, category: 'Outros', date: '2026-11-01', source: 'csv' as const, importHash: h });
    const res = await repo.saveAllTransactions('u1', [tx('h1'), tx('h2'), tx('h2')]);
    expect(res).toEqual({ added: 1, duplicates: 2, invalid: 0 });
    const inserted = calls.find(c => c.op === 'insert')!.args[0] as Array<Record<string, unknown>>;
    expect(inserted.map(r => r['import_hash'])).toEqual(['h2']);
    expect(inserted[0]).toMatchObject({ source: 'csv' });
  });

  it('sem importHash calcula o mesmo hash estável do importador Firebase (reimportar não duplica)', async () => {
    results = [
      { data: [], error: null },              // nenhum hash gravado ainda
      { data: [{ id: 'n1' }], error: null },  // insere uma
    ];
    const tx = { description: 'Padaria', value_cents: 1250 as never, type: 'saida' as const, category: 'Alimentação', date: '2026-11-03', source: 'csv' as const };
    const res = await repo.saveAllTransactions('u1', [tx, { ...tx }]);
    expect(res).toEqual({ added: 1, duplicates: 1, invalid: 0 });
    const inserted = calls.find(c => c.op === 'insert')!.args[0] as Array<Record<string, unknown>>;
    expect(inserted).toHaveLength(1);
    expect(String(inserted[0]!['import_hash'])).toMatch(/^[0-9a-f]{64}$/);
    expect(inserted[0]).not.toHaveProperty('descriptionLower');
  });
});
