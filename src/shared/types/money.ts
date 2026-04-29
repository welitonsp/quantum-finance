import Decimal from 'decimal.js';

/** Integer cents. Never use floats as the canonical source of money. */
declare const __brand: unique symbol;
export type Centavos = number & { readonly [__brand]: 'Centavos' };

export type MoneyInput = number | string | Decimal;

const BRL_FORMATTER = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

function assertFiniteDecimal(value: Decimal, label: string): void {
  if (!value.isFinite() || value.isNaN()) {
    throw new Error(`${label} inválido: NaN ou Infinity não são permitidos.`);
  }
}

function assertSafeCentavos(value: Decimal, label: string): Centavos {
  assertFiniteDecimal(value, label);
  const rounded = value.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  if (!rounded.isInteger()) {
    throw new Error(`${label} inválido: centavos devem ser inteiros.`);
  }
  if (rounded.abs().greaterThan(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${label} fora de Number.MAX_SAFE_INTEGER.`);
  }
  return rounded.toNumber() as Centavos;
}

function normalizeMoneyString(input: string): string {
  let value = input
    .trim()
    .replace(/\u00a0/g, ' ')
    .replace(/[R$\s]/g, '');

  if (!value) throw new Error('Valor monetário vazio.');

  const isParenthesizedNegative = value.startsWith('(') && value.endsWith(')');
  const hasExplicitNegative = value.startsWith('-');
  const hasExplicitPositive = value.startsWith('+');
  const negative = isParenthesizedNegative || hasExplicitNegative;

  value = value.replace(/[()+-]/g, '');
  if (!/^\d+(?:[.,]\d+)*(?:[.,]\d+)?$/.test(value)) {
    throw new Error(`Formato monetário inválido: "${input}".`);
  }

  const lastComma = value.lastIndexOf(',');
  const lastDot = value.lastIndexOf('.');

  if (lastComma !== -1 && lastDot !== -1) {
    if (lastComma > lastDot) {
      value = value.replace(/\./g, '').replace(',', '.');
    } else {
      value = value.replace(/,/g, '');
    }
  } else if (lastComma !== -1) {
    value = value.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(?:\.\d{3})+$/.test(value)) {
    value = value.replace(/\./g, '');
  } else if ((value.match(/\./g) ?? []).length > 1) {
    value = value.replace(/\./g, '');
  }

  const signed = negative ? `-${value}` : value;
  return hasExplicitPositive && !negative ? value : signed;
}

function toDecimal(value: MoneyInput): Decimal {
  if (value instanceof Decimal) {
    assertFiniteDecimal(value, 'Valor monetário');
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('Valor monetário inválido: NaN ou Infinity não são permitidos.');
    }
    return new Decimal(value.toString());
  }

  return new Decimal(normalizeMoneyString(value));
}

export function toCentavos(value: MoneyInput): Centavos {
  const centavos = toDecimal(value).times(100);
  return assertSafeCentavos(centavos, 'Valor monetário');
}

export function fromCentavos(value: Centavos | number): number {
  const centavos = assertSafeCentavos(new Decimal(value), 'Centavos');
  return new Decimal(centavos)
    .dividedBy(100)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    .toNumber();
}

export function addCentavos(...values: Array<Centavos | number>): Centavos {
  const total = values.reduce(
    (acc, value) => acc.plus(assertSafeCentavos(new Decimal(value), 'Centavos')),
    new Decimal(0),
  );
  return assertSafeCentavos(total, 'Soma em centavos');
}

export function subtractCentavos(base: Centavos | number, ...values: Array<Centavos | number>): Centavos {
  const result = values.reduce(
    (acc, value) => acc.minus(assertSafeCentavos(new Decimal(value), 'Centavos')),
    new Decimal(assertSafeCentavos(new Decimal(base), 'Centavos')),
  );
  return assertSafeCentavos(result, 'Subtração em centavos');
}

export function absCentavos(value: Centavos | number): Centavos {
  return assertSafeCentavos(new Decimal(value).abs(), 'Valor absoluto em centavos');
}

export function divideCentavos(value: Centavos | number, divisor: number | Decimal): Centavos {
  const divisorDecimal = divisor instanceof Decimal ? divisor : new Decimal(divisor.toString());
  assertFiniteDecimal(divisorDecimal, 'Divisor');
  if (divisorDecimal.isZero()) throw new Error('Divisão por zero não é permitida.');
  return assertSafeCentavos(new Decimal(value).dividedBy(divisorDecimal), 'Divisão em centavos');
}

export function multiplyCentavos(value: Centavos | number, multiplier: number | Decimal): Centavos {
  const multiplierDecimal = multiplier instanceof Decimal ? multiplier : new Decimal(multiplier.toString());
  assertFiniteDecimal(multiplierDecimal, 'Multiplicador');
  return assertSafeCentavos(new Decimal(value).times(multiplierDecimal), 'Multiplicação em centavos');
}

export function formatBRL(value: Centavos | number): string {
  return BRL_FORMATTER.format(fromCentavos(value));
}

export function toCentavosTyped(n: number): Centavos {
  return toCentavos(n);
}
