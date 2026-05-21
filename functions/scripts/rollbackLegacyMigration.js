const crypto = require('node:crypto');
const fs = require('node:fs');

const BACKUP_SCHEMA_VERSION = 1;
const ROLLBACK_PLAN_SCHEMA_VERSION = 1;
const BLOCKED_EXECUTION_MESSAGE = 'Execution mode is blocked in FASE 10D-1H-A. Read-only rollback planning only.';

function createRollbackError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function readFlagValue(argv, index, code) {
  const value = argv[index + 1];

  if (value === undefined || value.startsWith('--')) {
    throw createRollbackError(code);
  }

  return value;
}

function parseCliArgs(argv = []) {
  const options = {
    dryRun: true,
    readOnly: true,
  };
  const positional = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--execute' || arg.startsWith('--execute=')) {
      throw new Error(BLOCKED_EXECUTION_MESSAGE);
    }

    if (arg === '--dry-run' || arg === '--read-only') {
      continue;
    }

    if (arg === '--file' || arg === '--backup') {
      options.filePath = readFlagValue(argv, index, 'missing_backup_path');
      index += 1;
      continue;
    }

    if (arg.startsWith('--file=')) {
      options.filePath = arg.slice('--file='.length);
      continue;
    }

    if (arg.startsWith('--backup=')) {
      options.filePath = arg.slice('--backup='.length);
      continue;
    }

    if (arg.startsWith('--')) {
      throw createRollbackError('unsupported_argument');
    }

    positional.push(arg);
  }

  if (options.filePath && positional.length > 0) {
    throw createRollbackError('multiple_backup_paths');
  }

  if (!options.filePath && positional.length === 1) {
    options.filePath = positional[0];
  }

  if (!options.filePath || options.filePath.trim().length === 0) {
    throw createRollbackError('missing_backup_path');
  }

  if (positional.length > 1) {
    throw createRollbackError('multiple_backup_paths');
  }

  options.filePath = options.filePath.trim();

  return options;
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

function calculateChecksumSha256(snapshot) {
  const hash = crypto.createHash('sha256');

  hash['update'](stableStringify(snapshot));

  return hash.digest('hex');
}

function readBackupFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    throw createRollbackError('invalid_backup_file');
  }
}

function isValidHexSha256(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function assertSafeIntegerField(container, fieldName, code) {
  if (!Number.isSafeInteger(container[fieldName]) || container[fieldName] < 0) {
    throw createRollbackError(code);
  }
}

function validateBackupPackage(backupPackage) {
  if (!isPlainObject(backupPackage)) {
    throw createRollbackError('invalid_backup_file');
  }

  const manifest = backupPackage.manifest;
  const snapshot = backupPackage.snapshot;

  if (!isPlainObject(manifest) || !isPlainObject(snapshot)) {
    throw createRollbackError('invalid_backup_file');
  }

  if (
    manifest.schemaVersion !== BACKUP_SCHEMA_VERSION
    || snapshot.schemaVersion !== BACKUP_SCHEMA_VERSION
  ) {
    throw createRollbackError('invalid_backup_schema_version');
  }

  if (!Array.isArray(snapshot.candidates)) {
    throw createRollbackError('invalid_backup_candidates');
  }

  assertSafeIntegerField(manifest, 'totalAnalyzed', 'invalid_backup_counts');
  assertSafeIntegerField(manifest, 'totalBackedUp', 'invalid_backup_counts');

  if (manifest.totalAnalyzed < manifest.totalBackedUp) {
    throw createRollbackError('invalid_backup_counts');
  }

  if (manifest.totalBackedUp !== snapshot.candidates.length) {
    throw createRollbackError('backup_candidate_count_mismatch');
  }

  if (!isValidHexSha256(manifest.checksumSha256)) {
    throw createRollbackError('invalid_backup_checksum');
  }

  const checksumSha256 = calculateChecksumSha256(snapshot);

  if (checksumSha256 !== manifest.checksumSha256) {
    throw createRollbackError('invalid_backup_checksum');
  }

  return {
    manifest,
    snapshot,
    checksumSha256,
    schemaVersionValid: true,
    checksumValid: true,
    candidateCountValid: true,
  };
}

function classifySnapshotCandidate(candidate) {
  const hasPath = isPlainObject(candidate) && typeof candidate.path === 'string' && candidate.path.length > 0;
  const hasData = isPlainObject(candidate) && isPlainObject(candidate.data);

  if (hasPath && hasData) {
    return 'restoreCandidate';
  }

  if (!hasPath && !hasData) {
    return 'invalidMissingPathAndData';
  }

  if (!hasPath) {
    return 'invalidMissingPath';
  }

  return 'invalidMissingData';
}

function buildRollbackPlan(backupPackage) {
  const validation = validateBackupPackage(backupPackage);
  const candidates = validation.snapshot.candidates;
  const plan = {
    schemaVersion: ROLLBACK_PLAN_SCHEMA_VERSION,
    backupSchemaVersion: validation.snapshot.schemaVersion,
    backupGeneratedAt: validation.snapshot.generatedAt,
    dryRun: true,
    readOnly: true,
    totalCandidates: candidates.length,
    rollbackCandidateCount: 0,
    invalidCandidateCount: 0,
    missingPathCount: 0,
    missingDataCount: 0,
    validation: {
      schemaVersionValid: validation.schemaVersionValid,
      checksumValid: validation.checksumValid,
      candidateCountValid: validation.candidateCountValid,
    },
    status: 'rollbackPlanReady',
  };

  for (const candidate of candidates) {
    const classification = classifySnapshotCandidate(candidate);

    if (classification === 'restoreCandidate') {
      plan.rollbackCandidateCount += 1;
      continue;
    }

    plan.invalidCandidateCount += 1;

    if (classification === 'invalidMissingPath' || classification === 'invalidMissingPathAndData') {
      plan.missingPathCount += 1;
    }

    if (classification === 'invalidMissingData' || classification === 'invalidMissingPathAndData') {
      plan.missingDataCount += 1;
    }
  }

  if (plan.totalCandidates === 0) {
    plan.status = 'emptySnapshot';
  } else if (plan.invalidCandidateCount > 0) {
    plan.status = 'rollbackPlanBlocked';
  }

  return canonicalizeValue(plan);
}

function createSanitizedReport(plan) {
  return canonicalizeValue({
    schemaVersion: plan.schemaVersion,
    backupSchemaVersion: plan.backupSchemaVersion,
    backupGeneratedAt: plan.backupGeneratedAt,
    dryRun: true,
    readOnly: true,
    status: plan.status,
    totalCandidates: plan.totalCandidates,
    rollbackCandidateCount: plan.rollbackCandidateCount,
    invalidCandidateCount: plan.invalidCandidateCount,
    missingPathCount: plan.missingPathCount,
    missingDataCount: plan.missingDataCount,
    validation: {
      schemaVersionValid: plan.validation.schemaVersionValid,
      checksumValid: plan.validation.checksumValid,
      candidateCountValid: plan.validation.candidateCountValid,
    },
  });
}

function formatSanitizedReport(report) {
  return stableStringify(report, 2);
}

function writeSanitizedReport(report, logger = console) {
  const output = formatSanitizedReport(report);

  if (typeof logger === 'function') {
    logger(output);
    return output;
  }

  if (logger && typeof logger.log === 'function') {
    logger.log(output);
  }

  return output;
}

async function runRollback({
  argv = [],
  backupPackage,
  readFile = readBackupFile,
  logger = console,
} = {}) {
  const options = parseCliArgs(argv);
  const packageToPlan = backupPackage || readFile(options.filePath);
  const plan = buildRollbackPlan(packageToPlan);
  const report = createSanitizedReport(plan);

  writeSanitizedReport(report, logger);

  return {
    plan,
    report,
  };
}

async function runCli(options = {}) {
  return runRollback({
    ...options,
    argv: options.argv || process.argv.slice(2),
  });
}

if (require.main === module) {
  runCli().catch((error) => {
    if (error && error.message === BLOCKED_EXECUTION_MESSAGE) {
      console.error(BLOCKED_EXECUTION_MESSAGE);
    } else {
      console.error('legacy_rollback_planner_failed');
    }

    process.exitCode = 1;
  });
}

module.exports = {
  BACKUP_SCHEMA_VERSION,
  ROLLBACK_PLAN_SCHEMA_VERSION,
  BLOCKED_EXECUTION_MESSAGE,
  parseCliArgs,
  canonicalizeValue,
  stableStringify,
  calculateChecksumSha256,
  readBackupFile,
  validateBackupPackage,
  buildRollbackPlan,
  createSanitizedReport,
  formatSanitizedReport,
  writeSanitizedReport,
  runRollback,
  runCli,
};
