import { describe, it, expect } from 'vitest';
import { serializeFinancialContext, resolveRefs } from '../contextSerializer';
import type { Centavos } from '../../shared/types/money';

const cents = (n: number): Centavos => n as Centavos;

describe('serializeFinancialContext', () => {
  it('produz refs com ref_saldo, ref_receita e ref_despesa', () => {
    const { refs } = serializeFinancialContext({
      balance: 1234,
      monthlyIncome:  cents(500000),
      monthlyExpense: cents(200000),
      topCategories: [],
    });
    expect(refs).toHaveProperty('ref_saldo');
    expect(refs).toHaveProperty('ref_receita');
    expect(refs).toHaveProperty('ref_despesa');
  });

  it('valores monetários são formatados como BRL, não como dígitos crus', () => {
    const { refs } = serializeFinancialContext({
      balance: 1234,
      monthlyIncome:  cents(500000),
      monthlyExpense: cents(200000),
      topCategories: [],
    });
    // Valores devem ser strings formatadas (contêm R$), não números
    expect(refs['ref_receita']).toContain('R$');
    expect(refs['ref_despesa']).toContain('R$');
    expect(refs['ref_saldo']).toContain('R$');
  });

  it('topCategories gera refs ref_cat0_nome e ref_cat0_valor', () => {
    const { refs } = serializeFinancialContext({
      balance: 0,
      monthlyIncome:  cents(100000),
      monthlyExpense: cents(50000),
      topCategories: [{ name: 'Alimentação', amountCents: cents(30000) }],
    });
    expect(refs['ref_cat0_nome']).toBe('Alimentação');
    expect(refs['ref_cat0_valor']).toContain('R$');
  });

  it('múltiplas topCategories geram índices incrementais', () => {
    const { refs } = serializeFinancialContext({
      balance: 0,
      monthlyIncome:  cents(100000),
      monthlyExpense: cents(50000),
      topCategories: [
        { name: 'Alimentação', amountCents: cents(30000) },
        { name: 'Transporte',  amountCents: cents(15000) },
      ],
    });
    expect(refs['ref_cat0_nome']).toBe('Alimentação');
    expect(refs['ref_cat1_nome']).toBe('Transporte');
  });

  it('topCategories vazio não gera entradas de categoria nos refs', () => {
    const { refs } = serializeFinancialContext({
      balance: 0,
      monthlyIncome:  cents(100000),
      monthlyExpense: cents(50000),
      topCategories: [],
    });
    expect(Object.keys(refs).filter(k => k.startsWith('ref_cat'))).toHaveLength(0);
  });

  it('systemInstruction menciona todos os tokens dos refs', () => {
    const { refs, systemInstruction } = serializeFinancialContext({
      balance: 500,
      monthlyIncome:  cents(100000),
      monthlyExpense: cents(50000),
      topCategories: [],
    });
    for (const key of Object.keys(refs)) {
      expect(systemInstruction).toContain(`{{${key}}}`);
    }
  });

  it('systemInstruction proíbe escrita de dígitos diretamente', () => {
    const { systemInstruction } = serializeFinancialContext({
      balance: 0,
      monthlyIncome:  cents(100000),
      monthlyExpense: cents(50000),
      topCategories: [],
    });
    expect(systemInstruction).toContain('NUNCA');
  });
});

describe('resolveRefs', () => {
  it('substitui token conhecido pelo valor do mapa', () => {
    const refs = { ref_saldo: 'R$ 1.234,00' };
    expect(resolveRefs('Seu saldo é {{ref_saldo}}.', refs)).toBe('Seu saldo é R$ 1.234,00.');
  });

  it('mantém token desconhecido como [?key] para evidenciar o problema', () => {
    const refs = { ref_saldo: 'R$ 100,00' };
    expect(resolveRefs('Valor: {{ref_xyz}}', refs)).toBe('Valor: [?ref_xyz]');
  });

  it('substitui múltiplos tokens distintos na mesma string', () => {
    const refs = { ref_receita: 'R$ 5.000,00', ref_despesa: 'R$ 2.000,00' };
    const result = resolveRefs('Receita: {{ref_receita}}, Despesa: {{ref_despesa}}', refs);
    expect(result).toBe('Receita: R$ 5.000,00, Despesa: R$ 2.000,00');
  });

  it('não altera texto sem tokens', () => {
    expect(resolveRefs('Sem tokens aqui.', {})).toBe('Sem tokens aqui.');
  });

  it('string vazia retorna string vazia', () => {
    expect(resolveRefs('', { ref_saldo: 'R$ 0,00' })).toBe('');
  });
});
