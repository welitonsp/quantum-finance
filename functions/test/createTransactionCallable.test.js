const assert = require('node:assert/strict');
const { after, describe, it } = require('node:test');

const firebaseFunctionsTest = require('firebase-functions-test');

const testEnv = firebaseFunctionsTest();
const adminModulePath = require.resolve('firebase-admin');
const originalAdminModule = require.cache[adminModulePath];

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
      set() {},
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

describe('createTransaction callable', () => {
  it('creates a manual transaction with auth and App Check context', async () => {
    autoDocIndex = 0;

    const result = await wrappedCreateTransaction({
      data: validPayload(),
      auth: { uid: 'test-user-id' },
      app: { appId: 'test-app-id' },
    });

    assert.equal(typeof result.id, 'string');
    assert.ok(result.id.length > 0);
  });
});
