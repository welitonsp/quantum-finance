import { describe, it, expect } from 'vitest';
import { calculateForecast } from './ForecastChart';
import type { Transaction } from '../shared/types/transaction';
import type { Centavos } from '../shared/types/money';

const cents = (n: number): Centavos => n as Centavos;

let seq = 0;
function tx(overrides: Partial<Omit<Transaction, 'value_cents'>> & { value_cents?: number }): Transaction {
  seq += 1;
  const { value_cents, ...rest } = overrides;
  return {
    id: `tx-${seq}`,
    description: 'Despesa',
    date: '2026-07-05',
    value_cents: cents(value_cents ?? 10000),
    type: 'saida',
    category: 'Outros',
    ...rest,
  } as Transaction;
}

/** Julho de 2026 como data fixa de referência (day 9). */
const NOW_JUL9 = new Date('2026-07-09T12:00:00Z');

describe('calculateForecast', () => {
  it('retorna zeros e gráfico com diasNoMes entradas para lista vazia', () => {
    const result = calculateForecast([], 7, 2026, NOW_JUL9);
    expect(result.gastoAtual).toBe(0);
    expect(result.projecaoFinal).toBe(0);
    expect(result.ritmoDiario).toBe(0);
    // Julho tem 31 dias
    expect(result.dadosGrafico).toHaveLength(31);
  });

  it('dias até hoje têm real=0 (sem despesas), dias futuros têm real=null', () => {
    const result = calculateForecast([], 7, 2026, NOW_JUL9);
    // dia 1 (índice 0) a dia 9 (índice 8): real preenchido
    expect(result.dadosGrafico[0]!.real).toBe(0);
    expect(result.dadosGrafico[8]!.real).toBe(0);
    // dia 10 (índice 9): real=null
    expect(result.dadosGrafico[9]!.real).toBeNull();
    expect(result.dadosGrafico[30]!.real).toBeNull();
  });

  it('acumula despesas e retorna gastoAtual correto', () => {
    // Despesa de R$ 90,00 em dia dentro da janela
    const txs = [tx({ date: '2026-07-05', value_cents: 9000, type: 'saida' })];
    const result = calculateForecast(txs, 7, 2026, NOW_JUL9);
    // gastoAtual = total acumulado até diaAtual (dia 9)
    expect(result.gastoAtual).toBe(90);
    // O último ponto real (índice 8 = dia 9) reflete o total
    expect(result.dadosGrafico[8]!.real).toBe(90);
    // Dias futuros continuam com real=null
    expect(result.dadosGrafico[9]!.real).toBeNull();
  });

  it('computa ritmoDiario e projecaoFinal a partir do burn rate', () => {
    // R$ 90,00 gastos em 9 dias → ritmo R$ 10,00/dia → projeção R$ 310,00 em 31 dias
    const txs = [tx({ date: '2026-07-05', value_cents: 9000, type: 'saida' })];
    const result = calculateForecast(txs, 7, 2026, NOW_JUL9);
    expect(result.ritmoDiario).toBeCloseTo(10, 1);
    expect(result.projecaoFinal).toBeCloseTo(310, 0);
  });

  it('preenche projetado nos dias futuros do mês atual', () => {
    const txs = [tx({ date: '2026-07-05', value_cents: 9000, type: 'saida' })];
    const result = calculateForecast(txs, 7, 2026, NOW_JUL9);
    // Dia 9 (diaAtual): deve ter projetado = real (ponto de ancoragem)
    expect(result.dadosGrafico[8]!.projetado).toBe(90);
    // Dia 10 em diante: projetado > 0
    expect(result.dadosGrafico[9]!.projetado).toBeGreaterThan(90);
    // Dia 31: projetado ≈ projecaoFinal
    const lastPoint = result.dadosGrafico[30]!;
    expect(lastPoint.projetado).toBeCloseTo(result.projecaoFinal, 0);
  });

  it('não gera projeção (projetado=null) para mês não-atual', () => {
    // Junho 2026 com NOW em julho → mês passado
    const now = new Date('2026-07-09T12:00:00Z');
    const result = calculateForecast([], 6, 2026, now);
    const anyProjection = result.dadosGrafico.some(d => d.projetado !== null);
    expect(anyProjection).toBe(false);
  });

  it('para mês não-atual, todos os dias têm real preenchido (diaAtual=diasNoMes)', () => {
    // Junho tem 30 dias
    const now = new Date('2026-07-09T12:00:00Z');
    const result = calculateForecast([], 6, 2026, now);
    expect(result.dadosGrafico).toHaveLength(30);
    expect(result.dadosGrafico[29]!.real).toBe(0); // último dia preenchido
    expect(result.dadosGrafico[29]!.projetado).toBeNull();
  });

  it('ignora transações que não são despesas', () => {
    const txs = [
      tx({ date: '2026-07-05', value_cents: 50000, type: 'entrada' }),
      tx({ date: '2026-07-05', value_cents: 50000, type: 'transferencia' }),
    ];
    const result = calculateForecast(txs, 7, 2026, NOW_JUL9);
    expect(result.gastoAtual).toBe(0);
    expect(result.projecaoFinal).toBe(0);
  });

  it('o campo dia do gráfico é string do número do dia', () => {
    const result = calculateForecast([], 7, 2026, NOW_JUL9);
    expect(result.dadosGrafico[0]!.dia).toBe('1');
    expect(result.dadosGrafico[14]!.dia).toBe('15');
    expect(result.dadosGrafico[30]!.dia).toBe('31');
  });
});
