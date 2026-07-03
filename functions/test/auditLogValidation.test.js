const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const {
  AuditLogValidationError,
  validateAuditLogPayload,
} = require('../lib/auditLogValidation');

function validPayload(overrides = {}) {
  return {
    action: 'BULK_UPDATE',
    entity: 'TRANSACTION',
    ...overrides,
  };
}

function assertInvalid(payload, messagePart) {
  assert.throws(
    () => validateAuditLogPayload(payload),
    (error) => {
      assert.ok(error instanceof AuditLogValidationError, 'must be AuditLogValidationError');
      assert.equal(error.code, 'invalid-argument');
      if (messagePart) assert.match(error.message, messagePart);
      return true;
    },
  );
}

describe('validateAuditLogPayload', () => {
  it('accepts a minimal valid BULK_UPDATE payload', () => {
    const result = validateAuditLogPayload(validPayload());
    assert.deepEqual(result, { action: 'BULK_UPDATE', entity: 'TRANSACTION' });
  });

  it('accepts a valid UNDO_BULK_UPDATE payload with details and metadata', () => {
    const result = validateAuditLogPayload(validPayload({
      action: 'UNDO_BULK_UPDATE',
      details: 'Desfez 3 transações',
      metadata: { count: 3, changes: [{ id: 'tx-1', from: 'Lazer', to: 'Alimentação' }] },
    }));
    assert.equal(result.action, 'UNDO_BULK_UPDATE');
    assert.equal(result.details, 'Desfez 3 transações');
    assert.deepEqual(result.metadata, { count: 3, changes: [{ id: 'tx-1', from: 'Lazer', to: 'Alimentação' }] });
  });

  it('rejects a non-object payload', () => {
    assertInvalid(null, /objeto/);
    assertInvalid('string', /objeto/);
    assertInvalid(['array'], /objeto/);
  });

  it('rejects action outside the whitelist (e.g. IMPORT_TRANSACTION, ADD_RECURRING, HACK)', () => {
    assertInvalid(validPayload({ action: 'IMPORT_TRANSACTION' }), /action/);
    assertInvalid(validPayload({ action: 'ADD_RECURRING' }), /action/);
    assertInvalid(validPayload({ action: 'HACK' }), /action/);
  });

  it('rejects entity other than TRANSACTION', () => {
    assertInvalid(validPayload({ entity: 'RECURRING_TASK' }), /entity/);
  });

  it('rejects details outside 1..500 chars', () => {
    assertInvalid(validPayload({ details: '' }), /details/);
    assertInvalid(validPayload({ details: 'x'.repeat(501) }), /details/);
  });

  it('rejects metadata missing count or changes', () => {
    assertInvalid(validPayload({ metadata: { changes: [] } }), /metadata\.count/);
    assertInvalid(validPayload({ metadata: { count: 1 } }), /metadata\.changes/);
    assertInvalid(validPayload({ metadata: 'not-an-object' }), /metadata/);
  });
});
