const assert = require('node:assert/strict');
const { beforeEach, describe, it } = require('node:test');

const {
  OP_RATE_LIMITS,
  checkAndIncrementOpRateLimit,
} = require('../lib/opRateLimit');

// ── Fake Firestore com injeção de cenário ─────────────────────────────────────
// O módulo recebe `db` por parâmetro (DI), então não precisamos de mock de módulo.
let store; // path -> { count, lastResetMs }
let failTransaction;
let writes;

function makeDb() {
  return {
    doc(path) {
      return { path };
    },
    async runTransaction(callback) {
      if (failTransaction) throw new Error('transaction failed');
      const tx = {
        async get(ref) {
          const data = store.get(ref.path);
          if (!data) return { exists: false, data: () => undefined };
          return {
            exists: true,
            data: () => ({
              count: data.count,
              lastReset: { toMillis: () => data.lastResetMs },
            }),
          };
        },
        set(ref, payload) {
          writes.push({ op: 'set', path: ref.path, payload });
          store.set(ref.path, { count: 1, lastResetMs: Date.now() });
        },
        update(ref, payload) {
          writes.push({ op: 'update', path: ref.path, payload });
          const prev = store.get(ref.path) ?? { count: 0, lastResetMs: Date.now() };
          if ('lastReset' in payload) {
            store.set(ref.path, { count: 1, lastResetMs: Date.now() });
          } else {
            store.set(ref.path, { ...prev, count: prev.count + 1 });
          }
        },
      };
      return callback(tx);
    },
  };
}

beforeEach(() => {
  store = new Map();
  failTransaction = false;
  writes = [];
});

describe('OP_RATE_LIMITS — configuração', () => {
  it('cobre exatamente as 6 callables de escrita não-IA', () => {
    assert.deepEqual(
      Object.keys(OP_RATE_LIMITS).sort(),
      [
        'createTransaction',
        'createTransfer',
        'deleteUserData',
        'executeAgentAction',
        'logAuditEvent',
        'recordPriceObservation',
      ],
    );
  });

  it('todo teto é inteiro positivo com janela positiva', () => {
    for (const [key, cfg] of Object.entries(OP_RATE_LIMITS)) {
      assert.ok(Number.isInteger(cfg.limit) && cfg.limit > 0, `${key}.limit`);
      assert.ok(Number.isInteger(cfg.windowMs) && cfg.windowMs > 0, `${key}.windowMs`);
    }
  });
});

describe('checkAndIncrementOpRateLimit', () => {
  it('primeira chamada cria o doc e permite', async () => {
    const result = await checkAndIncrementOpRateLimit(makeDb(), 'user-1', 'createTransfer');
    assert.deepEqual(result, { status: 'allowed' });
    assert.equal(writes[0].op, 'set');
    assert.equal(writes[0].path, 'users/user-1/usage/op_createTransfer');
  });

  it('permite até o teto e bloqueia a chamada seguinte', async () => {
    const db = makeDb();
    const { limit } = OP_RATE_LIMITS.createTransfer;
    for (let i = 0; i < limit; i++) {
      const r = await checkAndIncrementOpRateLimit(db, 'user-1', 'createTransfer');
      assert.equal(r.status, 'allowed', `chamada ${i + 1} deveria passar`);
    }
    const blocked = await checkAndIncrementOpRateLimit(db, 'user-1', 'createTransfer');
    assert.deepEqual(blocked, { status: 'limited' });
  });

  it('janela expirada reseta o contador e permite', async () => {
    const db = makeDb();
    const { limit, windowMs } = OP_RATE_LIMITS.deleteUserData;
    store.set('users/user-1/usage/op_deleteUserData', {
      count: limit,
      lastResetMs: Date.now() - windowMs - 1000,
    });
    const result = await checkAndIncrementOpRateLimit(db, 'user-1', 'deleteUserData');
    assert.deepEqual(result, { status: 'allowed' });
    const lastWrite = writes.at(-1);
    assert.equal(lastWrite.op, 'update');
    assert.ok('lastReset' in lastWrite.payload, 'reset deve reescrever lastReset');
  });

  it('contadores são isolados por operação e por uid', async () => {
    const db = makeDb();
    const { limit } = OP_RATE_LIMITS.createTransfer;
    store.set('users/user-1/usage/op_createTransfer', {
      count: limit,
      lastResetMs: Date.now(),
    });
    // Mesma op, outro uid → permite.
    const otherUid = await checkAndIncrementOpRateLimit(db, 'user-2', 'createTransfer');
    assert.equal(otherUid.status, 'allowed');
    // Mesmo uid, outra op → permite.
    const otherOp = await checkAndIncrementOpRateLimit(db, 'user-1', 'createTransaction');
    assert.equal(otherOp.status, 'allowed');
    // Mesmo uid, mesma op → bloqueia.
    const same = await checkAndIncrementOpRateLimit(db, 'user-1', 'createTransfer');
    assert.equal(same.status, 'limited');
  });

  it('erro interno retorna status error (NUNCA limited) e chama onError', async () => {
    failTransaction = true;
    let observed = null;
    const result = await checkAndIncrementOpRateLimit(
      makeDb(),
      'user-1',
      'createTransaction',
      (e) => { observed = e; },
    );
    assert.deepEqual(result, { status: 'error' });
    assert.ok(observed instanceof Error);
  });

  it('erro interno sem onError não lança', async () => {
    failTransaction = true;
    const result = await checkAndIncrementOpRateLimit(makeDb(), 'user-1', 'logAuditEvent');
    assert.deepEqual(result, { status: 'error' });
  });
});
