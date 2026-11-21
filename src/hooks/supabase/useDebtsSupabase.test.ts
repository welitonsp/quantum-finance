import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const calls: Array<{ op: string; args: unknown[] }> = [];
let selectResult: { data: unknown; error: unknown } = { data: [], error: null };
let writeResult: { data: unknown; error: unknown } = { data: { id: 'new-id' }, error: null };

function builder() {
  const b: Record<string, unknown> = {};
  const record = (op: string) => (...args: unknown[]) => { calls.push({ op, args }); return b; };
  b['select'] = record('select');
  b['insert'] = record('insert');
  b['update'] = record('update');
  b['delete'] = record('delete');
  b['eq'] = record('eq');
  b['order'] = (...args: unknown[]) => { calls.push({ op: 'order', args }); return Promise.resolve(selectResult); };
  b['single'] = () => Promise.resolve(writeResult);
  b['then'] = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve({ error: writeResult.error }).then(res, rej);
  return b;
}

const channel = { on: vi.fn(() => channel), subscribe: vi.fn(() => channel) };
const client = {
  from: vi.fn(() => builder()),
  channel: vi.fn(() => channel),
  removeChannel: vi.fn(() => Promise.resolve()),
};

vi.mock('../../shared/api/supabase/client', () => ({ getSupabase: () => client }));
vi.mock('../../shared/lib/firebaseErrorHandling', () => ({ logSanitizedFirebaseError: vi.fn() }));

import { useDebtsSupabase, mapDebtRow, toDebtColumns, rateFromNumeric } from './useDebtsSupabase';
import type { Centavos } from '../../shared/types/money';

beforeEach(() => {
  calls.length = 0;
  selectResult = { data: [], error: null };
  writeResult = { data: { id: 'new-id' }, error: null };
  vi.clearAllMocks();
});

const row = {
  id: 'd1', user_id: 'u1', name: 'Carro', creditor: 'Banco', total_cents: '5000000', remaining_cents: 4200000,
  interest_rate: '0.018500', installments: 48, paid_installments: 6, due_day_of_month: 10,
  start_date: '2026-05-10', category: 'financiamento', active: true,
  created_at: '2026-05-10T00:00:00Z', updated_at: '2026-11-20T00:00:00Z',
};

describe('rateFromNumeric', () => {
  it('aceita number e string decimal; recusa lixo', () => {
    expect(rateFromNumeric('0.018500')).toBe(0.0185);
    expect(rateFromNumeric(0.02)).toBe(0.02);
    expect(rateFromNumeric('abc')).toBe(0);
    expect(rateFromNumeric(null)).toBe(0);
  });
});

describe('mapDebtRow / toDebtColumns', () => {
  it('mapeia a linha para Debt em centavos', () => {
    expect(mapDebtRow(row)).toEqual({
      id: 'd1', uid: 'u1', name: 'Carro', creditor: 'Banco', totalCents: 5000000, remainingCents: 4200000,
      interestRate: 0.0185, installments: 48, paidInstallments: 6, dueDayOfMonth: 10,
      startDate: '2026-05-10', category: 'financiamento', active: true,
      createdAt: '2026-05-10T00:00:00Z', updatedAt: '2026-11-20T00:00:00Z',
    });
  });

  it('categoria desconhecida vira outro', () => {
    expect(mapDebtRow({ ...row, category: 'agiota' }).category).toBe('outro');
  });

  it('DTO vira colunas snake_case e taxa como decimal exato', () => {
    expect(toDebtColumns({ paidInstallments: 7, remainingCents: 4100000 as Centavos, interestRate: 0.0185 }))
      .toEqual({ paid_installments: 7, remaining_cents: 4100000, interest_rate: '0.018500' });
  });
});

describe('useDebtsSupabase', () => {
  it('carrega mais recentes primeiro e assina tempo real', async () => {
    selectResult = { data: [row], error: null };
    const { result } = renderHook(() => useDebtsSupabase('u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.debts[0]?.remainingCents).toBe(4200000);
    expect(calls).toContainEqual({ op: 'order', args: ['created_at', { ascending: false }] });
    expect(client.channel).toHaveBeenCalledWith('debts:u1');
  });

  it('addDebt devolve o id criado', async () => {
    const { result } = renderHook(() => useDebtsSupabase('u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    let id = '';
    await act(async () => {
      id = await result.current.addDebt({
        name: 'X', creditor: '', totalCents: 1000 as Centavos, remainingCents: 1000 as Centavos, interestRate: 0,
        installments: 1, paidInstallments: 0, dueDayOfMonth: 5, startDate: '2026-11-20', category: 'outro', active: true,
      });
    });
    expect(id).toBe('new-id');
  });

  it('erro ao excluir vira mensagem amigável', async () => {
    writeResult = { data: null, error: { code: '42501' } };
    const { result } = renderHook(() => useDebtsSupabase('u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await expect(result.current.deleteDebt('d1')).rejects.toThrow('Não foi possível excluir a dívida.');
  });
});
