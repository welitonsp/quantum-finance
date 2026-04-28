import { describe, expect, it } from 'vitest';
import { calculateForecast } from './forecastEngine';
import type { Transaction } from '../shared/types/transaction';
import type { Centavos } from '../shared/types/money';

const FIXED_DATE = new Date('2026-04-15T12:00:00Z');

const c = (value: number): Centavos => value as Centavos;

const tx = (
  type: 'entrada' | 'saida',
  value_cents: number,
  date: string,
  description = `tx-${date}`,
): Transaction => ({
  id: `${date}-${type}-${value_cents}-${description}`,
  description,
  value_cents: c(value_cents),
  schemaVersion: 2,
  type,
  category: 'Outros',
  date,
});

describe('calculateForecast - determinismo e imutabilidade', () => {
  it('mesmo input + mesma data produz resultado idêntico', () => {
    const txs = [
      tx('saida', 10000, '2026-04-10'),
      tx('entrada', 20000, '2026-04-05'),
    ];
    const r1 = calculateForecast(txs, 1000, 30, FIXED_DATE);
    const r2 = calculateForecast(txs, 1000, 30, FIXED_DATE);
    expect(r1).toEqual(r2);
  });

  it('ordena transações cronologicamente sem mutar o array recebido', () => {
    const txs = [
      tx('saida', 10000, '2026-03-15', 'Assinatura'),
      tx('saida', 10000, '2026-02-15', 'Assinatura'),
    ];
    const originalOrder = txs.map(item => item.date);

    calculateForecast(txs, 1000, 30, new Date('2026-04-01T12:00:00Z'));

    expect(txs.map(item => item.date)).toEqual(originalOrder);
  });

  it('não muta referenceDate passada', () => {
    const ref = new Date(FIXED_DATE.getTime());
    calculateForecast([], 1000, 30, FIXED_DATE);
    expect(FIXED_DATE.getTime()).toBe(ref.getTime());
  });
});

describe('calculateForecast - centavos e recorrência', () => {
  it('sem transações retorna EMPTY com currentBalance preservado em reais', () => {
    const result = calculateForecast([], 999.99, 30, FIXED_DATE);
    expect(result.finalBalance).toBe(999.99);
    expect(result.minBalance).toBe(999.99);
    expect(result.points).toHaveLength(0);
    expect(result.health).toBe('good');
  });

  it('usa value_cents e ignora value legado em documentos v2', () => {
    const result = calculateForecast([
      {
        ...tx('saida', 12000, '2026-04-10'),
        value: 999999,
      },
    ], 1000, 1, FIXED_DATE);

    expect(result.finalBalance).toBe(996);
  });

  it('projeta recorrência detectada por intervalos cronológicos', () => {
    const result = calculateForecast([
      tx('saida', 10000, '2026-03-15', 'Netflix'),
      tx('saida', 10000, '2026-02-15', 'Netflix'),
    ], 1000, 20, new Date('2026-04-01T12:00:00Z'));

    expect(result.points.some(point => point.date === '2026-04-12' && point.balance === 900)).toBe(true);
    expect(result.finalBalance).toBe(900);
  });

  it('health = danger quando saldo projetado fica negativo', () => {
    const txs = Array.from({ length: 10 }, (_, i) =>
      tx('saida', 500000, `2026-04-${String(i + 1).padStart(2, '0')}`),
    );
    const result = calculateForecast(txs, 100, 30, FIXED_DATE);
    expect(result.health).toBe('danger');
  });
});
