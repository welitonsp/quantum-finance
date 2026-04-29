import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../api/firebase/index';

// ─── Audit Model (replayable) ─────────────────────────────────────────────────

export type AuditAction = 'BULK_UPDATE' | 'UNDO_BULK_UPDATE';
export type AuditEntity = 'TRANSACTION';

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
};
