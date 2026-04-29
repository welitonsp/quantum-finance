import Decimal from 'decimal.js';
import { describe, it, expect, expectTypeOf } from 'vitest';
import {
  absCentavos,
  addCentavos,
  divideCentavos,
  formatBRL,
  fromCentavos,
  multiplyCentavos,
  subtractCentavos,
  toCentavos,
  toCentavosTyped,
  type Centavos,
} from './money';

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

    it('aceita formatos monetários brasileiros e decimal com ponto', () => {
      expect(toCentavos('12,50')).toBe(1250);
      expect(toCentavos('12.50')).toBe(1250);
      expect(toCentavos('12,00')).toBe(1200);
      expect(toCentavos('12.00')).toBe(1200);
      expect(toCentavos('1200')).toBe(120000);
      expect(toCentavos('1.200')).toBe(120000);
      expect(toCentavos('1.234,56')).toBe(123456);
      expect(toCentavos('1.200,50')).toBe(120050);
      expect(toCentavos('1,200.50')).toBe(120050);
      expect(toCentavos('1200,50')).toBe(120050);
      expect(toCentavos('1234,56')).toBe(123456);
      expect(toCentavos('1234.56')).toBe(123456);
      expect(toCentavos(1234.56)).toBe(123456);
      expect(toCentavos('12,50')).toBe(1250);
      expect(toCentavos('12.50')).toBe(1250);
      expect(toCentavos('12,00')).toBe(1200);
      expect(toCentavos('12.00')).toBe(1200);
      expect(toCentavos('1200')).toBe(120000);
      expect(toCentavos('1.200')).toBe(120000);
      expect(toCentavos('1.200,50')).toBe(120050);
      expect(toCentavos('1,200.50')).toBe(120050);
    });

    it('preserva sinal para estornos ou ajustes negativos', () => {
      expect(toCentavos(-10.5)).toBe(-1050);
      expect(toCentavos(-10.005)).toBe(-1001);
    });

    it('rejeita NaN, Infinity e valores fora do inteiro seguro', () => {
      expect(() => toCentavos(Number.NaN)).toThrow();
      expect(() => toCentavos(Number.POSITIVE_INFINITY)).toThrow();
      expect(() => fromCentavos(Number.MAX_SAFE_INTEGER + 1)).toThrow();
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
      expect(fromCentavos(123456 as Centavos)).toBe(1234.56);
      expect(fromCentavos(1050 as Centavos)).toBe(10.5);
      expect(fromCentavos(1001 as Centavos)).toBe(10.01);
      expect(fromCentavos(-1001 as Centavos)).toBe(-10.01);
    });
  });

  describe('operações em centavos', () => {
    it('mantem soma, subtração, divisão, multiplicação e absoluto em inteiros', () => {
      expect(addCentavos(100, 25, -5)).toBe(120);
      expect(subtractCentavos(1000, 250, 50)).toBe(700);
      expect(absCentavos(-1234)).toBe(1234);
      expect(divideCentavos(1001, 2)).toBe(501);
      expect(multiplyCentavos(333, 3)).toBe(999);
    });

    it('formata BRL a partir de centavos', () => {
      expect(formatBRL(123456).replace(/\s/u, ' ')).toBe('R$ 1.234,56');
    });
  });

  describe('toCentavosTyped', () => {
    it('mantem compatibilidade delegando para toCentavos', () => {
      expect(toCentavosTyped(12.34)).toBe(1234);
    });
  });
});
