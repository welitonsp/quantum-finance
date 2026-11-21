import { describe, it, expect, vi, beforeEach } from 'vitest';

type Result = { data: unknown; error: unknown };
const calls: Array<{ op: string; args: unknown[] }> = [];
let results: Result[] = [];
const next = (): Promise<Result> => Promise.resolve(results.shift() ?? { data: [], error: null });

function builder() {
  const b: Record<string, unknown> = {};
  const record = (op: string) => (...args: unknown[]) => { calls.push({ op, args }); return b; };
  for (const op of ['select', 'insert', 'update', 'eq', 'gt', 'is', 'order']) b[op] = record(op);
  b['then'] = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => next().then(res, rej);
  return b;
}

const client = {
  from: vi.fn(() => builder()),
  rpc: vi.fn((fn: string, args: unknown) => { calls.push({ op: 'rpc', args: [fn, args] }); return next(); }),
};

vi.mock('../../api/supabase/client', () => ({ getSupabase: () => client }));
vi.mock('../../lib/firebaseErrorHandling', () => ({ logSanitizedFirebaseError: vi.fn() }));

import { installmentRepoSupabase as repo } from './installmentRepoSupabase';
import { transferRepoSupabase } from '../transferRepo';
import { buildInstallmentPlan } from '../firestoreCore';

beforeEach(() => {
  calls.length = 0;
  results = [];
  vi.clearAllMocks();
});

describe('buildInstallmentPlan', () => {
  it('divide sem perder centavos: a sobra vai para a última parcela', () => {
    const plan = buildInstallmentPlan({
      description: 'TV', totalValueCents: 100000 as never, installmentCount: 3, date: '2026-11-10', category: 'Lazer',
    });
    expect(plan.map(p => p.valueCents)).toEqual([33333, 33333, 33334]);
    expect(plan.map(p => p.date)).toEqual(['2026-11-10', '2026-12-10', '2027-01-10']);
    expect(plan[2]?.description).toBe('TV (3/3)');
  });

  it('recusa quantidade fora de 2–120 e descrição vazia', () => {
    const base = { description: 'TV', totalValueCents: 1000 as never, date: '2026-11-10', category: 'Lazer' };
    expect(() => buildInstallmentPlan({ ...base, installmentCount: 1 })).toThrow();
    expect(() => buildInstallmentPlan({ ...base, installmentCount: 121 })).toThrow();
    expect(() => buildInstallmentPlan({ ...base, description: '  ', installmentCount: 2 })).toThrow();
  });

  it('recusa total menor que o número de parcelas (parcela de R$ 0,00)', () => {
    expect(() => buildInstallmentPlan({
      description: 'TV', totalValueCents: 1 as never, installmentCount: 2, date: '2026-11-10', category: 'Lazer',
    })).toThrow('Valor total pequeno demais');
  });
});

describe('installmentRepoSupabase', () => {
  it('grava todas as parcelas num único insert com o mesmo grupo', async () => {
    const groupId = await repo.createInstallmentGroupWithHistory('u1', {
      description: 'TV', totalValueCents: 100000 as never, installmentCount: 3, date: '2026-11-10',
      category: 'Lazer', cardId: 'c1', closingDay: 5,
    });
    const inserts = calls.filter(c => c.op === 'insert');
    expect(inserts).toHaveLength(1);
    const rows = inserts[0]!.args[0] as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ id: groupId, installment_group_id: groupId, installment_index: 1, card_id: 'c1', account_id: null });
    expect(rows.map(r => r['value_cents'])).toEqual([33333, 33333, 33334]);
    expect(rows.every(r => r['installment_total_cents'] === 100000 && r['installment_count'] === 3)).toBe(true);
    expect(rows.some(r => 'user_id' in r)).toBe(false);
  });

  it('erro do banco vira mensagem amigável', async () => {
    results = [{ data: null, error: { code: '23514' } }];
    await expect(repo.createInstallmentGroupWithHistory('u1', {
      description: 'TV', totalValueCents: 1000 as never, installmentCount: 2, date: '2026-11-10', category: 'Lazer',
    })).rejects.toThrow('Não foi possível salvar o parcelamento.');
  });

  it('lê o grupo ativo em ordem e cancela as parcelas restantes', async () => {
    results = [{ data: [], error: null }];
    await repo.getInstallmentGroup('u1', 'g1');
    expect(calls).toContainEqual({ op: 'eq', args: ['installment_group_id', 'g1'] });
    expect(calls).toContainEqual({ op: 'order', args: ['installment_index', { ascending: true }] });

    calls.length = 0;
    results = [{ data: [{ id: 'a' }, { id: 'b' }], error: null }];
    expect(await repo.cancelRemainingInstallments('u1', 'g1', 1)).toBe(2);
    expect(calls).toContainEqual({ op: 'gt', args: ['installment_index', 1] });
    expect(calls).toContainEqual({ op: 'is', args: ['deleted_at', null] });
  });
});

describe('transferRepoSupabase', () => {
  const dto = { fromAccountId: 'a1', toAccountId: 'a2', value_cents: 5000 as never, date: '2026-11-12', description: ' Reserva ' };

  it('chama a RPC create_transfer com chave de idempotência', async () => {
    results = [{ data: 't9', error: null }];
    expect(await transferRepoSupabase.createTransferWithHistory('u1', dto)).toBe('t9');
    const [fn, args] = calls.find(c => c.op === 'rpc')!.args as [string, Record<string, unknown>];
    expect(fn).toBe('create_transfer');
    expect(args).toMatchObject({ p_from_account_id: 'a1', p_to_account_id: 'a2', p_value_cents: 5000, p_date: '2026-11-12', p_description: 'Reserva' });
    expect(String(args['p_idempotency_key'])).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('erro ou resposta vazia vira mensagem amigável', async () => {
    results = [{ data: null, error: { code: '42501' } }];
    await expect(transferRepoSupabase.createTransferWithHistory('u1', dto)).rejects.toThrow('Não foi possível concluir a transferência.');
  });

  it('falha de rede repete uma vez com a MESMA chave de idempotência', async () => {
    results = [{ data: null, error: { message: 'fetch failed' } }, { data: 't9', error: null }];
    expect(await transferRepoSupabase.createTransferWithHistory('u1', dto)).toBe('t9');
    const rpcs = calls.filter(c => c.op === 'rpc').map(c => (c.args[1] as Record<string, unknown>)['p_idempotency_key']);
    expect(rpcs).toHaveLength(2);
    expect(rpcs[0]).toBe(rpcs[1]);
  });

  it('erro do banco (com código) não repete', async () => {
    results = [{ data: null, error: { code: '42501' } }];
    await expect(transferRepoSupabase.createTransferWithHistory('u1', dto)).rejects.toThrow();
    expect(client.rpc).toHaveBeenCalledTimes(1);
  });

  it('valida antes de chamar o banco', async () => {
    await expect(transferRepoSupabase.createTransferWithHistory('u1', { ...dto, toAccountId: 'a1' })).rejects.toThrow();
    expect(client.rpc).not.toHaveBeenCalled();
  });
});
