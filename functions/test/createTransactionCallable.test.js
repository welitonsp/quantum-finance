const assert = require('node:assert/strict');
const { after, beforeEach, describe, it } = require('node:test');

const firebaseFunctionsTest = require('firebase-functions-test');

const testEnv = firebaseFunctionsTest();
const adminModulePath = require.resolve('firebase-admin');
const originalAdminModule = require.cache[adminModulePath];

const writes = [];
let autoDocIndex = 0;

// Idempotency store: path → data (simulates Firestore doc existence)
const idemStore = {};

function nextDocId() {
  const ids = ['tx-test-id', 'history-test-id'];
  const id = ids[autoDocIndex] || `doc-${autoDocIndex}`;
  autoDocIndex += 1;
  return id;
}

function createCollectionRef(path) {
  return {
    doc(id = nextDocId()) {
      return createDocRef(`${path}/${id}`, id);
    },
  };
}

function createDocRef(path, id) {
  return {
    id,
    path,
    collection(name) {
      return createCollectionRef(`${path}/${name}`);
    },
    async get() {
      const stored = idemStore[path];
      if (stored) return { exists: true, data: () => stored };
      return { exists: false, data: () => undefined };
    },
  };
}

const mockDb = {
  collection: createCollectionRef,
  doc(path) {
    const parts = path.split('/');
    const id = parts[parts.length - 1];
    return createDocRef(path, id);
  },
  async runTransaction(callback) {
    const transaction = {
      set(ref, payload) {
        // Persist idempotency writes so t.get() sees them within the same tx
        if (ref.path.includes('/idempotency/')) {
          idemStore[ref.path] = payload;
        }
        writes.push({ path: ref.path, payload });
      },
      async get(ref) {
        const stored = idemStore[ref.path];
        if (stored) return { exists: true, data: () => stored };
        return { exists: false, data: () => undefined };
      },
    };
    return callback(transaction);
  },
};

const mockAdmin = {
  initializeApp() {
    return {};
  },
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

const { createTransaction } = require('../index');
const wrappedCreateTransaction = testEnv.wrap(createTransaction);

after(() => {
  testEnv.cleanup();

  if (originalAdminModule) {
    require.cache[adminModulePath] = originalAdminModule;
  } else {
    delete require.cache[adminModulePath];
  }
});

function validPayload() {
  return {
    description: 'Compra mercado',
    value_cents: 12345,
    type: 'saida',
    category: 'Alimentacao',
    date: '2026-05-07',
    source: 'manual',
    fitId: null,
    tags: ['casa'],
    isRecurring: false,
    account: 'Conta principal',
    accountId: 'account-1',
    cardId: 'card-1',
  };
}

function resetFirestoreMock() {
  writes.length = 0;
  autoDocIndex = 0;
  Object.keys(idemStore).forEach(k => delete idemStore[k]);
}

function assertNoForbiddenFields(value) {
  const forbidden = new Set(['uid', 'id', 'value', 'importHash']);
  const stack = [value];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || typeof current !== 'object') continue;

    for (const [key, nested] of Object.entries(current)) {
      assert.equal(forbidden.has(key), false, `forbidden field ${key} leaked`);
      if (nested && typeof nested === 'object') stack.push(nested);
    }
  }
}

describe('createTransaction callable', () => {
  beforeEach(() => resetFirestoreMock());

  it('creates a manual transaction with auth and App Check context', async () => {
    const result = await wrappedCreateTransaction({
      data: validPayload(),
      auth: { uid: 'test-user-id' },
      app: { appId: 'test-app-id' },
    });

    assert.equal(typeof result.id, 'string');
    assert.ok(result.id.length > 0);

    assert.equal(writes.length, 2);

    const [transactionWrite, historyWrite] = writes;
    assert.equal(transactionWrite.path, 'users/test-user-id/transactions/tx-test-id');
    assert.equal(historyWrite.path, 'users/test-user-id/transactions/tx-test-id/history/history-test-id');

    assert.deepEqual(transactionWrite.payload, {
      description: 'Compra mercado',
      descriptionLower: 'compra mercado',
      value_cents: 12345,
      type: 'saida',
      category: 'Alimentacao',
      date: '2026-05-07',
      source: 'manual',
      schemaVersion: 2,
      fitId: null,
      tags: ['casa'],
      isRecurring: false,
      createdAt: { __op: 'serverTimestamp' },
      updatedAt: { __op: 'serverTimestamp' },
      account: 'Conta principal',
      accountId: 'account-1',
      cardId: 'card-1',
    });

    assert.equal(historyWrite.payload.action, 'CREATE');
    assert.equal(historyWrite.payload.origin, 'manual');
    assert.equal(historyWrite.payload.txId, 'tx-test-id');
    assert.equal(historyWrite.payload.amount_cents, 12345);
    assert.equal(historyWrite.payload.category, 'Alimentacao');
    assert.equal(historyWrite.payload.schemaVersion, 1);
    assert.deepEqual(historyWrite.payload.createdAt, { __op: 'serverTimestamp' });
    assert.deepEqual(historyWrite.payload.after, {
      description: 'Compra mercado',
      descriptionLower: 'compra mercado',
      value_cents: 12345,
      schemaVersion: 2,
      type: 'saida',
      category: 'Alimentacao',
      date: '2026-05-07',
      source: 'manual',
      isRecurring: false,
      tags: ['casa'],
      account: 'Conta principal',
      accountId: 'account-1',
      cardId: 'card-1',
    });
    assert.deepEqual(historyWrite.payload.changedFields, [
      'description',
      'descriptionLower',
      'value_cents',
      'schemaVersion',
      'type',
      'category',
      'date',
      'source',
      'isRecurring',
      'tags',
      'account',
      'accountId',
      'cardId',
    ]);

    assertNoForbiddenFields(transactionWrite.payload);
    assertNoForbiddenFields(historyWrite.payload);
  });

  it('rejects unauthenticated calls before writing', async () => {
    await assert.rejects(
      () => wrappedCreateTransaction({
        data: validPayload(),
        app: { appId: 'test-app-id' },
      }),
      (error) => {
        assert.equal(error.code, 'unauthenticated');
        return true;
      },
    );

    assert.equal(writes.length, 0);
  });

  it('stores idempotency key atomically on first call', async () => {
    const idemKey = 'a1b2c3d4-e5f6-4a7b-89c0-d1e2f3a4b5c6';

    const result = await wrappedCreateTransaction({
      data: { ...validPayload(), idempotencyKey: idemKey },
      auth: { uid: 'uid-idem' },
      app: { appId: 'test-app-id' },
    });

    assert.equal(typeof result.id, 'string');

    // 3 writes: idempotency key + transaction + history
    assert.equal(writes.length, 3);
    const idemWrite = writes.find(w => w.path.includes('/idempotency/'));
    assert.ok(idemWrite, 'idempotency key write expected');
    assert.equal(idemWrite.payload.txId, result.id);
    assert.deepEqual(idemWrite.payload.createdAt, { __op: 'serverTimestamp' });
  });

  it('returns same txId without writing on duplicate idempotencyKey', async () => {
    const idemKey = 'b2c3d4e5-f6a7-4b8c-90d1-e2f3a4b5c6d7';
    const uid = 'uid-dedup';

    // Pre-seed idempotency store as if first call already completed
    const existingTxId = 'pre-existing-tx-id';
    idemStore[`users/${uid}/idempotency/${idemKey}`] = {
      txId: existingTxId,
      createdAt: { __op: 'serverTimestamp' },
    };

    const result = await wrappedCreateTransaction({
      data: { ...validPayload(), idempotencyKey: idemKey },
      auth: { uid },
      app: { appId: 'test-app-id' },
    });

    assert.equal(result.id, existingTxId, 'must return original txId on duplicate');
    assert.equal(writes.length, 0, 'must not write anything on duplicate');
  });

  it('ignores malformed idempotencyKey (not a UUID v4)', async () => {
    const result = await wrappedCreateTransaction({
      data: { ...validPayload(), idempotencyKey: 'not-a-uuid' },
      auth: { uid: 'uid-bad-key' },
      app: { appId: 'test-app-id' },
    });

    assert.equal(typeof result.id, 'string');
    // No idempotency write — key was ignored
    const idemWrite = writes.find(w => w.path.includes('/idempotency/'));
    assert.equal(idemWrite, undefined, 'malformed key must be ignored');
    // 2 normal writes: transaction + history
    assert.equal(writes.length, 2);
  });
});
