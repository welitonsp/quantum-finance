const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');

describe('AI categorization minimization guardrails', () => {
  it('uses an opaque promptId instead of the client id in the categorization prompt', () => {
    assert.match(source, /ID:\s*\$\{t\.promptId\}/);
    assert.doesNotMatch(source, /ID:\s*\$\{t\.id\}/);
  });

  it('restricts prompt IDs to simple opaque values before calling Gemini', () => {
    assert.ok(source.includes('const OPAQUE_CATEGORIZATION_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;'));
    assert.ok(source.includes('function toSafeCategorizationPromptId(id, index)'));
    assert.ok(source.includes('promptId:    toSafeCategorizationPromptId(t.id, index)'));
  });
});
