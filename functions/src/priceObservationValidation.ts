/**
 * priceObservationValidation.ts — Validação pura (server-trusted) do payload da
 * callable `recordPriceObservation`. Sem Admin SDK, sem I/O — 100% testável via
 * `node --test`.
 *
 * P2 hardening (rodada 2): `users/{uid}/priceObservations` migra de escrita
 * client-side direta (`addDoc`) para esta callable — fecha a superfície de
 * `firestore.rules` (isValidPriceObservationCreate) e prova o padrão de
 * migração para coleções de baixo risco financeiro (append-only, sem history
 * atômico, sem saldo). `shoppingLists`/`debts` seguem candidatas para uma
 * próxima rodada, fora do escopo desta PR.
 */

const SHOPPING_UNITS = new Set(['un', 'kg', 'g', 'L', 'mL', 'cx', 'pct', 'dz']);

export class PriceObservationValidationError extends Error {
  code: string;
  constructor(message: string) {
    super(message);
    this.name = 'PriceObservationValidationError';
    this.code = 'invalid-argument';
  }
}

export interface ValidatedPriceObservationPayload {
  productName:   string;
  store:         string;
  unitPriceCents: number;
  quantity:      string;
  unit:          string;
  observedAt:    string;
  sourceListId?: string;
}

function invalidPriceObservationArgument(message: string): never {
  throw new PriceObservationValidationError(message);
}

function assertPlainObject(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    invalidPriceObservationArgument('Payload deve ser um objeto.');
  }
  return value as Record<string, unknown>;
}

function assertStringSized(data: Record<string, unknown>, field: string, min: number, max: number): string {
  const value = data[field];
  if (typeof value !== 'string') invalidPriceObservationArgument(`${field} deve ser uma string.`);
  const trimmed = (value as string).trim();
  if (trimmed.length < min || trimmed.length > max) {
    invalidPriceObservationArgument(`${field} deve ter entre ${min} e ${max} caracteres.`);
  }
  return trimmed;
}

function assertPositiveSafeIntegerCents(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    invalidPriceObservationArgument('unitPriceCents deve ser um inteiro seguro positivo.');
  }
  return value as number;
}

function assertObservedAt(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    invalidPriceObservationArgument('observedAt deve ser uma data válida no formato YYYY-MM-DD.');
  }
  return value as string;
}

function assertUnit(value: unknown): string {
  if (typeof value !== 'string' || !SHOPPING_UNITS.has(value)) {
    invalidPriceObservationArgument(`unit deve ser uma das unidades válidas: ${[...SHOPPING_UNITS].join(', ')}.`);
  }
  return value as string;
}

export function validatePriceObservationPayload(rawData: unknown): ValidatedPriceObservationPayload {
  const data = assertPlainObject(rawData);

  const productName = assertStringSized(data, 'productName', 1, 120);
  const store       = assertStringSized(data, 'store', 1, 80);

  const quantityValue = data['quantity'];
  if (typeof quantityValue !== 'string' || quantityValue.length < 1) {
    invalidPriceObservationArgument('quantity deve ser uma string não vazia.');
  }

  let sourceListId: string | undefined;
  if ('sourceListId' in data && data['sourceListId'] !== undefined) {
    if (typeof data['sourceListId'] !== 'string' || data['sourceListId'].length < 1) {
      invalidPriceObservationArgument('sourceListId deve ser uma string não vazia quando presente.');
    }
    sourceListId = data['sourceListId'];
  }

  return {
    productName,
    store,
    unitPriceCents: assertPositiveSafeIntegerCents(data['unitPriceCents']),
    quantity:       quantityValue as string,
    unit:           assertUnit(data['unit']),
    observedAt:     assertObservedAt(data['observedAt']),
    ...(sourceListId !== undefined ? { sourceListId } : {}),
  };
}
