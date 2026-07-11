const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.ts'), 'utf8');

// All callables now require App Check enforcement (rollout completed in security audit 2026-06-02).
const ALL_CALLABLES_WITH_APP_CHECK_ENFORCEMENT = [
  'createTransaction',
  'createTransfer',
  'executeAgentAction',
  'deleteUserData',
  'categorizeTransactionsBatch',
  'chatWithQuantumAI',
  'generateAuditReport',
];

function callableOptions(exportName) {
  // Match TypeScript `export const X = onCall({ ... },`
  const pattern = new RegExp(`export const ${exportName}\\s*=\\s*onCall\\(\\s*({[\\s\\S]*?})\\s*,`);
  const match = source.match(pattern);
  assert.ok(match, `${exportName} callable options not found`);
  return match[1];
}

describe('App Check guardrails — full enforcement', () => {
  // App Check is gated through ENFORCE_APP_CHECK so the Firebase Emulator (which the
  // client cannot supply an App Check token to) is not blocked. The gate MUST resolve
  // to `true` outside the emulator, so production enforcement is unchanged.
  it('derives the App Check gate from the emulator environment (production stays enforced)', () => {
    assert.match(
      source,
      /const\s+ENFORCE_APP_CHECK\s*=\s*process\.env\.FUNCTIONS_EMULATOR\s*!==\s*'true'/,
      'ENFORCE_APP_CHECK must be true unless running under the Functions emulator',
    );
  });

  it('enforces App Check on all callables', () => {
    for (const callableName of ALL_CALLABLES_WITH_APP_CHECK_ENFORCEMENT) {
      assert.match(
        callableOptions(callableName),
        /\benforceAppCheck\s*:\s*ENFORCE_APP_CHECK\b/,
        `${callableName} must enforce App Check (gated)`,
      );
    }
  });

  it('enables App Check token consumption (replay protection) on all callables', () => {
    for (const callableName of ALL_CALLABLES_WITH_APP_CHECK_ENFORCEMENT) {
      assert.match(
        callableOptions(callableName),
        /\bconsumeAppCheckToken\s*:\s*ENFORCE_APP_CHECK\b/,
        `${callableName} must consume App Check token for replay protection (gated)`,
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

describe('Cost & AI-consent guardrails (F-09, F-01, F-06)', () => {
  it('deleteUserData exige autenticação recente (step-up via auth_time)', () => {
    const body = source.slice(source.indexOf('export const deleteUserData'));
    assert.ok(/auth_time/.test(body), 'deleteUserData deve validar auth_time (step-up)');
  });

  it('caps maxInstances globally (bounds custo/DoS econômico)', () => {
    assert.match(
      source,
      /setGlobalOptions\(\s*{[^}]*maxInstances\s*:\s*\d+/,
      'must set a global maxInstances cap via setGlobalOptions',
    );
  });

  it('gates every Gemini callable behind AI consent (assertAiConsent) before the rate limit', () => {
    for (const name of ['categorizeTransactionsBatch', 'chatWithQuantumAI', 'generateAuditReport']) {
      const body = source.slice(source.indexOf(`export const ${name}`));
      const consentIdx = body.indexOf('assertAiConsent');
      const rateIdx    = body.indexOf('assertAiRateLimit');
      assert.ok(consentIdx > 0, `${name} must call assertAiConsent`);
      assert.ok(consentIdx < rateIdx, `${name} must check consent before the rate limit`);
    }
  });
});
