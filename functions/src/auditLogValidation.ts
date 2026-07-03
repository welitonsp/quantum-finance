/**
 * auditLogValidation.ts — Validação pura (server-trusted) do payload da callable
 * `logAuditEvent`. Sem Admin SDK, sem I/O — 100% testável via `node --test`.
 *
 * P2 hardening (2026-07-02): BULK_UPDATE/UNDO_BULK_UPDATE de `users/{uid}/audit_logs`
 * migraram de escrita client-side direta para esta callable, fechando o self-forgery
 * que existia nas Rules. ADD/UPDATE/DELETE_RECURRING e IMPORT_TRANSACTION permanecem
 * client-side (ver comentários em firestore.rules e functions/src/index.ts).
 */

export const AUDIT_LOG_ALLOWED_ACTIONS = new Set(['BULK_UPDATE', 'UNDO_BULK_UPDATE']);

export class AuditLogValidationError extends Error {
  code: string;
  constructor(message: string) {
    super(message);
    this.name = 'AuditLogValidationError';
    this.code = 'invalid-argument';
  }
}

export interface ValidatedAuditLogPayload {
  action:   'BULK_UPDATE' | 'UNDO_BULK_UPDATE';
  entity:   'TRANSACTION';
  details?: string;
  metadata?: { count: number; changes: unknown[] };
}

function invalidAuditLogArgument(message: string): never {
  throw new AuditLogValidationError(message);
}

function assertPlainObject(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    invalidAuditLogArgument('Payload deve ser um objeto.');
  }
  return value as Record<string, unknown>;
}

export function validateAuditLogPayload(rawData: unknown): ValidatedAuditLogPayload {
  const data = assertPlainObject(rawData);

  const action = data['action'];
  if (typeof action !== 'string' || !AUDIT_LOG_ALLOWED_ACTIONS.has(action)) {
    invalidAuditLogArgument('action deve ser BULK_UPDATE ou UNDO_BULK_UPDATE.');
  }

  if (data['entity'] !== 'TRANSACTION') {
    invalidAuditLogArgument('entity deve ser TRANSACTION.');
  }

  let details: string | undefined;
  if ('details' in data && data['details'] !== undefined) {
    const value = data['details'];
    if (typeof value !== 'string' || value.length < 1 || value.length > 500) {
      invalidAuditLogArgument('details deve ser uma string entre 1 e 500 caracteres.');
    }
    details = value as string;
  }

  let metadata: { count: number; changes: unknown[] } | undefined;
  if ('metadata' in data && data['metadata'] !== undefined) {
    const m = data['metadata'];
    if (!m || typeof m !== 'object' || Array.isArray(m)) {
      invalidAuditLogArgument('metadata deve ser um objeto.');
    }
    const mm = m as Record<string, unknown>;
    if (typeof mm['count'] !== 'number') {
      invalidAuditLogArgument('metadata.count deve ser um número.');
    }
    if (!Array.isArray(mm['changes'])) {
      invalidAuditLogArgument('metadata.changes deve ser um array.');
    }
    metadata = { count: mm['count'] as number, changes: mm['changes'] as unknown[] };
  }

  return {
    action: action as 'BULK_UPDATE' | 'UNDO_BULK_UPDATE',
    entity: 'TRANSACTION',
    ...(details  !== undefined ? { details }  : {}),
    ...(metadata !== undefined ? { metadata } : {}),
  };
}
