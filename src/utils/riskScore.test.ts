import { describe, it, expect } from 'vitest';
import { annotateRiskScores } from './riskScore';
import type { Transaction } from '../shared/types/transaction';
import type { Centavos } from '../shared/types/money';

const cents = (value: number): Centavos => value as Centavos;

function expenseTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id:            'tx',
    description:   'Despesa',
    value_cents:   cents(1000),
    schemaVersion: 2,
    type:          'saida',
    category:      'Alimentação',
    date:          '2026-04-20',
    ...overrides,
  } as Transaction;
}

describe('annotateRiskScores — detecção estatística de anomalias por categoria', () => {
  it('categoria com menos de 3 transações fica sempre normal (baseline insuficiente)', () => {
    const txs = [
      expenseTx({ id: 't1', value_cents: cents(1000) }),
      expenseTx({ id: 't2', value_cents: cents(100000) }), // outlier, mas só 2 pontos na categoria
    ];
    const result = annotateRiskScores(txs);
    expect(result.every(t => t.riskScore === 'normal')).toBe(true);
  });

  it('classifica como anomalous um valor muito acima do desvio padrão da categoria', () => {
    // Com n-1 pontos idênticos (std da base = 0) + 1 outlier, o z-score do outlier
    // converge para sqrt(n-1) independente da magnitude — com n=8 (7 + outlier),
    // z = sqrt(7) ≈ 2.646, sempre > 2.5 (anomalous), verificado analiticamente.
    const txs = [
      ...Array.from({ length: 7 }, (_, i) => expenseTx({ id: `base-${i}`, value_cents: cents(1000) })),
      expenseTx({ id: 'outlier', value_cents: cents(50000) }),
    ];
    const result = annotateRiskScores(txs);
    const outlier = result.find(t => t.id === 'outlier')!;
    expect(outlier.riskScore).toBe('anomalous');
  });

  it('classifica valores próximos da média da categoria como normal', () => {
    // mean=1002.5, std≈5.59 — maior desvio (995) fica a z≈1.34, abaixo do corte de 1.5
    const txs = [
      expenseTx({ id: 't1', value_cents: cents(1000) }),
      expenseTx({ id: 't2', value_cents: cents(1010) }),
      expenseTx({ id: 't3', value_cents: cents(995) }),
      expenseTx({ id: 't4', value_cents: cents(1005) }),
    ];
    const result = annotateRiskScores(txs);
    expect(result.every(t => t.riskScore === 'normal')).toBe(true);
  });

  it('z-score é assimétrico: só detecta gastos ACIMA da média, nunca abaixo (sem valor absoluto)', () => {
    // Um valor muito ABAIXO da média não é sinalizado — só "gastou muito mais que o normal" importa.
    const txs = [
      expenseTx({ id: 't1', value_cents: cents(1000) }),
      expenseTx({ id: 't2', value_cents: cents(1000) }),
      expenseTx({ id: 't3', value_cents: cents(1000) }),
      expenseTx({ id: 'low', value_cents: cents(1) }), // muito abaixo da média, mas z negativo
    ];
    const result = annotateRiskScores(txs);
    expect(result.find(t => t.id === 'low')!.riskScore).toBe('normal');
  });

  it('receitas e transferências sempre recebem riskScore normal', () => {
    const txs = [
      expenseTx({ id: 't1', type: 'entrada', category: 'Salário', value_cents: cents(500000) }),
    ];
    const result = annotateRiskScores(txs);
    expect(result[0]!.riskScore).toBe('normal');
  });

  it('transações com valor zero recebem riskScore normal', () => {
    const txs = [expenseTx({ id: 't1', value_cents: cents(0) })];
    const result = annotateRiskScores(txs);
    expect(result[0]!.riskScore).toBe('normal');
  });

  it('categorias diferentes têm estatísticas independentes', () => {
    const txs = [
      // Categoria A: baixa variância, outlier moderado
      expenseTx({ id: 'a1', category: 'A', value_cents: cents(1000) }),
      expenseTx({ id: 'a2', category: 'A', value_cents: cents(1000) }),
      expenseTx({ id: 'a3', category: 'A', value_cents: cents(1000) }),
      // Categoria B: alta variância, mesmo valor absoluto não é outlier
      expenseTx({ id: 'b1', category: 'B', value_cents: cents(1000) }),
      expenseTx({ id: 'b2', category: 'B', value_cents: cents(5000) }),
      expenseTx({ id: 'b3', category: 'B', value_cents: cents(9000) }),
    ];
    const result = annotateRiskScores(txs);
    // Categoria A tem desvio padrão 0 → fica normal por definição (guard std === 0)
    expect(result.find(t => t.id === 'a1')!.riskScore).toBe('normal');
  });

  it('preserva os demais campos da transação original', () => {
    const txs = [expenseTx({ id: 't1', description: 'Compra específica' })];
    const result = annotateRiskScores(txs);
    expect(result[0]!.description).toBe('Compra específica');
    expect(result[0]!.id).toBe('t1');
  });
});
