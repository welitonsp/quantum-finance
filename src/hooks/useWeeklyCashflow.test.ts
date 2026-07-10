import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWeeklyCashflow, formatCents } from './useWeeklyCashflow';
import type { Transaction, RecurringTask } from '../shared/types/transaction';

// Segunda-feira → startOfWeek = o próprio dia, semanas alinhadas e determinísticas.
const FIXED_NOW = new Date('2026-06-15T12:00:00Z');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});
afterEach(() => vi.useRealTimers());

let _id = 0;
function tx(over: Record<string, unknown>): Transaction {
  return {
    id: `tx-${++_id}`,
    description: 'Mov',
    type: 'saida',
    category: 'Outros',
    value_cents: 0,
    ...over,
  } as Transaction;
}

function task(over: Record<string, unknown>): RecurringTask {
  return {
    id: `rt-${++_id}`,
    description: 'Recorrente',
    type: 'saida',
    frequency: 'mensal',
    active: true,
    dueDay: 20,
    value_cents: 10000,
    ...over,
  } as RecurringTask;
}

function render(txs: Transaction[], tasks: RecurringTask[]) {
  return renderHook(() => useWeeklyCashflow(txs, tasks)).result.current;
}

describe('useWeeklyCashflow — buckets históricos', () => {
  it('gera 4 semanas históricas + 2 de previsão', () => {
    const r = render([], []);
    expect(r.weeks).toHaveLength(6);
    expect(r.weeks.slice(0, 4).every(w => !w.isForecast)).toBe(true);
    expect(r.weeks.slice(4).every(w => w.isForecast)).toBe(true);
  });

  it('acumula receita e despesa na semana correta, ignorando pagamento de fatura e tx sem data', () => {
    const txs = [
      tx({ date: '2026-06-10', type: 'entrada', value_cents: 30000 }),
      tx({ date: '2026-06-10', type: 'saida',   value_cents: 20000 }),
      // pagamento de fatura: não conta como despesa
      tx({ date: '2026-06-10', type: 'saida', value_cents: 99999, paidInvoiceMonth: '2026-05' }),
      // sem data: ignorada
      tx({ date: '', type: 'saida', value_cents: 55555 }),
      // fora de qualquer bucket (muito antiga): ignorada
      tx({ date: '2026-01-01', type: 'saida', value_cents: 77777 }),
    ];
    const r = render(txs, []);
    // weeks[2] = 08/06–14/06
    const semana = r.weeks[2]!;
    expect(semana.incomeCents).toBe(30000);
    expect(semana.expenseCents).toBe(20000);
  });
});

describe('useWeeklyCashflow — recorrentes e previsão', () => {
  it('projeta recorrente mensal como evento futuro e no bucket de previsão', () => {
    // dueDay 20 → 20/06/2026 cai no 1º bucket de previsão (15–21/06)
    const r = render([], [task({ type: 'saida', dueDay: 20, value_cents: 10000, description: 'Aluguel' })]);
    const ev = r.futureEvents.find(e => e.date === '2026-06-20');
    expect(ev).toBeDefined();
    expect(ev!.amountCents).toBe(-10000); // despesa = negativo
    // bucket de previsão 1 recebeu a despesa
    const fw1 = r.weeks[4]!;
    expect(fw1.expenseCents).toBeGreaterThanOrEqual(10000);
  });

  it('recorrente de receita entra com sinal positivo', () => {
    const r = render([], [task({ type: 'entrada', dueDay: 18, value_cents: 50000, description: 'Salário' })]);
    const ev = r.futureEvents.find(e => e.description === 'Salário');
    expect(ev!.amountCents).toBe(50000);
  });

  it('ignora recorrente inativo e de valor zero', () => {
    const r = render([], [
      task({ active: false, dueDay: 18 }),
      task({ value_cents: 0, dueDay: 18 }),
    ]);
    expect(r.futureEvents).toHaveLength(0);
  });

  it('recorrente anual só dispara no mês de vencimento', () => {
    // dueMonth 6 (junho) → dispara; agosto não seria coberto pela janela de qualquer forma
    const r = render([], [task({ frequency: 'anual', dueMonth: 6, dueDay: 25, description: 'IPVA' })]);
    expect(r.futureEvents.some(e => e.description === 'IPVA')).toBe(true);

    const r2 = render([], [task({ frequency: 'anual', dueMonth: 12, dueDay: 25, description: 'IPTU' })]);
    expect(r2.futureEvents.some(e => e.description === 'IPTU')).toBe(false);
  });

  it('clampa o dia de vencimento ao último dia do mês', () => {
    // dueDay 31 em junho (30 dias) → 30/06; ainda é futuro → evento presente
    const r = render([], [task({ dueDay: 31, description: 'Fatura' })]);
    expect(r.futureEvents.some(e => e.date === '2026-06-30')).toBe(true);
  });

  it('descarta vencimentos no passado (antes de hoje)', () => {
    // dueDay 5 → 05/06 e 05/07; 05/06 é passado (hoje 15/06) → só 05/07 sobra
    const r = render([], [task({ dueDay: 5, description: 'Passada' })]);
    const dates = r.futureEvents.map(e => e.date);
    expect(dates).not.toContain('2026-06-05');
    expect(dates).toContain('2026-07-05');
  });

  it('limita a 8 eventos futuros ordenados por data', () => {
    const tasks = Array.from({ length: 12 }, (_, i) =>
      task({ dueDay: 16 + (i % 12), description: `T${i}` }),
    );
    const r = render([], tasks);
    expect(r.futureEvents.length).toBeLessThanOrEqual(8);
    const sorted = [...r.futureEvents].sort((a, b) => a.date.localeCompare(b.date));
    expect(r.futureEvents).toEqual(sorted);
  });
});

describe('formatCents', () => {
  it('formata em reais inteiros, sempre positivo', () => {
    expect(formatCents(123456)).toBe('R$ 1235');
    expect(formatCents(-5000)).toBe('R$ 50');
  });
});
