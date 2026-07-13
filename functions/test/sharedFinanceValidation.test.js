const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { validateInviteAcceptance, validateExpenseShares } = require('../lib/sharedFinanceValidation.js');

const NOW = Date.parse('2026-07-11T12:00:00.000Z');
const FUTURE = '2026-08-01T00:00:00.000Z';
const PAST = '2026-07-01T00:00:00.000Z';

const invite = (over = {}) => ({
  status: 'pending', inviteeEmail: 'bob@test.com', expiresAt: FUTURE, ...over,
});
const group = (over = {}) => ({ memberUids: ['alice'], ownerUid: 'alice', ...over });

describe('validateInviteAcceptance (F-03)', () => {
  it('aceita convite pendente, no prazo, email correto, não-membro', () => {
    const r = validateInviteAcceptance(invite(), group(), 'bob', 'bob@test.com', NOW);
    assert.deepEqual(r, { ok: true });
  });

  it('rejeita convite ausente / grupo ausente', () => {
    assert.equal(validateInviteAcceptance(null, group(), 'bob', 'bob@test.com', NOW).ok, false);
    assert.equal(validateInviteAcceptance(invite(), null, 'bob', 'bob@test.com', NOW).ok, false);
  });

  it('single-use: rejeita status != pending (accepted/rejected)', () => {
    for (const status of ['accepted', 'rejected', 'consumed']) {
      const r = validateInviteAcceptance(invite({ status }), group(), 'bob', 'bob@test.com', NOW);
      assert.equal(r.ok, false);
      assert.equal(r.reason, 'invite_not_pending');
    }
  });

  it('rejeita email divergente (case-insensitive compara)', () => {
    const r = validateInviteAcceptance(invite(), group(), 'bob', 'mallory@test.com', NOW);
    assert.equal(r.reason, 'email_mismatch');
    // mesmo email com caixa diferente passa
    assert.equal(validateInviteAcceptance(invite({ inviteeEmail: 'Bob@Test.com' }), group(), 'bob', 'bob@test.com', NOW).ok, true);
  });

  it('rejeita convite expirado', () => {
    const r = validateInviteAcceptance(invite({ expiresAt: PAST }), group(), 'bob', 'bob@test.com', NOW);
    assert.equal(r.reason, 'invite_expired');
  });

  it('rejeita reentrada: uid já é membro', () => {
    const r = validateInviteAcceptance(invite(), group({ memberUids: ['alice', 'bob'] }), 'bob', 'bob@test.com', NOW);
    assert.equal(r.reason, 'already_member');
  });
});

describe('validateExpenseShares (F-02)', () => {
  const members = ['alice', 'bob'];
  const share = (uid, amountCents, paid = false) => ({ uid, amountCents, paid });

  it('aceita cotas válidas que somam o total', () => {
    const r = validateExpenseShares([share('alice', 6000), share('bob', 4000)], 10000, members);
    assert.deepEqual(r, { ok: true });
  });

  it('rejeita soma diferente do total', () => {
    const r = validateExpenseShares([share('alice', 6000), share('bob', 3000)], 10000, members);
    assert.equal(r.reason, 'shares_sum_mismatch');
  });

  it('rejeita uid fora do grupo', () => {
    const r = validateExpenseShares([share('alice', 5000), share('mallory', 5000)], 10000, members);
    assert.equal(r.reason, 'share_uid_not_member');
  });

  it('rejeita uid duplicado', () => {
    const r = validateExpenseShares([share('alice', 5000), share('alice', 5000)], 10000, members);
    assert.equal(r.reason, 'share_uid_duplicated');
  });

  it('rejeita amount/paid inválidos, total inválido e lista vazia', () => {
    assert.equal(validateExpenseShares([share('alice', -1), share('bob', 10001)], 10000, members).reason, 'share_amount_invalid');
    assert.equal(validateExpenseShares([{ uid: 'alice', amountCents: 10000 }], 10000, members).reason, 'share_paid_invalid');
    assert.equal(validateExpenseShares([share('alice', 10000)], 0, members).reason, 'total_invalid');
    assert.equal(validateExpenseShares([], 10000, members).reason, 'shares_empty');
  });
});
