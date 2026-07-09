import { describe, it, expect } from 'vitest';
import { computeCashflowTimeline, firstNegativeDate } from '../cashflowTimeline';
import type { DailyBalance } from '../cashflowTimeline';
import type { Transaction, RecurringTask } from '../../shared/types/transaction';
import type { Centavos } from '../../shared/types/money';

const cents = (n: number): Centavos => n as Centavos;

let seq = 0;
function tx(overrides: Partial<Omit<Transaction, 'value_cents'>> & { value_cents?: number }): Transaction {
  seq += 1;
  const { value_cents, ...rest } = overrides;
  return {
    id: `tx-${seq}`,
    description: 'Descrição',
    date: '2026-07-09',
    value_cents: cents(value_cents ?? 10000),
    type: 'saida',
    category: 'Outros',
    ...rest,
  } as Transaction;
}

function recurringTask(overrides: Partial<Omit<RecurringTask, 'value_cents'>> & { value_cents?: number }): RecurringTask {
  const { value_cents, ...rest } = overrides;
  return {
    id: `rt-${seq++}`,
    description: 'Recorrente',
    value: 50,
    value_cents: cents(value_cents ?? 5000),
    category: 'Assinaturas',
    dueDay: 15,
    active: true,
    type: 'saida',
    frequency: 'mensal',
    ...rest,
  };
}

const TODAY = '2026-07-09';

describe('computeCashflowTimeline', () => {
  it('retorna 90 dias por padrão com saldo estável quando não há eventos', () => {
    const result = computeCashflowTimeline({
      currentBalanceCents: cents(100000),
      transactions: [],
      recurringTasks: [],
      today: TODAY,
    });
    expect(result).toHaveLength(90);
    // Sem eventos e sem renda histórica → saldo constante
    expect(result[0]!.balanceCents).toBe(100000);
    expect(result[89]!.balanceCents).toBe(100000);
  });

  it('respeitia daysAhead customizado', () => {
    const result = computeCashflowTimeline({
      currentBalanceCents: cents(50000),
      transactions: [],
      recurringTasks: [],
      today: TODAY,
      daysAhead: 7,
    });
    expect(result).toHaveLength(7);
  });

  it('o primeiro dia do resultado é today + 1', () => {
    const result = computeCashflowTimeline({
      currentBalanceCents: cents(0),
      transactions: [],
      recurringTasks: [],
      today: TODAY,
      daysAhead: 3,
    });
    expect(result[0]!.date).toBe('2026-07-10');
    expect(result[1]!.date).toBe('2026-07-11');
    expect(result[2]!.date).toBe('2026-07-12');
  });

  it('parcela futura (installment) reduz o saldo na data exata', () => {
    const installDate = '2026-07-20';
    const installTx = tx({ date: installDate, value_cents: 20000, type: 'saida', installmentGroupId: 'grp-1' });
    const result = computeCashflowTimeline({
      currentBalanceCents: cents(100000),
      transactions: [installTx],
      recurringTasks: [],
      today: TODAY,
      daysAhead: 30,
    });
    const dayBefore = result.find(d => d.date === '2026-07-19')!;
    const dayOf    = result.find(d => d.date === installDate)!;
    expect(dayBefore.balanceCents).toBe(100000);
    expect(dayOf.balanceCents).toBe(80000);
    expect(dayOf.events).toHaveLength(1);
    expect(dayOf.events[0]!.type).toBe('installment');
    expect(dayOf.events[0]!.direction).toBe('out');
  });

  it('parcela com isDeleted:true não impacta o saldo', () => {
    const installTx = tx({ date: '2026-07-20', value_cents: 20000, type: 'saida', installmentGroupId: 'grp-1', isDeleted: true });
    const result = computeCashflowTimeline({
      currentBalanceCents: cents(100000),
      transactions: [installTx],
      recurringTasks: [],
      today: TODAY,
      daysAhead: 30,
    });
    const dayOf = result.find(d => d.date === '2026-07-20')!;
    expect(dayOf.balanceCents).toBe(100000);
    expect(dayOf.events).toHaveLength(0);
  });

  it('recorrente mensal de saída aparece na data correta e reduz o saldo', () => {
    // TODAY = 09/07, dueDay 15 → próxima ocorrência = 15/07
    const result = computeCashflowTimeline({
      currentBalanceCents: cents(100000),
      transactions: [],
      recurringTasks: [recurringTask({ dueDay: 15, value_cents: 5000, type: 'saida' })],
      today: TODAY,
      daysAhead: 30,
    });
    const dayOf = result.find(d => d.date === '2026-07-15')!;
    expect(dayOf).toBeDefined();
    expect(dayOf.events.some(e => e.type === 'recurring' && e.direction === 'out')).toBe(true);
    expect(dayOf.balanceCents).toBe(95000);
  });

  it('recorrente mensal de entrada aumenta o saldo na data correta', () => {
    const result = computeCashflowTimeline({
      currentBalanceCents: cents(50000),
      transactions: [],
      recurringTasks: [recurringTask({ dueDay: 15, value_cents: 10000, type: 'entrada' })],
      today: TODAY,
      daysAhead: 30,
    });
    const dayOf = result.find(d => d.date === '2026-07-15')!;
    expect(dayOf.balanceCents).toBe(60000);
    expect(dayOf.events[0]!.direction).toBe('in');
  });

  it('recorrente com active:false é completamente ignorado', () => {
    const result = computeCashflowTimeline({
      currentBalanceCents: cents(100000),
      transactions: [],
      recurringTasks: [recurringTask({ dueDay: 15, active: false })],
      today: TODAY,
      daysAhead: 30,
    });
    const dayOf = result.find(d => d.date === '2026-07-15')!;
    expect(dayOf.events).toHaveLength(0);
    expect(dayOf.balanceCents).toBe(100000);
  });

  it('recorrente anual com dueMonth fora da janela não dispara', () => {
    // Hoje = julho/2026, janela 90 dias ≈ até outubro; anual dispara em dezembro
    const annual = recurringTask({ frequency: 'anual', dueMonth: 12, dueDay: 10, value_cents: 50000 });
    const result = computeCashflowTimeline({
      currentBalanceCents: cents(100000),
      transactions: [],
      recurringTasks: [annual],
      today: TODAY,
      daysAhead: 90,
    });
    const hasRecurring = result.some(d => d.events.some(e => e.type === 'recurring'));
    expect(hasRecurring).toBe(false);
  });

  it('incomeScenario optimistic produz saldo maior que pessimistic dada renda histórica', () => {
    // Transação de entrada nos últimos 90 dias → gera daily income projection
    const historicIncome = tx({ date: '2026-06-01', value_cents: 900000, type: 'entrada' });
    const pessimistic = computeCashflowTimeline({
      currentBalanceCents: cents(0),
      transactions: [historicIncome],
      recurringTasks: [],
      today: TODAY,
      daysAhead: 1,
      incomeScenario: 'pessimistic',
    });
    const optimistic = computeCashflowTimeline({
      currentBalanceCents: cents(0),
      transactions: [historicIncome],
      recurringTasks: [],
      today: TODAY,
      daysAhead: 1,
      incomeScenario: 'optimistic',
    });
    expect(optimistic[0]!.balanceCents).toBeGreaterThan(pessimistic[0]!.balanceCents);
  });
});

describe('firstNegativeDate', () => {
  it('retorna null quando nenhum dia tem saldo negativo', () => {
    const timeline: DailyBalance[] = [
      { date: '2026-07-10', balanceCents: cents(1000), events: [] },
      { date: '2026-07-11', balanceCents: cents(500),  events: [] },
    ];
    expect(firstNegativeDate(timeline)).toBeNull();
  });

  it('retorna a primeira data com saldo negativo', () => {
    const timeline: DailyBalance[] = [
      { date: '2026-07-10', balanceCents: cents(100),  events: [] },
      { date: '2026-07-11', balanceCents: cents(-1) as Centavos,  events: [] },
      { date: '2026-07-12', balanceCents: cents(-50) as Centavos, events: [] },
    ];
    expect(firstNegativeDate(timeline)).toBe('2026-07-11');
  });

  it('retorna null para timeline vazia', () => {
    expect(firstNegativeDate([])).toBeNull();
  });

  it('ignora dias positivos intermediários e encontra o negativo correto', () => {
    const timeline: DailyBalance[] = [
      { date: '2026-07-10', balanceCents: cents(500),  events: [] },
      { date: '2026-07-11', balanceCents: cents(100),  events: [] },
      { date: '2026-07-12', balanceCents: cents(-10) as Centavos, events: [] },
    ];
    expect(firstNegativeDate(timeline)).toBe('2026-07-12');
  });
});
