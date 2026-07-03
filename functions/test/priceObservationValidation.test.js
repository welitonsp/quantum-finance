const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const {
  PriceObservationValidationError,
  validatePriceObservationPayload,
} = require('../lib/priceObservationValidation');

function validPayload(overrides = {}) {
  return {
    productName: 'Arroz Tio João 5kg',
    store: 'Mercado Central',
    unitPriceCents: 2599,
    quantity: '1',
    unit: 'un',
    observedAt: '2026-07-03',
    ...overrides,
  };
}

function assertInvalid(payload, messagePart) {
  assert.throws(
    () => validatePriceObservationPayload(payload),
    (error) => {
      assert.ok(error instanceof PriceObservationValidationError, 'must be PriceObservationValidationError');
      assert.equal(error.code, 'invalid-argument');
      if (messagePart) assert.match(error.message, messagePart);
      return true;
    },
  );
}

describe('validatePriceObservationPayload', () => {
  it('accepts a valid payload without sourceListId', () => {
    const result = validatePriceObservationPayload(validPayload());
    assert.deepEqual(result, {
      productName: 'Arroz Tio João 5kg',
      store: 'Mercado Central',
      unitPriceCents: 2599,
      quantity: '1',
      unit: 'un',
      observedAt: '2026-07-03',
    });
  });

  it('accepts a valid payload with sourceListId', () => {
    const result = validatePriceObservationPayload(validPayload({ sourceListId: 'list-abc' }));
    assert.equal(result.sourceListId, 'list-abc');
  });

  it('trims productName/store (whitespace-only padding, no case normalization)', () => {
    const result = validatePriceObservationPayload(validPayload({ productName: '  Feijão  ' }));
    assert.equal(result.productName, 'Feijão');
  });

  it('rejects a non-object payload', () => {
    assertInvalid(null, /objeto/);
    assertInvalid('string', /objeto/);
    assertInvalid(['array'], /objeto/);
  });

  it('rejects productName/store outside size bounds', () => {
    assertInvalid(validPayload({ productName: '' }), /productName/);
    assertInvalid(validPayload({ productName: 'x'.repeat(121) }), /productName/);
    assertInvalid(validPayload({ store: '' }), /store/);
    assertInvalid(validPayload({ store: 'x'.repeat(81) }), /store/);
  });

  it('rejects non-positive or non-integer unitPriceCents', () => {
    assertInvalid(validPayload({ unitPriceCents: 0 }), /unitPriceCents/);
    assertInvalid(validPayload({ unitPriceCents: -100 }), /unitPriceCents/);
    assertInvalid(validPayload({ unitPriceCents: 12.5 }), /unitPriceCents/);
    assertInvalid(validPayload({ unitPriceCents: '2599' }), /unitPriceCents/);
  });

  it('rejects empty quantity', () => {
    assertInvalid(validPayload({ quantity: '' }), /quantity/);
    assertInvalid(validPayload({ quantity: 1 }), /quantity/);
  });

  it('rejects unit outside the whitelist', () => {
    assertInvalid(validPayload({ unit: 'lb' }), /unit/);
  });

  it('rejects invalid observedAt', () => {
    assertInvalid(validPayload({ observedAt: '2026-7-3' }), /observedAt/);
    assertInvalid(validPayload({ observedAt: '' }), /observedAt/);
  });

  it('rejects empty sourceListId when present', () => {
    assertInvalid(validPayload({ sourceListId: '' }), /sourceListId/);
  });
});
