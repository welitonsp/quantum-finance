// src/shared/schemas/financialSchemas.test.js
import { describe, it, expect } from 'vitest';
import { toCentavos, fromCentavos } from './financialSchemas';

describe('🛡️ Blindagem Matemática: Sistema de Centavos', () => {
  
  it('Deve converter reais para centavos blindando o Erro de Ponto Flutuante do JS', () => {
    // O clássico erro de JS: 0.1 + 0.2 daria 0.30000000000000004
    const somaPerigosa = 0.1 + 0.2; 
    
    // O nosso sistema deve forçar a saída para o inteiro 30
    expect(toCentavos(somaPerigosa)).toBe(30); 
    
    // Testes de rotina
    expect(toCentavos(15.90)).toBe(1590);
    expect(toCentavos(100)).toBe(10000);
    expect(toCentavos(0)).toBe(0);
  });

  it('Deve reverter centavos exatos para renderização visual na UI', () => {
    expect(fromCentavos(1590)).toBe(15.9);
    expect(fromCentavos(30)).toBe(0.3);
    expect(fromCentavos(10000)).toBe(100);
  });
});