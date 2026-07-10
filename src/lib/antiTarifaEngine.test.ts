import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { detectarTarifas } from './antiTarifaEngine';
import type { Transaction } from '../shared/types/transaction';
import type { Centavos } from '../shared/types/money';

// Fixa a data atual para testes determinísticos
const FIXED_NOW = new Date('2025-06-13T12:00:00Z');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});
afterEach(() => vi.useRealTimers());

let _id = 0;
function makeTx(overrides: Partial<Transaction> & { value_cents: Centavos }): Transaction {
  return {
    id: `tx-${++_id}`,
    description: 'Tarifa de Manutenção',
    type: 'saida',
    category: 'Impostos/Taxas',
    date: '2025-05-01',
    isDeleted: false,
    ...overrides,
  } as Transaction;
}

describe('detectarTarifas — básico', () => {
  it('retorna relatorio vazio quando não há transações', () => {
    const r = detectarTarifas([]);
    expect(r.tarifas).toHaveLength(0);
    expect(r.totalEstimadoAnualCents).toBe(0);
    expect(r.transacoesAnalisadas).toBe(0);
  });

  it('ignora transações deletadas', () => {
    const txs = [
      makeTx({ value_cents: 2000 as Centavos, isDeleted: true, date: '2025-04-01' }),
      makeTx({ value_cents: 2000 as Centavos, isDeleted: true, date: '2025-05-01' }),
    ];
    const r = detectarTarifas(txs);
    expect(r.tarifas).toHaveLength(0);
  });

  it('ignora transações de entrada', () => {
    const txs = [
      makeTx({ value_cents: 2000 as Centavos, type: 'entrada', date: '2025-04-01' }),
      makeTx({ value_cents: 2000 as Centavos, type: 'entrada', date: '2025-05-01' }),
    ];
    const r = detectarTarifas(txs);
    expect(r.tarifas).toHaveLength(0);
  });

  it('ignora cobranças acima do limiar (> R$ 80)', () => {
    const txs = [
      makeTx({ value_cents: 10000 as Centavos, date: '2025-04-01' }),
      makeTx({ value_cents: 10000 as Centavos, date: '2025-05-01' }),
    ];
    const r = detectarTarifas(txs);
    expect(r.tarifas).toHaveLength(0);
  });

  it('ignora cobranças que aparecem em apenas 1 mês', () => {
    const txs = [makeTx({ value_cents: 1500 as Centavos, date: '2025-05-01' })];
    const r = detectarTarifas(txs);
    expect(r.tarifas).toHaveLength(0);
  });

  it('detecta tarifa recorrente em 2 meses', () => {
    const txs = [
      makeTx({ value_cents: 1500 as Centavos, date: '2025-04-01' }),
      makeTx({ value_cents: 1500 as Centavos, date: '2025-05-01' }),
    ];
    const r = detectarTarifas(txs);
    expect(r.tarifas).toHaveLength(1);
    expect(r.tarifas[0]!.frequencia).toBe(2);
  });

  it('agrupa transações do mesmo mês como uma única ocorrência', () => {
    // Duas cobranças no mesmo mês contam como frequencia=1 (só 1 mês)
    const txs = [
      makeTx({ value_cents: 1500 as Centavos, date: '2025-05-01' }),
      makeTx({ value_cents: 1500 as Centavos, date: '2025-05-15' }),
    ];
    const r = detectarTarifas(txs);
    // Frequencia = 1 mês → abaixo de MIN_FREQUENCIA → não detecta
    expect(r.tarifas).toHaveLength(0);
  });
});

describe('detectarTarifas — classificação de risco', () => {
  it('classifica como alto risco quando descrição contém keyword de tarifa', () => {
    const txs = [
      makeTx({ description: 'Tarifa Manutenção Conta', value_cents: 2000 as Centavos, date: '2025-04-01' }),
      makeTx({ description: 'Tarifa Manutenção Conta', value_cents: 2000 as Centavos, date: '2025-05-01' }),
    ];
    const r = detectarTarifas(txs);
    expect(r.tarifas[0]!.risco).toBe('alto');
  });

  it('classifica como medio risco para keyword suspeita', () => {
    const txs = [
      makeTx({ description: 'Seguro Auto Premium', value_cents: 5000 as Centavos, date: '2025-04-01' }),
      makeTx({ description: 'Seguro Auto Premium', value_cents: 5000 as Centavos, date: '2025-05-01' }),
    ];
    const r = detectarTarifas(txs);
    // "seguro" = medio risco keyword; valor < limiar → pontos = 1+1 = 2 → medio
    expect(r.tarifas[0]!.risco).toBe('medio');
  });

  it('fornece razoes não vazias para cada tarifa detectada', () => {
    const txs = [
      makeTx({ description: 'Anuidade Cartão Platinum', value_cents: 3000 as Centavos, date: '2025-04-01' }),
      makeTx({ description: 'Anuidade Cartão Platinum', value_cents: 3000 as Centavos, date: '2025-05-01' }),
    ];
    const r = detectarTarifas(txs);
    expect(r.tarifas[0]!.razoes.length).toBeGreaterThan(0);
  });
});

describe('detectarTarifas — cálculos financeiros', () => {
  it('calcula totalCobradoCents corretamente', () => {
    const txs = [
      makeTx({ value_cents: 1500 as Centavos, date: '2025-03-01' }),
      makeTx({ value_cents: 2000 as Centavos, date: '2025-04-01' }),
      makeTx({ value_cents: 1800 as Centavos, date: '2025-05-01' }),
    ];
    const r = detectarTarifas(txs);
    expect(r.tarifas[0]!.totalCobradoCents).toBe(5300);
  });

  it('calcula projecaoAnualCents como valorMedio × 12', () => {
    // 3 meses, total 5300 → média 1766.67 → arredondado 1767 → anual 21204
    const txs = [
      makeTx({ value_cents: 1500 as Centavos, date: '2025-03-01' }),
      makeTx({ value_cents: 2000 as Centavos, date: '2025-04-01' }),
      makeTx({ value_cents: 1800 as Centavos, date: '2025-05-01' }),
    ];
    const r = detectarTarifas(txs);
    const t = r.tarifas[0]!;
    const mediaCents = Math.round(5300 / 3);
    expect(t.projecaoAnualCents).toBe(mediaCents * 12);
  });

  it('soma totalEstimadoAnualCents de todas as tarifas', () => {
    const txs = [
      makeTx({ description: 'Tarifa A', value_cents: 1000 as Centavos, date: '2025-04-01' }),
      makeTx({ description: 'Tarifa A', value_cents: 1000 as Centavos, date: '2025-05-01' }),
      makeTx({ description: 'Seguro B', value_cents: 2000 as Centavos, date: '2025-04-01' }),
      makeTx({ description: 'Seguro B', value_cents: 2000 as Centavos, date: '2025-05-01' }),
    ];
    const r = detectarTarifas(txs);
    expect(r.tarifas).toHaveLength(2);
    const expected = r.tarifas.reduce((a, t) => a + t.projecaoAnualCents, 0);
    expect(r.totalEstimadoAnualCents).toBe(expected);
  });

  it('registra ultimo valor como o da transação mais recente', () => {
    const txs = [
      makeTx({ value_cents: 1000 as Centavos, date: '2025-03-01' }),
      makeTx({ value_cents: 1200 as Centavos, date: '2025-05-15' }),
      makeTx({ value_cents: 1100 as Centavos, date: '2025-04-01' }),
    ];
    const r = detectarTarifas(txs);
    expect(r.tarifas[0]!.ultimoValorCents).toBe(1200); // maio 15 = mais recente
  });
});

describe('detectarTarifas — ordenação', () => {
  it('ordena alto risco antes de medio', () => {
    const txs = [
      makeTx({ description: 'Seguro vida extra', value_cents: 5000 as Centavos, date: '2025-04-01' }),
      makeTx({ description: 'Seguro vida extra', value_cents: 5000 as Centavos, date: '2025-05-01' }),
      makeTx({ description: 'Tarifa manutenção conta', value_cents: 1500 as Centavos, date: '2025-04-01' }),
      makeTx({ description: 'Tarifa manutenção conta', value_cents: 1500 as Centavos, date: '2025-05-01' }),
    ];
    const r = detectarTarifas(txs);
    expect(r.tarifas[0]!.risco).toBe('alto');
  });
});

describe('detectarTarifas — frequência alta e fallback de valor', () => {
  it('adiciona razão de meses consecutivos quando frequência ≥ 6', () => {
    // 6 meses distintos dentro da janela (dez/2024 – maio/2025)
    const meses = ['2024-12', '2025-01', '2025-02', '2025-03', '2025-04', '2025-05'];
    const txs = meses.map((ym) =>
      makeTx({
        description: 'Tarifa Manutenção Conta',
        value_cents: 1500 as Centavos,
        date: `${ym}-01`,
      }),
    );
    const r = detectarTarifas(txs);
    expect(r.tarifas[0]!.frequencia).toBe(6);
    expect(r.tarifas[0]!.risco).toBe('alto');
    expect(r.tarifas[0]!.razoes.some((rz) => rz.includes('6 meses consecutivos'))).toBe(true);
  });

  it('usa value legado quando value_cents está ausente', () => {
    // Sem value_cents → canonicalCents cai em toCentavos(tx.value)
    const legado = (date: string): Transaction => {
      const t = makeTx({ value_cents: 0 as Centavos, value: 15, date });
      delete (t as { value_cents?: Centavos }).value_cents;
      return t;
    };
    const txs = [legado('2025-04-01'), legado('2025-05-01')];
    const r = detectarTarifas(txs);
    expect(r.tarifas).toHaveLength(1);
    expect(r.tarifas[0]!.ultimoValorCents).toBe(1500);
  });

  it('trata value e value_cents ausentes como zero', () => {
    const semValor = (date: string): Transaction => {
      const t = makeTx({ value_cents: 0 as Centavos, date });
      delete (t as { value_cents?: Centavos }).value_cents;
      delete (t as { value?: number }).value;
      return t;
    };
    const txs = [semValor('2025-04-01'), semValor('2025-05-01')];
    const r = detectarTarifas(txs);
    expect(r.tarifas[0]!.totalCobradoCents).toBe(0);
  });
});

describe('detectarTarifas — janela de tempo', () => {
  it('ignora transações fora da janela de 12 meses', () => {
    // Transação de 14 meses atrás não deve ser incluída
    const velha = new Date(FIXED_NOW);
    velha.setMonth(velha.getMonth() - 14);
    const txs = [
      makeTx({ value_cents: 1500 as Centavos, date: velha.toISOString().slice(0, 10) }),
      makeTx({ value_cents: 1500 as Centavos, date: '2025-05-01' }),
    ];
    // Apenas 1 mês na janela → frequencia=1 → não detecta
    const r = detectarTarifas(txs);
    expect(r.tarifas).toHaveLength(0);
  });

  it('respeita janela customizada', () => {
    const txs = [
      makeTx({ value_cents: 1500 as Centavos, date: '2025-04-01' }),
      makeTx({ value_cents: 1500 as Centavos, date: '2025-05-01' }),
    ];
    // Janela de 1 mês: apenas maio → frequencia=1 → não detecta
    const r = detectarTarifas(txs, 1);
    expect(r.tarifas).toHaveLength(0);
  });
});
