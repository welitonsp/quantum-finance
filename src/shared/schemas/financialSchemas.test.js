// src/shared/schemas/financialSchemas.test.js
import { describe, it, expect } from 'vitest';
import { toCentavos, fromCentavos } from './financialSchemas';

describe('🛡️ Matemática Quântica (Decimal.js)', () => {
  
  it('deve blindar o Erro de Ponto Flutuante clássico do JS', () => {
    // O clássico erro de JS: 0.1 + 0.2 daria 0.30000000000000004
    const somaPerigosa = 0.1 + 0.2; 
    expect(toCentavos(somaPerigosa)).toBe(30); 
  });

  it('deve converter Reais para Centavos com arredondamento bancário exato (ROUND_HALF_UP)', () => {
    // Testes de stress para arredondamento (O JS nativo falharia e daria prejuízo aqui)
    expect(toCentavos(1.005)).toBe(101); // O Math.round nativo daria 100
    expect(toCentavos(2.675)).toBe(268); // O Math.round nativo daria 267
    
    // Testes de rotina
    expect(toCentavos(15.90)).toBe(1590);
    expect(toCentavos(100)).toBe(10000);
    expect(toCentavos(1500.99)).toBe(150099);
    expect(toCentavos(0)).toBe(0);
  });

  it('deve reverter Centavos para Reais perfeitamente para a UI', () => {
    expect(fromCentavos(1590)).toBe(15.9);
    expect(fromCentavos(30)).toBe(0.3);
    expect(fromCentavos(10000)).toBe(100);
    expect(fromCentavos(101)).toBe(1.01);
    expect(fromCentavos(268)).toBe(2.68);
  });

  it('deve tratar valores nulos, indefinidos e vazios como zero (Proteção de Interface)', () => {
    expect(toCentavos(null)).toBe(0);
    expect(toCentavos(undefined)).toBe(0);
    expect(toCentavos('')).toBe(0);
    
    expect(fromCentavos(null)).toBe(0);
    expect(fromCentavos(undefined)).toBe(0);
  });
});