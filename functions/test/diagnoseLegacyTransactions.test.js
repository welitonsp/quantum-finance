const assert = require('node:assert/strict');
const { describe, it, beforeEach, afterEach } = require('node:test');

// Mock console to avoid cluttering test output
const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;

const capturedLogs = [];

function mockLogs() {
  capturedLogs.length = 0;
  console.log = (...args) => capturedLogs.push(args.join(' '));
  console.warn = (...args) => capturedLogs.push(args.join(' '));
  console.error = (...args) => capturedLogs.push(args.join(' '));
}

function restoreLogs() {
  console.log = originalLog;
  console.warn = originalWarn;
  console.error = originalError;
}

const envKeys = [
  'FIREBASE_PROJECT_ID',
  'GCLOUD_PROJECT',
  'GOOGLE_CLOUD_PROJECT',
  'NODE_ENV',
  'FIRESTORE_EMULATOR_HOST',
];

const scriptModulePath = require.resolve('../scripts/diagnoseLegacyTransactions');
const adminModulePath = require.resolve('firebase-admin');
const originalAdminModule = require.cache[adminModulePath];

let savedEnv;
let mockTransactions = [];
let mockDb;
let initializeCalls = [];
let collectionCalls = [];
let collectionGroupCalls = [];
let limitCalls = [];

function saveAndClearEnv() {
  savedEnv = {};

  for (const key of envKeys) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
}

function restoreEnv() {
  for (const key of envKeys) {
    if (savedEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = savedEnv[key];
    }
  }
}

function validTransaction(overrides = {}) {
  return {
    description: 'Regular transaction',
    value_cents: 1000,
    schemaVersion: 2,
    type: 'saida',
    category: 'Outros',
    date: '2026-01-01',
    source: 'manual',
    createdAt: new Date('2026-01-01T12:00:00Z'),
    updatedAt: new Date('2026-01-01T12:00:00Z'),
    ...overrides,
  };
}

function metadataOnlyMissing(overrides = {}) {
  return validTransaction({
    schemaVersion: undefined,
    source: undefined,
    updatedAt: undefined,
    ...overrides,
  });
}

function mockTransaction(id, data, path = `users/test-user/transactions/${id}`) {
  return { id, path, data };
}

function createMockDb() {
  return {
    collection(name) {
      collectionCalls.push(name);
      throw new Error('collection_users_should_not_be_called');
    },
    collectionGroup(name) {
      collectionGroupCalls.push(name);

      return {
        limit(limitValue) {
          limitCalls.push(limitValue);

          return {
            get: async () => ({
              docs: mockTransactions.slice(0, limitValue).map((transaction) => ({
                id: transaction.id,
                ref: { path: transaction.path },
                data: () => transaction.data,
              })),
            }),
          };
        },
      };
    },
  };
}

function loadScriptWithMockAdmin({ apps = [] } = {}) {
  delete require.cache[scriptModulePath];

  mockDb = createMockDb();
  initializeCalls = [];
  collectionCalls = [];
  collectionGroupCalls = [];
  limitCalls = [];

  const mockAdmin = {
    apps: [...apps],
    initializeApp(options) {
      initializeCalls.push(options);
      this.apps.push({ options });
      return this.apps[this.apps.length - 1];
    },
    firestore: () => mockDb,
  };

  require.cache[adminModulePath] = {
    id: adminModulePath,
    filename: adminModulePath,
    loaded: true,
    exports: mockAdmin,
  };

  return require('../scripts/diagnoseLegacyTransactions');
}

function restoreModules() {
  delete require.cache[scriptModulePath];

  if (originalAdminModule) {
    require.cache[adminModulePath] = originalAdminModule;
  } else {
    delete require.cache[adminModulePath];
  }
}

describe('Diagnostic Script: diagnoseLegacyTransactions', () => {
  beforeEach(() => {
    mockLogs();
    saveAndClearEnv();
    mockTransactions = [];
  });

  afterEach(() => {
    restoreLogs();
    restoreModules();
    restoreEnv();
  });

  it('importar o módulo não deve executar main automaticamente', () => {
    loadScriptWithMockAdmin();

    assert.equal(initializeCalls.length, 0);
    assert.deepEqual(collectionCalls, []);
    assert.deepEqual(collectionGroupCalls, []);
    assert.deepEqual(capturedLogs, []);
  });

  it('deve usar collectionGroup("transactions") e não depender de collection("users")', async () => {
    const { runDiagnostics } = loadScriptWithMockAdmin();
    mockTransactions = [
      mockTransaction('tx-1', metadataOnlyMissing()),
    ];

    const result = await runDiagnostics({
      db: mockDb,
      args: ['node', 'script'],
      transactionLimit: 25,
    });

    assert.equal(result.totalTransactionsAnalyzed, 1);
    assert.deepEqual(collectionGroupCalls, ['transactions']);
    assert.deepEqual(collectionCalls, []);
    assert.deepEqual(limitCalls, [25]);

    const allLogs = capturedLogs.join('\n');
    assert.ok(allLogs.includes('Modo: DRY-RUN'));
    assert.ok(allLogs.includes('transactionLimitApplied: 25'));
    assert.ok(allLogs.includes('totalTransactionsAnalyzed: 1'));
  });

  it('deve ignorar paths fora de users/{uid}/transactions/{txId}', async () => {
    const { runDiagnostics } = loadScriptWithMockAdmin();
    mockTransactions = [
      mockTransaction('tx-valid', metadataOnlyMissing(), 'users/user-a/transactions/tx-valid'),
      mockTransaction('tx-root', metadataOnlyMissing(), 'transactions/tx-root'),
      mockTransaction('tx-nested', metadataOnlyMissing(), 'orgs/org-a/users/user-a/transactions/tx-nested'),
      mockTransaction('tx-history', metadataOnlyMissing(), 'users/user-a/transactions/tx-a/history/tx-history'),
    ];

    const result = await runDiagnostics({
      db: mockDb,
      args: ['node', 'script'],
      transactionLimit: 10,
    });

    assert.equal(result.totalTransactionsAnalyzed, 1);
    assert.equal(result.repairPlan.ignoredOutOfScope, 3);
    assert.equal(result.repairPlan.repairPlanEligible, 1);
    assert.equal(result.legacyValueConversion.conversionBlockedTotal, 1);
    assert.equal(result.legacyValueConversion.conversionBlockedMissingLegacyValue, 1);

    const allLogs = capturedLogs.join('\n');
    assert.ok(allLogs.includes('- ignoredOutOfScope: 3'));
    assert.ok(!allLogs.includes('orgs/org-a'));
    assert.ok(!allLogs.includes('tx-root'));
    assert.ok(!allLogs.includes('tx-history'));
  });

  it('deve respeitar transactionLimit', async () => {
    const { runDiagnostics } = loadScriptWithMockAdmin();
    mockTransactions = [
      mockTransaction('tx-1', metadataOnlyMissing()),
      mockTransaction('tx-2', metadataOnlyMissing()),
      mockTransaction('tx-3', metadataOnlyMissing()),
    ];

    const result = await runDiagnostics({
      db: mockDb,
      args: ['node', 'script'],
      transactionLimit: 2,
    });

    assert.equal(result.transactionLimitApplied, 2);
    assert.equal(result.totalTransactionsAnalyzed, 2);
    assert.deepEqual(limitCalls, [2]);
  });

  it('deve marcar elegível somente documento com shape financeiro seguro e metadados reparáveis', async () => {
    const { runDiagnostics } = loadScriptWithMockAdmin();
    mockTransactions = [
      mockTransaction('tx-eligible', metadataOnlyMissing()),
      mockTransaction('tx-no-cents', metadataOnlyMissing({ value_cents: undefined })),
      mockTransaction('tx-invalid-type', metadataOnlyMissing({ type: 'despesa' })),
      mockTransaction('tx-missing-category', metadataOnlyMissing({ category: undefined })),
    ];

    const result = await runDiagnostics({
      db: mockDb,
      args: ['node', 'script'],
      transactionLimit: 10,
    });

    assert.equal(result.repairPlan.repairPlanEligible, 1);
    assert.equal(result.repairPlan.repairPlanBlocked, 3);
    assert.equal(result.repairPlan.blockedByMissingValueCents, 1);
    assert.equal(result.repairPlan.blockedByInvalidType, 1);
    assert.deepEqual(result.missingFieldNames, ['category', 'schemaVersion', 'source', 'updatedAt']);
    assert.deepEqual(result.invalidFieldNames, ['type']);
  });

  it('documento sem value_cents deve cair em blockedByMissingValueCents', async () => {
    const { runDiagnostics } = loadScriptWithMockAdmin();
    mockTransactions = [
      mockTransaction('tx-no-cents', metadataOnlyMissing({ value_cents: undefined })),
    ];

    const result = await runDiagnostics({
      db: mockDb,
      args: ['node', 'script'],
      transactionLimit: 1,
    });

    assert.equal(result.repairPlan.repairPlanEligible, 0);
    assert.equal(result.repairPlan.repairPlanBlocked, 1);
    assert.equal(result.repairPlan.blockedByMissingValueCents, 1);
  });

  it('documento com value_cents não inteiro deve cair em blockedByInvalidValueCents', async () => {
    const { runDiagnostics } = loadScriptWithMockAdmin();
    mockTransactions = [
      mockTransaction('tx-float-cents', metadataOnlyMissing({ value_cents: 10.5 })),
      mockTransaction('tx-string-cents', metadataOnlyMissing({ value_cents: '1000' })),
    ];

    const result = await runDiagnostics({
      db: mockDb,
      args: ['node', 'script'],
      transactionLimit: 2,
    });

    assert.equal(result.repairPlan.repairPlanEligible, 0);
    assert.equal(result.repairPlan.repairPlanBlocked, 2);
    assert.equal(result.repairPlan.blockedByInvalidValueCents, 2);
    assert.deepEqual(result.invalidFieldNames, []);
  });

  it('detecta presença e tipo de value legado sem imprimir valores', async () => {
    const { runDiagnostics } = loadScriptWithMockAdmin();
    mockTransactions = [
      mockTransaction('tx-value-number', metadataOnlyMissing({ value_cents: undefined, value: 1234.56 })),
      mockTransaction('tx-value-string', metadataOnlyMissing({ value_cents: undefined, value: 'R$ 777,77' })),
      mockTransaction('tx-value-other', metadataOnlyMissing({ value_cents: undefined, value: { raw: 888 } })),
    ];

    const result = await runDiagnostics({
      db: mockDb,
      args: ['node', 'script'],
      transactionLimit: 3,
    });

    assert.equal(result.financialShape.hasValueCents, 0);
    assert.equal(result.financialShape.missingValueCents, 3);
    assert.equal(result.financialShape.hasLegacyValue, 3);
    assert.equal(result.financialShape.legacyValueTypeNumber, 1);
    assert.equal(result.financialShape.legacyValueTypeString, 1);
    assert.equal(result.financialShape.legacyValueTypeOther, 1);
    assert.deepEqual(result.financialFieldNamesFound, ['value']);
    assert.equal(result.repairPlan.repairPlanEligible, 0);
    assert.equal(result.repairPlan.blockedByMissingValueCents, 3);

    const allLogs = capturedLogs.join('\n');
    assert.ok(!allLogs.includes('1234.56'));
    assert.ok(!allLogs.includes('R$ 777,77'));
    assert.ok(!allLogs.includes('888'));
  });

  it('detecta amount_cents e valueInCents inteiros sem reconstruir value_cents', async () => {
    const { runDiagnostics } = loadScriptWithMockAdmin();
    mockTransactions = [
      mockTransaction('tx-amount-cents', metadataOnlyMissing({
        value_cents: undefined,
        amount_cents: 123456,
      })),
      mockTransaction('tx-value-in-cents', metadataOnlyMissing({
        value_cents: undefined,
        valueInCents: 654321,
      })),
      mockTransaction('tx-other-cents', metadataOnlyMissing({
        value_cents: undefined,
        amount_cents: '123456',
        valueInCents: { cents: 654321 },
      })),
    ];

    const result = await runDiagnostics({
      db: mockDb,
      args: ['node', 'script'],
      transactionLimit: 3,
    });

    assert.equal(result.financialShape.hasAmountCents, 2);
    assert.equal(result.financialShape.amountCentsTypeInteger, 1);
    assert.equal(result.financialShape.amountCentsTypeOther, 1);
    assert.equal(result.financialShape.hasValueInCents, 2);
    assert.equal(result.financialShape.valueInCentsTypeInteger, 1);
    assert.equal(result.financialShape.valueInCentsTypeOther, 1);
    assert.deepEqual(result.financialFieldNamesFound, ['amount_cents', 'valueInCents']);
    assert.equal(result.repairPlan.repairPlanEligible, 0);
    assert.equal(result.repairPlan.blockedByMissingValueCents, 3);

    const allLogs = capturedLogs.join('\n');
    assert.ok(!allLogs.includes('123456'));
    assert.ok(!allLogs.includes('654321'));
  });

  it('detecta amount number/string/other sem imprimir valores', async () => {
    const { runDiagnostics } = loadScriptWithMockAdmin();
    mockTransactions = [
      mockTransaction('tx-amount-number', metadataOnlyMissing({ value_cents: undefined, amount: 2345.67 })),
      mockTransaction('tx-amount-string', metadataOnlyMissing({ value_cents: undefined, amount: '2345,67 BRL' })),
      mockTransaction('tx-amount-other', metadataOnlyMissing({ value_cents: undefined, amount: ['2345.67'] })),
    ];

    const result = await runDiagnostics({
      db: mockDb,
      args: ['node', 'script'],
      transactionLimit: 3,
    });

    assert.equal(result.financialShape.hasAmount, 3);
    assert.equal(result.financialShape.amountTypeNumber, 1);
    assert.equal(result.financialShape.amountTypeString, 1);
    assert.equal(result.financialShape.amountTypeOther, 1);
    assert.deepEqual(result.financialFieldNamesFound, ['amount']);
    assert.equal(result.repairPlan.blockedByMissingValueCents, 3);

    const allLogs = capturedLogs.join('\n');
    assert.ok(!allLogs.includes('2345.67'));
    assert.ok(!allLogs.includes('2345,67 BRL'));
  });

  it('detecta valor e valor_centavos sem imprimir valores', async () => {
    const { runDiagnostics } = loadScriptWithMockAdmin();
    mockTransactions = [
      mockTransaction('tx-valor-number', metadataOnlyMissing({
        value_cents: undefined,
        valor: 3456.78,
        valor_centavos: 345678,
      })),
      mockTransaction('tx-valor-string', metadataOnlyMissing({
        value_cents: undefined,
        valor: '3456,78',
        valor_centavos: '345678',
      })),
      mockTransaction('tx-valor-other', metadataOnlyMissing({
        value_cents: undefined,
        valor: null,
        valor_centavos: { cents: 345678 },
      })),
    ];

    const result = await runDiagnostics({
      db: mockDb,
      args: ['node', 'script'],
      transactionLimit: 3,
    });

    assert.equal(result.financialShape.hasValor, 3);
    assert.equal(result.financialShape.valorTypeNumber, 1);
    assert.equal(result.financialShape.valorTypeString, 1);
    assert.equal(result.financialShape.valorTypeOther, 1);
    assert.equal(result.financialShape.hasValorCentavos, 3);
    assert.equal(result.financialShape.valorCentavosTypeInteger, 1);
    assert.equal(result.financialShape.valorCentavosTypeOther, 2);
    assert.deepEqual(result.financialFieldNamesFound, ['valor', 'valor_centavos']);
    assert.equal(result.repairPlan.blockedByMissingValueCents, 3);

    const allLogs = capturedLogs.join('\n');
    assert.ok(!allLogs.includes('3456.78'));
    assert.ok(!allLogs.includes('3456,78'));
    assert.ok(!allLogs.includes('345678'));
  });

  it('mantém missingValueCents mesmo quando há campos financeiros legados', async () => {
    const { runDiagnostics } = loadScriptWithMockAdmin();
    mockTransactions = [
      mockTransaction('tx-has-canonical', metadataOnlyMissing({ value_cents: 1111 })),
      mockTransaction('tx-has-legacy', metadataOnlyMissing({ value_cents: undefined, value: 2222 })),
      mockTransaction('tx-no-financial-field', metadataOnlyMissing({ value_cents: undefined })),
    ];

    const result = await runDiagnostics({
      db: mockDb,
      args: ['node', 'script'],
      transactionLimit: 3,
    });

    assert.equal(result.financialShape.hasValueCents, 1);
    assert.equal(result.financialShape.missingValueCents, 2);
    assert.equal(result.financialShape.hasLegacyValue, 1);
    assert.equal(result.repairPlan.repairPlanEligible, 1);
    assert.equal(result.repairPlan.repairPlanBlocked, 2);
    assert.equal(result.repairPlan.blockedByMissingValueCents, 2);
  });

  it('conta value number finito sem imprimir valor individual', async () => {
    const { runDiagnostics } = loadScriptWithMockAdmin();
    mockTransactions = [
      mockTransaction('tx-finite-value', metadataOnlyMissing({
        value_cents: undefined,
        type: 'entrada',
        value: 456.78,
      })),
    ];

    const result = await runDiagnostics({
      db: mockDb,
      args: ['node', 'script'],
      transactionLimit: 1,
    });

    assert.equal(result.legacyValueSemantics.legacyValueNumberCount, 1);
    assert.equal(result.legacyValueSemantics.legacyValueFiniteCount, 1);
    assert.equal(result.legacyValueSemantics.legacyValueNonFiniteCount, 0);
    assert.equal(result.legacyValueSemantics.legacyValueDecimalCount, 1);
    assert.equal(result.legacyValueSemantics.legacyValuePositiveCount, 1);
    assert.equal(result.legacyValueSemantics.legacyValueTwoDecimalCompatibleCount, 1);
    assert.equal(result.legacyValueSemantics.legacyValueLooksLikeReaisCount, 1);
    assert.equal(result.legacyValueSemantics.legacyValueAbs100To1000Count, 1);
    assert.equal(result.legacyValueSemantics.legacyValueEntradaPositiveCount, 1);
    assert.equal(result.legacyValueSemantics.legacyValueTypeSignCompatibleCount, 1);
    assert.equal(result.repairPlan.repairPlanEligible, 0);
    assert.equal(result.repairPlan.blockedByMissingValueCents, 1);

    const allLogs = capturedLogs.join('\n');
    assert.ok(!allLogs.includes('456.78'));
  });

  it('conta NaN e infinito como non-finite sem imprimir valores', async () => {
    const { runDiagnostics } = loadScriptWithMockAdmin();
    mockTransactions = [
      mockTransaction('tx-nan-value', metadataOnlyMissing({ value_cents: undefined, value: NaN })),
      mockTransaction('tx-infinite-value', metadataOnlyMissing({ value_cents: undefined, value: Infinity })),
      mockTransaction('tx-negative-infinite-value', metadataOnlyMissing({ value_cents: undefined, value: -Infinity })),
    ];

    const result = await runDiagnostics({
      db: mockDb,
      args: ['node', 'script'],
      transactionLimit: 3,
    });

    assert.equal(result.legacyValueSemantics.legacyValueNumberCount, 3);
    assert.equal(result.legacyValueSemantics.legacyValueFiniteCount, 0);
    assert.equal(result.legacyValueSemantics.legacyValueNonFiniteCount, 3);
    assert.equal(result.legacyValueSemantics.legacyValueNaNCount, 1);
    assert.equal(result.legacyValueSemantics.legacyValueIntegerCount, 0);
    assert.equal(result.legacyValueSemantics.legacyValueDecimalCount, 0);
    assert.equal(result.repairPlan.blockedByMissingValueCents, 3);

    const allLogs = capturedLogs.join('\n');
    assert.ok(!allLogs.includes('Infinity'));
  });

  it('detecta inteiro, decimal, duas casas e mais de duas casas sem reconstrução', async () => {
    const { runDiagnostics } = loadScriptWithMockAdmin();
    mockTransactions = [
      mockTransaction('tx-integer-value', metadataOnlyMissing({ value_cents: undefined, value: 12 })),
      mockTransaction('tx-two-decimal-value', metadataOnlyMissing({ value_cents: undefined, value: 12.34 })),
      mockTransaction('tx-more-decimal-value', metadataOnlyMissing({ value_cents: undefined, value: 12.345 })),
    ];

    const result = await runDiagnostics({
      db: mockDb,
      args: ['node', 'script'],
      transactionLimit: 3,
    });

    assert.equal(result.legacyValueSemantics.legacyValueIntegerCount, 1);
    assert.equal(result.legacyValueSemantics.legacyValueDecimalCount, 2);
    assert.equal(result.legacyValueSemantics.legacyValueTwoDecimalCompatibleCount, 2);
    assert.equal(result.legacyValueSemantics.legacyValueMoreThanTwoDecimalsCount, 1);
    assert.equal(result.legacyValueSemantics.legacyValueLooksLikeReaisCount, 1);
    assert.equal(result.legacyValueSemantics.legacyValueLooksLikeCentsCount, 0);
    assert.equal(result.legacyValueSemantics.legacyValueAmbiguousScaleCount, 2);
    assert.equal(result.repairPlan.repairPlanEligible, 0);
    assert.equal(result.repairPlan.blockedByMissingValueCents, 3);

    const allLogs = capturedLogs.join('\n');
    assert.ok(!allLogs.includes('12.34'));
    assert.ok(!allLogs.includes('12.345'));
  });

  it('detecta escala provável de reais, centavos e ambígua apenas por contadores', async () => {
    const { runDiagnostics } = loadScriptWithMockAdmin();
    mockTransactions = [
      mockTransaction('tx-reais-like', metadataOnlyMissing({ value_cents: undefined, value: 42.42 })),
      mockTransaction('tx-cents-like', metadataOnlyMissing({ value_cents: undefined, value: 12000 })),
      mockTransaction('tx-ambiguous-integer', metadataOnlyMissing({ value_cents: undefined, value: 777 })),
      mockTransaction('tx-ambiguous-decimal', metadataOnlyMissing({ value_cents: undefined, value: 10.123 })),
    ];

    const result = await runDiagnostics({
      db: mockDb,
      args: ['node', 'script'],
      transactionLimit: 4,
    });

    assert.equal(result.legacyValueSemantics.legacyValueLooksLikeReaisCount, 1);
    assert.equal(result.legacyValueSemantics.legacyValueLooksLikeCentsCount, 1);
    assert.equal(result.legacyValueSemantics.legacyValueAmbiguousScaleCount, 2);
    assert.equal(result.legacyValueSemantics.legacyValueMoreThanTwoDecimalsCount, 1);
    assert.equal(result.repairPlan.blockedByMissingValueCents, 4);

    const allLogs = capturedLogs.join('\n');
    assert.ok(!allLogs.includes('42.42'));
    assert.ok(!allLogs.includes('12000'));
    assert.ok(!allLogs.includes('10.123'));
  });

  it('detecta positivo, negativo, zero e sinal versus type', async () => {
    const { runDiagnostics } = loadScriptWithMockAdmin();
    mockTransactions = [
      mockTransaction('tx-entrada-positive', metadataOnlyMissing({ value_cents: undefined, type: 'entrada', value: 321.11 })),
      mockTransaction('tx-entrada-negative', metadataOnlyMissing({ value_cents: undefined, type: 'entrada', value: -432.22 })),
      mockTransaction('tx-saida-negative', metadataOnlyMissing({ value_cents: undefined, type: 'saida', value: -543.33 })),
      mockTransaction('tx-saida-positive', metadataOnlyMissing({ value_cents: undefined, type: 'saida', value: 654.44 })),
      mockTransaction('tx-zero', metadataOnlyMissing({ value_cents: undefined, type: 'saida', value: 0 })),
    ];

    const result = await runDiagnostics({
      db: mockDb,
      args: ['node', 'script'],
      transactionLimit: 5,
    });

    assert.equal(result.legacyValueSemantics.legacyValuePositiveCount, 2);
    assert.equal(result.legacyValueSemantics.legacyValueNegativeCount, 2);
    assert.equal(result.legacyValueSemantics.legacyValueZeroCount, 1);
    assert.equal(result.legacyValueSemantics.legacyValueEntradaPositiveCount, 1);
    assert.equal(result.legacyValueSemantics.legacyValueEntradaNegativeCount, 1);
    assert.equal(result.legacyValueSemantics.legacyValueSaidaPositiveCount, 1);
    assert.equal(result.legacyValueSemantics.legacyValueSaidaNegativeCount, 1);
    assert.equal(result.legacyValueSemantics.legacyValueTypeSignCompatibleCount, 2);
    assert.equal(result.legacyValueSemantics.legacyValueTypeSignMismatchCount, 2);
    assert.equal(result.repairPlan.repairPlanEligible, 0);

    const allLogs = capturedLogs.join('\n');
    assert.ok(!allLogs.includes('321.11'));
    assert.ok(!allLogs.includes('-432.22'));
    assert.ok(!allLogs.includes('-543.33'));
    assert.ok(!allLogs.includes('654.44'));
  });

  it('conta buckets agregados sem imprimir min ou max exatos', async () => {
    const { runDiagnostics } = loadScriptWithMockAdmin();
    mockTransactions = [
      mockTransaction('tx-abs-lt-one', metadataOnlyMissing({ value_cents: undefined, value: 0.42 })),
      mockTransaction('tx-abs-one-to-hundred', metadataOnlyMissing({ value_cents: undefined, value: 55.55 })),
      mockTransaction('tx-abs-hundred-to-thousand', metadataOnlyMissing({ value_cents: undefined, value: 555.55 })),
      mockTransaction('tx-abs-thousand-to-ten-thousand', metadataOnlyMissing({ value_cents: undefined, value: 5555.55 })),
      mockTransaction('tx-abs-gte-ten-thousand', metadataOnlyMissing({ value_cents: undefined, value: 55555.55 })),
    ];

    const result = await runDiagnostics({
      db: mockDb,
      args: ['node', 'script'],
      transactionLimit: 5,
    });

    assert.equal(result.legacyValueSemantics.legacyValueAbsLt1Count, 1);
    assert.equal(result.legacyValueSemantics.legacyValueAbs1To100Count, 1);
    assert.equal(result.legacyValueSemantics.legacyValueAbs100To1000Count, 1);
    assert.equal(result.legacyValueSemantics.legacyValueAbs1000To10000Count, 1);
    assert.equal(result.legacyValueSemantics.legacyValueAbsGte10000Count, 1);
    assert.equal(result.repairPlan.blockedByMissingValueCents, 5);

    const allLogs = capturedLogs.join('\n');
    assert.ok(!allLogs.includes('0.42'));
    assert.ok(!allLogs.includes('55.55'));
    assert.ok(!allLogs.includes('555.55'));
    assert.ok(!allLogs.includes('5555.55'));
    assert.ok(!allLogs.includes('55555.55'));
  });

  it('marca candidato likely reais com value decimal compatível sem reconstruir value_cents', async () => {
    const { runDiagnostics } = loadScriptWithMockAdmin();
    mockTransactions = [
      mockTransaction('tx-conversion-reais', metadataOnlyMissing({
        value_cents: undefined,
        type: 'entrada',
        value: 246.81,
      })),
    ];

    const result = await runDiagnostics({
      db: mockDb,
      args: ['node', 'script'],
      transactionLimit: 1,
    });

    assert.equal(result.legacyValueConversion.conversionCandidateTotal, 1);
    assert.equal(result.legacyValueConversion.conversionCandidateLikelyReais, 1);
    assert.equal(result.legacyValueConversion.conversionCandidateAmbiguousInteger, 0);
    assert.equal(result.legacyValueConversion.conversionBlockedTotal, 0);
    assert.equal(result.repairPlan.repairPlanEligible, 0);
    assert.equal(result.repairPlan.blockedByMissingValueCents, 1);
    assert.equal(result.financialShape.missingValueCents, 1);

    const allLogs = capturedLogs.join('\n');
    assert.ok(!allLogs.includes('246.81'));
  });

  it('marca candidato ambíguo com value inteiro sem reconstruir value_cents', async () => {
    const { runDiagnostics } = loadScriptWithMockAdmin();
    mockTransactions = [
      mockTransaction('tx-conversion-integer', metadataOnlyMissing({
        value_cents: undefined,
        type: 'saida',
        value: 4321,
      })),
    ];

    const result = await runDiagnostics({
      db: mockDb,
      args: ['node', 'script'],
      transactionLimit: 1,
    });

    assert.equal(result.legacyValueConversion.conversionCandidateTotal, 1);
    assert.equal(result.legacyValueConversion.conversionCandidateLikelyReais, 0);
    assert.equal(result.legacyValueConversion.conversionCandidateAmbiguousInteger, 1);
    assert.equal(result.legacyValueConversion.conversionBlockedTotal, 0);
    assert.equal(result.repairPlan.repairPlanEligible, 0);
    assert.equal(result.repairPlan.blockedByMissingValueCents, 1);

    const allLogs = capturedLogs.join('\n');
    assert.ok(!allLogs.includes('4321'));
  });

  it('bloqueia provável cents scale em candidato de conversão', async () => {
    const { runDiagnostics } = loadScriptWithMockAdmin();
    mockTransactions = [
      mockTransaction('tx-likely-cents-scale', metadataOnlyMissing({
        value_cents: undefined,
        type: 'entrada',
        value: 98765,
      })),
    ];

    const result = await runDiagnostics({
      db: mockDb,
      args: ['node', 'script'],
      transactionLimit: 1,
    });

    assert.equal(result.legacyValueConversion.conversionCandidateTotal, 0);
    assert.equal(result.legacyValueConversion.conversionBlockedTotal, 1);
    assert.equal(result.legacyValueConversion.conversionBlockedLikelyCentsScale, 1);
    assert.equal(result.repairPlan.repairPlanEligible, 0);

    const allLogs = capturedLogs.join('\n');
    assert.ok(!allLogs.includes('98765'));
  });

  it('bloqueia cents inteiros inseguros em candidato de conversão', async () => {
    const { runDiagnostics } = loadScriptWithMockAdmin();
    mockTransactions = [
      mockTransaction('tx-unsafe-cents-scale', metadataOnlyMissing({
        value_cents: undefined,
        type: 'entrada',
        value: 90071992547410,
      })),
    ];

    const result = await runDiagnostics({
      db: mockDb,
      args: ['node', 'script'],
      transactionLimit: 1,
    });

    assert.equal(result.legacyValueConversion.conversionCandidateTotal, 0);
    assert.equal(result.legacyValueConversion.conversionBlockedTotal, 1);
    assert.equal(result.legacyValueConversion.conversionBlockedUnsafeIntegerCents, 1);
    assert.equal(result.legacyValueConversion.conversionBlockedLikelyCentsScale, 1);

    const allLogs = capturedLogs.join('\n');
    assert.ok(!allLogs.includes('90071992547410'));
  });

  it('bloqueia non-finite e mais de duas casas em candidatos de conversão', async () => {
    const { runDiagnostics } = loadScriptWithMockAdmin();
    mockTransactions = [
      mockTransaction('tx-conversion-non-finite', metadataOnlyMissing({
        value_cents: undefined,
        type: 'entrada',
        value: Infinity,
      })),
      mockTransaction('tx-conversion-more-decimals', metadataOnlyMissing({
        value_cents: undefined,
        type: 'entrada',
        value: 135.791,
      })),
    ];

    const result = await runDiagnostics({
      db: mockDb,
      args: ['node', 'script'],
      transactionLimit: 2,
    });

    assert.equal(result.legacyValueConversion.conversionCandidateTotal, 0);
    assert.equal(result.legacyValueConversion.conversionBlockedTotal, 2);
    assert.equal(result.legacyValueConversion.conversionBlockedNonFiniteLegacyValue, 1);
    assert.equal(result.legacyValueConversion.conversionBlockedMoreThanTwoDecimals, 1);
    assert.equal(result.repairPlan.blockedByMissingValueCents, 2);

    const allLogs = capturedLogs.join('\n');
    assert.ok(!allLogs.includes('Infinity'));
    assert.ok(!allLogs.includes('135.791'));
  });

  it('bloqueia value negativo em candidatos de conversão', async () => {
    const { runDiagnostics } = loadScriptWithMockAdmin();
    mockTransactions = [
      mockTransaction('tx-conversion-negative', metadataOnlyMissing({
        value_cents: undefined,
        type: 'saida',
        value: -246.8,
      })),
    ];

    const result = await runDiagnostics({
      db: mockDb,
      args: ['node', 'script'],
      transactionLimit: 1,
    });

    assert.equal(result.legacyValueConversion.conversionCandidateTotal, 0);
    assert.equal(result.legacyValueConversion.conversionBlockedTotal, 1);
    assert.equal(result.legacyValueConversion.conversionBlockedNegativeLegacyValue, 1);
    assert.equal(result.repairPlan.repairPlanEligible, 0);

    const allLogs = capturedLogs.join('\n');
    assert.ok(!allLogs.includes('-246.8'));
  });

  it('bloqueia sem type ou type inválido em candidatos de conversão', async () => {
    const { runDiagnostics } = loadScriptWithMockAdmin();
    mockTransactions = [
      mockTransaction('tx-conversion-missing-type', metadataOnlyMissing({
        value_cents: undefined,
        type: undefined,
        value: 501.25,
      })),
      mockTransaction('tx-conversion-invalid-type', metadataOnlyMissing({
        value_cents: undefined,
        type: 'receita',
        value: 502.25,
      })),
    ];

    const result = await runDiagnostics({
      db: mockDb,
      args: ['node', 'script'],
      transactionLimit: 2,
    });

    assert.equal(result.legacyValueConversion.conversionCandidateTotal, 0);
    assert.equal(result.legacyValueConversion.conversionBlockedTotal, 2);
    assert.equal(result.legacyValueConversion.conversionBlockedMissingType, 1);
    assert.equal(result.legacyValueConversion.conversionBlockedInvalidType, 1);
    assert.equal(result.repairPlan.blockedByMissingValueCents, 2);

    const allLogs = capturedLogs.join('\n');
    assert.ok(!allLogs.includes('501.25'));
    assert.ok(!allLogs.includes('502.25'));
  });

  it('bloqueia sem date, description ou createdAt em candidatos de conversão', async () => {
    const { runDiagnostics } = loadScriptWithMockAdmin();
    mockTransactions = [
      mockTransaction('tx-conversion-missing-date', metadataOnlyMissing({
        value_cents: undefined,
        date: undefined,
        value: 601.25,
      })),
      mockTransaction('tx-conversion-missing-description', metadataOnlyMissing({
        value_cents: undefined,
        description: undefined,
        value: 602.25,
      })),
      mockTransaction('tx-conversion-missing-created', metadataOnlyMissing({
        value_cents: undefined,
        createdAt: undefined,
        value: 603.25,
      })),
    ];

    const result = await runDiagnostics({
      db: mockDb,
      args: ['node', 'script'],
      transactionLimit: 3,
    });

    assert.equal(result.legacyValueConversion.conversionCandidateTotal, 0);
    assert.equal(result.legacyValueConversion.conversionBlockedTotal, 3);
    assert.equal(result.legacyValueConversion.conversionBlockedMissingDate, 1);
    assert.equal(result.legacyValueConversion.conversionBlockedMissingDescription, 1);
    assert.equal(result.legacyValueConversion.conversionBlockedMissingCreatedAt, 1);
    assert.equal(result.repairPlan.blockedByMissingValueCents, 3);

    const allLogs = capturedLogs.join('\n');
    assert.ok(!allLogs.includes('601.25'));
    assert.ok(!allLogs.includes('602.25'));
    assert.ok(!allLogs.includes('603.25'));
  });

  it('bloqueia date, description ou createdAt inválidos em candidatos de conversão', async () => {
    const { runDiagnostics } = loadScriptWithMockAdmin();
    mockTransactions = [
      mockTransaction('tx-conversion-invalid-date', metadataOnlyMissing({
        value_cents: undefined,
        date: '2026-99-99',
        value: 701.25,
      })),
      mockTransaction('tx-conversion-invalid-description', metadataOnlyMissing({
        value_cents: undefined,
        description: '   ',
        value: 702.25,
      })),
      mockTransaction('tx-conversion-invalid-created', metadataOnlyMissing({
        value_cents: undefined,
        createdAt: 'not-a-date',
        value: 703.25,
      })),
    ];

    const result = await runDiagnostics({
      db: mockDb,
      args: ['node', 'script'],
      transactionLimit: 3,
    });

    assert.equal(result.legacyValueConversion.conversionCandidateTotal, 0);
    assert.equal(result.legacyValueConversion.conversionBlockedTotal, 3);
    assert.equal(result.legacyValueConversion.conversionBlockedInvalidDate, 1);
    assert.equal(result.legacyValueConversion.conversionBlockedInvalidDescription, 1);
    assert.equal(result.legacyValueConversion.conversionBlockedInvalidCreatedAt, 1);
    assert.equal(result.repairPlan.repairPlanEligible, 0);

    const allLogs = capturedLogs.join('\n');
    assert.ok(!allLogs.includes('701.25'));
    assert.ok(!allLogs.includes('702.25'));
    assert.ok(!allLogs.includes('703.25'));
  });

  it('bloqueia conversão quando value_cents já existe ou value legado não é numérico', async () => {
    const { runDiagnostics } = loadScriptWithMockAdmin();
    mockTransactions = [
      mockTransaction('tx-conversion-has-cents', metadataOnlyMissing({
        value_cents: 80401,
        value: 804.01,
      })),
      mockTransaction('tx-conversion-missing-value', metadataOnlyMissing({
        value_cents: undefined,
        value: undefined,
      })),
      mockTransaction('tx-conversion-string-value', metadataOnlyMissing({
        value_cents: undefined,
        value: '806.01',
      })),
    ];

    const result = await runDiagnostics({
      db: mockDb,
      args: ['node', 'script'],
      transactionLimit: 3,
    });

    assert.equal(result.legacyValueConversion.conversionCandidateTotal, 0);
    assert.equal(result.legacyValueConversion.conversionBlockedTotal, 3);
    assert.equal(result.legacyValueConversion.conversionBlockedHasValueCents, 1);
    assert.equal(result.legacyValueConversion.conversionBlockedMissingLegacyValue, 1);
    assert.equal(result.legacyValueConversion.conversionBlockedNonNumberLegacyValue, 1);
    assert.equal(result.repairPlan.repairPlanEligible, 1);
    assert.equal(result.repairPlan.blockedByMissingValueCents, 2);

    const allLogs = capturedLogs.join('\n');
    assert.ok(!allLogs.includes('804.01'));
    assert.ok(!allLogs.includes('80401'));
    assert.ok(!allLogs.includes('806.01'));
  });

  it('documento sem date, description, type ou createdAt deve ser bloqueado', async () => {
    const { runDiagnostics } = loadScriptWithMockAdmin();
    mockTransactions = [
      mockTransaction('tx-no-date', metadataOnlyMissing({ date: undefined })),
      mockTransaction('tx-no-description', metadataOnlyMissing({ description: undefined })),
      mockTransaction('tx-no-type', metadataOnlyMissing({ type: undefined })),
      mockTransaction('tx-no-created', metadataOnlyMissing({ createdAt: undefined })),
    ];

    const result = await runDiagnostics({
      db: mockDb,
      args: ['node', 'script'],
      transactionLimit: 4,
    });

    assert.equal(result.repairPlan.repairPlanEligible, 0);
    assert.equal(result.repairPlan.repairPlanBlocked, 4);
    assert.equal(result.repairPlan.blockedByMissingDate, 1);
    assert.equal(result.repairPlan.blockedByMissingDescription, 1);
    assert.equal(result.repairPlan.blockedByMissingType, 1);
    assert.equal(result.repairPlan.blockedByMissingCreatedAt, 1);
  });

  it('documento com date, description, type ou createdAt inválido deve ser bloqueado', async () => {
    const { runDiagnostics } = loadScriptWithMockAdmin();
    mockTransactions = [
      mockTransaction('tx-bad-date', metadataOnlyMissing({ date: '2026-99-99' })),
      mockTransaction('tx-bad-description', metadataOnlyMissing({ description: '   ' })),
      mockTransaction('tx-bad-type', metadataOnlyMissing({ type: 'receita' })),
      mockTransaction('tx-bad-created', metadataOnlyMissing({ createdAt: 'not-a-date' })),
    ];

    const result = await runDiagnostics({
      db: mockDb,
      args: ['node', 'script'],
      transactionLimit: 4,
    });

    assert.equal(result.repairPlan.repairPlanEligible, 0);
    assert.equal(result.repairPlan.repairPlanBlocked, 4);
    assert.equal(result.repairPlan.blockedByInvalidDate, 1);
    assert.equal(result.repairPlan.blockedByInvalidDescription, 1);
    assert.equal(result.repairPlan.blockedByInvalidType, 1);
    assert.equal(result.repairPlan.blockedByInvalidCreatedAt, 1);
    assert.deepEqual(result.invalidFieldNames, ['createdAt', 'date', 'type']);
  });

  it('documento com apenas schemaVersion, source e updatedAt ausentes é elegível', async () => {
    const { runDiagnostics } = loadScriptWithMockAdmin();
    mockTransactions = [
      mockTransaction('tx-metadata-only', metadataOnlyMissing()),
    ];

    const result = await runDiagnostics({
      db: mockDb,
      args: ['node', 'script'],
      transactionLimit: 1,
    });

    assert.equal(result.issuesCount.missingEssentialField, 1);
    assert.deepEqual(result.missingFieldNames, ['schemaVersion', 'source', 'updatedAt']);
    assert.equal(result.repairPlan.repairPlanEligible, 1);
    assert.equal(result.repairPlan.repairPlanBlocked, 0);
    assert.equal(result.repairClassification.adminRepairRequired, 1);

    const allLogs = capturedLogs.join('\n');
    assert.ok(allLogs.includes('- repairPlanEligible: 1'));
    assert.ok(allLogs.includes('- blockedBySourceAmbiguous: 0'));
  });

  it('source presente fora do contrato atual deve ser bloqueado como ambíguo sem imprimir valor', async () => {
    const { runDiagnostics } = loadScriptWithMockAdmin();
    mockTransactions = [
      mockTransaction('tx-source-ambiguous', metadataOnlyMissing({ source: 'ambiguous-source-secret' })),
    ];

    const result = await runDiagnostics({
      db: mockDb,
      args: ['node', 'script'],
      transactionLimit: 1,
    });

    assert.equal(result.repairPlan.repairPlanEligible, 0);
    assert.equal(result.repairPlan.repairPlanBlocked, 1);
    assert.equal(result.repairPlan.blockedBySourceAmbiguous, 1);
    assert.deepEqual(result.invalidFieldNames, ['source']);

    const allLogs = capturedLogs.join('\n');
    assert.ok(!allLogs.includes('ambiguous-source-secret'));
  });

  it('não deve imprimir uid, path, id real, importHash, description, value, value_cents ou payload', async () => {
    const { runDiagnostics } = loadScriptWithMockAdmin();
    mockTransactions = [
      mockTransaction(
        'tx-secret-id',
        metadataOnlyMissing({
          uid: 'user-secret',
          description: 'Secret payroll adjustment',
          value: 9876.54,
          value_cents: 987654,
          importHash: 'import-hash-secret',
          payload: { nested: 'raw-payload-secret' },
        }),
        'users/user-secret/transactions/tx-secret-id'
      ),
    ];

    await runDiagnostics({
      db: mockDb,
      args: ['node', 'script'],
      transactionLimit: 1,
    });

    const allLogs = capturedLogs.join('\n');
    assert.ok(!allLogs.includes('user-secret'), 'uid should not be printed');
    assert.ok(!allLogs.includes('users/user-secret/transactions/tx-secret-id'), 'full path should not be printed');
    assert.ok(!allLogs.includes('tx-secret-id'), 'transaction id should not be printed');
    assert.ok(!allLogs.includes('import-hash-secret'), 'importHash should not be printed');
    assert.ok(!allLogs.includes('Secret payroll adjustment'), 'description value should not be printed');
    assert.ok(!allLogs.includes('9876.54'), 'legacy value should not be printed');
    assert.ok(!allLogs.includes('987654'), 'value_cents value should not be printed');
    assert.ok(!allLogs.includes('value_cents'), 'value_cents field name should not be printed');
    assert.ok(!allLogs.includes('payload'), 'payload key should not be printed');
    assert.ok(!allLogs.includes('raw-payload-secret'), 'payload value should not be printed');
    assert.ok(!allLogs.includes('description'), 'description field name should not be printed');
  });

  it('deve rejeitar --write antes de acessar o banco', async () => {
    const { runDiagnostics } = loadScriptWithMockAdmin();

    await assert.rejects(
      () => runDiagnostics({ db: mockDb, args: ['node', 'script', '--write'] }),
      (error) => error.code === 'write_mode_rejected'
    );

    assert.deepEqual(collectionGroupCalls, []);
    assert.deepEqual(collectionCalls, []);

    const allLogs = capturedLogs.join('\n');
    assert.ok(allLogs.includes('diagnostic_failed'));
    assert.ok(allLogs.includes('code=write_mode_rejected'));
  });

  it('deve inicializar Admin SDK com FIREBASE_PROJECT_ID quando fornecido', () => {
    const { getFirestoreDb } = loadScriptWithMockAdmin();

    const db = getFirestoreDb({
      env: {
        FIREBASE_PROJECT_ID: 'quantum-finance-39235',
        GCLOUD_PROJECT: 'demo-quantum-finance',
        GOOGLE_CLOUD_PROJECT: 'demo-other',
        NODE_ENV: 'production',
      },
    });

    assert.equal(db, mockDb);
    assert.deepEqual(initializeCalls, [{ projectId: 'quantum-finance-39235' }]);

    getFirestoreDb({ env: { FIREBASE_PROJECT_ID: 'quantum-finance-39235' } });
    assert.equal(initializeCalls.length, 1);
  });

  it('deve usar demo-quantum-finance somente em teste ou emulador', () => {
    const { resolveProjectId } = loadScriptWithMockAdmin();

    assert.equal(resolveProjectId({ NODE_ENV: 'test' }), 'demo-quantum-finance');
    assert.equal(resolveProjectId({ FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' }), 'demo-quantum-finance');
    assert.throws(
      () => resolveProjectId({ NODE_ENV: 'production' }),
      (error) => error.code === 'missing_project_id'
    );
  });

  it('deve falhar com missing_project_id quando não há projectId em ambiente real', async () => {
    const { runDiagnostics } = loadScriptWithMockAdmin();

    await assert.rejects(
      () => runDiagnostics({ args: ['node', 'script'], env: { NODE_ENV: 'production' } }),
      (error) => error.code === 'missing_project_id'
    );

    assert.equal(initializeCalls.length, 0);
    assert.deepEqual(collectionGroupCalls, []);

    const allLogs = capturedLogs.join('\n');
    assert.ok(allLogs.includes('diagnostic_failed'));
    assert.ok(allLogs.includes('code=missing_project_id'));
    assert.ok(!allLogs.includes('demo-quantum-finance'));
  });

  it('sanitizeDiagnosticError não deve retornar stack, message, metadata ou paths brutos', () => {
    const { sanitizeDiagnosticError } = loadScriptWithMockAdmin();
    const rawError = new Error('PERMISSION_DENIED: Permission denied on resource project demo-quantum-finance');
    rawError.code = 'PERMISSION_DENIED: C:\\Users\\PMGO\\secret\\file.js';
    rawError.metadata = { path: 'C:\\Users\\PMGO\\secret' };
    rawError.stack = 'Error: PERMISSION_DENIED\n    at C:\\Users\\PMGO\\secret\\file.js:1:1';

    const sanitized = sanitizeDiagnosticError(rawError);

    assert.deepEqual(sanitized, { code: 'PERMISSION_DENIED' });
    assert.equal(Object.hasOwn(sanitized, 'message'), false);
    assert.equal(Object.hasOwn(sanitized, 'stack'), false);
    assert.equal(Object.hasOwn(sanitized, 'metadata'), false);

    const serialized = JSON.stringify(sanitized);
    assert.ok(!serialized.includes('Permission denied'));
    assert.ok(!serialized.includes('demo-quantum-finance'));
    assert.ok(!serialized.includes('C:\\Users'));
  });
});
