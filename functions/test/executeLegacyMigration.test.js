const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const fs = require('fs');
const path = require('path');

const {
  BLOCKED_EXECUTION_MESSAGE,
  DEFAULT_LIMIT,
  parseCliArgs,
  buildDryRunReport,
  formatSanitizedReport,
  runDryRun,
} = require('../scripts/executeLegacyMigration');

const FIXED_GENERATED_AT = '2026-05-21T12:00:00.000Z';
const scriptPath = path.join(__dirname, '../scripts/executeLegacyMigration.js');
const testPath = path.join(__dirname, './executeLegacyMigration.test.js');

function reportFor(documents, options = {}) {
  return buildDryRunReport(documents, {
    generatedAt: FIXED_GENERATED_AT,
    ...options,
  });
}

function serializedReportFor(documents, options = {}) {
  return formatSanitizedReport(reportFor(documents, options));
}

function forbiddenFinancialTokens() {
  return [
    'Math' + '.round',
    'parse' + 'Float',
    'Num' + 'ber(',
    'value' + ' * ' + '100',
  ];
}

function forbiddenWriteTokens() {
  return [
    'batch' + '.commit',
    '.' + 'commit(',
    '.' + 'set(',
    '.' + 'update(',
    '.' + 'delete(',
    'write' + 'Batch',
    'admin.firestore' + '().batch',
  ];
}

describe('executeLegacyMigration dry-run planner (10D-1D)', () => {
  it('bloqueia a flag de execução com erro fixo', async () => {
    assert.throws(
      () => parseCliArgs(['--execute']),
      { message: BLOCKED_EXECUTION_MESSAGE }
    );

    let readerCalled = false;

    await assert.rejects(
      runDryRun({
        argv: ['--execute'],
        readDocuments: async () => {
          readerCalled = true;
          return [];
        },
        logger: () => {},
      }),
      { message: BLOCKED_EXECUTION_MESSAGE }
    );

    assert.equal(readerCalled, false);
  });

  it('usa dry-run como modo padrão', () => {
    const parsed = parseCliArgs([]);

    assert.equal(parsed.dryRun, true);
    assert.equal(parsed.limit, DEFAULT_LIMIT);
  });

  it('usa o classificador e o construtor de plano injetados', () => {
    const calls = {
      classify: 0,
      plan: 0,
    };
    const policy = {
      classifyLegacyTransaction(documentData) {
        calls.classify += 1;
        assert.equal(documentData.value_cents, 1000);
        return { status: 'v1WithSafeValueCents', decision: 'migrationEligible' };
      },
      buildMigrationPlan(documentData, classification) {
        calls.plan += 1;
        assert.equal(documentData.value_cents, 1000);
        assert.equal(classification.decision, 'migrationEligible');
        return { schemaVersion: 2 };
      },
    };

    const report = reportFor([{ value_cents: 1000 }], { policy });

    assert.equal(calls.classify, 1);
    assert.equal(calls.plan, 1);
    assert.equal(report.migrationEligibleCount, 1);
  });

  it('classifica documento somente com valor legado como reparo administrativo ou bloqueio', () => {
    const report = reportFor([{ value: 12.34, description: 'valor sensivel' }]);

    assert.equal(report.adminRepairRequiredCount + report.migrationBlockedCount, 1);
    assert.equal(report.totalAnalyzed, 1);
  });

  it('classifica v1 com centavos seguros como elegivel para migracao', () => {
    const report = reportFor([{ value_cents: 1500 }]);

    assert.equal(report.migrationEligibleCount, 1);
    assert.equal(report.summary.statuses.v1WithSafeValueCents, 1);
  });

  it('classifica documento v2 seguro como ignorado', () => {
    const report = reportFor([{ schemaVersion: 2, value_cents: 1500 }]);

    assert.equal(report.ignoredCount, 1);
    assert.equal(report.summary.statuses.alreadyV2, 1);
  });

  it('mantem relatorio sem campos ou valores sensiveis', () => {
    const output = serializedReportFor([{
      uid: 'user-secret',
      importHash: 'hash-secret',
      description: 'descricao secreta',
      value: 12.34,
      value_cents: 987654,
      path: 'users/user-secret/transactions/tx-secret',
    }]);

    assert.equal(output.includes('user-secret'), false);
    assert.equal(output.includes('hash-secret'), false);
    assert.equal(output.includes('descricao secreta'), false);
    assert.equal(output.includes('12.34'), false);
    assert.equal(output.includes('987654'), false);
    assert.equal(output.includes('users/'), false);
    assert.equal(output.includes('importHash'), false);
    assert.equal(output.includes('description'), false);
    assert.equal(output.includes('value_cents'), false);
    assert.equal(output.includes('"value"'), false);
    assert.equal(output.includes('"uid"'), false);
  });

  it('gera logs agregados e sanitizados', async () => {
    const logs = [];

    await runDryRun({
      argv: [],
      documents: [{
        uid: 'user-secret',
        importHash: 'hash-secret',
        description: 'descricao secreta',
        value_cents: 1000,
        path: 'users/user-secret/transactions/tx-secret',
      }],
      generatedAt: FIXED_GENERATED_AT,
      logger: (line) => logs.push(line),
    });

    const output = logs.join('\n');

    assert.equal(logs.length, 1);
    assert.equal(output.includes('"totalAnalyzed": 1'), true);
    assert.equal(output.includes('user-secret'), false);
    assert.equal(output.includes('hash-secret'), false);
    assert.equal(output.includes('descricao secreta'), false);
    assert.equal(output.includes('users/'), false);
  });

  it('nao contem padroes proibidos de conversao financeira', () => {
    const contents = [
      fs.readFileSync(scriptPath, 'utf8'),
      fs.readFileSync(testPath, 'utf8'),
    ];

    for (const token of forbiddenFinancialTokens()) {
      for (const content of contents) {
        assert.equal(content.includes(token), false, token);
      }
    }
  });

  it('nao contem padroes proibidos de escrita em banco', () => {
    const contents = [
      fs.readFileSync(scriptPath, 'utf8'),
      fs.readFileSync(testPath, 'utf8'),
    ];

    for (const token of forbiddenWriteTokens()) {
      for (const content of contents) {
        assert.equal(content.includes(token), false, token);
      }
    }
  });

  it('gera relatorio valido para lista vazia', () => {
    const report = reportFor([]);

    assert.equal(report.dryRun, true);
    assert.equal(report.totalAnalyzed, 0);
    assert.equal(report.ignoredCount, 0);
    assert.equal(report.migrationEligibleCount, 0);
    assert.equal(report.adminRepairRequiredCount, 0);
    assert.equal(report.migrationBlockedCount, 0);
    assert.equal(report.unknownShapeCount, 0);
  });

  it('respeita o limite informado', () => {
    const report = reportFor([
      { value_cents: 1000 },
      { value_cents: 2000 },
      { value_cents: 3000 },
    ], { limit: 2 });

    assert.equal(report.limitApplied, 2);
    assert.equal(report.totalAnalyzed, 2);
    assert.equal(report.migrationEligibleCount, 2);
  });

  it('produz JSON deterministico quando generatedAt e entradas sao fixos', () => {
    const documents = [
      { value_cents: 1000 },
      { schemaVersion: 2, value_cents: 2000 },
    ];
    const first = serializedReportFor(documents);
    const second = serializedReportFor(documents);

    assert.equal(first, second);
  });

  it('nao transforma source ausente em manual', () => {
    const output = serializedReportFor([{ value_cents: 1000 }]);

    assert.equal(output.includes('manual'), false);
    assert.equal(output.includes('source'), false);
  });

  it('nao expoe hash de importacao no plano agregado nem no relatorio', () => {
    const output = serializedReportFor([{
      value_cents: 1000,
      importHash: 'hash-secret',
    }]);

    assert.equal(output.includes('hash-secret'), false);
    assert.equal(output.includes('importHash'), false);
    assert.equal(output.includes('before'), false);
    assert.equal(output.includes('after'), false);
  });
});
