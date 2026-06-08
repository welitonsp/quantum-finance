const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');

// All callables now require App Check enforcement (rollout completed in security audit 2026-06-02).
const ALL_CALLABLES_WITH_APP_CHECK_ENFORCEMENT = [
  'createTransaction',
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

describe('App Check guardrails — full enforcement', () => {
  it('enforces App Check on all callables', () => {
    for (const callableName of ALL_CALLABLES_WITH_APP_CHECK_ENFORCEMENT) {
      assert.match(
        callableOptions(callableName),
        /\benforceAppCheck\s*:\s*true\b/,
        `${callableName} must enforce App Check`,
      );
    }
  });

  it('enables App Check token consumption (replay protection) on all callables', () => {
    for (const callableName of ALL_CALLABLES_WITH_APP_CHECK_ENFORCEMENT) {
      assert.match(
        callableOptions(callableName),
        /\bconsumeAppCheckToken\s*:\s*true\b/,
        `${callableName} must consume App Check token for replay protection`,
      );
    }
  });

  it('rejects already-consumed tokens in all callable handlers', () => {
    assert.ok(
      source.includes('alreadyConsumed'),
      'handlers must check request.app?.alreadyConsumed',
    );
  });
});
