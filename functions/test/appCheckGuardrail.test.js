const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');

const AI_CALLABLES_PLANNED_FOR_GRADUAL_ENFORCEMENT = [
  'categorizeTransactionsBatch',
  'chatWithQuantumAI',
  'generateAuditReport',
];

function callableOptions(exportName) {
  const pattern = new RegExp(`exports\\.${exportName}\\s*=\\s*onCall\\(\\s*({[\\s\\S]*?})\\s*,`);
  const match = source.match(pattern);
  assert.ok(match, `${exportName} callable options not found`);
  return match[1];
}

describe('App Check guardrails before AI enforcement rollout', () => {
  it('keeps createTransaction enforced', () => {
    assert.match(callableOptions('createTransaction'), /\benforceAppCheck\s*:\s*true\b/);
  });

  it('keeps AI callables temporarily without enforcement until the explicit rollout phase', () => {
    for (const callableName of AI_CALLABLES_PLANNED_FOR_GRADUAL_ENFORCEMENT) {
      assert.doesNotMatch(
        callableOptions(callableName),
        /\benforceAppCheck\b/,
        `${callableName} must remain unenforced in 10C-2A; change this only in the planned rollout phase`,
      );
    }
  });

  it('does not enable App Check token consumption in any callable', () => {
    assert.equal(source.includes('consumeAppCheckToken'), false);
  });
});
