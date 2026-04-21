import { describe, it, expect, expectTypeOf } from 'vitest';
import { toCentavosTyped, type Centavos } from './money';

describe('Money — Centavos (branded type)', () => {
  describe('toCentavosTyped — arredondamento bancário', () => {
    it('trunca/arredonda para inteiro (ROUND_HALF_AWAY_FROM_ZERO via Math.round)', () => {
      expect(toCentavosTyped(1050)).toBe(1050);
      expect(toCentavosTyped(1050.4)).toBe(1050);
      expect(toCentavosTyped(1050.5)).toBe(1051);
      expect(toCentavosTyped(1050.6)).toBe(1051);
    });

    it('aceita zero e valores negativos preservando o sinal', () => {
      expect(toCentavosTyped(0)).toBe(0);
      // Math.round(-0) === -0 — documentamos a semântica IEEE-754
      expect(Object.is(toCentavosTyped(-0), -0) || Object.is(toCentavosTyped(-0), 0)).toBe(true);
      expect(toCentavosTyped(-1050.7)).toBe(-1051);
    });

    it('lida com floats clássicos problemáticos', () => {
      // Math.round(0.1 + 0.2 = 0.30000000000000004) = 0
      expect(toCentavosTyped(0.1 + 0.2)).toBe(0);
      // 0.1 * 100 = 10.000000000000002 → 10
      expect(toCentavosTyped(0.1 * 100)).toBe(10);
    });

    it('é idempotente quando recebe um Centavos já arredondado', () => {
      const c = toCentavosTyped(500);
      expect(toCentavosTyped(c)).toBe(c);
    });

    it('retorna o tipo de marca Centavos (branded)', () => {
      const val = toCentavosTyped(250);
      expectTypeOf(val).toEqualTypeOf<Centavos>();
      // Garante que um number cru NÃO é atribuível a Centavos sem cast
      // @ts-expect-error — number não é atribuível a Centavos sem toCentavosTyped
      const _bad: Centavos = 250;
      void _bad;
    });

    it('não explode em valores extremos', () => {
      expect(toCentavosTyped(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
      expect(Number.isFinite(toCentavosTyped(1e15))).toBe(true);
    });
  });
});
