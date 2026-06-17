const MAX_LOG_MESSAGE_LENGTH = 240;

export const FIREBASE_ERROR_OPERATIONS = [
  'transaction_add',
  'transaction_update',
  'transaction_delete',
  'transaction_delete_batch',
  'transaction_bulk_update',
  'transaction_bulk_undo',
  'transaction_import',
  'transaction_snapshot',
  'transaction_load_more',
  'transaction_sync',
  'category_settings_save',
  'category_settings_delete',
  'account_create',
  'credit_card_create',
  'credit_card_update',
  'recurring_create',
  'accounts_load',
  'import_parse_worker',
  'simulation_run',
  'simulation_crash',
  'financial_metrics_compute',
  'ai_chat_advice',
  'credit_cards_load',
  'audit_logs_load',
  'audit_logs_load_more',
  'recurring_load',
  'auth_login',
  'auth_login_screen',
  'auth_anonymous_login',
  'app_error_boundary',
  'import_parse',
  'import_reconcile',
  'import_candidate_search',
  'audit_log_action',
  'audit_transaction_history',
  'ai_category',
  'callable_ai_category',
  'callable_ai_chat',
  'callable_ai_report',
  'callable_ai_briefing',
  'firestore_query',
  'data_export',
  'data_delete_subcollections',
  'data_delete_auth_user',
  'data_delete_account',
  'unknown_operation',
  'goals_load',
  'goal_create',
  'goal_delete',
  'installment_group_load',
  'installment_group_cancel',
  'data_processing_log',
  'data_processing_log_read',
  'user_consents_read',
  'user_consents_save',
  'score_history_persist',
  'score_history_load',
  'challenges_load',
  'debt_load',
  'debt_add',
  'debt_update',
  'debt_delete',
  'shopping_lists_load',
  'shopping_list_create',
  'shopping_list_update',
  'shopping_list_delete',
  'price_observations_load',
  'price_observation_add',
  'shared_groups_load',
  'shared_group_create',
  'shared_group_delete',
  'shared_group_invite',
  'shared_expenses_load',
  'shared_expense_add',
  'shared_expense_mark_paid',
  'shared_expense_delete',
  'invoice_payment',
] as const;

export type FirebaseErrorOperation = typeof FIREBASE_ERROR_OPERATIONS[number];

export interface FirebaseErrorLogContext {
  operation: FirebaseErrorOperation;
}

export interface SanitizedFirebaseErrorLog {
  code: string;
  name?: string;
  message?: string;
}

const FIREBASE_ERROR_OPERATION_SET = new Set<string>(FIREBASE_ERROR_OPERATIONS);

const USER_FRIENDLY_MESSAGES = {
  'permission-denied': 'Não foi possível concluir a operação porque as regras de segurança bloquearam a alteração. Atualize a página e tente novamente.',
  'failed-precondition': 'Não foi possível concluir a operação porque os dados precisam ser atualizados antes de salvar. Recarregue as movimentações e tente novamente.',
  unavailable: 'Serviço temporariamente indisponível. Verifique sua conexão e tente novamente em instantes.',
  unknown: 'Não foi possível concluir a operação. Tente novamente e, se o problema persistir, verifique sua conexão.',
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function stringProp(value: unknown, key: string): string {
  if (!isRecord(value)) return '';
  const prop = value[key];
  return typeof prop === 'string' || typeof prop === 'number' ? String(prop) : '';
}

function truncate(value: string): string {
  return value.length > MAX_LOG_MESSAGE_LENGTH
    ? `${value.slice(0, MAX_LOG_MESSAGE_LENGTH - 1)}…`
    : value;
}

function sanitizeMessageForLog(message: string): string {
  return truncate(
    message
      .replace(/\busers\/[^/\s)]+/gi, 'users/[redigido]')
      .replace(/\b(?:uid|userId|user_id)\s*[:=]\s*["']?[^"',\s)}\]]+/gi, 'identificador=[redigido]')
      .replace(/\bimportHash\s*[:=]\s*["']?[A-Za-z0-9_-]{8,}["']?/gi, 'hash_importacao=[redigido]')
      .replace(/\b(?:uid|userId|user_id)\b/gi, 'identificador')
      .replace(/\bimportHash\b/gi, 'hash_importacao')
      .replace(/\b[A-Fa-f0-9]{32,}\b/g, '[hash-redigido]')
      .replace(/\b(?:before|after)\s*[:=]\s*(?:\{[^}]*\}|\[[^\]]*\]|"[^"]*"|'[^']*'|[^,;)\]}]+)/gi, 'historico=[redigido]')
      .replace(/\b(?:payload|transactions?|rawData|fileContent)\s*[:=]\s*(?:\{[^}]*\}|\[[^\]]*\]|"[^"]*"|'[^']*'|[^,;)\]}]+)/gi, 'dados=[redigido]')
      .replace(/\bdescription\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^,;)\]}]+)/gi, 'descricao=[redigido]')
      .replace(/\b(?:value_cents|amount_cents|value)\s*[:=]\s*-?\d+(?:[.,]\d+)?/gi, 'valor=[redigido]')
      .replace(/\s+/g, ' ')
      .trim(),
  );
}

export function getFirebaseErrorCode(error: unknown): string {
  const rawCode = stringProp(error, 'code').trim().toLowerCase();
  if (!rawCode) return 'unknown';

  const parts = rawCode.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? 'unknown';
}

export function sanitizeFirebaseErrorContext(context: unknown): FirebaseErrorLogContext {
  const rawOperation =
    typeof context === 'string'
      ? context
      : isRecord(context)
        ? stringProp(context, 'operation')
        : '';

  return {
    operation: FIREBASE_ERROR_OPERATION_SET.has(rawOperation)
      ? rawOperation as FirebaseErrorOperation
      : 'unknown_operation',
  };
}

export function getUserFriendlyErrorMessage(
  error: unknown,
  context?: FirebaseErrorLogContext | FirebaseErrorOperation,
): string {
  sanitizeFirebaseErrorContext(context);

  const code = getFirebaseErrorCode(error);
  if (code.includes('permission-denied')) return USER_FRIENDLY_MESSAGES['permission-denied'];
  if (code.includes('failed-precondition')) return USER_FRIENDLY_MESSAGES['failed-precondition'];
  if (code.includes('unavailable')) return USER_FRIENDLY_MESSAGES.unavailable;
  return USER_FRIENDLY_MESSAGES.unknown;
}

export function sanitizeErrorForLog(error: unknown): SanitizedFirebaseErrorLog {
  const code = getFirebaseErrorCode(error);
  const sanitized: SanitizedFirebaseErrorLog = { code };

  const name = error instanceof Error ? error.name : stringProp(error, 'name');
  if (name) sanitized.name = sanitizeMessageForLog(name);

  const rawMessage = error instanceof Error
    ? error.message
    : stringProp(error, 'message') || (typeof error === 'string' ? error : '');
  const message = sanitizeMessageForLog(rawMessage);
  if (message) sanitized.message = message;

  return sanitized;
}

export function logSanitizedFirebaseError(
  context: FirebaseErrorLogContext | FirebaseErrorOperation,
  error: unknown,
): void {
  const safeContext = sanitizeFirebaseErrorContext(context);
  console.warn('[FirebaseError]', {
    operation: safeContext.operation,
    ...sanitizeErrorForLog(error),
  });
}
