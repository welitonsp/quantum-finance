/**
 * P-01 — motor puro de rollups mensais (functions/src/monthlyRollups.ts).
 * Runs via: npm --prefix functions test
 */

const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const {
  applyContribution,
  buildRollupsFromTransactions,
  computeRollupDelta,
  emptyMonthTotals,
  isConsistentMonthTotals,
  parseMonthTotals,
  planMonthWrite,
  resolveMonthKey,
  transactionContribution,
} = require('../lib/monthlyRollups');

function tx(overrides = {}) {
  return {
    type: 'saida',
    value_cents: 12345,
    category: 'Alimentação',
    account: 'conta_corrente',
    date: '2026-03-15',
    schemaVersion: 2,
    ...overrides,
  };
}

/** Aplica uma sequência de escritas (before/after) e devolve o estado persistido por mês. */
function replay(writes) {
  const store = {};
  for (const [before, after] of writes) {
    const deltas = computeRollupDelta(before, after);
    for (const [month, delta] of Object.entries(deltas)) {
      const plan = planMonthWrite(store[month] ?? emptyMonthTotals(), delta);
      if (plan.action === 'delete') delete store[month];
      else store[month] = plan.totals;
    }
  }
  return store;
}

describe('transactionContribution', () => {
  it('classifica receita, despesa, pagamento de fatura e transferência', () => {
    assert.equal(transactionContribution(tx({ type: 'entrada' })).kind, 'income');
    assert.equal(transactionContribution(tx({ type: 'receita' })).kind, 'income');
    assert.equal(transactionContribution(tx({ type: 'saida' })).kind, 'expense');
    assert.equal(transactionContribution(tx({ type: 'despesa' })).kind, 'expense');
    assert.equal(transactionContribution(tx({ paidInvoiceMonth: '2026-02' })).kind, 'invoicePayment');
    assert.equal(transactionContribution(tx({ type: 'transferencia' })).kind, 'transfer');
  });

  it('usa valor absoluto inteiro de value_cents', () => {
    assert.equal(transactionContribution(tx({ value_cents: -500 })).cents, 500);
  });

  it('ignora soft-delete, valor inválido, tipo desconhecido e data inválida', () => {
    assert.equal(transactionContribution(tx({ isDeleted: true })), null);
    assert.equal(transactionContribution(tx({ deletedAt: { seconds: 1 } })), null);
    assert.equal(transactionContribution(tx({ value_cents: 10.5 })), null);
    assert.equal(transactionContribution(tx({ value_cents: undefined, value: 10.5 })), null, 'legado float não é convertido');
    assert.equal(transactionContribution(tx({ value_cents: 0 })), null);
    assert.equal(transactionContribution(tx({ value_cents: Number.MAX_SAFE_INTEGER + 1 })), null);
    assert.equal(transactionContribution(tx({ type: 'outro' })), null);
    assert.equal(transactionContribution(tx({ date: '2026-13-01' })), null);
    assert.equal(transactionContribution(null), null);
  });

  it('aplica defaults de conta e categoria e bloqueia nomes reservados do Firestore', () => {
    const c = transactionContribution(tx({ account: undefined, category: '__name__' }));
    assert.equal(c.account, 'conta_corrente');
    assert.equal(c.category, 'Diversos');
    assert.equal(transactionContribution(tx({ category: '   ' })).category, 'Diversos');
  });
});

describe('resolveMonthKey', () => {
  it('usa o campo date quando presente', () => {
    assert.equal(resolveMonthKey({ date: '2025-12-31' }), '2025-12');
  });

  it('cai para createdAt em America/Sao_Paulo (virada de mês em UTC)', () => {
    // 2026-04-01T02:00:00Z = 31/03/2026 23:00 em São Paulo (UTC-3)
    const ms = Date.UTC(2026, 3, 1, 2, 0, 0);
    assert.equal(resolveMonthKey({ createdAt: { toMillis: () => ms } }), '2026-03');
    assert.equal(resolveMonthKey({ createdAt: { seconds: ms / 1000 } }), '2026-03');
  });

  it('retorna null sem data utilizável', () => {
    assert.equal(resolveMonthKey({}), null);
  });
});

describe('computeRollupDelta', () => {
  it('create soma, delete subtrai, update irrelevante não gera delta', () => {
    const created = computeRollupDelta(null, tx());
    assert.equal(created['2026-03'].expenseCents, 12345);
    assert.equal(created['2026-03'].txCount, 1);

    const deleted = computeRollupDelta(tx(), null);
    assert.equal(deleted['2026-03'].expenseCents, -12345);

    assert.deepEqual(computeRollupDelta(tx(), tx({ description: 'nova descrição' })), {});
  });

  it('mudança de mês move o valor entre os dois meses', () => {
    const delta = computeRollupDelta(tx(), tx({ date: '2026-04-02' }));
    assert.equal(delta['2026-03'].expenseCents, -12345);
    assert.equal(delta['2026-04'].expenseCents, 12345);
  });

  it('soft-delete via update remove a contribuição', () => {
    const delta = computeRollupDelta(tx(), tx({ isDeleted: true }));
    assert.equal(delta['2026-03'].expenseCents, -12345);
    assert.equal(delta['2026-03'].txCount, -1);
  });
});

describe('replay de escritas (equivalência com recálculo completo)', () => {
  it('sequência create/update/delete converge para buildRollupsFromTransactions', () => {
    const a = tx({ type: 'entrada', value_cents: 500000, category: 'Salário' });
    const b = tx({ value_cents: 2000, category: 'Transporte', account: 'nubank' });
    const b2 = { ...b, value_cents: 2500, date: '2026-04-10' };
    const c = tx({ paidInvoiceMonth: '2026-02', value_cents: 90000 });
    const d = tx({ type: 'transferencia', value_cents: 10000 });

    const store = replay([
      [null, a], [null, b], [null, c], [null, d],
      [b, b2],          // edição muda valor e mês
      [d, null],        // exclusão
    ]);

    const expected = buildRollupsFromTransactions([a, b2, c]);
    assert.deepEqual(store, expected);
    assert.equal(store['2026-03'].incomeCents, 500000);
    assert.equal(store['2026-03'].invoicePaymentCents, 90000);
    assert.equal(store['2026-03'].expenseCents, 0, 'pagamento de fatura não é consumo');
    assert.equal(store['2026-04'].byAccount.nubank.expenseCents, 2500);
    assert.equal(store['2026-03'].byAccount.nubank, undefined, 'conta zerada é removida');
    for (const month of Object.values(store)) assert.ok(isConsistentMonthTotals(month));
  });

  it('ordem de entrega não altera o resultado (deltas comutam)', () => {
    const v1 = tx();
    const v2 = tx({ value_cents: 999 });
    const v3 = tx({ value_cents: 999, category: 'Lazer' });
    const writes = [[null, v1], [v1, v2], [v2, v3]];
    const inOrder = replay(writes);
    const reversed = replay([...writes].reverse());
    assert.deepEqual(reversed, inOrder);
  });

  it('estado intermediário fora de ordem é sinalizado e depois converge', () => {
    const v1 = tx();
    const v2 = tx({ category: 'Lazer' });
    const early = planMonthWrite(emptyMonthTotals(), computeRollupDelta(v1, v2)['2026-03']);
    assert.equal(early.action, 'set');
    assert.equal(early.needsRebuild, true, 'categoria negativa antes do create chegar');

    const late = planMonthWrite(early.totals, computeRollupDelta(null, v1)['2026-03']);
    assert.equal(late.action, 'set');
    assert.equal(late.needsRebuild, false);
    assert.deepEqual(late.totals, buildRollupsFromTransactions([v2])['2026-03']);
  });

  it('suporta mais de 500 transações sem perda (motivo do P-01)', () => {
    const txs = [];
    for (let i = 0; i < 1200; i += 1) {
      txs.push(tx({ value_cents: 100, date: `2025-${String((i % 12) + 1).padStart(2, '0')}-10` }));
    }
    const months = buildRollupsFromTransactions(txs);
    assert.equal(Object.keys(months).length, 12);
    const total = Object.values(months).reduce((sum, m) => sum + m.expenseCents, 0);
    assert.equal(total, 120000);
  });
});

describe('invariantes e leitura tolerante', () => {
  it('detecta drift (total negativo ou soma por conta divergente)', () => {
    const m = emptyMonthTotals();
    applyContribution(m, transactionContribution(tx()), -1);
    assert.equal(isConsistentMonthTotals(m), false);

    const ok = buildRollupsFromTransactions([tx()])['2026-03'];
    assert.equal(isConsistentMonthTotals(ok), true);
    assert.equal(isConsistentMonthTotals({ ...ok, expenseCents: ok.expenseCents + 1 }), false);
  });

  it('parseMonthTotals ignora campos não inteiros e ausentes', () => {
    const parsed = parseMonthTotals({
      incomeCents: 10,
      expenseCents: 'x',
      expenseByCategory: { A: 5, B: 1.5 },
      byAccount: { c: { incomeCents: 10, txCount: 1 } },
    });
    assert.equal(parsed.incomeCents, 10);
    assert.equal(parsed.expenseCents, 0);
    assert.deepEqual(parsed.expenseByCategory, { A: 5 });
    assert.equal(parsed.byAccount.c.txCount, 1);
    assert.deepEqual(parseMonthTotals(null), emptyMonthTotals());
  });
});

describe('chaves vindas do usuário', () => {
  it('categoria/conta com nome de propriedade de Object.prototype não corrompe totais', () => {
    const txs = ['constructor', 'toString', 'hasOwnProperty', 'valueOf'].flatMap((key) => [
      { type: 'saida', value_cents: 1000, date: '2026-03-10', category: key, account: key },
      { type: 'entrada', value_cents: 500, date: '2026-03-11', category: key, account: key },
    ]);
    const m = buildRollupsFromTransactions(txs)['2026-03'];
    assert.equal(m.expenseCents, 4000);
    assert.equal(m.incomeCents, 2000);
    assert.equal(m.expenseByCategory.constructor, 1000);
    assert.equal(m.incomeByCategory.toString, 500);
    assert.deepEqual(m.byAccount.valueOf, {
      incomeCents: 500, expenseCents: 1000, invoicePaymentCents: 0, transferCents: 0, txCount: 2,
    });
    assert.equal(isConsistentMonthTotals(m), true);

    const delta = computeRollupDelta(txs[0], null)['2026-03'];
    const plan = planMonthWrite(m, delta);
    assert.equal(plan.action, 'set');
    assert.equal(plan.needsRebuild, false);
    assert.equal(Object.hasOwn(plan.totals.expenseByCategory, 'constructor'), false);
    assert.equal(plan.totals.byAccount.constructor.txCount, 1);
  });
});
