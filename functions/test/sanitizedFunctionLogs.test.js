const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
const helperStart = source.indexOf('// ─── Sanitized Function Error Logging');
const helperEnd = source.indexOf('// ─── Persistent rate limiting');

assert.notEqual(helperStart, -1, 'sanitized function error helper block not found');
assert.notEqual(helperEnd, -1, 'persistent rate limiting block not found');

const helperSource = source.slice(helperStart, helperEnd);

function evaluateSanitizer(context, error) {
  const sandbox = {
    error,
    result: null,
    detail: null,
  };
  vm.createContext(sandbox);
  vm.runInContext(`
${helperSource}
result = sanitizeFunctionError(${JSON.stringify(context)}, error);
detail = safeSystemLogDetail(${JSON.stringify(context)});
`, sandbox);
  return { result: sandbox.result, detail: sandbox.detail };
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
