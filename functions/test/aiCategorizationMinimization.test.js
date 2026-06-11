const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.ts'), 'utf8');
const financialUtilsSource = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'lib', 'financialUtils.ts'),
  'utf8',
);

describe('AI categorization minimization guardrails', () => {
  it('uses an opaque promptId instead of the client id in the categorization prompt', () => {
    assert.match(source, /ID:\s*\$\{t\.promptId\}/);
    assert.doesNotMatch(source, /ID:\s*\$\{t\.id\}/);
  });

  it('restricts prompt IDs to simple opaque values before calling Gemini', () => {
    assert.ok(financialUtilsSource.includes('export const OPAQUE_CATEGORIZATION_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;'));
    assert.ok(financialUtilsSource.includes('export function toSafeCategorizationPromptId(id: unknown, index: number): string'));
    assert.ok(source.includes('promptId:    toSafeCategorizationPromptId(t.id, index)'));
  });
});
