export const CREATE_TRANSACTION_ALLOWED_KEYS = new Set([
  'description',
  'value_cents',
  'type',
  'category',
  'date',
  'source',
  'fitId',
  'tags',
  'isRecurring',
  'account',
  'accountId',
  'cardId',
]);

export const CREATE_TRANSACTION_FORBIDDEN_KEYS = new Set([
  'id',
  'uid',
  'value',
  'importHash',
  'schemaVersion',
  'createdAt',
  'updatedAt',
  'deletedAt',
  'isDeleted',
  'reconciliationStatus',
  'reconciliationSource',
  'reconciledAt',
  'reconciledBy',
]);

export class CreateTransactionValidationError extends Error {
  code: string;
  constructor(message: string) {
    super(message);
    this.name = 'CreateTransactionValidationError';
    this.code = 'invalid-argument';
  }
}

export interface ValidatedCreateTransactionPayload {
  description: string;
  value_cents:  number;
  type:         'entrada' | 'saida';
  category:     string;
  date:         string;
  source:       'manual';
  fitId:        string | null;
  tags:         string[];
  isRecurring:  boolean;
  account?:     string;
  accountId?:   string;
  cardId?:      string;
}

function invalidCreateArgument(message: string): never {
  throw new CreateTransactionValidationError(message);
}

function assertPlainObject(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    invalidCreateArgument('Payload deve ser um objeto.');
  }
  return value as Record<string, unknown>;
}

function assertAllowedKeys(data: Record<string, unknown>): void {
  const keys = Object.keys(data);
  const forbidden = keys.filter(k => CREATE_TRANSACTION_FORBIDDEN_KEYS.has(k));
  if (forbidden.length > 0) {
    invalidCreateArgument(`Campos proibidos no payload: ${forbidden.sort().join(', ')}.`);
  }
  const unknown = keys.filter(k => !CREATE_TRANSACTION_ALLOWED_KEYS.has(k));
  if (unknown.length > 0) {
    invalidCreateArgument(`Campos desconhecidos no payload: ${unknown.sort().join(', ')}.`);
  }
}

function assertStringSized(data: Record<string, unknown>, field: string, min: number, max: number): string {
  const value = data[field];
  if (typeof value !== 'string') invalidCreateArgument(`${field} deve ser uma string.`);
  const trimmed = (value as string).trim();
  if (trimmed.length < min || trimmed.length > max) {
    invalidCreateArgument(`${field} deve ter entre ${min} e ${max} caracteres.`);
  }
  return trimmed;
}

function assertOptionalStringSized(data: Record<string, unknown>, field: string, max: number, emptyValue?: string): string | undefined;
function assertOptionalStringSized(data: Record<string, unknown>, field: string, max: number, emptyValue: null): string | null;
function assertOptionalStringSized(data: Record<string, unknown>, field: string, max: number, emptyValue: string | null | undefined = undefined): string | null | undefined {
  const value = data[field];
  if (value === undefined || value === null) return emptyValue;
  if (typeof value !== 'string') invalidCreateArgument(`${field} deve ser uma string ou null.`);
  const trimmed = (value as string).trim();
  if (trimmed.length < 1 || trimmed.length > max) {
    invalidCreateArgument(`${field} deve ter entre 1 e ${max} caracteres.`);
  }
  return trimmed;
}

function assertTags(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) invalidCreateArgument('tags deve ser um array de strings ou null.');
  if ((value as unknown[]).length > 20) invalidCreateArgument('tags deve conter no maximo 20 itens.');
  return (value as unknown[]).map((tag, index) => {
    if (typeof tag !== 'string') invalidCreateArgument(`tags[${index}] deve ser uma string.`);
    const trimmed = (tag as string).trim();
    if (trimmed.length < 1 || trimmed.length > 32) {
      invalidCreateArgument(`tags[${index}] deve ter entre 1 e 32 caracteres.`);
    }
    return trimmed;
  });
}

function assertIsoDateYYYYMMDD(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    invalidCreateArgument('date deve ser uma data valida no formato YYYY-MM-DD.');
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    invalidCreateArgument('date deve ser uma data valida no formato YYYY-MM-DD.');
  }
  return value as string;
}

function assertSafePositiveIntegerCents(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    invalidCreateArgument('value_cents deve ser um inteiro seguro positivo.');
  }
  return value as number;
}

function assertOptionalBoolean(data: Record<string, unknown>, field: string, defaultValue: boolean): boolean {
  const value = data[field];
  if (value === undefined || value === null) return defaultValue;
  if (typeof value !== 'boolean') invalidCreateArgument(`${field} deve ser booleano ou null.`);
  return value as boolean;
}

function assertTransactionType(value: unknown): 'entrada' | 'saida' {
  if (value !== 'entrada' && value !== 'saida') {
    invalidCreateArgument('type deve ser "entrada" ou "saida".');
  }
  return value as 'entrada' | 'saida';
}

export function validateCreateTransactionPayload(rawData: unknown): ValidatedCreateTransactionPayload {
  const data = assertPlainObject(rawData);
  assertAllowedKeys(data);

  if (data['source'] !== 'manual') {
    invalidCreateArgument('source deve ser "manual".');
  }

  return {
    description: assertStringSized(data, 'description', 1, 500),
    value_cents:  assertSafePositiveIntegerCents(data['value_cents']),
    type:         assertTransactionType(data['type']),
    category:     assertStringSized(data, 'category', 1, 120),
    date:         assertIsoDateYYYYMMDD(data['date']),
    source:       'manual',
    fitId:        assertOptionalStringSized(data, 'fitId', 160, null),
    tags:         assertTags(data['tags']),
    isRecurring:  assertOptionalBoolean(data, 'isRecurring', false),
    account:      assertOptionalStringSized(data, 'account', 120),
    accountId:    assertOptionalStringSized(data, 'accountId', 120),
    cardId:       assertOptionalStringSized(data, 'cardId', 120),
  };
}
