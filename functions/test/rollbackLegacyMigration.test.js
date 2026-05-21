const assert = require('node:assert/strict');
const { describe, it, afterEach } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  BACKUP_SCHEMA_VERSION,
  BLOCKED_EXECUTION_MESSAGE,
  parseCliArgs,
  calculateChecksumSha256,
  readBackupFile,
  validateBackupPackage,
  buildRollbackPlan,
  createSanitizedReport,
  formatSanitizedReport,
  runRollback,
} = require('../scripts/rollbackLegacyMigration');

const FIXED_BACKUP_GENERATED_AT = '2026-05-21T12:00:00.000Z';
const scriptPath = path.join(__dirname, '../scripts/rollbackLegacyMigration.js');
const testPath = path.join(__dirname, './rollbackLegacyMigration.test.js');
const tempDirs = [];

function createBackupPackage(candidates, overrides = {}) {
  const snapshot = {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    generatedAt: FIXED_BACKUP_GENERATED_AT,
    candidates,
    ...(overrides.snapshot || {}),
  };
  const manifest = {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    generatedAt: snapshot.generatedAt,
    totalAnalyzed: candidates.length,
    totalBackedUp: candidates.length,
    blockedCount: 0,
    ignoredCount: 0,
    checksumSha256: calculateChecksumSha256(snapshot),
    dryRun: true,
    readOnly: true,
    backupType: 'legacyMigrationCandidates',
    ...(overrides.manifest || {}),
  };

  return {
    manifest,
    snapshot,
  };
}

function candidate(id, data = {}) {
  return {
    path: `users/test-user/transactions/${id}`,
    data: {
      value_cents: 1000,
      description: 'sensitive description',
      importHash: 'sensitive-hash',
      ...data,
    },
  };
}

function createTempDir() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qf-legacy-rollback-'));
  tempDirs.push(tempDir);
  return tempDir;
}

function writeJsonFixture(fileName, content) {
  const tempDir = createTempDir();
  const filePath = path.join(tempDir, fileName);

  fs.writeFileSync(filePath, content, 'utf8');

  return filePath;
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

afterEach(() => {
  while (tempDirs.length > 0) {
    const tempDir = tempDirs.pop();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

describe('rollbackLegacyMigration read-only planner (10D-1H-A)', () => {
  it('aceita caminho do arquivo de backup via argumento posicional', () => {
    const parsed = parseCliArgs(['data/legacy-backups/backup.json']);

    assert.equal(parsed.filePath, 'data/legacy-backups/backup.json');
    assert.equal(parsed.readOnly, true);
    assert.equal(parsed.dryRun, true);
  });

  it('aceita caminho do arquivo de backup via --file', () => {
    const parsed = parseCliArgs(['--file', 'data/legacy-backups/backup.json']);

    assert.equal(parsed.filePath, 'data/legacy-backups/backup.json');
  });

  it('rejeita --execute com erro fixo antes de ler arquivo', async () => {
    let readCalled = false;

    assert.throws(
      () => parseCliArgs(['--execute', 'backup.json']),
      { message: BLOCKED_EXECUTION_MESSAGE }
    );

    await assert.rejects(
      runRollback({
        argv: ['--execute', 'backup.json'],
        readFile: () => {
          readCalled = true;
          return createBackupPackage([]);
        },
        logger: () => {},
      }),
      { message: BLOCKED_EXECUTION_MESSAGE }
    );

    assert.equal(readCalled, false);
  });

  it('le arquivo local e gera plano agregado sanitizado', async () => {
    const backupPackage = createBackupPackage([
      candidate('a'),
      candidate('b', { source: 'csv' }),
    ]);
    const backupPath = writeJsonFixture('backup.json', JSON.stringify(backupPackage));
    const logs = [];
    const result = await runRollback({
      argv: [backupPath],
      logger: (line) => logs.push(line),
    });

    assert.equal(result.plan.totalCandidates, 2);
    assert.equal(result.plan.rollbackCandidateCount, 2);
    assert.equal(result.plan.status, 'rollbackPlanReady');
    assert.equal(result.report.validation.checksumValid, true);
    assert.equal(logs.length, 1);
  });

  it('valida schemaVersion do manifesto e snapshot', () => {
    const backupPackage = createBackupPackage([], {
      manifest: { schemaVersion: 999 },
    });

    assert.throws(
      () => validateBackupPackage(backupPackage),
      { code: 'invalid_backup_schema_version' }
    );
  });

  it('valida checksumSha256 e rejeita checksum invalido', () => {
    const backupPackage = createBackupPackage([candidate('a')], {
      manifest: { checksumSha256: '0'.repeat(64) },
    });

    assert.throws(
      () => validateBackupPackage(backupPackage),
      { code: 'invalid_backup_checksum' }
    );
  });

  it('valida contagem de candidatos do manifesto', () => {
    const backupPackage = createBackupPackage([candidate('a')], {
      manifest: { totalAnalyzed: 2, totalBackedUp: 2 },
    });

    assert.throws(
      () => validateBackupPackage(backupPackage),
      { code: 'backup_candidate_count_mismatch' }
    );
  });

  it('gera plano agregado bloqueado para candidatos sem shape minimo', () => {
    const backupPackage = createBackupPackage([
      candidate('a'),
      { path: 'users/test-user/transactions/b' },
      { data: { value_cents: 2000 } },
      {},
    ]);
    const plan = buildRollbackPlan(backupPackage);

    assert.equal(plan.totalCandidates, 4);
    assert.equal(plan.rollbackCandidateCount, 1);
    assert.equal(plan.invalidCandidateCount, 3);
    assert.equal(plan.missingPathCount, 2);
    assert.equal(plan.missingDataCount, 2);
    assert.equal(plan.status, 'rollbackPlanBlocked');
  });

  it('reporta apenas contadores e status sanitizados', () => {
    const backupPackage = createBackupPackage([
      candidate('secret', {
        uid: 'user-secret',
        value_cents: 987654,
      }),
    ]);
    const report = createSanitizedReport(buildRollbackPlan(backupPackage));
    const output = formatSanitizedReport(report);

    assert.equal(output.includes('user-secret'), false);
    assert.equal(output.includes('sensitive-hash'), false);
    assert.equal(output.includes('sensitive description'), false);
    assert.equal(output.includes('987654'), false);
    assert.equal(output.includes('users/'), false);
    assert.equal(output.includes('importHash'), false);
    assert.equal(output.includes('description'), false);
    assert.equal(output.includes('value_cents'), false);
    assert.equal(output.includes('"path"'), false);
    assert.equal(output.includes('"data"'), false);
  });

  it('nao imprime snapshot nem dados sensiveis em logs', async () => {
    const logs = [];
    const backupPackage = createBackupPackage([
      candidate('secret', {
        uid: 'user-secret',
        value_cents: 987654,
      }),
    ]);

    await runRollback({
      argv: ['backup.json'],
      backupPackage,
      logger: (line) => logs.push(line),
    });

    const output = logs.join('\n');

    assert.equal(output.includes('snapshot'), false);
    assert.equal(output.includes('candidates'), false);
    assert.equal(output.includes('user-secret'), false);
    assert.equal(output.includes('sensitive-hash'), false);
    assert.equal(output.includes('sensitive description'), false);
    assert.equal(output.includes('987654'), false);
    assert.equal(output.includes('users/'), false);
  });

  it('rejeita arquivo invalido', () => {
    const invalidPath = writeJsonFixture('invalid.json', '{not-json');

    assert.throws(
      () => readBackupFile(invalidPath),
      { code: 'invalid_backup_file' }
    );
  });

  it('lista vazia gera plano valido com status emptySnapshot', () => {
    const backupPackage = createBackupPackage([]);
    const plan = buildRollbackPlan(backupPackage);
    const report = createSanitizedReport(plan);

    assert.equal(plan.totalCandidates, 0);
    assert.equal(plan.rollbackCandidateCount, 0);
    assert.equal(plan.status, 'emptySnapshot');
    assert.equal(report.validation.checksumValid, true);
  });

  it('codigo novo nao importa firebase-admin', () => {
    const content = fs.readFileSync(scriptPath, 'utf8');

    assert.equal(content.includes('firebase-admin'), false);
  });

  it('codigo novo nao contem padroes proibidos de escrita em banco', () => {
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

  it('codigo novo nao contem matematica float proibida', () => {
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
});
