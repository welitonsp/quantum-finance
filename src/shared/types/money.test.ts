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

  // ─── Branches de normalizeMoneyString ainda não cobertas ────────────────────

  describe('normalizeMoneyString — branches de erro', () => {
    it('rejeita string vazia após remoção de R$ e espaços (linha 38)', () => {
      expect(() => toCentavos('R$')).toThrow('Valor monetário vazio.');
      expect(() => toCentavos('   ')).toThrow('Valor monetário vazio.');
    });

    it('rejeita formato inválido com caracteres não numéricos (linha 47)', () => {
      expect(() => toCentavos('abc')).toThrow('Formato monetário inválido');
      expect(() => toCentavos('12,abc')).toThrow('Formato monetário inválido');
    });

    it('múltiplos pontos sem vírgula são removidos (linha 64) — "1.2.3" vira 123 reais', () => {
      // "1.2.3" tem 2 pontos → branch linha 64 remove todos → "123" → toCentavos = 12300 centavos
      expect(toCentavos('1.2.3')).toBe(12300);
    });

    it('aceita valor positivo explícito com sinal + (linha 68)', () => {
      expect(toCentavos('+10,50')).toBe(1050);
    });

    it('aceita valor negativo com parênteses (formato financeiro US)', () => {
      expect(toCentavos('(10,50)')).toBe(-1050);
    });
  });

  // ─── Branches de toDecimal com Decimal NaN/Infinity (linha 16 / 73) ─────────

  describe('toDecimal — branches com Decimal inválido', () => {
    it('rejeita Decimal NaN (assertFiniteDecimal linha 16)', () => {
      const nanDecimal = new Decimal(NaN);
      expect(() => toCentavos(nanDecimal)).toThrow('NaN ou Infinity não são permitidos');
    });

    it('rejeita Decimal Infinity', () => {
      const infDecimal = new Decimal(Infinity);
      expect(() => toCentavos(infDecimal)).toThrow('NaN ou Infinity não são permitidos');
    });
  });

  // ─── Branches de divideCentavos e multiplyCentavos com Decimal ───────────────

  describe('divideCentavos — branches de erro', () => {
    it('rejeita divisão por zero', () => {
      expect(() => divideCentavos(1000, 0)).toThrow('Divisão por zero');
    });

    it('aceita divisor como Decimal', () => {
      expect(divideCentavos(1000, new Decimal(4))).toBe(250);
    });

    it('rejeita divisor Infinity', () => {
      expect(() => divideCentavos(1000, Infinity)).toThrow();
    });
  });

  describe('multiplyCentavos — branches de erro', () => {
    it('aceita multiplicador como Decimal', () => {
      expect(multiplyCentavos(500, new Decimal(3))).toBe(1500);
    });

    it('rejeita multiplicador Infinity', () => {
      expect(() => multiplyCentavos(500, Infinity)).toThrow();
    });
  });
});
