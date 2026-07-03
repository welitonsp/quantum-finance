import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../api/firebase/index';
import { logSanitizedFirebaseError } from '../lib/firebaseErrorHandling';
import { isSafeOperationId } from '../lib/operationTrace';

// ─── Audit Model (replayable) ─────────────────────────────────────────────────

export type AuditAction = 'IMPORT_TRANSACTION' | 'BULK_UPDATE' | 'UNDO_BULK_UPDATE' | 'ADD_RECURRING' | 'UPDATE_RECURRING' | 'DELETE_RECURRING';
export type AuditEntity = 'TRANSACTION' | 'RECURRING_TASK';

/** Ações de auditoria de transação migradas para a callable server-trusted `logAuditEvent`. */
export type TransactionAuditAction = 'BULK_UPDATE' | 'UNDO_BULK_UPDATE';

// ─── Transaction History Model ────────────────────────────────────────────────

export type TransactionHistoryAction =
  | 'CREATE'
  | 'UPDATE'
  | 'SOFT_DELETE'
  | 'RESTORE'
  | 'BULK_UPDATE'
  | 'UNDO_BULK_UPDATE'
  | 'IMPORT';

/**
 * Evento de histórico por movimentação.
 * Gravado em users/{uid}/transactions/{txId}/history/{historyId}.
 * Nunca inclui userId: o path já isola por usuário.
 */
export interface TransactionHistoryEvent {
  action:        TransactionHistoryAction;
  txId:          string;
  before?:       Record<string, unknown>;
  after?:        Record<string, unknown>;
  changedFields?: string[];
  origin?:       string;
  reason?:       string;
  correlationId?: string;
  importHash?:   string;
  amount_cents?: number;
  category?:     string;
}

/** Uma linha de diff: o que era → o que ficou. */
export interface AuditChange {
  id:    string;
  from:  string;
  to?:   string;
}

export interface AuditMetadata {
  count:   number;
  changes: AuditChange[];
}

export interface AuditLog {
  id?:        string;
  userId:     string;
  action:     AuditAction;
  entity:     AuditEntity;
  details?:   string;
  metadata?:  AuditMetadata;
  createdAt:  ReturnType<typeof serverTimestamp>;
  /** @deprecated Nunca escrito — presente apenas em documentos antigos lidos como fallback em useAuditLogs. */
  timestamp?: ReturnType<typeof serverTimestamp>;
  schemaVersion: 2;
}

type AuditLogInput = Omit<AuditLog, 'id' | 'createdAt' | 'schemaVersion'>;

/**
 * Input restrito a ações de recorrentes (client-side, decisão "P3 controlado"
 * vigente — ver docs/DECISOES-ARQUITETURA.md). BULK_UPDATE/UNDO_BULK_UPDATE
 * NÃO passam mais por logAction — usar logTransactionAudit (callable).
 */
type RecurringAuditLogInput = Omit<AuditLogInput, 'action' | 'entity'> & {
  action: 'ADD_RECURRING' | 'UPDATE_RECURRING' | 'DELETE_RECURRING';
  entity: 'RECURRING_TASK';
};

type TransactionAuditLogInput = {
  action:    TransactionAuditAction;
  entity:    'TRANSACTION';
  details?:  string;
  metadata?: AuditMetadata;
};

// ─── AuditService ─────────────────────────────────────────────────────────────

export const AuditService = {
  /**
   * Persiste um log de auditoria de recorrentes em users/{userId}/audit_logs
   * (ADD_RECURRING/UPDATE_RECURRING/DELETE_RECURRING).
   *
   * - Isolamento por usuário (segurança + escalabilidade)
   * - serverTimestamp() garante integridade temporal (sem drift de cliente)
   * - Estrutura replayable: cada entrada tem { id, from, to }
   * - FAIL SILENT — nunca lança erro nem bloqueia o fluxo principal
   */
  async logAction(log: RecurringAuditLogInput): Promise<void> {
    if (!log.userId) {
      if (import.meta.env.DEV) {
        console.warn('[AuditService] logAction ignorado: identificador ausente.');
      }
      return;
    }

    try {
      const ref = collection(db, 'users', log.userId, 'audit_logs');
      const payload: Record<string, unknown> = {
        action:        log.action,
        entity:        log.entity,
        createdAt:     serverTimestamp(),
        schemaVersion: 2,
      };
      if (log.details  !== undefined) payload['details']  = log.details;
      if (log.metadata !== undefined) payload['metadata'] = log.metadata;
      await addDoc(ref, payload);
    } catch (error) {
      // FAIL SILENT — UI nunca quebra por falha de auditoria
      logSanitizedFirebaseError('audit_log_action', error);
    }
  },

  /**
   * Persiste um log de auditoria de transação (BULK_UPDATE/UNDO_BULK_UPDATE)
   * via a callable server-trusted `logAuditEvent` (Admin SDK). Migrado da
   * escrita client-side direta (P2 hardening 2026-07-02) — fecha o
   * self-forgery em users/{uid}/audit_logs; Rules negam create client-side
   * dessas 2 actions.
   *
   * - FAIL SILENT — nunca lança erro nem bloqueia o fluxo principal
   */
  async logTransactionAudit(log: TransactionAuditLogInput): Promise<void> {
    try {
      const call = httpsCallable<TransactionAuditLogInput, { logged: boolean }>(
        functions, 'logAuditEvent'
      );
      await call(log);
    } catch (error) {
      // FAIL SILENT — UI nunca quebra por falha de auditoria
      logSanitizedFirebaseError('audit_log_transaction_event', error);
    }
  },

  /**
   * Persiste um evento de histórico por movimentação em:
   * users/{uid}/transactions/{txId}/history/{historyId}
   *
   * - Path aninhado isola por usuário + transação (sem userId no doc)
   * - schemaVersion: 1 — modelo distinto do audit_logs global
   * - FAIL SILENT — nunca lança erro nem bloqueia o fluxo principal
   */
  async logTransactionHistory(
    uid:   string,
    txId:  string,
    event: TransactionHistoryEvent,
  ): Promise<void> {
    if (!uid || !txId) {
      if (import.meta.env.DEV) {
        console.warn('[AuditService] logTransactionHistory ignorado: identificador ausente.');
      }
      return;
    }
    try {
      const histRef = collection(db, 'users', uid, 'transactions', txId, 'history');
      const payload: Record<string, unknown> = {
        action:        event.action,
        txId:          event.txId,
        createdAt:     serverTimestamp(),
        schemaVersion: 1,
      };
      if (event.before      !== undefined)          payload['before']        = event.before;
      if (event.after       !== undefined)          payload['after']         = event.after;
      if (event.changedFields?.length)              payload['changedFields'] = event.changedFields;
      if (event.origin)                             payload['origin']        = event.origin;
      if (event.reason)                             payload['reason']        = event.reason;
      if (isSafeOperationId(event.correlationId))    payload['correlationId'] = event.correlationId;
      if (event.importHash)                         payload['importHash']    = event.importHash;
      if (event.amount_cents !== undefined)         payload['amount_cents']  = event.amount_cents;
      if (event.category)                           payload['category']      = event.category;
      await addDoc(histRef, payload);
    } catch (error) {
      // FAIL SILENT — UI nunca quebra por falha de auditoria
      logSanitizedFirebaseError('audit_transaction_history', error);
    }
  },
};
