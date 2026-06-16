import { describe, it, expect } from 'vitest';
import { parseBRLToCents } from './transactionGroupUtils';

describe('parseBRLToCents', () => {
  it('converte "10,50" para 1050', () => {
    expect(parseBRLToCents('10,50')).toBe(1050);
  });

  it('converte "1.234,56" para 123456', () => {
    expect(parseBRLToCents('1.234,56')).toBe(123456);
  });

  it('converte "R$ 1.234,56" para 123456', () => {
    expect(parseBRLToCents('R$ 1.234,56')).toBe(123456);
  });

  it('converte inteiro "50" para 5000', () => {
    expect(parseBRLToCents('50')).toBe(5000);
  });

  it('converte "1.234" (milhar sem decimal) para 123400', () => {
    expect(parseBRLToCents('1.234')).toBe(123400);
  });

  it('retorna null para string vazia', () => {
    expect(parseBRLToCents('')).toBeNull();
  });

  it('retorna null para formato inválido com letras', () => {
    expect(parseBRLToCents('50abc')).toBeNull();
  });

  it('retorna null para valor negativo', () => {
    expect(parseBRLToCents('-50')).toBeNull();
  });

  it('retorna null para formato US (ponto como decimal)', () => {
    expect(parseBRLToCents('1,234.56')).toBeNull();
  });
});
