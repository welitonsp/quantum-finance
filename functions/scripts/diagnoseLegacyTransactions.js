const admin = require('firebase-admin');

const TEST_PROJECT_ID = 'demo-quantum-finance';
const DEFAULT_TRANSACTION_LIMIT = 500;
const CURRENT_SCHEMA_VERSION = 2;
const ACCEPTED_SOURCES = new Set(['manual', 'csv', 'ofx', 'pdf']);
const ACCEPTED_TYPES = new Set(['entrada', 'saida']);
const REPAIRABLE_METADATA_FIELDS = new Set(['schemaVersion', 'source', 'updatedAt']);
const FINANCIAL_FIELD_NAMES = [
  'value_cents',
  'value',
  'amount',
  'amount_cents',
  'valueInCents',
  'valor',
  'valor_centavos',
];

const ESSENTIAL_FIELDS = [
  'description',
  'value_cents',
  'schemaVersion',
  'type',
  'category',
  'date',
  'source',
  'createdAt',
  'updatedAt'
];

const SENSITIVE_FIELD_NAMES = new Set([
  'description',
  'value_cents',
  'value',
  'amount',
  'amount_cents',
  'valueInCents',
  'valor',
  'valor_centavos',
  'importHash',
]);

const ADMIN_REPAIR_FIELDS = new Set([
  'createdAt',
  'updatedAt',
  'schemaVersion',
  'source',
]);

const CLIENT_REPAIR_FIELDS = new Set([
  'description',
  'value_cents',
  'type',
  'category',
  'date',
]);

const REPAIR_PLAN_COUNTER_KEYS = [
  'repairPlanEligible',
  'repairPlanBlocked',
  'blockedByMissingValueCents',
  'blockedByInvalidValueCents',
  'blockedByMissingDate',
  'blockedByInvalidDate',
  'blockedByMissingDescription',
  'blockedByInvalidDescription',
  'blockedByMissingType',
  'blockedByInvalidType',
  'blockedByMissingCreatedAt',
  'blockedByInvalidCreatedAt',
  'blockedBySourceAmbiguous',
  'ignoredOutOfScope',
];

const FINANCIAL_SHAPE_COUNTER_KEYS = [
  'hasValueCents',
  'missingValueCents',
  'hasLegacyValue',
  'legacyValueTypeNumber',
  'legacyValueTypeString',
  'legacyValueTypeOther',
  'hasAmount',
  'amountTypeNumber',
  'amountTypeString',
  'amountTypeOther',
  'hasAmountCents',
  'amountCentsTypeInteger',
  'amountCentsTypeOther',
  'hasValueInCents',
  'valueInCentsTypeInteger',
  'valueInCentsTypeOther',
  'hasValor',
  'valorTypeNumber',
  'valorTypeString',
  'valorTypeOther',
  'hasValorCentavos',
  'valorCentavosTypeInteger',
  'valorCentavosTypeOther',
];

const LEGACY_VALUE_SEMANTICS_COUNTER_KEYS = [
  'legacyValueNumberCount',
  'legacyValueFiniteCount',
  'legacyValueNonFiniteCount',
  'legacyValueNaNCount',
  'legacyValueIntegerCount',
  'legacyValueDecimalCount',
  'legacyValuePositiveCount',
  'legacyValueNegativeCount',
  'legacyValueZeroCount',
  'legacyValueTwoDecimalCompatibleCount',
  'legacyValueMoreThanTwoDecimalsCount',
  'legacyValueLooksLikeReaisCount',
  'legacyValueLooksLikeCentsCount',
  'legacyValueAmbiguousScaleCount',
  'legacyValueEntradaPositiveCount',
  'legacyValueEntradaNegativeCount',
  'legacyValueSaidaPositiveCount',
  'legacyValueSaidaNegativeCount',
  'legacyValueTypeSignMismatchCount',
  'legacyValueTypeSignCompatibleCount',
  'legacyValueAbsLt1Count',
  'legacyValueAbs1To100Count',
  'legacyValueAbs100To1000Count',
  'legacyValueAbs1000To10000Count',
  'legacyValueAbsGte10000Count',
];

const LEGACY_VALUE_CONVERSION_COUNTER_KEYS = [
  'conversionCandidateTotal',
  'conversionCandidateLikelyReais',
  'conversionCandidateAmbiguousInteger',
  'conversionBlockedTotal',
  'conversionBlockedHasValueCents',
  'conversionBlockedMissingLegacyValue',
  'conversionBlockedNonNumberLegacyValue',
  'conversionBlockedNonFiniteLegacyValue',
  'conversionBlockedNegativeLegacyValue',
  'conversionBlockedMoreThanTwoDecimals',
  'conversionBlockedUnsafeIntegerCents',
  'conversionBlockedMissingType',
  'conversionBlockedInvalidType',
  'conversionBlockedMissingDate',
  'conversionBlockedInvalidDate',
  'conversionBlockedMissingDescription',
  'conversionBlockedInvalidDescription',
  'conversionBlockedMissingCreatedAt',
  'conversionBlockedInvalidCreatedAt',
  'conversionBlockedLikelyCentsScale',
];

function createDiagnosticError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function resolveProjectId(env = process.env) {
  const explicitProjectId = [
    env.FIREBASE_PROJECT_ID,
    env.GCLOUD_PROJECT,
    env.GOOGLE_CLOUD_PROJECT,
  ].find((value) => typeof value === 'string' && value.trim().length > 0);

  if (explicitProjectId) {
    return explicitProjectId.trim();
  }

  if (env.NODE_ENV === 'test' || env.FIRESTORE_EMULATOR_HOST) {
    return TEST_PROJECT_ID;
  }

  throw createDiagnosticError('missing_project_id');
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

function sanitizeErrorCode(code) {
  if (code === undefined || code === null || code === '') {
    return undefined;
  }

  const [token] = String(code).trim().split(/[\s:;\\/]+/);
  const sanitized = token.replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 64);

  return sanitized || 'unknown';
}

function sanitizeDiagnosticError(error) {
  if (!error || typeof error !== 'object') {
    return {};
  }

  const code = sanitizeErrorCode(error.code);

  return code ? { code } : {};
}

function resolveTransactionLimit(transactionLimit) {
  if (transactionLimit === undefined) {
    return DEFAULT_TRANSACTION_LIMIT;
  }

  const numericLimit = Number(transactionLimit);

  if (!Number.isInteger(numericLimit) || numericLimit < 1) {
    throw createDiagnosticError('invalid_transaction_limit');
  }

  return numericLimit;
}

function trackSafeFieldNames(target, fieldNames) {
  for (const fieldName of fieldNames) {
    if (!SENSITIVE_FIELD_NAMES.has(fieldName)) {
      target.add(fieldName);
    }
  }
}

function formatFieldNames(fieldNames) {
  if (fieldNames.size === 0) {
    return 'none';
  }

  return [...fieldNames].sort().join(',');
}

function classifyRepair(missingFields, invalidTypes) {
  const affectedFields = new Set([...missingFields, ...invalidTypes]);

  if (affectedFields.size === 0) {
    return null;
  }

  if ([...affectedFields].some((fieldName) => ADMIN_REPAIR_FIELDS.has(fieldName))) {
    return 'adminRepairRequired';
  }

  if ([...affectedFields].some((fieldName) => CLIENT_REPAIR_FIELDS.has(fieldName))) {
    return 'clientRepairable';
  }

  return 'unknownShape';
}

function createRepairPlanCounters() {
  return Object.fromEntries(REPAIR_PLAN_COUNTER_KEYS.map((key) => [key, 0]));
}

function createFinancialShapeCounters() {
  return Object.fromEntries(FINANCIAL_SHAPE_COUNTER_KEYS.map((key) => [key, 0]));
}

function createLegacyValueSemanticsCounters() {
  return Object.fromEntries(LEGACY_VALUE_SEMANTICS_COUNTER_KEYS.map((key) => [key, 0]));
}

function createLegacyValueConversionCounters() {
  return Object.fromEntries(LEGACY_VALUE_CONVERSION_COUNTER_KEYS.map((key) => [key, 0]));
}

function isScopedTransactionPath(path) {
  if (typeof path !== 'string') {
    return false;
  }

  const segments = path.split('/');

  return segments.length === 4
    && segments[0] === 'users'
    && segments[1].trim().length > 0
    && segments[2] === 'transactions'
    && segments[3].trim().length > 0;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isSafeCents(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function isTwoDecimalCompatible(value) {
  if (!Number.isFinite(value)) {
    return false;
  }

  const scaled = value * 100;
  const rounded = Math.round(scaled);
  const tolerance = 1e-9;

  return Number.isSafeInteger(rounded) && Math.abs(scaled - rounded) <= tolerance;
}

function getScaledCentsInfo(value) {
  if (!Number.isFinite(value)) {
    return {
      integerCompatible: false,
      safeIntegerCents: false,
    };
  }

  const scaled = value * 100;
  const rounded = Math.round(scaled);
  const tolerance = 1e-9;
  const integerCompatible = Number.isFinite(scaled) && Math.abs(scaled - rounded) <= tolerance;

  return {
    integerCompatible,
    safeIntegerCents: integerCompatible && Number.isSafeInteger(rounded),
  };
}

function hasStoredField(data, fieldName) {
  return Object.prototype.hasOwnProperty.call(data, fieldName) && data[fieldName] !== undefined;
}

function isValidIsoDateYYYYMMDD(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00Z`);

  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isValidDescription(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isAcceptedType(value) {
  return typeof value === 'string' && ACCEPTED_TYPES.has(value);
}

function isAcceptedSource(value) {
  return typeof value === 'string' && ACCEPTED_SOURCES.has(value);
}

function isValidTimestampLike(value) {
  if (value === null || value === undefined) {
    return false;
  }

  if (value instanceof Date) {
    return !Number.isNaN(value.getTime());
  }

  if (typeof value === 'number') {
    return Number.isFinite(value);
  }

  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return !Number.isNaN(parsed);
  }

  if (typeof value === 'object' && typeof value.toMillis === 'function') {
    const millis = value.toMillis();
    return Number.isFinite(millis);
  }

  return false;
}

function collectRepairPlanBlockers(data, missingFields, invalidTypes, hasUnknownShape) {
  const blockerKeys = new Set();

  if (hasUnknownShape) {
    return { isEligible: false, blockerKeys, classification: 'unknownShape' };
  }

  if (data.value_cents === undefined) {
    blockerKeys.add('blockedByMissingValueCents');
  } else if (!isSafeCents(data.value_cents)) {
    blockerKeys.add('blockedByInvalidValueCents');
  }

  if (data.date === undefined) {
    blockerKeys.add('blockedByMissingDate');
  } else if (!isValidIsoDateYYYYMMDD(data.date)) {
    blockerKeys.add('blockedByInvalidDate');
  }

  if (data.description === undefined) {
    blockerKeys.add('blockedByMissingDescription');
  } else if (!isValidDescription(data.description)) {
    blockerKeys.add('blockedByInvalidDescription');
  }

  if (data.type === undefined) {
    blockerKeys.add('blockedByMissingType');
  } else if (!isAcceptedType(data.type)) {
    blockerKeys.add('blockedByInvalidType');
  }

  if (data.createdAt === undefined || data.createdAt === null) {
    blockerKeys.add('blockedByMissingCreatedAt');
  } else if (!isValidTimestampLike(data.createdAt)) {
    blockerKeys.add('blockedByInvalidCreatedAt');
  }

  if (data.source !== undefined && !isAcceptedSource(data.source)) {
    blockerKeys.add('blockedBySourceAmbiguous');
  }

  const missingOnlyRepairableMetadata = missingFields
    .every((fieldName) => REPAIRABLE_METADATA_FIELDS.has(fieldName));
  const invalidOnlyRepairableMetadata = invalidTypes.length === 0;
  const schemaVersionIsRepairable = data.schemaVersion === undefined
    || data.schemaVersion === CURRENT_SCHEMA_VERSION;

  const isEligible = blockerKeys.size === 0
    && missingOnlyRepairableMetadata
    && invalidOnlyRepairableMetadata
    && schemaVersionIsRepairable;

  return {
    isEligible,
    blockerKeys,
    classification: blockerKeys.size > 0 || !missingOnlyRepairableMetadata || !schemaVersionIsRepairable
      ? 'unknownShape'
      : classifyRepair(missingFields, invalidTypes),
  };
}

function trackNumberStringOther(financialShape, value, numberKey, stringKey, otherKey) {
  if (typeof value === 'number') {
    financialShape[numberKey]++;
  } else if (typeof value === 'string') {
    financialShape[stringKey]++;
  } else {
    financialShape[otherKey]++;
  }
}

function trackIntegerOther(financialShape, value, integerKey, otherKey) {
  if (Number.isSafeInteger(value)) {
    financialShape[integerKey]++;
  } else {
    financialShape[otherKey]++;
  }
}

function trackLegacyValueRange(legacyValueSemantics, value) {
  const absValue = Math.abs(value);

  if (absValue < 1) {
    legacyValueSemantics.legacyValueAbsLt1Count++;
  } else if (absValue < 100) {
    legacyValueSemantics.legacyValueAbs1To100Count++;
  } else if (absValue < 1000) {
    legacyValueSemantics.legacyValueAbs100To1000Count++;
  } else if (absValue < 10000) {
    legacyValueSemantics.legacyValueAbs1000To10000Count++;
  } else {
    legacyValueSemantics.legacyValueAbsGte10000Count++;
  }
}

function trackLegacyValueTypeSign(legacyValueSemantics, value, type) {
  if (!ACCEPTED_TYPES.has(type) || value === 0) {
    return;
  }

  if (type === 'entrada') {
    if (value > 0) {
      legacyValueSemantics.legacyValueEntradaPositiveCount++;
      legacyValueSemantics.legacyValueTypeSignCompatibleCount++;
    } else {
      legacyValueSemantics.legacyValueEntradaNegativeCount++;
      legacyValueSemantics.legacyValueTypeSignMismatchCount++;
    }
  }

  if (type === 'saida') {
    if (value > 0) {
      legacyValueSemantics.legacyValueSaidaPositiveCount++;
      legacyValueSemantics.legacyValueTypeSignMismatchCount++;
    } else {
      legacyValueSemantics.legacyValueSaidaNegativeCount++;
      legacyValueSemantics.legacyValueTypeSignCompatibleCount++;
    }
  }
}

function collectLegacyValueSemantics(data, legacyValueSemantics) {
  if (!hasStoredField(data, 'value') || typeof data.value !== 'number') {
    return;
  }

  const value = data.value;
  legacyValueSemantics.legacyValueNumberCount++;

  if (Number.isNaN(value)) {
    legacyValueSemantics.legacyValueNaNCount++;
  }

  if (!Number.isFinite(value)) {
    legacyValueSemantics.legacyValueNonFiniteCount++;
    return;
  }

  legacyValueSemantics.legacyValueFiniteCount++;

  if (Number.isInteger(value)) {
    legacyValueSemantics.legacyValueIntegerCount++;
  } else {
    legacyValueSemantics.legacyValueDecimalCount++;
  }

  if (value > 0) {
    legacyValueSemantics.legacyValuePositiveCount++;
  } else if (value < 0) {
    legacyValueSemantics.legacyValueNegativeCount++;
  } else {
    legacyValueSemantics.legacyValueZeroCount++;
  }

  const twoDecimalCompatible = isTwoDecimalCompatible(value);
  if (twoDecimalCompatible) {
    legacyValueSemantics.legacyValueTwoDecimalCompatibleCount++;
  } else {
    legacyValueSemantics.legacyValueMoreThanTwoDecimalsCount++;
  }

  if (!twoDecimalCompatible) {
    legacyValueSemantics.legacyValueAmbiguousScaleCount++;
  } else if (Number.isInteger(value) && Math.abs(value) >= 10000) {
    legacyValueSemantics.legacyValueLooksLikeCentsCount++;
  } else if (!Number.isInteger(value)) {
    legacyValueSemantics.legacyValueLooksLikeReaisCount++;
  } else {
    legacyValueSemantics.legacyValueAmbiguousScaleCount++;
  }

  trackLegacyValueRange(legacyValueSemantics, value);
  trackLegacyValueTypeSign(legacyValueSemantics, value, data.type);
}

function collectLegacyValueConversionCandidate(data, legacyValueConversion) {
  const blockerKeys = new Set();
  const hasLegacyValue = hasStoredField(data, 'value');
  const hasValueCents = hasStoredField(data, 'value_cents');
  const value = data.value;

  if (hasValueCents) {
    blockerKeys.add('conversionBlockedHasValueCents');
  }

  if (!hasLegacyValue) {
    blockerKeys.add('conversionBlockedMissingLegacyValue');
  } else if (typeof value !== 'number') {
    blockerKeys.add('conversionBlockedNonNumberLegacyValue');
  } else if (!Number.isFinite(value)) {
    blockerKeys.add('conversionBlockedNonFiniteLegacyValue');
  } else {
    if (value < 0) {
      blockerKeys.add('conversionBlockedNegativeLegacyValue');
    }

    const scaledCentsInfo = getScaledCentsInfo(value);
    if (!scaledCentsInfo.integerCompatible) {
      blockerKeys.add('conversionBlockedMoreThanTwoDecimals');
    } else if (!scaledCentsInfo.safeIntegerCents) {
      blockerKeys.add('conversionBlockedUnsafeIntegerCents');
    }

    if (Number.isInteger(value) && Math.abs(value) >= 10000) {
      blockerKeys.add('conversionBlockedLikelyCentsScale');
    }
  }

  if (data.type === undefined) {
    blockerKeys.add('conversionBlockedMissingType');
  } else if (!isAcceptedType(data.type)) {
    blockerKeys.add('conversionBlockedInvalidType');
  }

  if (data.date === undefined) {
    blockerKeys.add('conversionBlockedMissingDate');
  } else if (!isValidIsoDateYYYYMMDD(data.date)) {
    blockerKeys.add('conversionBlockedInvalidDate');
  }

  if (data.description === undefined) {
    blockerKeys.add('conversionBlockedMissingDescription');
  } else if (!isValidDescription(data.description)) {
    blockerKeys.add('conversionBlockedInvalidDescription');
  }

  if (data.createdAt === undefined || data.createdAt === null) {
    blockerKeys.add('conversionBlockedMissingCreatedAt');
  } else if (!isValidTimestampLike(data.createdAt)) {
    blockerKeys.add('conversionBlockedInvalidCreatedAt');
  }

  if (blockerKeys.size > 0) {
    legacyValueConversion.conversionBlockedTotal++;
    for (const blockerKey of blockerKeys) {
      legacyValueConversion[blockerKey]++;
    }
    return;
  }

  legacyValueConversion.conversionCandidateTotal++;
  if (Number.isInteger(value)) {
    legacyValueConversion.conversionCandidateAmbiguousInteger++;
  } else {
    legacyValueConversion.conversionCandidateLikelyReais++;
  }
}

function collectFinancialShape(data, financialShape, financialFieldNamesFound) {
  for (const fieldName of FINANCIAL_FIELD_NAMES) {
    if (hasStoredField(data, fieldName)) {
      financialFieldNamesFound.add(fieldName);
    }
  }

  if (hasStoredField(data, 'value_cents')) {
    financialShape.hasValueCents++;
  } else {
    financialShape.missingValueCents++;
  }

  if (hasStoredField(data, 'value')) {
    financialShape.hasLegacyValue++;
    trackNumberStringOther(
      financialShape,
      data.value,
      'legacyValueTypeNumber',
      'legacyValueTypeString',
      'legacyValueTypeOther'
    );
  }

  if (hasStoredField(data, 'amount')) {
    financialShape.hasAmount++;
    trackNumberStringOther(
      financialShape,
      data.amount,
      'amountTypeNumber',
      'amountTypeString',
      'amountTypeOther'
    );
  }

  if (hasStoredField(data, 'amount_cents')) {
    financialShape.hasAmountCents++;
    trackIntegerOther(
      financialShape,
      data.amount_cents,
      'amountCentsTypeInteger',
      'amountCentsTypeOther'
    );
  }

  if (hasStoredField(data, 'valueInCents')) {
    financialShape.hasValueInCents++;
    trackIntegerOther(
      financialShape,
      data.valueInCents,
      'valueInCentsTypeInteger',
      'valueInCentsTypeOther'
    );
  }

  if (hasStoredField(data, 'valor')) {
    financialShape.hasValor++;
    trackNumberStringOther(
      financialShape,
      data.valor,
      'valorTypeNumber',
      'valorTypeString',
      'valorTypeOther'
    );
  }

  if (hasStoredField(data, 'valor_centavos')) {
    financialShape.hasValorCentavos++;
    trackIntegerOther(
      financialShape,
      data.valor_centavos,
      'valorCentavosTypeInteger',
      'valorCentavosTypeOther'
    );
  }
}

async function runDiagnostics({
  db,
  env = process.env,
  args = process.argv,
  transactionLimit,
} = {}) {
  const isWriteMode = args.includes('--write');

  console.log('--- Diagnóstico de Transações Legadas ---');
  console.log(`Modo: ${isWriteMode ? 'WRITE (Não autorizado)' : 'DRY-RUN'}\n`);

  try {
    if (isWriteMode) {
      console.warn('WRITE MODE bloqueado temporariamente por segurança até auditoria.');
      throw createDiagnosticError('write_mode_rejected');
    }

    const firestoreDb = getFirestoreDb({ db, env });
    const appliedTransactionLimit = resolveTransactionLimit(transactionLimit);
    let totalTransactionsAnalyzed = 0;
    const issuesCount = {
      missingCreatedAt: 0,
      missingEssentialField: 0,
      invalidFieldType: 0,
    };

    const repairPlan = createRepairPlanCounters();
    const financialShape = createFinancialShapeCounters();
    const legacyValueSemantics = createLegacyValueSemanticsCounters();
    const legacyValueConversion = createLegacyValueConversionCounters();
    const repairClassification = {
      adminRepairRequired: 0,
      clientRepairable: 0,
      unknownShape: 0,
    };

    const missingFieldNames = new Set();
    const invalidFieldNames = new Set();
    const financialFieldNamesFound = new Set();
    const txSnapshot = await firestoreDb
      .collectionGroup('transactions')
      .limit(appliedTransactionLimit)
      .get();

    for (const txDoc of txSnapshot.docs) {
      if (!isScopedTransactionPath(txDoc.ref && txDoc.ref.path)) {
        repairPlan.ignoredOutOfScope++;
        continue;
      }

      totalTransactionsAnalyzed++;
      const rawData = txDoc.data();
      const data = isPlainObject(rawData)
        ? rawData
        : {};
      const hasUnknownShape = data !== rawData;
      collectFinancialShape(data, financialShape, financialFieldNamesFound);
      collectLegacyValueSemantics(data, legacyValueSemantics);
      collectLegacyValueConversionCandidate(data, legacyValueConversion);

      // 1. Missing createdAt
      if (!data.createdAt) {
        issuesCount.missingCreatedAt++;
      }

      // 2. Missing other essential fields
      const missingFields = ESSENTIAL_FIELDS.filter((fieldName) => data[fieldName] === undefined);
      if (missingFields.length > 0) {
        issuesCount.missingEssentialField++;
        trackSafeFieldNames(missingFieldNames, missingFields);
      }

      // 3. Invalid field types for essential fields
      const invalidTypes = [];
      if (data.description !== undefined && typeof data.description !== 'string') invalidTypes.push('description');
      if (data.description !== undefined && typeof data.description === 'string' && data.description.trim().length === 0) invalidTypes.push('description');
      if (data.value_cents !== undefined && !isSafeCents(data.value_cents)) invalidTypes.push('value_cents');

      const rawType = data.type;
      if (data.type !== undefined && !isAcceptedType(rawType)) {
        invalidTypes.push('type');
      }

      if (data.date !== undefined && !isValidIsoDateYYYYMMDD(data.date)) invalidTypes.push('date');
      if (data.createdAt !== undefined && data.createdAt !== null && !isValidTimestampLike(data.createdAt)) invalidTypes.push('createdAt');
      if (data.source !== undefined && !isAcceptedSource(data.source)) invalidTypes.push('source');

      if (invalidTypes.length > 0) {
        issuesCount.invalidFieldType++;
        trackSafeFieldNames(invalidFieldNames, invalidTypes);
      }

      const planResult = collectRepairPlanBlockers(data, missingFields, invalidTypes, hasUnknownShape);

      if (planResult.isEligible) {
        repairPlan.repairPlanEligible++;
      } else {
        repairPlan.repairPlanBlocked++;
        for (const blockerKey of planResult.blockerKeys) {
          repairPlan[blockerKey]++;
        }
      }

      const classification = hasUnknownShape ? 'unknownShape' : planResult.classification;
      if (classification) {
        repairClassification[classification]++;
      }
    }

    console.log(`transactionLimitApplied: ${appliedTransactionLimit}`);
    console.log(`totalTransactionsAnalyzed: ${totalTransactionsAnalyzed}`);
    console.log('\nContagem de problemas encontrados:');
    console.log(`- createdAt ausente: ${issuesCount.missingCreatedAt}`);
    console.log(`- campos essenciais ausentes: ${issuesCount.missingEssentialField}`);
    console.log(`- tipos inválidos em campos essenciais: ${issuesCount.invalidFieldType}`);
    console.log(`- nomes de campos ausentes: ${formatFieldNames(missingFieldNames)}`);
    console.log(`- nomes de campos inválidos: ${formatFieldNames(invalidFieldNames)}`);

    console.log('\nClassificação de reparo:');
    console.log(`- adminRepairRequired: ${repairClassification.adminRepairRequired}`);
    console.log(`- clientRepairable: ${repairClassification.clientRepairable}`);
    console.log(`- unknownShape: ${repairClassification.unknownShape}`);

    console.log('\nRepair plan dry-run:');
    for (const key of REPAIR_PLAN_COUNTER_KEYS) {
      console.log(`- ${key}: ${repairPlan[key]}`);
    }

    console.log('\nFinancial shape discovery:');
    for (const key of FINANCIAL_SHAPE_COUNTER_KEYS) {
      console.log(`- ${key}: ${financialShape[key]}`);
    }
    console.log(`- financialFieldNamesFoundCount: ${financialFieldNamesFound.size}`);

    console.log('\nLegacy value semantics discovery:');
    for (const key of LEGACY_VALUE_SEMANTICS_COUNTER_KEYS) {
      console.log(`- ${key}: ${legacyValueSemantics[key]}`);
    }

    console.log('\nLegacy value conversion candidate dry-run:');
    for (const key of LEGACY_VALUE_CONVERSION_COUNTER_KEYS) {
      console.log(`- ${key}: ${legacyValueConversion[key]}`);
    }

    console.log('\nFim do diagnóstico.');
    return {
      totalTransactionsAnalyzed,
      totalAnalyzed: totalTransactionsAnalyzed,
      transactionLimitApplied: appliedTransactionLimit,
      issuesCount,
      repairClassification,
      repairPlan,
      financialShape,
      legacyValueSemantics,
      legacyValueConversion,
      financialFieldNamesFound: [...financialFieldNamesFound].sort(),
      missingFieldNames: [...missingFieldNames].sort(),
      invalidFieldNames: [...invalidFieldNames].sort(),
    };

  } catch (error) {
    const sanitizedError = sanitizeDiagnosticError(error);

    console.error('diagnostic_failed');
    if (sanitizedError.code) {
      console.error(`code=${sanitizedError.code}`);
    }

    throw error;
  }
}

if (require.main === module) {
  runDiagnostics().catch(() => {
    process.exitCode = 1;
  });
}

module.exports = {
  runDiagnostics,
  ESSENTIAL_FIELDS,
  getFirestoreDb,
  resolveProjectId,
  sanitizeDiagnosticError,
  resolveTransactionLimit,
  isScopedTransactionPath,
};
