/**
 * transferValidation.ts — Validação pura (server-trusted) do payload da callable
 * `createTransfer`. Sem Admin SDK, sem I/O — 100% testável via `node --test`.
 *
 * Correção P1 F-01: transferências entre contas são SERVER-ONLY. A callable grava
 * atomicamente a transação `transferencia` + history + movimenta os saldos das duas
 * contas (débito na origem, crédito no destino). Valores sempre em centavos inteiros.
 */

export const CREATE_TRANSFER_ALLOWED_KEYS = new Set([
  'fromAccountId',
  'toAccountId',
  'value_cents',
  'date',
  'description',
]);

export class TransferValidationError extends Error {
  code: string;
  constructor(message: string) {
    super(message);
    this.name = 'TransferValidationError';
    this.code = 'invalid-argument';
  }
}

export interface ValidatedTransferPayload {
  fromAccountId: string;
  toAccountId:   string;
  value_cents:   number;
  date:          string;
  description:   string;
}

function invalidTransferArgument(message: string): never {
  throw new TransferValidationError(message);
}

function assertPlainObject(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    invalidTransferArgument('Payload deve ser um objeto.');
  }
  return value as Record<string, unknown>;
}

function assertAllowedKeys(data: Record<string, unknown>): void {
  const unknown = Object.keys(data).filter(k => !CREATE_TRANSFER_ALLOWED_KEYS.has(k));
  if (unknown.length > 0) {
    invalidTransferArgument(`Campos desconhecidos no payload: ${unknown.sort().join(', ')}.`);
  }
}

function assertStringSized(data: Record<string, unknown>, field: string, min: number, max: number): string {
  const value = data[field];
  if (typeof value !== 'string') invalidTransferArgument(`${field} deve ser uma string.`);
  const trimmed = (value as string).trim();
  if (trimmed.length < min || trimmed.length > max) {
    invalidTransferArgument(`${field} deve ter entre ${min} e ${max} caracteres.`);
  }
  return trimmed;
}

function assertIsoDateYYYYMMDD(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    invalidTransferArgument('date deve ser uma data valida no formato YYYY-MM-DD.');
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    invalidTransferArgument('date deve ser uma data valida no formato YYYY-MM-DD.');
  }
  return value as string;
}

function assertSafePositiveIntegerCents(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    invalidTransferArgument('value_cents deve ser um inteiro seguro positivo.');
  }
  return value as number;
}

export function validateTransferPayload(rawData: unknown): ValidatedTransferPayload {
  const data = assertPlainObject(rawData);
  assertAllowedKeys(data);

  const fromAccountId = assertStringSized(data, 'fromAccountId', 1, 128);
  const toAccountId   = assertStringSized(data, 'toAccountId', 1, 128);
  if (fromAccountId === toAccountId) {
    invalidTransferArgument('Origem e destino não podem ser iguais.');
  }

  const description = data['description'] === undefined || data['description'] === null
    ? 'Transferência'
    : assertStringSized(data, 'description', 1, 160);

  return {
    fromAccountId,
    toAccountId,
    value_cents: assertSafePositiveIntegerCents(data['value_cents']),
    date:        assertIsoDateYYYYMMDD(data['date']),
    description,
  };
}
