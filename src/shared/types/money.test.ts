import Decimal from 'decimal.js';
import { describe, it, expect, expectTypeOf } from 'vitest';
import { fromCentavos, toCentavos, toCentavosTyped, type Centavos } from './money';

describe('Money - Centavos', () => {
  describe('toCentavos', () => {
    it('converte reais number para centavos inteiros com ROUND_HALF_UP', () => {
      expect(toCentavos(10.5)).toBe(1050);
      expect(toCentavos(10.004)).toBe(1000);
      expect(toCentavos(10.005)).toBe(1001);
      expect(toCentavos(10.006)).toBe(1001);
    });

    it('aceita string e Decimal sem drift de ponto flutuante', () => {
      expect(toCentavos('0.10')).toBe(10);
      expect(toCentavos(new Decimal('0.29').plus('0.01'))).toBe(30);
    });

    it('preserva sinal para estornos ou ajustes negativos', () => {
      expect(toCentavos(-10.5)).toBe(-1050);
      expect(toCentavos('-10.005')).toBe(-1001);
    });

    it('retorna o tipo branded Centavos', () => {
      const val = toCentavos(2.5);
      expectTypeOf(val).toEqualTypeOf<Centavos>();
      // @ts-expect-error number cru nao e atribuivel a Centavos sem conversao
      const bad: Centavos = 250;
      void bad;
    });
  });

  describe('fromCentavos', () => {
    it('converte centavos inteiros para reais de exibicao', () => {
      expect(fromCentavos(1050 as Centavos)).toBe(10.5);
      expect(fromCentavos(1001 as Centavos)).toBe(10.01);
      expect(fromCentavos(-1001 as Centavos)).toBe(-10.01);
    });
  });

  describe('toCentavosTyped', () => {
    it('mantem compatibilidade delegando para toCentavos', () => {
      expect(toCentavosTyped(12.34)).toBe(1234);
    });
  });
});
