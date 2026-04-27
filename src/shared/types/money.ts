import Decimal from 'decimal.js';

/** Integer cents. Never use floats for money calculations. */
declare const __brand: unique symbol;
export type Centavos = number & { readonly [__brand]: 'Centavos' };

export function toCentavos(value: number | string | Decimal): Centavos {
  return new Decimal(value)
    .times(100)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .toNumber() as Centavos;
}

export function fromCentavos(value: Centavos | number): number {
  return new Decimal(value)
    .dividedBy(100)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    .toNumber();
}

export function toCentavosTyped(n: number): Centavos {
  return toCentavos(n);
}
