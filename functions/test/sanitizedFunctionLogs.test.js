const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');
const { safeSystemLogDetail, sanitizeFunctionError } = require('../lib/lib/logger');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.ts'), 'utf8');

function evaluateSanitizer(context, error) {
  return {
    result: sanitizeFunctionError(context, error),
    detail: safeSystemLogDetail(context),
  };
}

describe('sanitized function logging guardrails', () => {
  it('does not expose sensitive error message content in sanitized logs or system log detail', () => {
    const sensitiveError = new Error('users/abc123/importHash aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa PIX JOAO CPF 123.456.789-00 prompt secreto token secret before after');
    sensitiveError.code = 'users/abc123/importHash';

    const { result, detail } = evaluateSanitizer('ai_batch_categorization', sensitiveError);
    const serialized = JSON.stringify({ result, detail });

    assert.deepEqual(JSON.parse(JSON.stringify(result)), {
      status: 'error',
      context: 'ai_batch_categorization',
      code: 'internal_error',
      message: 'AI categorization failed',
      // Safe error class name (not PII). Emulator-only fields (detail/env) are
      // absent here because FUNCTIONS_EMULATOR is unset in this test run.
      name: 'Error',
    });
    assert.equal(detail, 'AI categorization failed');

    for (const forbidden of [
      'users/',
      'abc123',
      'importHash',
      'PIX',
      'JOAO',
      'CPF',
      '123.456.789-00',
      'prompt',
      'token',
      'secret',
      'before',
      'after',
    ]) {
      assert.equal(serialized.includes(forbidden), false, `${forbidden} leaked in sanitized output`);
    }
  });

  it('keeps console and system_logs writes away from raw error.message', () => {
    const unsafeConsoleLines = source
      .split(/\r?\n/)
      .filter(line => /console\.(error|warn)/.test(line) && /\.message\b/.test(line));
    const unsafeSystemLogLines = source
      .split(/\r?\n/)
      .filter(line => /writeStructuredLog/.test(line) && /\.message\b/.test(line));

    assert.deepEqual(unsafeConsoleLines, []);
    assert.deepEqual(unsafeSystemLogLines, []);
    assert.equal(source.includes('e.message'), false);
  });

  it('persists only generic detail strings for AI callable failures', () => {
    assert.match(source, /writeStructuredLog\(uid, 'ERROR', safeSystemLogDetail\('ai_batch_categorization'\)\)/);
    assert.match(source, /writeStructuredLog\(uid, 'ERROR', safeSystemLogDetail\('ai_chat'\)\)/);
    assert.match(source, /writeStructuredLog\(uid, 'ERROR', safeSystemLogDetail\('ai_audit_report'\)\)/);
  });
});

describe('emulator-only rate-limit diagnostics', () => {
  it('adds safe presence booleans for rate_limit_check under the emulator without leaking values', () => {
    const prevEmu  = process.env.FUNCTIONS_EMULATOR;
    const prevHost = process.env.FIRESTORE_EMULATOR_HOST;
    process.env.FUNCTIONS_EMULATOR = 'true';
    process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
    try {
      const err = new Error('connect ECONNREFUSED 127.0.0.1:8080 for users/abc123/usage');
      err.code = 'unavailable';
      const result = sanitizeFunctionError('rate_limit_check', err);
      const serialized = JSON.stringify(result);

      assert.equal(result.context, 'rate_limit_check');
      assert.equal(result.env.firestoreEmulatorHost, true);
      assert.equal(typeof result.env.projectId, 'boolean');
      assert.equal(result.code, 'unavailable');
      // UID path inside the message must be redacted in the emulator detail.
      assert.equal(serialized.includes('abc123'), false, 'uid leaked in emulator detail');
    } finally {
      process.env.FUNCTIONS_EMULATOR = prevEmu;
      if (prevHost === undefined) delete process.env.FIRESTORE_EMULATOR_HOST;
      else process.env.FIRESTORE_EMULATOR_HOST = prevHost;
    }
  });

  it('omits emulator diagnostics entirely outside the emulator', () => {
    const prevEmu = process.env.FUNCTIONS_EMULATOR;
    delete process.env.FUNCTIONS_EMULATOR;
    try {
      const result = sanitizeFunctionError('rate_limit_check', new Error('boom users/abc123'));
      assert.equal(result.env, undefined);
      assert.equal(result.detail, undefined);
      assert.equal(JSON.stringify(result).includes('abc123'), false);
    } finally {
      if (prevEmu === undefined) delete process.env.FUNCTIONS_EMULATOR;
      else process.env.FUNCTIONS_EMULATOR = prevEmu;
    }
  });
});
