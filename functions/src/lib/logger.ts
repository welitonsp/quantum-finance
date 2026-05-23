export const SAFE_FUNCTION_ERROR_MESSAGES = Object.freeze({
  rate_limit_check: 'Rate limit check failed',
  structured_log_write: 'Structured log write failed',
  ai_batch_categorization: 'AI categorization failed',
  ai_chat: 'AI chat failed',
  ai_audit_report: 'AI audit report failed',
});

const SAFE_ERROR_CODE_RE = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

type SafeFunctionErrorContext = keyof typeof SAFE_FUNCTION_ERROR_MESSAGES;

function isSafeErrorContext(context: unknown): context is SafeFunctionErrorContext {
  return typeof context === 'string'
    && Object.prototype.hasOwnProperty.call(SAFE_FUNCTION_ERROR_MESSAGES, context);
}

export function safeErrorCode(error: unknown): string {
  if (!error || typeof error !== 'object' || typeof (error as { code?: unknown }).code !== 'string') {
    return 'internal_error';
  }
  const code = (error as { code: string }).code.trim();
  return SAFE_ERROR_CODE_RE.test(code) ? code.toLowerCase() : 'internal_error';
}

export function safeErrorContext(context: unknown): SafeFunctionErrorContext | 'unknown_error' {
  return isSafeErrorContext(context) ? context : 'unknown_error';
}

export function sanitizeFunctionError(context: unknown, error: unknown): {
  status: 'error';
  context: SafeFunctionErrorContext | 'unknown_error';
  code: string;
  message: string;
} {
  const safeContext = safeErrorContext(context);
  const messages: Record<string, string> = SAFE_FUNCTION_ERROR_MESSAGES;
  return {
    status: 'error',
    context: safeContext,
    code: safeErrorCode(error),
    message: messages[safeContext] ?? 'Operation failed',
  };
}

export function safeSystemLogDetail(context: unknown): string {
  const safeContext = safeErrorContext(context);
  const messages: Record<string, string> = SAFE_FUNCTION_ERROR_MESSAGES;
  return messages[safeContext] ?? 'Operation failed';
}
