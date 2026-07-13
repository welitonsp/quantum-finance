// Rate limit genérico por operação/uid para callables de escrita (não-IA).
// Mesmo padrão transacional de checkAndIncrementRateLimit (usage/ai_calls),
// generalizado: cada operação tem seu próprio doc `users/{uid}/usage/op_{key}`
// com janela fixa (lastReset + windowMs). Docs sob usage/ sem match explícito
// nas Rules caem no deny padrão — escrita é exclusiva do Admin SDK, sem
// alteração de firestore.rules.
//
// CRÍTICO (mesmo contrato do limiter de IA): erro interno do Firestore NUNCA
// é confundido com limite atingido — o consumidor decide o HttpsError.

import { FieldValue } from 'firebase-admin/firestore';
import type { Firestore, Timestamp } from 'firebase-admin/firestore';

export type OpRateLimitResult =
  | { status: 'allowed' }
  | { status: 'limited' }
  | { status: 'error' };

export interface OpRateLimitConfig {
  limit: number;
  windowMs: number;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// Tetos por uid, calibrados para nunca atrapalhar uso humano legítimo e ainda
// bloquear abuso scriptado. Ações do Agente exigem confirmação humana uma a uma;
// logAuditEvent/recordPriceObservation têm rajadas legítimas (bulk/sessão de compras).
export const OP_RATE_LIMITS = {
  createTransaction:      { limit: 120, windowMs: HOUR_MS },
  createTransfer:         { limit: 30,  windowMs: HOUR_MS },
  executeAgentAction:     { limit: 60,  windowMs: HOUR_MS },
  deleteUserData:         { limit: 5,   windowMs: DAY_MS },
  logAuditEvent:          { limit: 240, windowMs: HOUR_MS },
  recordPriceObservation: { limit: 240, windowMs: HOUR_MS },
  acceptGroupInvite:      { limit: 30,  windowMs: HOUR_MS },
} as const satisfies Record<string, OpRateLimitConfig>;

export type OpRateLimitKey = keyof typeof OP_RATE_LIMITS;

export async function checkAndIncrementOpRateLimit(
  db: Firestore,
  uid: string,
  opKey: OpRateLimitKey,
  onError?: (error: unknown) => void,
): Promise<OpRateLimitResult> {
  const { limit, windowMs } = OP_RATE_LIMITS[opKey];
  const ref = db.doc(`users/${uid}/usage/op_${opKey}`);
  const nowMs = Date.now();

  try {
    return await db.runTransaction(async (tx): Promise<OpRateLimitResult> => {
      const snap = await tx.get(ref);

      if (!snap.exists) {
        tx.set(ref, { count: 1, lastReset: FieldValue.serverTimestamp() });
        return { status: 'allowed' };
      }

      const data = snap.data()!;
      const lastResetMs = (data['lastReset'] as Timestamp | undefined)?.toMillis?.() ?? 0;

      if (nowMs - lastResetMs > windowMs) {
        tx.update(ref, { count: 1, lastReset: FieldValue.serverTimestamp() });
        return { status: 'allowed' };
      }

      if (((data['count'] as number) ?? 0) >= limit) return { status: 'limited' };

      tx.update(ref, { count: FieldValue.increment(1) });
      return { status: 'allowed' };
    });
  } catch (e) {
    onError?.(e);
    return { status: 'error' };
  }
}
