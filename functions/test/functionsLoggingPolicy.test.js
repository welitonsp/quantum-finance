const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
const loggerSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'logger.ts'), 'utf8');
const lines = source.split(/\r?\n/);

function lineNumber(index) {
  return index + 1;
}

function collectStatements(pattern) {
  const statements = [];

  for (let i = 0; i < lines.length; i += 1) {
    if (!pattern.test(lines[i])) continue;

    const start = i;
    const parts = [lines[i]];
    let depth = (lines[i].match(/\(/g) || []).length - (lines[i].match(/\)/g) || []).length;

    while (depth > 0 && i + 1 < lines.length) {
      i += 1;
      parts.push(lines[i]);
      depth += (lines[i].match(/\(/g) || []).length - (lines[i].match(/\)/g) || []).length;
    }

    statements.push({
      line: lineNumber(start),
      text: parts.join('\n').trim(),
    });
  }

  return statements;
}

function assertNoMatches(description, regex) {
  const matches = lines
    .map((line, index) => ({ line: lineNumber(index), text: line }))
    .filter(item => regex.test(item.text));

  assert.deepEqual(
    matches,
    [],
    `${description}:\n${matches.map(item => `${item.line}: ${item.text}`).join('\n')}`,
  );
}

function assertStatementDoesNotContain(statements, regex, description) {
  const matches = statements.filter(statement => regex.test(statement.text));
  assert.deepEqual(
    matches,
    [],
    `${description}:\n${matches.map(item => `${item.line}: ${item.text}`).join('\n')}`,
  );
}

describe('Functions logging policy', () => {
  it('keeps the server-side sanitization helpers present', () => {
    assert.match(loggerSource, /export function sanitizeFunctionError\(context: unknown, error: unknown\)/);
    assert.match(loggerSource, /export function safeErrorCode\(error: unknown\)/);
    assert.match(loggerSource, /export function safeSystemLogDetail\(context: unknown\)/);
    assert.match(source, /sanitizeFunctionError/);
    assert.match(source, /safeSystemLogDetail/);
  });

  it('blocks high-risk console APIs and raw error objects in console logging', () => {
    assertNoMatches('console.debug is forbidden in Cloud Functions', /\bconsole\.debug\b/);
    assertNoMatches('console.trace is forbidden in Cloud Functions', /\bconsole\.trace\b/);
    assertNoMatches('console.log is forbidden in Cloud Functions logging policy', /\bconsole\.log\b/);

    const consoleStatements = collectStatements(/\bconsole\.(error|warn)\b/);
    assertStatementDoesNotContain(
      consoleStatements,
      /\.message\b|String\((?:error|e)\)/,
      'console logging must not use raw error messages or String(error)',
    );
    assertStatementDoesNotContain(
      consoleStatements.filter(statement => !statement.text.includes('sanitizeFunctionError(')),
      /\bconsole\.(?:error|warn)\s*\([^)]*\b(?:error|e)\b/,
      'console logging must not pass raw error objects',
    );

    const unsafeConsoleStatements = consoleStatements.filter(statement => (
      !statement.text.includes('sanitizeFunctionError(')
      && !/console\.warn\(\s*'[^']+'\s*\)/.test(statement.text)
      && !/console\.error\(\s*'[^']+'\s*\)/.test(statement.text)
    ));

    assert.deepEqual(
      unsafeConsoleStatements,
      [],
      `console.error/warn must use sanitizeFunctionError or a static message:\n${
        unsafeConsoleStatements.map(item => `${item.line}: ${item.text}`).join('\n')
      }`,
    );
  });

  it('blocks raw errors in system_logs and persisted log details', () => {
    const structuredLogCalls = collectStatements(/\bwriteStructuredLog\(/);

    assertStatementDoesNotContain(
      structuredLogCalls,
      /\.message\b|String\((?:error|e)\)/,
      'system_logs detail must not use raw error messages or String(error)',
    );
    assertStatementDoesNotContain(
      structuredLogCalls.filter(statement => !statement.text.includes('safeSystemLogDetail(')),
      /`[^`]*\$\{\s*(?:error|e)\b|['"][^'"]*['"]\s*\+\s*(?:error|e)\b|\b(?:error|e)\s*,?\s*\)/,
      'system_logs detail must not interpolate or persist raw error objects',
    );

    assertNoMatches('object detail fields must not persist e.message', /\bdetail\s*:\s*(?:e|error)\.message\b/);
    assertNoMatches('object message fields must not persist e.message', /\bmessage\s*:\s*(?:e|error)\.message\b/);
  });

  it('allows only the documented controlled error.message response path', () => {
    const messageLines = lines
      .map((line, index) => ({ line: lineNumber(index), text: line.trim() }))
      .filter(item => /\berror\.message\b/.test(item.text));

    assert.deepEqual(
      messageLines.map(item => item.text),
      ["throw new HttpsError('invalid-argument', error.message);"],
      'error.message is allowed only for the controlled CreateTransactionValidationError client response',
    );
  });
});
