const assert = require('node:assert/strict');
const { describe, it, afterEach } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  BACKUP_SCHEMA_VERSION,
  buildBackupPackage,
  calculateChecksumSha256,
  stableStringify,
  runBackup,
} = require('../scripts/backupLegacyCandidates');

const FIXED_GENERATED_AT = '2026-05-21T12:00:00.000Z';
const scriptPath = path.join(__dirname, '../scripts/backupLegacyCandidates.js');
const testPath = path.join(__dirname, './backupLegacyCandidates.test.js');
const tempDirs = [];

function fakeDoc(id, data, uid = 'test-user') {
  return {
    ref: { path: `users/${uid}/transactions/${id}` },
    data: () => data,
  };
}

function buildPackage(documents, options = {}) {
  return buildBackupPackage(documents, {
    generatedAt: FIXED_GENERATED_AT,
    ...options,
  });
}

function createTempDir() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qf-legacy-backup-'));
  tempDirs.push(tempDir);
  return tempDir;
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

describe('backupLegacyCandidates read-only planner (10D-1G-A)', () => {
  it('gera manifesto com contagem e checksum', () => {
    const backupPackage = buildPackage([
      fakeDoc('eligible', { value_cents: 1000 }),
      fakeDoc('blocked', { value: 12.34 }),
    ]);

    assert.equal(backupPackage.manifest.schemaVersion, BACKUP_SCHEMA_VERSION);
    assert.equal(backupPackage.manifest.generatedAt, FIXED_GENERATED_AT);
    assert.equal(backupPackage.manifest.totalAnalyzed, 2);
    assert.equal(backupPackage.manifest.totalBackedUp, 1);
    assert.equal(backupPackage.manifest.blockedCount, 1);
    assert.equal(backupPackage.manifest.dryRun, true);
    assert.equal(backupPackage.manifest.readOnly, true);
    assert.match(backupPackage.manifest.checksumSha256, /^[a-f0-9]{64}$/);
  });

  it('inclui no snapshot somente candidatos elegiveis', () => {
    const backupPackage = buildPackage([
      fakeDoc('eligible-a', { value_cents: 1000 }),
      fakeDoc('eligible-b', { value_cents: 2000, source: 'csv' }),
      fakeDoc('blocked', { value: 12.34 }),
      fakeDoc('ignored', { schemaVersion: 2, value_cents: 3000 }),
    ]);

    assert.equal(backupPackage.snapshot.candidates.length, 2);
    assert.deepEqual(
      backupPackage.snapshot.candidates.map((candidate) => candidate.path),
      [
        'users/test-user/transactions/eligible-a',
        'users/test-user/transactions/eligible-b',
      ]
    );
  });

  it('exclui documentos que exigem reparo administrativo', () => {
    const backupPackage = buildPackage([
      fakeDoc('float-only', { value: 12.34, description: 'nao imprimir' }),
    ]);

    assert.equal(backupPackage.snapshot.candidates.length, 0);
    assert.equal(backupPackage.manifest.blockedCount, 1);
  });

  it('exclui documentos ja migrados para v2', () => {
    const backupPackage = buildPackage([
      fakeDoc('already-v2', { schemaVersion: 2, value_cents: 1000 }),
    ]);

    assert.equal(backupPackage.snapshot.candidates.length, 0);
    assert.equal(backupPackage.manifest.ignoredCount, 1);
  });

  it('nao converte valor float legado em centavos', () => {
    const backupPackage = buildPackage([
      fakeDoc('float-only', { value: 12.34 }),
    ]);
    const snapshotText = stableStringify(backupPackage.snapshot);

    assert.equal(backupPackage.manifest.totalBackedUp, 0);
    assert.equal(snapshotText.includes('12.34'), false);
  });

  it('nao imprime uid, hash de importacao, descricao nem valores individuais', async () => {
    const logs = [];
    const outputDir = createTempDir();

    await runBackup({
      argv: [],
      documents: [
        fakeDoc('secret', {
          uid: 'user-secret',
          importHash: 'hash-secret',
          description: 'descricao secreta',
          value_cents: 987654,
        }, 'user-secret'),
      ],
      generatedAt: FIXED_GENERATED_AT,
      outputDir,
      logger: (line) => logs.push(line),
    });

    const output = logs.join('\n');

    assert.equal(output.includes('user-secret'), false);
    assert.equal(output.includes('hash-secret'), false);
    assert.equal(output.includes('descricao secreta'), false);
    assert.equal(output.includes('987654'), false);
    assert.equal(output.includes('users/'), false);
    assert.equal(output.includes('importHash'), false);
    assert.equal(output.includes('description'), false);
    assert.equal(output.includes('value_cents'), false);
  });

  it('nao inclui --uid no relatorio', async () => {
    const logs = [];
    const outputDir = createTempDir();

    const result = await runBackup({
      argv: ['--uid', 'user-secret'],
      documents: [
        fakeDoc('selected', { value_cents: 1000 }, 'user-secret'),
        fakeDoc('other', { value_cents: 2000 }, 'other-user'),
      ],
      generatedAt: FIXED_GENERATED_AT,
      outputDir,
      logger: (line) => logs.push(line),
    });

    assert.equal(result.manifest.totalAnalyzed, 1);
    assert.equal(result.manifest.totalBackedUp, 1);
    assert.equal(logs.join('\n').includes('user-secret'), false);
  });

  it('respeita --limit', async () => {
    const outputDir = createTempDir();
    const result = await runBackup({
      argv: ['--limit', '2'],
      documents: [
        fakeDoc('a', { value_cents: 1000 }),
        fakeDoc('b', { value_cents: 2000 }),
        fakeDoc('c', { value_cents: 3000 }),
      ],
      generatedAt: FIXED_GENERATED_AT,
      outputDir,
      logger: () => {},
    });

    assert.equal(result.manifest.totalAnalyzed, 2);
    assert.equal(result.manifest.totalBackedUp, 2);
    assert.equal(result.snapshot.candidates.length, 2);
  });

  it('lista vazia gera snapshot e manifesto validos', () => {
    const backupPackage = buildPackage([]);

    assert.equal(backupPackage.snapshot.schemaVersion, BACKUP_SCHEMA_VERSION);
    assert.deepEqual(backupPackage.snapshot.candidates, []);
    assert.equal(backupPackage.manifest.totalAnalyzed, 0);
    assert.equal(backupPackage.manifest.totalBackedUp, 0);
    assert.match(backupPackage.manifest.checksumSha256, /^[a-f0-9]{64}$/);
  });

  it('checksum muda quando o snapshot muda', () => {
    const first = buildPackage([fakeDoc('a', { value_cents: 1000 })]);
    const second = buildPackage([fakeDoc('a', { value_cents: 2000 })]);

    assert.notEqual(first.manifest.checksumSha256, second.manifest.checksumSha256);
  });

  it('checksum e deterministico para o mesmo conteudo', () => {
    const first = buildPackage([fakeDoc('a', { source: 'csv', value_cents: 1000 })]);
    const second = buildPackage([fakeDoc('a', { value_cents: 1000, source: 'csv' })]);

    assert.equal(first.manifest.checksumSha256, second.manifest.checksumSha256);
    assert.equal(
      calculateChecksumSha256(first.snapshot),
      calculateChecksumSha256(second.snapshot)
    );
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

  it('nao envia snapshot aos logs', async () => {
    const logs = [];
    const outputDir = createTempDir();

    await runBackup({
      argv: [],
      documents: [
        fakeDoc('secret', {
          importHash: 'hash-secret',
          description: 'descricao secreta',
          value_cents: 1000,
        }),
      ],
      generatedAt: FIXED_GENERATED_AT,
      outputDir,
      logger: (line) => logs.push(line),
    });

    const output = logs.join('\n');
    const parsed = JSON.parse(output);

    assert.equal(output.includes('snapshot'), false);
    assert.equal(output.includes('hash-secret'), false);
    assert.equal(output.includes('descricao secreta'), false);
    assert.deepEqual(Object.keys(parsed).sort(), [
      'blockedCount',
      'checksumSha256',
      'dryRun',
      'file',
      'ignoredCount',
      'readOnly',
      'totalAnalyzed',
      'totalBackedUp',
    ]);
  });

  it('escreve somente o arquivo de backup no diretorio solicitado', async () => {
    const outputDir = createTempDir();

    await runBackup({
      argv: [],
      documents: [fakeDoc('eligible', { value_cents: 1000 })],
      generatedAt: FIXED_GENERATED_AT,
      outputDir,
      logger: () => {},
    });

    const files = fs.readdirSync(outputDir);

    assert.equal(files.length, 1);
    assert.equal(files[0].endsWith('.json'), true);
  });
});
