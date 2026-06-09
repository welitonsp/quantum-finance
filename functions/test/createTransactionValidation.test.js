const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const {
  CreateTransactionValidationError,
  validateCreateTransactionPayload,
} = require('../lib/createTransactionValidation');

function canonicalPayload(overrides = {}) {
  return {
    description: 'Compra mercado',
    value_cents: 12345,
    type: 'saida',
    category: 'Alimentacao',
    date: '2026-05-07',
    source: 'manual',
    fitId: null,
    tags: ['casa'],
    isRecurring: false,
    account: 'Conta principal',
    accountId: 'account-1',
    cardId: 'card-1',
    ...overrides,
  };
}

function assertInvalid(payload, messagePart) {
  assert.throws(
    () => validateCreateTransactionPayload(payload),
    (error) => {
      assert.ok(error instanceof CreateTransactionValidationError);
      assert.equal(error.code, 'invalid-argument');
      assert.match(error.message, messagePart);
      return true;
    },
  );
}

describe('validateCreateTransactionPayload', () => {
  it('accepts the current canonical client payload', () => {
    const result = validateCreateTransactionPayload(canonicalPayload({
      description: '  Compra mercado  ',
      category: '  Alimentacao  ',
      tags: [' casa '],
    }));

    assert.deepEqual(result, {
      description: 'Compra mercado',
      value_cents: 12345,
      type: 'saida',
      category: 'Alimentacao',
      date: '2026-05-07',
      source: 'manual',
      fitId: null,
      tags: ['casa'],
      isRecurring: false,
      account: 'Conta principal',
      accountId: 'account-1',
      cardId: 'card-1',
    });
  });

  it('rejects forbidden fields explicitly', () => {
    assertInvalid(canonicalPayload({ importHash: 'a'.repeat(64) }), /Campos proibidos/);
  });

  it('rejects server-owned transaction fields explicitly', () => {
    assertInvalid(canonicalPayload({ uid: 'user-1' }), /Campos proibidos/);
    assertInvalid(canonicalPayload({ id: 'tx-1' }), /Campos proibidos/);
    assertInvalid(canonicalPayload({ value: 123.45 }), /Campos proibidos/);
    assertInvalid(canonicalPayload({ createdAt: '2026-05-07T00:00:00Z' }), /Campos proibidos/);
    assertInvalid(canonicalPayload({ updatedAt: '2026-05-07T00:00:00Z' }), /Campos proibidos/);
  });

  it('rejects unknown keys explicitly', () => {
    assertInvalid(canonicalPayload({ unexpected: true }), /Campos desconhecidos/);
  });

  it('rejects non-manual source values', () => {
    assertInvalid(canonicalPayload({ source: 'csv' }), /source deve ser "manual"/);
  });

  it('rejects invalid tags', () => {
    assertInvalid(canonicalPayload({ tags: [''] }), /tags\[0\]/);
    assertInvalid(canonicalPayload({ tags: ['x'.repeat(33)] }), /tags\[0\]/);
    assertInvalid(canonicalPayload({ tags: 'casa' }), /tags deve ser/);
  });

  it('rejects invalid optional string fields', () => {
    assertInvalid(canonicalPayload({ fitId: 'x'.repeat(161) }), /fitId/);
    assertInvalid(canonicalPayload({ accountId: 'x'.repeat(121) }), /accountId/);
    assertInvalid(canonicalPayload({ cardId: '' }), /cardId/);
  });

  it('rejects zero, negative, unsafe, and non-integer value_cents', () => {
    assertInvalid(canonicalPayload({ value_cents: 0 }), /value_cents/);
    assertInvalid(canonicalPayload({ value_cents: -100 }), /value_cents/);
    assertInvalid(canonicalPayload({ value_cents: 12.34 }), /value_cents/);
    assertInvalid(canonicalPayload({ value_cents: Number.MAX_SAFE_INTEGER + 1 }), /value_cents/);
  });
});
