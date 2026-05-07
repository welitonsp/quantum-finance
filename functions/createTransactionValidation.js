const CREATE_TRANSACTION_ALLOWED_KEYS = new Set([
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

const CREATE_TRANSACTION_FORBIDDEN_KEYS = new Set([
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

class CreateTransactionValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CreateTransactionValidationError';
    this.code = 'invalid-argument';
  }
}

function invalidCreateArgument(message) {
  throw new CreateTransactionValidationError(message);
}

function assertPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    invalidCreateArgument('Payload deve ser um objeto.');
  }
  return value;
}

function assertAllowedKeys(data) {
  const keys = Object.keys(data);
  const forbidden = keys.filter((key) => CREATE_TRANSACTION_FORBIDDEN_KEYS.has(key));
  if (forbidden.length > 0) {
    invalidCreateArgument(`Campos proibidos no payload: ${forbidden.sort().join(', ')}.`);
  }

  const unknown = keys.filter((key) => !CREATE_TRANSACTION_ALLOWED_KEYS.has(key));
  if (unknown.length > 0) {
    invalidCreateArgument(`Campos desconhecidos no payload: ${unknown.sort().join(', ')}.`);
  }
}

function assertStringSized(data, field, min, max) {
  const value = data[field];
  if (typeof value !== 'string') {
    invalidCreateArgument(`${field} deve ser uma string.`);
  }

  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) {
    invalidCreateArgument(`${field} deve ter entre ${min} e ${max} caracteres.`);
  }
  return trimmed;
}

function assertOptionalStringSized(data, field, max, emptyValue = undefined) {
  const value = data[field];
  if (value === undefined || value === null) return emptyValue;
  if (typeof value !== 'string') {
    invalidCreateArgument(`${field} deve ser uma string ou null.`);
  }

  const trimmed = value.trim();
  if (trimmed.length < 1 || trimmed.length > max) {
    invalidCreateArgument(`${field} deve ter entre 1 e ${max} caracteres.`);
  }
  return trimmed;
}

function assertTags(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    invalidCreateArgument('tags deve ser um array de strings ou null.');
  }
  if (value.length > 20) {
    invalidCreateArgument('tags deve conter no maximo 20 itens.');
  }

  return value.map((tag, index) => {
    if (typeof tag !== 'string') {
      invalidCreateArgument(`tags[${index}] deve ser uma string.`);
    }

    const trimmed = tag.trim();
    if (trimmed.length < 1 || trimmed.length > 32) {
      invalidCreateArgument(`tags[${index}] deve ter entre 1 e 32 caracteres.`);
    }
    return trimmed;
  });
}

function assertIsoDateYYYYMMDD(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    invalidCreateArgument('date deve ser uma data valida no formato YYYY-MM-DD.');
  }

  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    invalidCreateArgument('date deve ser uma data valida no formato YYYY-MM-DD.');
  }
  return value;
}

function assertSafePositiveIntegerCents(value) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    invalidCreateArgument('value_cents deve ser um inteiro seguro positivo.');
  }
  return value;
}

function assertOptionalBoolean(data, field, defaultValue) {
  const value = data[field];
  if (value === undefined || value === null) return defaultValue;
  if (typeof value !== 'boolean') {
    invalidCreateArgument(`${field} deve ser booleano ou null.`);
  }
  return value;
}

function assertTransactionType(value) {
  if (!['entrada', 'saida'].includes(value)) {
    invalidCreateArgument('type deve ser "entrada" ou "saida".');
  }
  return value;
}

function validateCreateTransactionPayload(rawData) {
  const data = assertPlainObject(rawData);
  assertAllowedKeys(data);

  if (data.source !== 'manual') {
    invalidCreateArgument('source deve ser "manual".');
  }

  return {
    description: assertStringSized(data, 'description', 1, 500),
    value_cents: assertSafePositiveIntegerCents(data.value_cents),
    type: assertTransactionType(data.type),
    category: assertStringSized(data, 'category', 1, 120),
    date: assertIsoDateYYYYMMDD(data.date),
    source: 'manual',
    fitId: assertOptionalStringSized(data, 'fitId', 160, null),
    tags: assertTags(data.tags),
    isRecurring: assertOptionalBoolean(data, 'isRecurring', false),
    account: assertOptionalStringSized(data, 'account', 120),
    accountId: assertOptionalStringSized(data, 'accountId', 120),
    cardId: assertOptionalStringSized(data, 'cardId', 120),
  };
}

module.exports = {
  CREATE_TRANSACTION_ALLOWED_KEYS,
  CREATE_TRANSACTION_FORBIDDEN_KEYS,
  CreateTransactionValidationError,
  validateCreateTransactionPayload,
};
