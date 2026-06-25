const assert = require('node:assert/strict');
const { after, beforeEach, describe, it } = require('node:test');

const firebaseFunctionsTest = require('firebase-functions-test');

const testEnv = firebaseFunctionsTest();
const adminModulePath = require.resolve('firebase-admin');
const originalAdminModule = require.cache[adminModulePath];

// ── Configurable Firestore mock ───────────────────────────────────────────────
// `scenario` drives runTransaction: 'allowed' (no usage doc), 'limited'
// (count at the daily cap with a fresh lastReset) or 'error' (transaction throws).
let scenario = 'allowed';
let structuredLogShouldThrow = false;
let systemLogWrites = [];
const DAILY_AI_LIMIT = 50; // mirrors functions/src/index.ts

function resetMock() {
  scenario = 'allowed';
  structuredLogShouldThrow = false;
  systemLogWrites = [];
}

const mockDb = {
  doc(path) {
    return { path };
  },
  collection(path) {
    return {
      add: async (payload) => {
        if (structuredLogShouldThrow) throw new Error('system_logs add failed');
        systemLogWrites.push({ path, payload });
        return { id: 'log-id' };
      },
    };
  },
  async runTransaction(callback) {
    if (scenario === 'error') throw new Error('transaction get failed');
    const tx = {
      async get() {
        if (scenario === 'allowed') return { exists: false, data: () => undefined };
        // 'limited': count at the cap, lastReset within the 24h window.
        return {
          exists: true,
          data: () => ({ count: DAILY_AI_LIMIT, lastReset: { toMillis: () => Date.now() } }),
        };
      },
      set() {},
      update() {},
    };
    return callback(tx);
  },
};

const mockAdmin = {
  initializeApp() {
    return {};
  },
  auth: () => ({}),
  firestore: Object.assign(() => mockDb, {
    FieldValue: {
      serverTimestamp() {
        return { __op: 'serverTimestamp' };
      },
      increment(value) {
        return { __op: 'increment', value };
      },
    },
  }),
};

require.cache[adminModulePath] = {
  id: adminModulePath,
  filename: adminModulePath,
  loaded: true,
  exports: mockAdmin,
};

// index.ts importa FieldValue do subpath modular `firebase-admin/firestore`.
const adminFirestoreModulePath = require.resolve('firebase-admin/firestore');
const originalAdminFirestoreModule = require.cache[adminFirestoreModulePath];
require.cache[adminFirestoreModulePath] = {
  id: adminFirestoreModulePath,
  filename: adminFirestoreModulePath,
  loaded: true,
  exports: {
    FieldValue: {
      serverTimestamp() {
        return { __op: 'serverTimestamp' };
      },
      increment(value) {
        return { __op: 'increment', value };
      },
    },
    Timestamp: {},
  },
};

const { checkAndIncrementRateLimit, chatWithQuantumAI } = require('../lib/index');
const wrappedChat = testEnv.wrap(chatWithQuantumAI);

after(() => {
  testEnv.cleanup();
  if (originalAdminModule) {
    require.cache[adminModulePath] = originalAdminModule;
  } else {
    delete require.cache[adminModulePath];
  }

  if (originalAdminFirestoreModule) {
    require.cache[adminFirestoreModulePath] = originalAdminFirestoreModule;
  } else {
    delete require.cache[adminFirestoreModulePath];
  }
});

describe('checkAndIncrementRateLimit — discriminated result', () => {
  beforeEach(() => resetMock());

  it('returns { status: "allowed" } when no usage document exists', async () => {
    scenario = 'allowed';
    assert.deepEqual(await checkAndIncrementRateLimit('user-1'), { status: 'allowed' });
  });

  it('returns { status: "limited" } when count >= DAILY_AI_LIMIT', async () => {
    scenario = 'limited';
    assert.deepEqual(await checkAndIncrementRateLimit('user-1'), { status: 'limited' });
  });

  it('returns { status: "error" } (never "limited") on internal transaction failure', async () => {
    scenario = 'error';
    const result = await checkAndIncrementRateLimit('user-1');
    assert.deepEqual(result, { status: 'error' });
    assert.notEqual(result.status, 'limited');
  });
});

describe('AI callable rate-limit dispatch', () => {
  beforeEach(() => resetMock());

  it('maps a real limit to HttpsError("resource-exhausted")', async () => {
    scenario = 'limited';
    await assert.rejects(
      wrappedChat({ data: { prompt: 'oi' }, auth: { uid: 'user-1' }, app: { appId: 'app-1' } }),
      (err) => err.code === 'resource-exhausted',
    );
  });

  it('maps an internal failure to HttpsError("internal"), NOT resource-exhausted', async () => {
    scenario = 'error';
    await assert.rejects(
      wrappedChat({ data: { prompt: 'oi' }, auth: { uid: 'user-1' }, app: { appId: 'app-1' } }),
      (err) => {
        assert.equal(err.code, 'internal');
        assert.notEqual(err.code, 'resource-exhausted');
        return true;
      },
    );
  });

  it('still throws the correct HttpsError when structured logging fails (non-blocking)', async () => {
    scenario = 'error';
    structuredLogShouldThrow = true;
    await assert.rejects(
      wrappedChat({ data: { prompt: 'oi' }, auth: { uid: 'user-1' }, app: { appId: 'app-1' } }),
      (err) => err.code === 'internal',
    );
  });
});
