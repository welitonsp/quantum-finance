/**
 * functions/scripts/executeLegacyMigrationSafe.js
 *
 * Passo de execução REAL, mas deliberadamente restrito, para a migração de
 * floats legados (FASE 10D). Separado de `executeLegacyMigration.js` de
 * propósito: aquele script permanece um dry-run planner puro, protegido por
 * um guardrail estático (`functions/test/executeLegacyMigration.test.js`)
 * que garante ausência TOTAL de tokens de escrita em banco. Este arquivo é a
 * ÚNICA superfície nova capaz de escrever, e escreve apenas o subconjunto
 * inequívoco:
 *
 *   - Só processa documentos classificados `migrationEligible` por
 *     `legacyMigrationPolicy.classifyLegacyTransaction` — já têm
 *     `value_cents` seguro (Number.isSafeInteger), falta só o bump de
 *     `schemaVersion`/`source`. ZERO matemática monetária nova é escrita —
 *     nenhuma conversão float→centavos, nenhuma heurística de arredondamento
 *     (as heurísticas proibidas no projeto continuam proibidas aqui também).
 *   - Qualquer documento fora dessa classificação no lote faz a execução
 *     INTEIRA abortar sem escrever nada (fail-closed) — não existe
 *     "escrever os elegíveis e pular o resto" nesta versão.
 *   - Exige um backup prévio válido e checksumado (produzido por
 *     `backupLegacyCandidates.js`, validado com a mesma lógica de
 *     `rollbackLegacyMigration.js`) cobrindo 100% dos documentos do lote —
 *     documento fora do backup também aborta a execução inteira.
 *   - `--execute` é obrigatório explicitamente; sem ele, lança erro fixo
 *     (não há modo "dry-run" aqui — para relatório sem escrita, usar
 *     `executeLegacyMigration.js`).
 *
 * Casos ambíguos/`adminRepairRequired`/`unknownShape` PERMANECEM bloqueados
 * — exigem decisão humana caso a caso, nunca conversão automática.
 */

const {
  classifyLegacyTransaction,
  buildMigrationPlan,
} = require('./legacyMigrationPolicy');
const {
  getFirestoreDb,
  readFirestoreTransactions,
} = require('./executeLegacyMigration');
const {
  readBackupFile,
  validateBackupPackage,
} = require('./rollbackLegacyMigration');

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;
const MISSING_EXECUTE_FLAG_MESSAGE = 'Esta ação requer a flag --execute explícita.';

function createSafeExecutionError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function readFlagValue(argv, index, code) {
  const value = argv[index + 1];

  if (value === undefined || value.startsWith('--')) {
    throw createSafeExecutionError(code);
  }

  return value;
}

function resolveLimit(rawLimit = DEFAULT_LIMIT) {
  const text = `${rawLimit}`.trim();

  if (!/^[1-9][0-9]*$/.test(text)) {
    throw createSafeExecutionError('invalid_limit');
  }

  const limit = parseInt(text, 10);

  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw createSafeExecutionError('invalid_limit');
  }

  return limit;
}

function parseCliArgs(argv = []) {
  const options = {
    execute: false,
    limit: DEFAULT_LIMIT,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--execute') {
      options.execute = true;
      continue;
    }

    if (arg === '--backup-file') {
      options.backupFile = readFlagValue(argv, index, 'missing_backup_file');
      index += 1;
      continue;
    }

    if (arg.startsWith('--backup-file=')) {
      options.backupFile = arg.slice('--backup-file='.length);
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

    throw createSafeExecutionError('unsupported_argument');
  }

  if (!options.execute) {
    throw new Error(MISSING_EXECUTE_FLAG_MESSAGE);
  }

  if (!options.backupFile || options.backupFile.trim().length === 0) {
    throw createSafeExecutionError('missing_backup_file');
  }

  if (options.uid !== undefined && options.uid.length === 0) {
    throw createSafeExecutionError('invalid_uid');
  }

  options.limit = resolveLimit(options.limit);

  return options;
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

function buildBackupPathSet(backupPackage) {
  const paths = new Set();

  for (const candidate of backupPackage.snapshot.candidates) {
    if (candidate && typeof candidate.path === 'string') {
      paths.add(candidate.path);
    }
  }

  return paths;
}

/**
 * Fail-closed por design: se QUALQUER documento do lote não for
 * migrationEligible OU não estiver no backup validado, a função lança e
 * NENHUM write é preparado — não existe "escrever os elegíveis e pular o
 * resto" nesta versão.
 */
function planSafeExecution({ documents = [], backupPackage, uid, limit, policy } = {}) {
  const classify = (policy && policy.classifyLegacyTransaction) || classifyLegacyTransaction;
  const buildPlan = (policy && policy.buildMigrationPlan) || buildMigrationPlan;
  const backedUpPaths = buildBackupPathSet(backupPackage);

  const writes = [];
  let analyzed = 0;

  for (const documentInput of documents) {
    if (!isDocumentForUid(documentInput, uid)) {
      continue;
    }

    if (analyzed >= limit) {
      break;
    }
    analyzed += 1;

    const path = extractDocumentPath(documentInput);

    if (typeof path !== 'string' || path.length === 0) {
      throw createSafeExecutionError('document_missing_path');
    }

    const documentData = extractDocumentData(documentInput);
    const classification = classify(documentData);

    if (classification.decision !== 'migrationEligible') {
      throw createSafeExecutionError('batch_contains_non_eligible_document');
    }

    if (!backedUpPaths.has(path)) {
      throw createSafeExecutionError('document_not_covered_by_backup');
    }

    const patch = buildPlan(documentData, classification);

    if (!patch || patch.schemaVersion !== 2) {
      throw createSafeExecutionError('invalid_migration_plan');
    }

    writes.push({ path, patch });
  }

  return { writes, analyzed };
}

function createSanitizedReport({ writes, analyzed }) {
  return {
    dryRun: false,
    executed: true,
    totalAnalyzed: analyzed,
    totalWritten: writes.length,
  };
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

async function commitWrites({ db, writes }) {
  if (writes.length === 0) {
    return;
  }

  const batch = db.batch();

  for (const { path, patch } of writes) {
    batch.update(db.doc(path), patch);
  }

  await batch.commit();
}

async function runSafeExecution({
  argv = [],
  db,
  env = process.env,
  documents,
  readDocuments,
  backupPackage,
  logger = console,
  policy,
} = {}) {
  const cliOptions = parseCliArgs(argv);

  const resolvedBackupPackage = backupPackage !== undefined
    ? backupPackage
    : readBackupFile(cliOptions.backupFile);

  validateBackupPackage(resolvedBackupPackage);

  const plannedDocuments = documents !== undefined
    ? documents
    : await (readDocuments || readFirestoreTransactions)({
      db,
      env,
      limit: cliOptions.limit,
      uid: cliOptions.uid,
    });

  const { writes, analyzed } = planSafeExecution({
    documents: plannedDocuments,
    backupPackage: resolvedBackupPackage,
    uid: cliOptions.uid,
    limit: cliOptions.limit,
    policy,
  });

  const firestoreDb = getFirestoreDb({ db, env });
  await commitWrites({ db: firestoreDb, writes });

  const report = createSanitizedReport({ writes, analyzed });
  writeSanitizedReport(report, logger);

  return report;
}

async function runCli(options = {}) {
  return runSafeExecution({
    ...options,
    argv: options.argv || process.argv.slice(2),
  });
}

if (require.main === module) {
  runCli().catch((error) => {
    console.error(error && error.message === MISSING_EXECUTE_FLAG_MESSAGE
      ? MISSING_EXECUTE_FLAG_MESSAGE
      : 'legacy_migration_safe_execution_failed');
    process.exitCode = 1;
  });
}

module.exports = {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  MISSING_EXECUTE_FLAG_MESSAGE,
  parseCliArgs,
  resolveLimit,
  planSafeExecution,
  createSanitizedReport,
  formatSanitizedReport,
  writeSanitizedReport,
  commitWrites,
  runSafeExecution,
  runCli,
};
