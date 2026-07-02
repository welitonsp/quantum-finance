/**
 * transferRepo.ts — transfer transaction operations.
 *
 * Correção P1 F-01: transferências são SERVER-ONLY, materializadas pela callable
 * `createTransfer` (Admin SDK), que grava atomicamente a transação `transferencia`
 * + history (Modelo A) + movimenta os saldos das DUAS contas (débito na origem,
 * crédito no destino) + histories por conta. As Firestore Rules negam create/update
 * client-side de `type: 'transferencia'`.
 *
 * A validação Zod client-side permanece para feedback rápido; a autoridade é do
 * validador server-trusted (functions/src/transferValidation.ts).
 */
import { httpsCallable } from 'firebase/functions';
import { functions } from '../api/firebase/index';
import {
  TransferCreateDTOSchema,
  type TransferCreateDTO,
} from './firestoreCore';

export const transferRepo = {
  async createTransferWithHistory(
    uid: string,
    data: TransferCreateDTO,
  ): Promise<string> {
    if (!uid) throw new Error('[Firestore][createTransferWithHistory] UID ausente.');
    const parsed = TransferCreateDTOSchema.safeParse(data);
    if (!parsed.success) {
      throw new Error(`[Firestore][createTransferWithHistory] ${parsed.error.issues[0]?.message ?? 'Payload inválido.'}`);
    }

    const { fromAccountId, toAccountId, value_cents, date, description } = parsed.data;
    const trimmedDescription = description?.trim();

    const callable = httpsCallable(functions, 'createTransfer', { timeout: 30_000 });
    const result = await callable({
      fromAccountId,
      toAccountId,
      value_cents: Math.abs(value_cents),
      date,
      ...(trimmedDescription ? { description: trimmedDescription } : {}),
      // Idempotência server-side: retries da mesma operação não duplicam a transferência.
      idempotencyKey: crypto.randomUUID(),
    });

    const payload = result.data as { id?: unknown } | null;
    if (!payload || typeof payload.id !== 'string' || payload.id.length === 0) {
      throw new Error('[Firestore][createTransferWithHistory] Resposta inválida do servidor.');
    }
    return payload.id;
  },
};
