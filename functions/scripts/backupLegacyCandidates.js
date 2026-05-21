const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {
  classifyLegacyTransaction,
} = require('./legacyMigrationPolicy');
const {
  readFirestoreTransactions,
} = require('./executeLegacyMigration');

const BACKUP_SCHEMA_VERSION = 1;
const DEFAULT_LIMIT = 100;
const DEFAULT_OUTPUT_DIR = path.resolve(__dirname, '../../data/legacy-backups');

function createBackupError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function readFlagValue(argv, index, code) {
  const value = argv[index + 1];

  if (value === undefined || value.startsWith('--')) {
    throw createBackupError(code);
  }

  return value;
}

function resolveLimit(rawLimit = DEFAULT_LIMIT) {
  const text = `${rawLimit}`.trim();

  if (!/^[1-9][0-9]*$/.test(text)) {
    throw createBackupError('invalid_limit');
  }

  const limit = parseInt(text, 10);

  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw createBackupError('invalid_limit');
  }

  return limit;
}

function parseCliArgs(argv = []) {
  const options = {
    dryRun: true,
    readOnly: true,
    limit: DEFAULT_LIMIT,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--execute' || arg.startsWith('--execute=')) {
      throw createBackupError('execution_mode_blocked');
    }

    if (arg === '--dry-run' || arg === '--read-only') {
      continue;
    }

    if (arg === '--uid') {
      options.uid = readFlagValue(argv, index, 'missing_uid').trim();
      index += 1;
      continue;
    }

    if (arg.startsWith('--uid=')) {
      options.uid = arg.slice('--uid='.length).trim();
      continue;
    }

    if (arg === '--limit') {
      options.limit = readFlagValue(argv, index, 'missing_limit');
      index += 1;
      continue;
    }

    if (arg.startsWith('--limit=')) {
      options.limit = arg.slice('--limit='.length);
      continue;
    }

    throw createBackupError('unsupported_argument');
  }

  if (options.uid !== undefined && options.uid.length === 0) {
    throw createBackupError('invalid_uid');
  }

  options.limit = resolveLimit(options.limit);

  return options;
}

function resolveGeneratedAt({ generatedAt, clock } = {}) {
  if (typeof generatedAt === 'string') {
    return generatedAt;
  }

  if (typeof clock === 'function') {
    const value = clock();

    if (value instanceof Date) {
      return value.toISOString();
    }

    return `${value}`;
  }

  return new Date().toISOString();
}

function extractDocumentData(documentInput) {
  if (
    documentInput
    && typeof documentInput === 'object'
    && typeof documentInput.data === 'function'
  ) {
    return documentInput.data();
  }

  if (
    documentInput
    && typeof documentInput === 'object'
    && (documentInput.ref || typeof documentInput.path === 'string')
    && documentInput.data
    && typeof documentInput.data === 'object'
    && !Array.isArray(documentInput.data)
  ) {
    return documentInput.data;
  }

  return documentInput;
}

function extractDocumentPath(documentInput) {
  if (!documentInput || typeof documentInput !== 'object') {
    return undefined;
  }

  if (typeof documentInput.path === 'string') {
    return documentInput.path;
  }

  if (documentInput.ref && typeof documentInput.ref.path === 'string') {
    return documentInput.ref.path;
  }

  return undefined;
}

function isDocumentForUid(documentInput, uid) {
  if (uid === undefined) {
    return true;
  }

  const documentPath = extractDocumentPath(documentInput);

  if (typeof documentPath !== 'string') {
    return false;
  }

  const segments = documentPath.split('/');

  return segments.length === 4
    && segments[0] === 'users'
    && segments[1] === uid
    && segments[2] === 'transactions';
}

function isPlainObject(value) {
  return Boolean(value)
    && typeof value === 'object'
    && !Array.isArray(value)
    && !(value instanceof Date);
}

function canonicalizeValue(value) {
  if (value === undefined || typeof value === 'function') {
    return undefined;
  }

  if (value instanceof Date) {
    return {
      __type: 'Date',
      iso: value.toISOString(),
    };
  }

  if (Array.isArray(value)) {
    return value.map((item) => {
      const canonicalItem = canonicalizeValue(item);
      return canonicalItem === undefined ? null : canonicalItem;
    });
  }

  if (isPlainObject(value)) {
    const sorted = {};
    const keys = Object.keys(value).sort();

    for (const key of keys) {
      const canonicalItem = canonicalizeValue(value[key]);

      if (canonicalItem !== undefined) {
        sorted[key] = canonicalItem;
      }
    }

    return sorted;
  }

  return value;
}

function stableStringify(value, spacing = 0) {
  return JSON.stringify(canonicalizeValue(value), null, spacing);
}

function createSnapshotCandidate(documentInput, documentData) {
  const documentPath = extractDocumentPath(documentInput);
  const candidate = {
    data: canonicalizeValue(documentData),
  };

  if (documentPath) {
    candidate.path = documentPath;
  }

  return canonicalizeValue(candidate);
}

function buildBackupSnapshot(documents = [], options = {}) {
  const limit = resolveLimit(options.limit);
  const generatedAt = resolveGeneratedAt(options);
  const policy = options.policy || { classifyLegacyTransaction };
  const snapshot = {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    generatedAt,
    candidates: [],
  };
  const counts = {
    totalAnalyzed: 0,
    totalBackedUp: 0,
    blockedCount: 0,
    ignoredCount: 0,
  };
  const sourceDocuments = Array.isArray(documents) ? documents : [];

  for (const documentInput of sourceDocuments) {
    if (!isDocumentForUid(documentInput, options.uid)) {
      continue;
    }

    if (counts.totalAnalyzed >= limit) {
      break;
    }

    const documentData = extractDocumentData(documentInput);
    const classification = policy.classifyLegacyTransaction(documentData);
    counts.totalAnalyzed += 1;

    if (classification.decision === 'migrationEligible') {
      snapshot.candidates.push(createSnapshotCandidate(documentInput, documentData));
      counts.totalBackedUp += 1;
      continue;
    }

    if (classification.decision === 'ignored') {
      counts.ignoredCount += 1;
      continue;
    }

    counts.blockedCount += 1;
  }

  return {
    snapshot: canonicalizeValue(snapshot),
    counts,
  };
}

function calculateChecksumSha256(snapshot) {
  const hash = crypto.createHash('sha256');

  hash['update'](stableStringify(snapshot));

  return hash.digest('hex');
}

function buildBackupManifest(snapshot, counts, options = {}) {
  return canonicalizeValue({
    schemaVersion: BACKUP_SCHEMA_VERSION,
    generatedAt: snapshot.generatedAt,
    totalAnalyzed: counts.totalAnalyzed,
    totalBackedUp: counts.totalBackedUp,
    blockedCount: counts.blockedCount,
    ignoredCount: counts.ignoredCount,
    checksumSha256: calculateChecksumSha256(snapshot),
    dryRun: true,
    readOnly: true,
    backupType: options.backupType || 'legacyMigrationCandidates',
  });
}

function buildBackupPackage(documents = [], options = {}) {
  const { snapshot, counts } = buildBackupSnapshot(documents, options);
  const manifest = buildBackupManifest(snapshot, counts, options);

  return {
    manifest,
    snapshot,
  };
}

function sanitizeTimestampForFileName(generatedAt) {
  return generatedAt.replace(/[^0-9A-Za-z-]/g, '');
}

function resolveOutputPath({ outputDir = DEFAULT_OUTPUT_DIR, fileName, generatedAt }) {
  const safeFileName = fileName || `legacy-candidates-${sanitizeTimestampForFileName(generatedAt)}.json`;

  return path.join(outputDir, safeFileName);
}

function writeBackupFile(backupPackage, options = {}) {
  const outputPath = resolveOutputPath({
    outputDir: options.outputDir,
    fileName: options.fileName,
    generatedAt: backupPackage.manifest.generatedAt,
  });

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${stableStringify(backupPackage, 2)}\n`, 'utf8');

  return outputPath;
}

function toSafeRelativePath(filePath, cwd = path.resolve(__dirname, '../..')) {
  const relativePath = path.relative(cwd, filePath);
  const normalized = relativePath.split(path.sep).join('/');

  if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
    return path.basename(filePath);
  }

  return normalized;
}

function createConsoleReport(manifest, filePath, options = {}) {
  return canonicalizeValue({
    totalAnalyzed: manifest.totalAnalyzed,
    totalBackedUp: manifest.totalBackedUp,
    blockedCount: manifest.blockedCount,
    ignoredCount: manifest.ignoredCount,
    checksumSha256: manifest.checksumSha256,
    file: toSafeRelativePath(filePath, options.cwd),
    dryRun: true,
    readOnly: true,
  });
}

function writeConsoleReport(report, logger = console) {
  const output = stableStringify(report, 2);

  if (typeof logger === 'function') {
    logger(output);
    return output;
  }

  if (logger && typeof logger.log === 'function') {
    logger.log(output);
  }

  return output;
}

async function runBackup({
  argv = [],
  documents,
  readDocuments,
  db,
  env = process.env,
  generatedAt,
  clock,
  outputDir,
  fileName,
  logger = console,
  policy,
  cwd,
} = {}) {
  const cliOptions = parseCliArgs(argv);
  const sourceDocuments = documents !== undefined
    ? documents
    : await (readDocuments || readFirestoreTransactions)({
      db,
      env,
      limit: cliOptions.limit,
      uid: cliOptions.uid,
    });
  const backupPackage = buildBackupPackage(sourceDocuments, {
    ...cliOptions,
    generatedAt,
    clock,
    policy,
  });
  const outputPath = writeBackupFile(backupPackage, {
    outputDir,
    fileName,
  });
  const report = createConsoleReport(backupPackage.manifest, outputPath, { cwd });

  writeConsoleReport(report, logger);

  return {
    manifest: backupPackage.manifest,
    snapshot: backupPackage.snapshot,
    outputPath,
    report,
  };
}

async function runCli(options = {}) {
  return runBackup({
    ...options,
    argv: options.argv || process.argv.slice(2),
  });
}

if (require.main === module) {
  runCli().catch(() => {
    console.error('legacy_backup_readonly_failed');
    process.exitCode = 1;
  });
}

module.exports = {
  BACKUP_SCHEMA_VERSION,
  DEFAULT_LIMIT,
  DEFAULT_OUTPUT_DIR,
  parseCliArgs,
  resolveLimit,
  canonicalizeValue,
  stableStringify,
  buildBackupSnapshot,
  calculateChecksumSha256,
  buildBackupManifest,
  buildBackupPackage,
  writeBackupFile,
  createConsoleReport,
  writeConsoleReport,
  runBackup,
  runCli,
};
