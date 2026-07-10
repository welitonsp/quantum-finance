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

describe('calculateForecast - health assessment', () => {
  it('health = warning quando saldo cai mas permanece positivo', () => {
    // 5 despesas recentes → run rate negativo, mas saldo 1000 aguenta
    const txs = [1, 2, 3, 4, 5].map(i =>
      tx('saida', 2000, `2026-04-${String(i).padStart(2, '0')}`),
    );
    const result = calculateForecast(txs, 1000, 30, FIXED_DATE);
    expect(result.health).toBe('warning');
    expect(result.finalBalance).toBeGreaterThan(0);
    expect(result.finalBalance).toBeLessThan(1000);
  });

  it('health = good quando saldo aumenta (receitas > despesas)', () => {
    const txs = [
      tx('entrada', 50000, '2026-04-10'),
      tx('saida',   10000, '2026-04-12'),
    ];
    const result = calculateForecast(txs, 1000, 30, FIXED_DATE);
    expect(result.health).toBe('good');
    expect(result.finalBalance).toBeGreaterThanOrEqual(1000);
  });
});

describe('calculateForecast - projeção de recorrentes', () => {
  it('salta datas passadas na projeção (projection guard)', () => {
    // lastDate Feb 15 + 31 dias = Mar 18 (passado, skipped pela guard)
    // Mar 18 + 31 = Apr 18 (futuro) → projetado aí
    const ref = new Date('2026-04-15T12:00:00Z');
    const txs = [
      tx('saida', 10000, '2026-01-15', 'Assinatura Anual'),
      tx('saida', 10000, '2026-02-15', 'Assinatura Anual'),
    ];
    const result = calculateForecast(txs, 500, 30, ref);
    expect(result.points.length).toBeGreaterThan(0);
    // Apr 18: recorrente projetado (despesa de R$100 abate o saldo de R$500)
    const day18 = result.points.find(p => p.date === '2026-04-18');
    expect(day18).toBeDefined();
    expect(day18!.balance).toBeLessThan(500);
  });

  it('descarta grupo com intervalos irregulares (stdDev/avg >= 0.20)', () => {
    // Intervalos: Jan 1→Jan 5 = 4 dias, Jan 5→Jan 20 = 15 dias
    // avg=9.5, stdDev≈5.5, stdDev/avg≈0.579 > 0.20 → irregular, descartado
    // Todas as datas estão antes do cutoff (Mar 16) → run rate = 0 → saldo estável
    const txs = [
      tx('saida', 10000, '2026-01-01', 'Irregular'),
      tx('saida', 10000, '2026-01-05', 'Irregular'),
      tx('saida', 10000, '2026-01-20', 'Irregular'),
    ];
    const result = calculateForecast(txs, 200, 30, FIXED_DATE);
    expect(result.finalBalance).toBeCloseTo(200, 0);
  });

  it('descarta entradas duplicadas no mesmo dia (avg <= 0 guard)', () => {
    // Duas ocorrências no mesmo dia → intervalo=0, avg=0 → ignorado
    const txs = [
      tx('saida', 10000, '2026-04-10', 'Duplicada'),
      tx('saida', 10000, '2026-04-10', 'Duplicada'),
    ];
    // Não deve lançar erro nem projetar recorrente inválido
    expect(() => calculateForecast(txs, 500, 30, FIXED_DATE)).not.toThrow();
  });
});

// ─── branches adicionais ──────────────────────────────────────────────────────

describe('calculateForecast — branches adicionais', () => {
  it('median com quantidade par de valores cobre o ramo even-length', () => {
    // incomeVals terá exatamente 2 elementos → median usa (s[0]+s[1])/2
    const txs = [
      tx('entrada', 10000, '2026-04-10', 'Entrada1'),
      tx('entrada', 30000, '2026-04-11', 'Entrada2'),
    ];
    const result = calculateForecast(txs, 0, 30, FIXED_DATE);
    // medInc = (10000+30000)/2 = 20000; ambos <= 60000 → filteredInc preservado
    expect(result.health).toBe('good');
  });

  it('recorrente do tipo entrada projeta com signed positivo (isIncome=true)', () => {
    // 2 ocorrências de 'Salário' entrada → recorrente detectado; isIncome=true → signed=+10000
    const ref = new Date('2026-04-01T12:00:00Z');
    const txs = [
      tx('entrada', 10000, '2026-02-15', 'Salário'),
      tx('entrada', 10000, '2026-03-15', 'Salário'),
    ];
    const result = calculateForecast(txs, 0, 30, ref);
    // recorrente projetado ~Apr 12 eleva saldo de 0 → algum ponto com balance > 0
    expect(result.points.some(p => p.balance > 0)).toBe(true);
    expect(result.finalBalance).toBeGreaterThan(0);
  });

  it('ignora transação sem date no agrupamento (branch !tx.date)', () => {
    const noDate = {
      ...tx('saida', 5000, '2026-04-01'),
      date: undefined,
    } as unknown as Transaction;
    expect(() => calculateForecast([tx('saida', 5000, '2026-04-01'), noDate], 100, 30, FIXED_DATE)).not.toThrow();
  });

  it('ignora transação com value_cents undefined no agrupamento (branch txCentavos===null)', () => {
    const noCents = {
      ...tx('saida', 5000, '2026-04-01'),
      value_cents: undefined,
    } as unknown as Transaction;
    expect(() => calculateForecast([tx('saida', 5000, '2026-04-01'), noCents], 100, 30, FIXED_DATE)).not.toThrow();
  });

  it('filtro de anomalia exclui outlier > mediana*3 (v <= medExp*3 false branch)', () => {
    // medExp = median([100, 100, 500]) = 100; 500 > 100*3=300 → removido
    const txs = [
      tx('saida', 100, '2026-04-10', 'Normal1'),
      tx('saida', 100, '2026-04-11', 'Normal2'),
      tx('saida', 500, '2026-04-12', 'Outlier'),
    ];
    const result = calculateForecast(txs, 1000, 30, FIXED_DATE);
    // sem outlier o run rate é baixo → saldo final positivo
    expect(result.finalBalance).toBeGreaterThan(0);
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
