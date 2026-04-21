// src/utils/formatters.test.ts
import { describe, it, expect } from 'vitest';
import { formatCurrency, formatPercent } from './formatters';

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
    expect(formatPercent(15.55)).toBe('15.6%');
    expect(formatPercent(10, 2)).toBe('10.00%');
    expect(formatPercent(0)).toBe('0.0%');
  });

  it('deve proteger percentagens contra valores nulos', () => {
    expect(formatPercent(null)).toBe('0.0%');
    expect(formatPercent(undefined, 2)).toBe('0.00%');
  });
});
