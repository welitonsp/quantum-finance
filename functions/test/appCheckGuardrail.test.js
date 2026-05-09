const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');

function callableOptions(exportName) {
  const pattern = new RegExp(`exports\\.${exportName}\\s*=\\s*onCall\\(\\s*({[\\s\\S]*?})\\s*,`);
  const match = source.match(pattern);
  assert.ok(match, `${exportName} callable options not found`);
  return match[1];
}

describe('App Check guardrails', () => {
  it('keeps enforcement scoped to createTransaction only', () => {
    assert.match(callableOptions('createTransaction'), /\benforceAppCheck\s*:\s*true\b/);
    assert.doesNotMatch(callableOptions('categorizeTransactionsBatch'), /\benforceAppCheck\b/);
    assert.doesNotMatch(callableOptions('chatWithQuantumAI'), /\benforceAppCheck\b/);
    assert.doesNotMatch(callableOptions('generateAuditReport'), /\benforceAppCheck\b/);
  });

  it('does not enable App Check token consumption', () => {
    assert.equal(source.includes('consumeAppCheckToken'), false);
  });
});
