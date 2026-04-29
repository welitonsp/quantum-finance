import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../api/firebase/index';

// ─── Audit Model (replayable) ─────────────────────────────────────────────────

export type AuditAction = 'BULK_UPDATE' | 'UNDO_BULK_UPDATE';
export type AuditEntity = 'TRANSACTION';

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
  id?:       string;
  userId:    string;
  action:    AuditAction;
  entity:    AuditEntity;
  details:   string;
  metadata:  AuditMetadata;
  createdAt: ReturnType<typeof serverTimestamp>;
  timestamp?: ReturnType<typeof serverTimestamp>;
  schemaVersion: 2;
}

type AuditLogInput = Omit<AuditLog, 'id' | 'createdAt' | 'schemaVersion'>;

// ─── AuditService ─────────────────────────────────────────────────────────────

export const AuditService = {
  /**
   * Persiste um log de auditoria em users/{userId}/audit_logs.
   *
   * - Isolamento por usuário (segurança + escalabilidade)
   * - serverTimestamp() garante integridade temporal (sem drift de cliente)
   * - Estrutura replayable: cada entrada tem { id, from, to }
   * - FAIL SILENT — nunca lança erro nem bloqueia o fluxo principal
   */
  async logAction(log: AuditLogInput): Promise<void> {
    if (!log.userId) {
      if (import.meta.env.DEV) {
        console.warn('[AuditService] logAction ignorado: userId ausente.');
      }
      return;
    }

    try {
      const ref = collection(db, 'users', log.userId, 'audit_logs');
      await addDoc(ref, {
        action:        log.action,
        entity:        log.entity,
        details:       log.details,
        metadata:      log.metadata,
        createdAt:     serverTimestamp(),
        schemaVersion: 2,
      });
    } catch (error) {
      // FAIL SILENT — UI nunca quebra por falha de auditoria
      if (import.meta.env.DEV) {
        console.warn('[AuditService] log failed:', error);
      }
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
        console.warn('[AuditService] logTransactionHistory ignorado: uid ou txId ausente.');
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
      if (event.correlationId)                      payload['correlationId'] = event.correlationId;
      if (event.importHash)                         payload['importHash']    = event.importHash;
      if (event.amount_cents !== undefined)         payload['amount_cents']  = event.amount_cents;
      if (event.category)                           payload['category']      = event.category;
      await addDoc(histRef, payload);
    } catch (error) {
      // FAIL SILENT — UI nunca quebra por falha de auditoria
      if (import.meta.env.DEV) {
        console.warn('[AuditService] logTransactionHistory failed:', error);
      }
    }
  },
};
