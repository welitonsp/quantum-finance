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

describe('computeCashflowTimeline — branches adicionais', () => {
  it('recorrente sem frequency (undefined) é tratado como mensal', () => {
    const task = {
      ...recurringTask({ dueDay: 15, value_cents: 5000, type: 'saida' }),
      frequency: undefined,
    } as unknown as RecurringTask;
    const result = computeCashflowTimeline({
      currentBalanceCents: cents(100000),
      transactions: [],
      recurringTasks: [task],
      today: TODAY,
      daysAhead: 30,
    });
    const day15 = result.find(d => d.date === '2026-07-15')!;
    expect(day15.events.some(e => e.type === 'recurring')).toBe(true);
  });

  it('recorrente mensal com dueDay já passado este mês dispara no mês seguinte', () => {
    // dueDay=5, TODAY=09/jul → clampedDay(5) <= fd(9) → próxima = 2026-08-05
    const result = computeCashflowTimeline({
      currentBalanceCents: cents(100000),
      transactions: [],
      recurringTasks: [recurringTask({ dueDay: 5, value_cents: 3000, type: 'saida' })],
      today: TODAY,
      daysAhead: 60,
    });
    expect(result.find(d => d.date === '2026-07-05')).toBeUndefined();
    const aug5 = result.find(d => d.date === '2026-08-05')!;
    expect(aug5.events.some(e => e.type === 'recurring')).toBe(true);
  });

  it('recorrente mensal em dezembro com dueDay passado wrapa para janeiro do ano seguinte', () => {
    // TODAY=2026-12-20, dueDay=15 → clampedDay(15) <= fd(20) → nm=1, ny=2027 → 2027-01-15
    const result = computeCashflowTimeline({
      currentBalanceCents: cents(100000),
      transactions: [],
      recurringTasks: [recurringTask({ dueDay: 15, value_cents: 5000 })],
      today: '2026-12-20',
      daysAhead: 60,
    });
    const jan15 = result.find(d => d.date === '2027-01-15');
    expect(jan15).toBeDefined();
    expect(jan15!.events.some(e => e.type === 'recurring')).toBe(true);
  });

  it('recorrente anual com dueMonth já passado neste ano dispara no próximo ano', () => {
    // TODAY=jul/2026, dueMonth=3 → thisYearDate=2026-03-10 <= 2026-07-09 → 2027-03-10
    const annual = recurringTask({ frequency: 'anual', dueMonth: 3, dueDay: 10, value_cents: 50000 });
    const result = computeCashflowTimeline({
      currentBalanceCents: cents(100000),
      transactions: [],
      recurringTasks: [annual],
      today: TODAY,
      daysAhead: 400,
    });
    const mar2027 = result.find(d => d.date === '2027-03-10')!;
    expect(mar2027).toBeDefined();
    expect(mar2027.events.some(e => e.type === 'recurring')).toBe(true);
  });

  it('recorrente anual sem dueMonth (undefined) usa mês 1 (janeiro)', () => {
    // dueMonth ?? 1 → janeiro; 2026-01-15 <= today → 2027-01-15
    // dueMonth is not included in helper defaults → will be undefined at runtime
    const annual = recurringTask({ frequency: 'anual', dueDay: 15, value_cents: 50000 });
    const result = computeCashflowTimeline({
      currentBalanceCents: cents(100000),
      transactions: [],
      recurringTasks: [annual],
      today: TODAY,
      daysAhead: 400,
    });
    const jan2027 = result.find(d => d.date === '2027-01-15')!;
    expect(jan2027).toBeDefined();
    expect(jan2027.events.some(e => e.type === 'recurring')).toBe(true);
  });

  it("transação de tipo 'transferencia' não conta como renda histórica", () => {
    const transferTx = tx({ date: '2026-06-01', value_cents: 900000, type: 'transferencia' });
    const withTransfer = computeCashflowTimeline({
      currentBalanceCents: cents(0),
      transactions: [transferTx],
      recurringTasks: [],
      today: TODAY,
      daysAhead: 1,
    });
    const noTx = computeCashflowTimeline({
      currentBalanceCents: cents(0),
      transactions: [],
      recurringTasks: [],
      today: TODAY,
      daysAhead: 1,
    });
    expect(withTransfer[0]!.balanceCents).toBe(noTx[0]!.balanceCents);
    expect(withTransfer[0]!.events.some(e => e.type === 'projection')).toBe(false);
  });

  it("transação de tipo 'receita' conta como renda histórica (além de 'entrada')", () => {
    const receitaTx = tx({ date: '2026-06-01', value_cents: 900000, type: 'receita' });
    const result = computeCashflowTimeline({
      currentBalanceCents: cents(0),
      transactions: [receitaTx],
      recurringTasks: [],
      today: TODAY,
      daysAhead: 1,
    });
    expect(result[0]!.events.some(e => e.type === 'projection')).toBe(true);
  });

  it('parcela futura de entrada (type=entrada) eleva o saldo', () => {
    const entradaTx = tx({
      date: '2026-07-20',
      value_cents: 15000,
      type: 'entrada',
      installmentGroupId: 'grp-renda',
    });
    const result = computeCashflowTimeline({
      currentBalanceCents: cents(50000),
      transactions: [entradaTx],
      recurringTasks: [],
      today: TODAY,
      daysAhead: 30,
    });
    const day20 = result.find(d => d.date === '2026-07-20')!;
    expect(day20.balanceCents).toBe(65000);
    expect(day20.events[0]!.direction).toBe('in');
  });

  it('transação futura sem installmentGroupId não é tratada como parcela', () => {
    const regularTx = tx({ date: '2026-07-20', value_cents: 10000, type: 'saida' });
    const result = computeCashflowTimeline({
      currentBalanceCents: cents(100000),
      transactions: [regularTx],
      recurringTasks: [],
      today: TODAY,
      daysAhead: 30,
    });
    const day20 = result.find(d => d.date === '2026-07-20')!;
    expect(day20.events.filter(e => e.type === 'installment')).toHaveLength(0);
  });

  it('parcela com date === today não aparece na projeção (getFutureInstallments excluí date <= today)', () => {
    const todayTx = tx({ date: TODAY, value_cents: 10000, type: 'saida', installmentGroupId: 'grp-1' });
    const result = computeCashflowTimeline({
      currentBalanceCents: cents(100000),
      transactions: [todayTx],
      recurringTasks: [],
      today: TODAY,
      daysAhead: 30,
    });
    const anyInstallment = result.some(d => d.events.some(e => e.type === 'installment'));
    expect(anyInstallment).toBe(false);
  });

  it('recorrente é excluído quando descrição coincide com parcela futura (anti-double-counting)', () => {
    const desc = 'Netflix';
    const installTx = tx({
      date: '2026-07-20',
      value_cents: 3990,
      type: 'saida',
      description: desc,
      installmentGroupId: 'grp-netflix',
    });
    const recTask = recurringTask({ dueDay: 20, value_cents: 3990, type: 'saida', description: desc });
    const result = computeCashflowTimeline({
      currentBalanceCents: cents(100000),
      transactions: [installTx],
      recurringTasks: [recTask],
      today: TODAY,
      daysAhead: 30,
    });
    const day20 = result.find(d => d.date === '2026-07-20')!;
    expect(day20.events.filter(e => e.type === 'installment')).toHaveLength(1);
    expect(day20.events.filter(e => e.type === 'recurring')).toHaveLength(0);
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
