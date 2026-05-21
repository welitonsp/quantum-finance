const admin = require('firebase-admin');
const {
  classifyLegacyTransaction,
  buildMigrationPlan,
} = require('./legacyMigrationPolicy');

const TEST_PROJECT_ID = 'demo-quantum-finance';
const DEFAULT_LIMIT = 100;
const BLOCKED_EXECUTION_MESSAGE = 'Execution mode is blocked in FASE 10D-1D. Dry-run only.';

const DECISION_KEYS = [
  'ignored',
  'migrationEligible',
  'adminRepairRequired',
  'migrationBlocked',
];

const STATUS_KEYS = [
  'alreadyV2',
  'v1WithSafeValueCents',
  'v1FloatOnlyUnsafe',
  'v1MissingValueCents',
  'unknownShape',
];

function createPlannerError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function assertExecutionModeBlocked() {
  throw new Error(BLOCKED_EXECUTION_MESSAGE);
}

function readFlagValue(argv, index, code) {
  const value = argv[index + 1];

  if (value === undefined || value.startsWith('--')) {
    throw createPlannerError(code);
  }

  return value;
}

function resolveLimit(rawLimit = DEFAULT_LIMIT) {
  const text = `${rawLimit}`.trim();

  if (!/^[1-9][0-9]*$/.test(text)) {
    throw createPlannerError('invalid_limit');
  }

  const limit = parseInt(text, 10);

  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw createPlannerError('invalid_limit');
  }

  return limit;
}

function parseCliArgs(argv = []) {
  const options = {
    dryRun: true,
    limit: DEFAULT_LIMIT,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--execute' || arg.startsWith('--execute=')) {
      assertExecutionModeBlocked();
    }

    if (arg === '--dry-run') {
      continue;
    }

    if (arg === '--uid') {
      const uid = readFlagValue(argv, index, 'missing_uid');
      options.uid = uid.trim();
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

    throw createPlannerError('unsupported_argument');
  }

  if (options.uid !== undefined && options.uid.length === 0) {
    throw createPlannerError('invalid_uid');
  }

  options.limit = resolveLimit(options.limit);

  return options;
}

function createCounterMap(keys) {
  const counters = {};

  for (const key of keys) {
    counters[key] = 0;
  }

  return counters;
}

function createEmptyReport({ generatedAt, limit }) {
  return {
    dryRun: true,
    generatedAt,
    limitApplied: limit,
    totalAnalyzed: 0,
    ignoredCount: 0,
    migrationEligibleCount: 0,
    adminRepairRequiredCount: 0,
    migrationBlockedCount: 0,
    unknownShapeCount: 0,
    summary: {
      decisions: createCounterMap(DECISION_KEYS),
      statuses: createCounterMap(STATUS_KEYS),
    },
  };
}

function normalizeDecision(decision) {
  return DECISION_KEYS.includes(decision) ? decision : 'migrationBlocked';
}

function normalizeStatus(status) {
  return STATUS_KEYS.includes(status) ? status : 'unknownShape';
}

function resolveGeneratedAt({ generatedAt, clock } = {}) {
  if (typeof generatedAt === 'string') {
    return generatedAt;
  }

  if (typeof clock === 'function') {
    const clockValue = clock();

    if (clockValue instanceof Date) {
      return clockValue.toISOString();
    }

    return `${clockValue}`;
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

  const path = extractDocumentPath(documentInput);

  if (typeof path !== 'string') {
    return false;
  }

  const segments = path.split('/');

  return segments.length === 4
    && segments[0] === 'users'
    && segments[1] === uid
    && segments[2] === 'transactions';
}

function incrementReport(report, classification) {
  const decision = normalizeDecision(classification && classification.decision);
  const status = normalizeStatus(classification && classification.status);

  report.summary.decisions[decision] += 1;
  report.summary.statuses[status] += 1;

  if (decision === 'ignored') {
    report.ignoredCount += 1;
  } else if (decision === 'migrationEligible') {
    report.migrationEligibleCount += 1;
  } else if (decision === 'adminRepairRequired') {
    report.adminRepairRequiredCount += 1;
  } else if (decision === 'migrationBlocked') {
    report.migrationBlockedCount += 1;
  }

  if (status === 'unknownShape') {
    report.unknownShapeCount += 1;
  }

  return { decision, status };
}

function buildDryRunReport(documents = [], options = {}) {
  const policy = options.policy || {
    classifyLegacyTransaction,
    buildMigrationPlan,
  };
  const limit = resolveLimit(options.limit);
  const generatedAt = resolveGeneratedAt(options);
  const report = createEmptyReport({ generatedAt, limit });
  const sourceDocuments = Array.isArray(documents) ? documents : [];

  for (const documentInput of sourceDocuments) {
    if (!isDocumentForUid(documentInput, options.uid)) {
      continue;
    }

    if (report.totalAnalyzed >= limit) {
      break;
    }

    const documentData = extractDocumentData(documentInput);
    const classification = policy.classifyLegacyTransaction(documentData);
    const normalizedClassification = incrementReport(report, classification);

    policy.buildMigrationPlan(documentData, normalizedClassification);
    report.totalAnalyzed += 1;
  }

  return report;
}

function resolveProjectId(env = process.env) {
  const candidates = [
    env.FIREBASE_PROJECT_ID,
    env.GCLOUD_PROJECT,
    env.GOOGLE_CLOUD_PROJECT,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  if (env.NODE_ENV === 'test' || env.FIRESTORE_EMULATOR_HOST) {
    return TEST_PROJECT_ID;
  }

  throw createPlannerError('missing_project_id');
}

function getFirestoreDb({ db, env = process.env } = {}) {
  if (db) {
    return db;
  }

  const projectId = resolveProjectId(env);

  if (admin.apps.length === 0) {
    admin.initializeApp({ projectId });
  }

  return admin.firestore();
}

async function readFirestoreTransactions({ db, env = process.env, limit }) {
  const firestoreDb = getFirestoreDb({ db, env });
  const snapshot = await firestoreDb
    .collectionGroup('transactions')
    .limit(limit)
    .get();

  return Array.isArray(snapshot.docs) ? snapshot.docs : [];
}

function formatSanitizedReport(report) {
  return JSON.stringify(report, null, 2);
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

async function runDryRun({
  argv = [],
  db,
  env = process.env,
  documents,
  readDocuments,
  generatedAt,
  clock,
  logger = console,
  policy,
} = {}) {
  const cliOptions = parseCliArgs(argv);
  const plannedDocuments = documents !== undefined
    ? documents
    : await (readDocuments || readFirestoreTransactions)({
      db,
      env,
      limit: cliOptions.limit,
      uid: cliOptions.uid,
    });
  const report = buildDryRunReport(plannedDocuments, {
    ...cliOptions,
    generatedAt,
    clock,
    policy,
  });

  writeSanitizedReport(report, logger);

  return report;
}

async function runCli(options = {}) {
  return runDryRun({
    ...options,
    argv: options.argv || process.argv.slice(2),
  });
}

if (require.main === module) {
  runCli().catch((error) => {
    if (error && error.message === BLOCKED_EXECUTION_MESSAGE) {
      console.error(BLOCKED_EXECUTION_MESSAGE);
    } else {
      console.error('legacy_migration_dry_run_failed');
    }

    process.exitCode = 1;
  });
}

module.exports = {
  BLOCKED_EXECUTION_MESSAGE,
  DEFAULT_LIMIT,
  DECISION_KEYS,
  STATUS_KEYS,
  parseCliArgs,
  resolveLimit,
  buildDryRunReport,
  formatSanitizedReport,
  writeSanitizedReport,
  runDryRun,
  runCli,
  readFirestoreTransactions,
  getFirestoreDb,
  resolveProjectId,
};
