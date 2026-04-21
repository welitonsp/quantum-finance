/** Centavos inteiros — nunca use floats para dinheiro */
declare const __brand: unique symbol;
export type Centavos = number & { readonly [__brand]: 'Centavos' };

export function toCentavosTyped(n: number): Centavos {
  return Math.round(n) as Centavos;
}
