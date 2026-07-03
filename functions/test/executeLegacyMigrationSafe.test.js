const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const fs = require('fs');
const path = require('path');

const {
  MISSING_EXECUTE_FLAG_MESSAGE,
  parseCliArgs,
  planSafeExecution,
  createSanitizedReport,
  formatSanitizedReport,
  runSafeExecution,
} = require('../scripts/executeLegacyMigrationSafe');
const { buildBackupPackage } = require('../scripts/backupLegacyCandidates');

const scriptPath = path.join(__dirname, '../scripts/executeLegacyMigrationSafe.js');
const testPath = path.join(__dirname, './executeLegacyMigrationSafe.test.js');
const FIXED_GENERATED_AT = '2026-07-03T12:00:00.000Z';

function forbiddenFinancialTokens() {
  return [
    'Math' + '.round',
    'parse' + 'Float',
    'Num' + 'ber(',
    'value' + ' * ' + '100',
  ];
}

function eligibleDoc(overrides = {}) {
  return {
    path: 'users/user-1/transactions/tx-eligible',
    data: { value_cents: 1500, description: 'Compra', ...overrides },
  };
}

function nonEligibleDoc(overrides = {}) {
  return {
    path: 'users/user-1/transactions/tx-blocked',
    data: { value: 12.34, description: 'Legado', ...overrides },
  };
}

function createFakeDb() {
  const updates = [];
  let committed = false;

  return {
    doc(docPath) {
      return { path: docPath };
    },
    batch() {
      return {
        update(docRef, patch) {
          updates.push({ path: docRef.path, patch });
        },
        commit: async () => {
          committed = true;
        },
      };
    },
    _updates: updates,
    _committed: () => committed,
  };
}

function backupFor(documents) {
  const { manifest, snapshot } = buildBackupPackage(documents, { generatedAt: FIXED_GENERATED_AT });
  return { manifest, snapshot };
}

describe('executeLegacyMigrationSafe — execução restrita (migrationEligible-only)', () => {
  it('exige --execute explícito; sem ele, lança erro fixo e não lê nem escreve', async () => {
    assert.throws(() => parseCliArgs(['--backup-file', 'x.json']), { message: MISSING_EXECUTE_FLAG_MESSAGE });

    let readerCalled = false;

    await assert.rejects(
      runSafeExecution({
        argv: ['--backup-file', 'x.json'],
        readDocuments: async () => { readerCalled = true; return []; },
        logger: () => {},
      }),
      { message: MISSING_EXECUTE_FLAG_MESSAGE },
    );

    assert.equal(readerCalled, false);
  });

  it('exige --backup-file; sem ele, lança erro fixo', () => {
    assert.throws(
      () => parseCliArgs(['--execute']),
      (error) => error.code === 'missing_backup_file',
    );
  });

  it('planSafeExecution: lote 100% migrationEligible e 100% coberto pelo backup gera os writes esperados', () => {
    const docs = [eligibleDoc()];
    const backup = backupFor(docs);

    const { writes, analyzed } = planSafeExecution({
      documents: docs,
      backupPackage: backup,
      limit: 50,
    });

    assert.equal(analyzed, 1);
    assert.equal(writes.length, 1);
    assert.deepEqual(writes[0], { path: 'users/user-1/transactions/tx-eligible', patch: { schemaVersion: 2 } });
  });

  it('planSafeExecution: falha fechada — 1 documento não-elegível no lote aborta tudo, zero writes', () => {
    const docs = [eligibleDoc(), nonEligibleDoc()];
    const backup = backupFor([eligibleDoc()]); // backup só cobre o elegível

    assert.throws(
      () => planSafeExecution({ documents: docs, backupPackage: backup, limit: 50 }),
      (error) => error.code === 'batch_contains_non_eligible_document',
    );
  });

  it('planSafeExecution: documento elegível mas fora do backup também aborta tudo', () => {
    const docs = [eligibleDoc()];
    const backup = backupFor([]); // backup vazio — não cobre o documento

    assert.throws(
      () => planSafeExecution({ documents: docs, backupPackage: backup, limit: 50 }),
      (error) => error.code === 'document_not_covered_by_backup',
    );
  });

  it('runSafeExecution: commit real só ocorre quando 100% do lote é elegível e coberto pelo backup', async () => {
    const docs = [eligibleDoc()];
    const backup = backupFor(docs);
    const fakeDb = createFakeDb();

    const report = await runSafeExecution({
      argv: ['--execute', '--backup-file', 'unused-in-test.json'],
      db: fakeDb,
      documents: docs,
      backupPackage: backup,
      logger: () => {},
    });

    assert.equal(fakeDb._committed(), true);
    assert.deepEqual(fakeDb._updates, [{ path: 'users/user-1/transactions/tx-eligible', patch: { schemaVersion: 2 } }]);
    assert.equal(report.executed, true);
    assert.equal(report.totalWritten, 1);
  });

  it('runSafeExecution: nenhum write é commitado quando o lote contém documento não-elegível', async () => {
    const docs = [eligibleDoc(), nonEligibleDoc()];
    const backup = backupFor([eligibleDoc()]);
    const fakeDb = createFakeDb();

    await assert.rejects(
      runSafeExecution({
        argv: ['--execute', '--backup-file', 'unused-in-test.json'],
        db: fakeDb,
        documents: docs,
        backupPackage: backup,
        logger: () => {},
      }),
      (error) => error.code === 'batch_contains_non_eligible_document',
    );

    assert.equal(fakeDb._committed(), false);
    assert.deepEqual(fakeDb._updates, []);
  });

  it('runSafeExecution: backup com checksum inválido rejeita a execução antes de qualquer leitura/escrita', async () => {
    const docs = [eligibleDoc()];
    const backup = backupFor(docs);
    const tamperedBackup = {
      manifest: backup.manifest,
      // mesma contagem de candidatos, mas dado alterado após o checksum ser calculado
      snapshot: {
        ...backup.snapshot,
        candidates: backup.snapshot.candidates.map((c) => ({ ...c, data: { ...c.data, value_cents: 999999 } })),
      },
    };
    const fakeDb = createFakeDb();
    let readerCalled = false;

    await assert.rejects(
      runSafeExecution({
        argv: ['--execute', '--backup-file', 'unused-in-test.json'],
        db: fakeDb,
        backupPackage: tamperedBackup,
        readDocuments: async () => { readerCalled = true; return docs; },
        logger: () => {},
      }),
      (error) => error.code === 'invalid_backup_checksum',
    );

    assert.equal(readerCalled, false);
    assert.equal(fakeDb._committed(), false);
  });

  it('respeita o limite informado', () => {
    const docs = [eligibleDoc({ }), { path: 'users/user-1/transactions/tx-2', data: { value_cents: 2000 } }];
    const backup = backupFor(docs);

    const { analyzed, writes } = planSafeExecution({ documents: docs, backupPackage: backup, limit: 1 });

    assert.equal(analyzed, 1);
    assert.equal(writes.length, 1);
  });

  it('relatório sanitizado não expõe path, uid nem valores', () => {
    const report = createSanitizedReport({ writes: [{ path: 'users/secret/transactions/tx', patch: { schemaVersion: 2 } }], analyzed: 1 });
    const output = formatSanitizedReport(report);

    assert.equal(output.includes('secret'), false);
    assert.equal(output.includes('path'), false);
    assert.equal(report.totalWritten, 1);
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
});
