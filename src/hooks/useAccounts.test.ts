import { describe, it, expect } from 'vitest';
import { normalizeBalance } from './useAccounts';

describe('normalizeBalance — tolerância de schema', () => {
  it('schemaVersion: 2 → balance é centavos inteiros (passthrough)', () => {
    expect(normalizeBalance(150_050, 2)).toBe(150_050);   // R$ 1500,50
    expect(normalizeBalance(0, 2)).toBe(0);
    expect(normalizeBalance(-100_00, 2)).toBe(-10_000);   // R$ -100,00
  });

  it('schemaVersion: 2 com float (defensivo) → arredonda para inteiro', () => {
    expect(normalizeBalance(150_050.4, 2)).toBe(150_050);
    expect(normalizeBalance(150_050.6, 2)).toBe(150_051);
  });

  it('sem schemaVersion (legado) → trata como reais e converte para centavos', () => {
    expect(normalizeBalance(1500.50, undefined)).toBe(150_050);
    expect(normalizeBalance(0, undefined)).toBe(0);
    expect(normalizeBalance(-100, undefined)).toBe(-10_000);
  });

  it('schemaVersion: 1 ou outros valores → trata como legado', () => {
    expect(normalizeBalance(1500.50, 1)).toBe(150_050);
    expect(normalizeBalance(1500.50, null)).toBe(150_050);
    expect(normalizeBalance(1500.50, 'v1')).toBe(150_050);
  });

  it('valores inválidos → 0', () => {
    expect(normalizeBalance(NaN, 2)).toBe(0);
    expect(normalizeBalance(undefined, 2)).toBe(0);
    expect(normalizeBalance(null, 2)).toBe(0);
    expect(normalizeBalance('abc', 2)).toBe(0);
  });

  it('preserva sinal negativo em ambos os schemas', () => {
    expect(normalizeBalance(-50_025, 2)).toBe(-50_025);
    expect(normalizeBalance(-500.25, undefined)).toBe(-50_025);
  });
});
