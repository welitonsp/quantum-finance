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
import { getSupabase } from '../api/supabase/client';
import { logSanitizedFirebaseError } from '../lib/firebaseErrorHandling';
import { DATA_BACKEND } from '../config/backend';

const transferRepoFirebase = {
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

/**
 * Supabase: a RPC create_transfer (security definer, migrações 0001/0003) grava a
 * transação 'transferencia' e move os saldos das duas contas na mesma transação
 * SQL, com idempotência por chave e histórico por trigger.
 */
export const transferRepoSupabase: typeof transferRepoFirebase = {
  async createTransferWithHistory(uid: string, data: TransferCreateDTO): Promise<string> {
    if (!uid) throw new Error('Usuário não autenticado.');
    const parsed = TransferCreateDTOSchema.safeParse(data);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? 'Transferência inválida.');
    }
    const { fromAccountId, toAccountId, value_cents, date, description } = parsed.data;
    const { data: id, error } = await getSupabase().rpc('create_transfer', {
      p_from_account_id: fromAccountId,
      p_to_account_id: toAccountId,
      p_value_cents: Math.abs(value_cents),
      p_date: date,
      p_description: description?.trim() || null,
      p_idempotency_key: crypto.randomUUID(),
    });
    if (error || typeof id !== 'string' || id.length === 0) {
      logSanitizedFirebaseError('transaction_add', error);
      throw new Error('Não foi possível concluir a transferência.');
    }
    return id;
  },
};

/** Repositório ativo, escolhido no build (VITE_AUTH_PROVIDER). */
export const transferRepo: typeof transferRepoFirebase =
  DATA_BACKEND === 'supabase' ? transferRepoSupabase : transferRepoFirebase;
