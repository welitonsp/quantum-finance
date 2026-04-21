import { describe, it, expect } from 'vitest';
import { toCentavos, fromCentavos, validateTransaction } from './financialSchemas';

describe('Motor Financeiro — Centavos', () => {
  it('converte valores com precisão bancária', () => {
    expect(toCentavos(10.50)).toBe(1050);
    expect(toCentavos(1.005)).toBe(101); // Caso crítico de arredondamento
    expect(toCentavos(0)).toBe(0);
  });

  it('converte centavos para display sem erro de float', () => {
    expect(fromCentavos(1050)).toBe(10.50);
    expect(fromCentavos(1)).toBe(0.01);
  });

  it('rejeita transação com valor negativo', () => {
    const result = validateTransaction({
      description: 'Test', value: -100, type: 'saida',
      category: 'Diversos', date: '2026-04-01',
    });
    expect(result.success).toBe(false);
  });

  it('rejeita transação com data futura além de 30 dias', () => {
    const result = validateTransaction({
      description: 'Test', value: 100, type: 'saida',
      category: 'Diversos', date: '2099-12-31',
    });
    expect(result.success).toBe(false);
  });
});
