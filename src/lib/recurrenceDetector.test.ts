import { describe, it, expect } from 'vitest';
import { detectRecurrenceCandidates } from './recurrenceDetector';
import type { Transaction } from '../shared/types/transaction';
import type { Centavos } from '../shared/types/money';

let _id = 0;
function makeTx(overrides: Partial<Transaction> & { value_cents: Centavos }): Transaction {
  return {
    id: `tx-${++_id}`,
    description: 'Assinatura Streaming',
    type: 'saida',
    category: 'Lazer',
    date: '2025-01-01',
    isDeleted: false,
    ...overrides,
  } as Transaction;
}

describe('detectRecurrenceCandidates — detecção básica', () => {
  it('detecta padrão recorrente mensal com intervalos regulares', () => {
    const txs = [
      makeTx({ value_cents: 5000 as Centavos, date: '2025-01-01' }),
      makeTx({ value_cents: 5000 as Centavos, date: '2025-01-31' }),
      makeTx({ value_cents: 5000 as Centavos, date: '2025-03-02' }),
    ];
    const candidates = detectRecurrenceCandidates(txs);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.intervalDays).toBe(30);
    expect(candidates[0]!.avgAmountCents).toBe(5000);
    expect(candidates[0]!.confidence).toBeGreaterThan(0);
    expect(candidates[0]!.suggestedCategory).toBe('Lazer');
    expect(candidates[0]!.occurrences).toHaveLength(3);
  });

  it('ignora grupos com menos de 3 ocorrências', () => {
    const txs = [
      makeTx({ value_cents: 5000 as Centavos, date: '2025-01-01' }),
      makeTx({ value_cents: 5000 as Centavos, date: '2025-02-01' }),
    ];
    expect(detectRecurrenceCandidates(txs)).toHaveLength(0);
  });

  it('ordena candidatos por confiança decrescente', () => {
    const txs = [
      // Grupo regular (alta confiança)
      makeTx({ description: 'Netflix', value_cents: 5000 as Centavos, date: '2025-01-01' }),
      makeTx({ description: 'Netflix', value_cents: 5000 as Centavos, date: '2025-01-31' }),
      makeTx({ description: 'Netflix', value_cents: 5000 as Centavos, date: '2025-03-02' }),
      // Grupo com leve variação de valor (confiança menor)
      makeTx({ description: 'Spotify', value_cents: 2000 as Centavos, date: '2025-01-05' }),
      makeTx({ description: 'Spotify', value_cents: 2200 as Centavos, date: '2025-02-04' }),
      makeTx({ description: 'Spotify', value_cents: 2100 as Centavos, date: '2025-03-06' }),
    ];
    const candidates = detectRecurrenceCandidates(txs);
    expect(candidates.length).toBe(2);
    expect(candidates[0]!.confidence).toBeGreaterThanOrEqual(candidates[1]!.confidence);
  });
});

describe('detectRecurrenceCandidates — filtros de elegibilidade', () => {
  const base = { value_cents: 5000 as Centavos };

  it('exclui transações sem value_cells positivo', () => {
    const txs = [
      makeTx({ value_cents: 0 as Centavos, date: '2025-01-01' }),
      makeTx({ value_cents: 0 as Centavos, date: '2025-02-01' }),
      makeTx({ value_cents: 0 as Centavos, date: '2025-03-01' }),
    ];
    expect(detectRecurrenceCandidates(txs)).toHaveLength(0);
  });

  it('exclui transações deletadas', () => {
    const txs = [
      makeTx({ ...base, isDeleted: true, date: '2025-01-01' }),
      makeTx({ ...base, isDeleted: true, date: '2025-01-31' }),
      makeTx({ ...base, isDeleted: true, date: '2025-03-02' }),
    ];
    expect(detectRecurrenceCandidates(txs)).toHaveLength(0);
  });

  it('exclui parcelamentos (installmentGroupId presente)', () => {
    const txs = [
      makeTx({ ...base, installmentGroupId: 'g1', date: '2025-01-01' }),
      makeTx({ ...base, installmentGroupId: 'g1', date: '2025-01-31' }),
      makeTx({ ...base, installmentGroupId: 'g1', date: '2025-03-02' }),
    ];
    expect(detectRecurrenceCandidates(txs)).toHaveLength(0);
  });

  it('exclui transferências e entradas', () => {
    const txs = [
      makeTx({ ...base, type: 'transferencia', date: '2025-01-01' }),
      makeTx({ ...base, type: 'entrada', date: '2025-01-31' }),
      makeTx({ ...base, type: 'receita', date: '2025-03-02' }),
    ];
    expect(detectRecurrenceCandidates(txs)).toHaveLength(0);
  });
});

describe('detectRecurrenceCandidates — regularidade e variação', () => {
  it('descarta intervalos irregulares (CV ≥ 0.20)', () => {
    const txs = [
      makeTx({ value_cents: 5000 as Centavos, date: '2025-01-01' }),
      makeTx({ value_cents: 5000 as Centavos, date: '2025-01-05' }),
      makeTx({ value_cents: 5000 as Centavos, date: '2025-03-01' }),
    ];
    expect(detectRecurrenceCandidates(txs)).toHaveLength(0);
  });

  it('descarta quando todas as datas são iguais (intervalos zerados)', () => {
    // intervalos [0,0] → média 0 → CV Infinity → descartado
    const txs = [
      makeTx({ value_cents: 5000 as Centavos, date: '2025-01-01' }),
      makeTx({ value_cents: 5000 as Centavos, date: '2025-01-01' }),
      makeTx({ value_cents: 5000 as Centavos, date: '2025-01-01' }),
    ];
    expect(detectRecurrenceCandidates(txs)).toHaveLength(0);
  });

  it('descarta quando valores variam mais de ±15%', () => {
    const txs = [
      makeTx({ value_cents: 5000 as Centavos, date: '2025-01-01' }),
      makeTx({ value_cents: 5000 as Centavos, date: '2025-01-31' }),
      makeTx({ value_cents: 8000 as Centavos, date: '2025-03-02' }),
    ];
    expect(detectRecurrenceCandidates(txs)).toHaveLength(0);
  });

  it('não sugere categoria quando transações não têm categoria', () => {
    const noCat = (date: string): Transaction => {
      const t = makeTx({ value_cents: 5000 as Centavos, date });
      delete (t as { category?: string }).category;
      return t;
    };
    const txs = [noCat('2025-01-01'), noCat('2025-01-31'), noCat('2025-03-02')];
    const candidates = detectRecurrenceCandidates(txs);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.suggestedCategory).toBeUndefined();
  });
});
