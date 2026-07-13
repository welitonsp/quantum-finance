/**
 * sharedFinanceValidation.ts — validação PURA server-trusted para finanças
 * compartilhadas (grupos). Zero I/O; usado dentro de transações no index.ts.
 *
 * F-03: aceite de convite atômico, single-use e com expiração.
 * F-02: integridade das cotas (shares) de uma despesa de grupo.
 *
 * `functions/` não importa `src/` — os shapes são declarados localmente.
 */

export interface InviteLike {
  status?: unknown;
  inviteeEmail?: unknown;
  expiresAt?: unknown;
}

export interface GroupLike {
  memberUids?: unknown;
  ownerUid?: unknown;
}

export interface ShareLike {
  uid?: unknown;
  amountCents?: unknown;
  paid?: unknown;
}

export type ValidationResult =
  | { ok: true }
  | { ok: false; code: 'failed-precondition' | 'permission-denied' | 'not-found'; reason: string };

function normEmail(v: unknown): string {
  return typeof v === 'string' ? v.toLowerCase().trim() : '';
}

/**
 * Valida se `uid`/`email` pode aceitar um convite. Single-use garantido por
 * exigir status 'pending' (uma vez 'accepted'/'rejected', nunca reaceita).
 */
export function validateInviteAcceptance(
  invite: InviteLike | undefined | null,
  group: GroupLike | undefined | null,
  uid: string,
  email: string,
  nowMs: number,
): ValidationResult {
  if (!invite) return { ok: false, code: 'not-found', reason: 'invite_not_found' };
  if (!group)  return { ok: false, code: 'not-found', reason: 'group_not_found' };

  if (invite.status !== 'pending') {
    return { ok: false, code: 'failed-precondition', reason: 'invite_not_pending' };
  }

  const callerEmail = normEmail(email);
  if (!callerEmail || callerEmail !== normEmail(invite.inviteeEmail)) {
    return { ok: false, code: 'permission-denied', reason: 'email_mismatch' };
  }

  const expiresMs = typeof invite.expiresAt === 'string' ? Date.parse(invite.expiresAt) : NaN;
  if (Number.isNaN(expiresMs) || expiresMs <= nowMs) {
    return { ok: false, code: 'failed-precondition', reason: 'invite_expired' };
  }

  const memberUids = Array.isArray(group.memberUids) ? group.memberUids : [];
  if (memberUids.includes(uid)) {
    return { ok: false, code: 'failed-precondition', reason: 'already_member' };
  }

  return { ok: true };
}

/**
 * Valida a integridade das cotas de uma despesa (F-02): estrutura, soma exata
 * igual ao total e todos os uids pertencentes ao grupo.
 */
export function validateExpenseShares(
  shares: unknown,
  totalCents: unknown,
  memberUids: unknown,
): ValidationResult {
  if (!Array.isArray(shares) || shares.length === 0) {
    return { ok: false, code: 'failed-precondition', reason: 'shares_empty' };
  }
  if (typeof totalCents !== 'number' || !Number.isSafeInteger(totalCents) || totalCents <= 0) {
    return { ok: false, code: 'failed-precondition', reason: 'total_invalid' };
  }
  const members = Array.isArray(memberUids) ? memberUids : [];

  let sum = 0;
  const seen = new Set<string>();
  for (const raw of shares as ShareLike[]) {
    const uid = typeof raw?.uid === 'string' ? raw.uid : '';
    const amount = raw?.amountCents;
    if (!uid || !members.includes(uid)) {
      return { ok: false, code: 'permission-denied', reason: 'share_uid_not_member' };
    }
    if (seen.has(uid)) {
      return { ok: false, code: 'failed-precondition', reason: 'share_uid_duplicated' };
    }
    seen.add(uid);
    if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount < 0) {
      return { ok: false, code: 'failed-precondition', reason: 'share_amount_invalid' };
    }
    if (typeof raw.paid !== 'boolean') {
      return { ok: false, code: 'failed-precondition', reason: 'share_paid_invalid' };
    }
    sum += amount;
  }

  if (sum !== totalCents) {
    return { ok: false, code: 'failed-precondition', reason: 'shares_sum_mismatch' };
  }
  return { ok: true };
}
