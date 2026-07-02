const assert = require('node:assert/strict');
const { after, beforeEach, describe, it } = require('node:test');

const firebaseFunctionsTest = require('firebase-functions-test');

const testEnv = firebaseFunctionsTest();
const adminModulePath = require.resolve('firebase-admin');
const originalAdminModule = require.cache[adminModulePath];

const writes = [];
let autoDocIndex = 0;

// docStore: path → data (contas, idempotency) — simula existência de documentos.
const docStore = {};

function nextDocId() {
  const ids = ['tx-transfer-id'];
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
      const stored = docStore[path];
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
        if (ref.path.includes('/idempotency/')) {
          docStore[ref.path] = payload;
        }
        writes.push({ op: 'set', path: ref.path, payload });
      },
      update(ref, payload) {
        writes.push({ op: 'update', path: ref.path, payload });
      },
      async get(ref) {
        const stored = docStore[ref.path];
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

const { createTransfer, accountBalanceCents } = require('../lib/index');
const wrappedCreateTransfer = testEnv.wrap(createTransfer);

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

const UID = 'test-user-id';
const FROM_PATH = `users/${UID}/accounts/acc-from`;
const TO_PATH = `users/${UID}/accounts/acc-to`;

function validPayload(overrides = {}) {
  return {
    fromAccountId: 'acc-from',
    toAccountId:   'acc-to',
    value_cents:   30000,
    date:          '2026-07-01',
    description:   'Reserva mensal',
    ...overrides,
  };
}

function seedAccounts({ fromBalance = 100000, toBalance = 5000 } = {}) {
  docStore[FROM_PATH] = {
    name: 'Conta Corrente', type: 'corrente', balance: fromBalance, schemaVersion: 2,
    createdAt: { __t: 'ts' }, updatedAt: { __t: 'ts' },
  };
  docStore[TO_PATH] = {
    name: 'Poupança', type: 'poupanca', balance: toBalance, schemaVersion: 2,
    createdAt: { __t: 'ts' }, updatedAt: { __t: 'ts' },
  };
}

function resetMock() {
  writes.length = 0;
  autoDocIndex = 0;
  Object.keys(docStore).forEach(k => delete docStore[k]);
}

describe('accountBalanceCents (normalização de saldo)', () => {
  it('schemaVersion 2: balance já é centavos (preserva sinal)', () => {
    assert.equal(accountBalanceCents({ balance: 150050, schemaVersion: 2 }), 150050);
    assert.equal(accountBalanceCents({ balance: -20000, schemaVersion: 2 }), -20000);
  });

  it('legado (sem schemaVersion 2): reais float → centavos', () => {
    assert.equal(accountBalanceCents({ balance: 1500.5 }), 150050);
    assert.equal(accountBalanceCents({ balance: 0.1 + 0.2 }), 30);
  });

  it('valores inválidos → 0', () => {
    assert.equal(accountBalanceCents({}), 0);
    assert.equal(accountBalanceCents({ balance: 'x' }), 0);
    assert.equal(accountBalanceCents({ balance: Infinity }), 0);
  });
});

describe('createTransfer callable', () => {
  beforeEach(() => resetMock());

  it('rejects unauthenticated calls before writing', async () => {
    await assert.rejects(
      () => wrappedCreateTransfer({
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

  it('rejects invalid payload (from == to) before writing', async () => {
    seedAccounts();
    await assert.rejects(
      () => wrappedCreateTransfer({
        data: validPayload({ toAccountId: 'acc-from' }),
        auth: { uid: UID },
        app: { appId: 'test-app-id' },
      }),
      (error) => {
        assert.equal(error.code, 'invalid-argument');
        return true;
      },
    );
    assert.equal(writes.length, 0);
  });

  it('rejects when source account does not exist (not-found, no writes persist)', async () => {
    docStore[TO_PATH] = { name: 'Poupança', type: 'poupanca', balance: 5000, schemaVersion: 2 };
    await assert.rejects(
      () => wrappedCreateTransfer({
        data: validPayload(),
        auth: { uid: UID },
        app: { appId: 'test-app-id' },
      }),
      (error) => {
        assert.equal(error.code, 'not-found');
        return true;
      },
    );
  });

  it('creates tx + history + debits/credits both accounts atomically', async () => {
    seedAccounts({ fromBalance: 100000, toBalance: 5000 });

    const result = await wrappedCreateTransfer({
      data: validPayload(),
      auth: { uid: UID },
      app: { appId: 'test-app-id' },
    });

    assert.equal(result.id, 'tx-transfer-id');

    // 6 writes: tx + tx history + 2 account updates + 2 account histories.
    assert.equal(writes.length, 6);

    const txWrite = writes.find(w => w.path === `users/${UID}/transactions/tx-transfer-id`);
    assert.ok(txWrite, 'transaction write expected');
    assert.deepEqual(txWrite.payload, {
      description:   'Reserva mensal',
      descriptionLower: 'reserva mensal',
      value_cents:   30000,
      schemaVersion: 2,
      type:          'transferencia',
      category:      'Transferência',
      date:          '2026-07-01',
      source:        'manual',
      fromAccountId: 'acc-from',
      toAccountId:   'acc-to',
      isRecurring:   false,
      createdAt:     { __op: 'serverTimestamp' },
      updatedAt:     { __op: 'serverTimestamp' },
    });

    const histWrite = writes.find(w => w.path === `users/${UID}/transactions/tx-transfer-id/history/create`);
    assert.ok(histWrite, 'history write expected');
    assert.equal(histWrite.payload.action, 'CREATE');
    assert.equal(histWrite.payload.origin, 'manual');
    assert.equal(histWrite.payload.txId, 'tx-transfer-id');
    assert.equal(histWrite.payload.amount_cents, 30000);
    assert.equal(histWrite.payload.category, 'Transferência');
    assert.equal(histWrite.payload.after.fromAccountId, 'acc-from');
    assert.equal(histWrite.payload.after.toAccountId, 'acc-to');
    assert.equal(histWrite.payload.after.description, 'Reserva mensal');
    assert.equal(histWrite.payload.after.schemaVersion, 2);
    assert.equal(histWrite.payload.after.isRecurring, false);

    const fromUpdate = writes.find(w => w.op === 'update' && w.path === FROM_PATH);
    assert.ok(fromUpdate, 'from account debit expected');
    assert.equal(fromUpdate.payload.balance, 70000);
    assert.equal(fromUpdate.payload.schemaVersion, 2);
    assert.equal(fromUpdate.payload._lastOpId, 'op_transfer_from_tx-transfer-id');

    const toUpdate = writes.find(w => w.op === 'update' && w.path === TO_PATH);
    assert.ok(toUpdate, 'to account credit expected');
    assert.equal(toUpdate.payload.balance, 35000);
    assert.equal(toUpdate.payload._lastOpId, 'op_transfer_to_tx-transfer-id');

    const fromHist = writes.find(w => w.path === `${FROM_PATH}/history/op_transfer_from_tx-transfer-id`);
    assert.ok(fromHist, 'from account history expected');
    assert.equal(fromHist.payload.action, 'UPDATE');
    assert.equal(fromHist.payload.origin, 'manual');
    assert.equal(fromHist.payload.accountId, 'acc-from');
    assert.equal(fromHist.payload.correlationId, 'op_transfer_from_tx-transfer-id');
    assert.equal(fromHist.payload.before.balance, 100000);
    assert.equal(fromHist.payload.after.balance, 70000);
    assert.deepEqual(fromHist.payload.changedFields, ['balance']);

    const toHist = writes.find(w => w.path === `${TO_PATH}/history/op_transfer_to_tx-transfer-id`);
    assert.ok(toHist, 'to account history expected');
    assert.equal(toHist.payload.before.balance, 5000);
    assert.equal(toHist.payload.after.balance, 35000);
  });

  it('allows the source account to go negative (divida/cheque especial)', async () => {
    seedAccounts({ fromBalance: 10000, toBalance: 0 });

    await wrappedCreateTransfer({
      data: validPayload({ value_cents: 25000 }),
      auth: { uid: UID },
      app: { appId: 'test-app-id' },
    });

    const fromUpdate = writes.find(w => w.op === 'update' && w.path === FROM_PATH);
    assert.equal(fromUpdate.payload.balance, -15000);
    const toUpdate = writes.find(w => w.op === 'update' && w.path === TO_PATH);
    assert.equal(toUpdate.payload.balance, 25000);
  });

  it('converts legacy (reais float) balances and upgrades schemaVersion', async () => {
    docStore[FROM_PATH] = { name: 'Legada', type: 'corrente', balance: 1500.5 };
    docStore[TO_PATH]   = { name: 'Nova', type: 'poupanca', balance: 5000, schemaVersion: 2 };

    await wrappedCreateTransfer({
      data: validPayload({ value_cents: 50 }),
      auth: { uid: UID },
      app: { appId: 'test-app-id' },
    });

    const fromUpdate = writes.find(w => w.op === 'update' && w.path === FROM_PATH);
    // 1500.50 reais = 150050 centavos − 50 = 150000
    assert.equal(fromUpdate.payload.balance, 150000);
    assert.equal(fromUpdate.payload.schemaVersion, 2);

    const fromHist = writes.find(w => w.path.startsWith(`${FROM_PATH}/history/`));
    assert.deepEqual(fromHist.payload.changedFields, ['balance', 'schemaVersion']);
  });

  it('stores idempotency key atomically on first call (7 writes)', async () => {
    seedAccounts();
    const idemKey = 'a1b2c3d4-e5f6-4a7b-89c0-d1e2f3a4b5c6';

    const result = await wrappedCreateTransfer({
      data: { ...validPayload(), idempotencyKey: idemKey },
      auth: { uid: UID },
      app: { appId: 'test-app-id' },
    });

    assert.equal(writes.length, 7);
    const idemWrite = writes.find(w => w.path.includes('/idempotency/'));
    assert.ok(idemWrite, 'idempotency write expected');
    assert.equal(idemWrite.payload.txId, result.id);
  });

  it('returns same txId without writing on duplicate idempotencyKey', async () => {
    seedAccounts();
    const idemKey = 'b2c3d4e5-f6a7-4b8c-90d1-e2f3a4b5c6d7';
    docStore[`users/${UID}/idempotency/${idemKey}`] = {
      txId: 'pre-existing-transfer-id',
      createdAt: { __op: 'serverTimestamp' },
    };

    const result = await wrappedCreateTransfer({
      data: { ...validPayload(), idempotencyKey: idemKey },
      auth: { uid: UID },
      app: { appId: 'test-app-id' },
    });

    assert.equal(result.id, 'pre-existing-transfer-id');
    assert.equal(writes.length, 0, 'must not write anything on duplicate');
  });

  it('ignores malformed idempotencyKey (not a UUID v4)', async () => {
    seedAccounts();

    await wrappedCreateTransfer({
      data: { ...validPayload(), idempotencyKey: 'not-a-uuid' },
      auth: { uid: UID },
      app: { appId: 'test-app-id' },
    });

    const idemWrite = writes.find(w => w.path.includes('/idempotency/'));
    assert.equal(idemWrite, undefined, 'malformed key must be ignored');
    assert.equal(writes.length, 6);
  });
});
