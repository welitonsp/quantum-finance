const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const {
  TransferValidationError,
  validateTransferPayload,
} = require('../lib/transferValidation');

function validPayload(overrides = {}) {
  return {
    fromAccountId: 'acc-corrente',
    toAccountId:   'acc-poupanca',
    value_cents:   50000,
    date:          '2026-07-01',
    ...overrides,
  };
}

function assertInvalid(payload, messagePart) {
  assert.throws(
    () => validateTransferPayload(payload),
    (error) => {
      assert.ok(error instanceof TransferValidationError, 'must be TransferValidationError');
      assert.equal(error.code, 'invalid-argument');
      if (messagePart) assert.match(error.message, messagePart);
      return true;
    },
  );
}

describe('validateTransferPayload', () => {
  it('accepts a valid payload with default description', () => {
    const result = validateTransferPayload(validPayload());
    assert.deepEqual(result, {
      fromAccountId: 'acc-corrente',
      toAccountId:   'acc-poupanca',
      value_cents:   50000,
      date:          '2026-07-01',
      description:   'Transferência',
    });
  });

  it('accepts a valid payload with custom trimmed description', () => {
    const result = validateTransferPayload(validPayload({ description: '  Reserva mensal  ' }));
    assert.equal(result.description, 'Reserva mensal');
  });

  it('treats null description as default', () => {
    const result = validateTransferPayload(validPayload({ description: null }));
    assert.equal(result.description, 'Transferência');
  });

  it('rejects non-object payloads', () => {
    assertInvalid(null, /objeto/);
    assertInvalid([], /objeto/);
    assertInvalid('transfer', /objeto/);
  });

  it('rejects unknown keys (allow-list)', () => {
    assertInvalid(validPayload({ category: 'Outros' }), /desconhecidos/);
    assertInvalid(validPayload({ uid: 'attacker' }), /desconhecidos/);
    assertInvalid(validPayload({ idempotencyKey: 'x' }), /desconhecidos/);
  });

  it('rejects fromAccountId == toAccountId', () => {
    assertInvalid(
      validPayload({ fromAccountId: 'acc-a', toAccountId: 'acc-a' }),
      /Origem e destino/,
    );
  });

  it('rejects missing or invalid account ids', () => {
    assertInvalid(validPayload({ fromAccountId: undefined }), /fromAccountId/);
    assertInvalid(validPayload({ fromAccountId: '' }), /fromAccountId/);
    assertInvalid(validPayload({ toAccountId: 42 }), /toAccountId/);
    assertInvalid(validPayload({ toAccountId: 'x'.repeat(129) }), /toAccountId/);
  });

  it('rejects non-positive or non-integer value_cents', () => {
    assertInvalid(validPayload({ value_cents: 0 }), /value_cents/);
    assertInvalid(validPayload({ value_cents: -100 }), /value_cents/);
    assertInvalid(validPayload({ value_cents: 100.5 }), /value_cents/);
    assertInvalid(validPayload({ value_cents: '100' }), /value_cents/);
    assertInvalid(validPayload({ value_cents: Number.MAX_SAFE_INTEGER + 1 }), /value_cents/);
  });

  it('rejects invalid dates', () => {
    assertInvalid(validPayload({ date: '2026-13-01' }), /date/);
    assertInvalid(validPayload({ date: '2026-02-30' }), /date/);
    assertInvalid(validPayload({ date: '01/07/2026' }), /date/);
    assertInvalid(validPayload({ date: undefined }), /date/);
  });

  it('rejects description over 160 chars or empty string', () => {
    assertInvalid(validPayload({ description: 'x'.repeat(161) }), /description/);
    assertInvalid(validPayload({ description: '   ' }), /description/);
    assertInvalid(validPayload({ description: 42 }), /description/);
  });
});
