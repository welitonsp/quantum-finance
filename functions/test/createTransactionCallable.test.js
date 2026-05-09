const assert = require('node:assert/strict');
const { after, describe, it } = require('node:test');

const firebaseFunctionsTest = require('firebase-functions-test');

const testEnv = firebaseFunctionsTest();
const adminModulePath = require.resolve('firebase-admin');
const originalAdminModule = require.cache[adminModulePath];

const writes = [];
let autoDocIndex = 0;

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
  };
}

const mockDb = {
  collection: createCollectionRef,
  async runTransaction(callback) {
    const transaction = {
      set(ref, payload) {
        writes.push({ path: ref.path, payload });
      },
    };

    await callback(transaction);
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
  it('creates a manual transaction with auth and App Check context', async () => {
    resetFirestoreMock();

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
    resetFirestoreMock();

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
});
