// src/utils/formatters.test.ts
import { describe, it, expect } from 'vitest';
import { formatCurrency, formatNumber, formatPercent, roundForDisplay } from './formatters';
import { toCentavos } from '../shared/types/money';

describe('Fábrica de Formatação (UI)', () => {
  it('deve formatar valores monetários para o padrão BRL (R$)', () => {
    const formatted = formatCurrency(1500.5).replace(/\s/g, ' ');
    expect(formatted).toMatch(/R\$\s?1\.500,50/);

    const zero = formatCurrency(0).replace(/\s/g, ' ');
    expect(zero).toMatch(/R\$\s?0,00/);
  });

  it('deve proteger a UI contra valores nulos e inválidos na moeda', () => {
    const invalid = formatCurrency(null).replace(/\s/g, ' ');
    expect(invalid).toMatch(/R\$\s?0,00/);

    const notANumber = formatCurrency(NaN).replace(/\s/g, ' ');
    expect(notANumber).toMatch(/R\$\s?0,00/);
  });

  it('deve formatar percentagens com a precisão exigida', () => {
    expect(formatPercent(15.55)).toBe('15,6%');
    expect(formatPercent(10, 2)).toBe('10,00%');
    expect(formatPercent(0)).toBe('0,0%');
    expect(formatPercent(0.83, 2)).toBe('0,83%');
    expect(formatPercent(1234.5)).toBe('1.234,5%');
    expect(formatPercent(12, 0)).toBe('12%');
  });

  it('deve proteger percentagens contra valores nulos', () => {
    expect(formatPercent(null)).toBe('0,0%');
    expect(formatPercent(undefined, 2)).toBe('0,00%');
    expect(formatPercent(NaN)).toBe('0,0%');
    expect(formatPercent(Infinity)).toBe('0,0%');
    expect(formatPercent(-Infinity, 2)).toBe('0,00%');
  });

  it('deve aceitar string numérica nas percentagens', () => {
    expect(formatPercent('15.55')).toBe('15,6%');
    expect(formatPercent('abc')).toBe('0,0%');
  });

  it('deve formatar números no padrão pt-BR', () => {
    expect(formatNumber(2.5)).toBe('2,5');
    expect(formatNumber(1234.567, 2)).toBe('1.234,57');
    expect(formatNumber(3, 0)).toBe('3');
    expect(formatNumber(null)).toBe('0,0');
    expect(formatNumber(Infinity)).toBe('0,0');
    expect(formatNumber('7.25', 1)).toBe('7,3');
    expect(formatNumber(-0.04)).toBe('0,0');
  });

  it('deve arredondar para exibição de forma consistente com a formatação', () => {
    expect(roundForDisplay(9.96, 1)).toBe(10);
    expect(roundForDisplay(9.94, 1)).toBe(9.9);
    expect(roundForDisplay(NaN)).toBe(0);
  });

  it('deve formatar centavos canonicos sem alterar a UI', () => {
    const formatted = formatCurrency(toCentavos(1500.5), { cents: true }).replace(/\s/g, ' ');
    expect(formatted).toMatch(/R\$\s?1\.500,50/);
  });
});
