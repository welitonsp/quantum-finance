import { describe, expect, it } from 'vitest';
import { parseImportedMoneyToCentavos } from './importMoneyParser';

describe('parseImportedMoneyToCentavos', () => {
  describe('formatos BRL padrão', () => {
    it.each([
      ['12,00',     1200],
      ['1.200,00',  120000],
      ['1.234,56',  123456],
      ['0,01',      1],
      ['100,00',    10000],
    ])('parseia "%s" → %i centavos (BRL)', (raw, expected) => {
      expect(parseImportedMoneyToCentavos(raw)).toBe(expected);
    });
  });

  describe('formato americano com ponto decimal', () => {
    it.each([
      ['1200.00',   120000],
      ['1,200.00',  120000],
      ['1234.56',   123456],
      ['0.01',      1],
    ])('parseia "%s" → %i centavos (US decimal)', (raw, expected) => {
      expect(parseImportedMoneyToCentavos(raw)).toBe(expected);
    });
  });

  describe('inteiro sem separador (padrão: interpreta como reais)', () => {
    it.each([
      ['1200',  120000],
      ['100',   10000],
      ['12',    1200],
    ])('parseia "%s" → %i centavos (reais)', (raw, expected) => {
      expect(parseImportedMoneyToCentavos(raw)).toBe(expected);
    });
  });

  describe('negativos e notação contábil', () => {
    it.each([
      ['-12,00',   -1200],
      ['(12,00)',  -1200],
      ['-1.200,00', -120000],
      ['(1200.00)', -120000],
    ])('parseia "%s" → %i centavos (negativo)', (raw, expected) => {
      expect(parseImportedMoneyToCentavos(raw)).toBe(expected);
    });
  });

  describe('prefixo R$ e espaços', () => {
    it.each([
      ['R$ 12,00',   1200],
      ['R$12,00',    1200],
      ['  12,00  ',  1200],
      ['"12,00"',    1200],
      [' R$ 1.200,00 ', 120000],
    ])('parseia "%s" → %i centavos (normalização)', (raw, expected) => {
      expect(parseImportedMoneyToCentavos(raw)).toBe(expected);
    });
  });

  describe('integerMinorUnits = true (banco exporta centavos como inteiro)', () => {
    it.each([
      ['1200', 1200],
      ['100',  100],
      ['1',    1],
      ['0',    0],
    ])('parseia "%s" → %i centavos (minor units)', (raw, expected) => {
      expect(parseImportedMoneyToCentavos(raw, { integerMinorUnits: true })).toBe(expected);
    });

    it('garante que "1200" com integerMinorUnits=true NÃO vira 120000', () => {
      const result = parseImportedMoneyToCentavos('1200', { integerMinorUnits: true });
      expect(result).toBe(1200);
      expect(result).not.toBe(120000);
    });

    it('rejeita string com vírgula quando integerMinorUnits=true', () => {
      expect(() =>
        parseImportedMoneyToCentavos('12,00', { integerMinorUnits: true }),
      ).toThrow();
    });

    it('rejeita string com ponto decimal quando integerMinorUnits=true', () => {
      expect(() =>
        parseImportedMoneyToCentavos('12.00', { integerMinorUnits: true }),
      ).toThrow();
    });
  });

  describe('casos de erro', () => {
    it('lança erro para string vazia', () => {
      expect(() => parseImportedMoneyToCentavos('')).toThrow();
    });

    it('lança erro para string só de espaços', () => {
      expect(() => parseImportedMoneyToCentavos('   ')).toThrow();
    });

    it('lança erro para texto não-monetário', () => {
      expect(() => parseImportedMoneyToCentavos('abc')).toThrow();
      expect(() => parseImportedMoneyToCentavos('R$ abc')).toThrow();
    });
  });

  describe('critério de aceite: "12,00" nunca pode virar R$ 1.200,00', () => {
    it('"12,00" → 1200 centavos (R$ 12,00), jamais 120000 (R$ 1.200,00)', () => {
      const result = parseImportedMoneyToCentavos('12,00');
      expect(result).toBe(1200);
      expect(result).not.toBe(120000);
    });
  });
});
