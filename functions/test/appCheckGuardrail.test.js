const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');

const CALLABLES_WITH_APP_CHECK_ENFORCEMENT = [
  'createTransaction',
  'categorizeTransactionsBatch',
];

const AI_CALLABLES_STILL_PENDING_GRADUAL_ENFORCEMENT = [
  'chatWithQuantumAI',
  'generateAuditReport',
];

function callableOptions(exportName) {
  const pattern = new RegExp(`exports\\.${exportName}\\s*=\\s*onCall\\(\\s*({[\\s\\S]*?})\\s*,`);
  const match = source.match(pattern);
  assert.ok(match, `${exportName} callable options not found`);
  return match[1];
}

describe('App Check guardrails during gradual AI enforcement rollout', () => {
  it('enforces App Check on createTransaction and AI batch categorization only', () => {
    for (const callableName of CALLABLES_WITH_APP_CHECK_ENFORCEMENT) {
      assert.match(
        callableOptions(callableName),
        /\benforceAppCheck\s*:\s*true\b/,
        `${callableName} must enforce App Check in the current rollout state`,
      );
    }
  });

  it('keeps chat and audit AI callables temporarily without enforcement', () => {
    for (const callableName of AI_CALLABLES_STILL_PENDING_GRADUAL_ENFORCEMENT) {
      assert.doesNotMatch(
        callableOptions(callableName),
        /\benforceAppCheck\b/,
        `${callableName} must remain unenforced until its explicit rollout phase`,
      );
    }
  });

  it('does not enable App Check token consumption in any callable', () => {
    assert.equal(source.includes('consumeAppCheckToken'), false);
  });
});
