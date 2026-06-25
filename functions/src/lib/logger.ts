export const SAFE_FUNCTION_ERROR_MESSAGES = Object.freeze({
  rate_limit_check: 'Rate limit check failed',
  structured_log_write: 'Structured log write failed',
  ai_batch_categorization: 'AI categorization failed',
  ai_chat: 'AI chat failed',
  ai_audit_report: 'AI audit report failed',
});

const SAFE_ERROR_CODE_RE = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const SAFE_ERROR_NAME_RE = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const MAX_DETAIL_LEN = 200;

type SafeFunctionErrorContext = keyof typeof SAFE_FUNCTION_ERROR_MESSAGES;

export interface SanitizedFunctionError {
  status: 'error';
  context: SafeFunctionErrorContext | 'unknown_error';
  code: string;
  message: string;
  // Safe technical fields (never PII): the error class name when it is a plain
  // identifier (e.g. 'Error', 'FirebaseError').
  name?: string;
  // Emulator-only diagnostics. Never emitted in production (gated on
  // FUNCTIONS_EMULATOR). `detail` is the redacted+truncated original message;
  // `env` exposes only presence booleans for the local Firestore wiring.
  detail?: string;
  env?: { firestoreEmulatorHost: boolean; projectId: boolean };
}

function isSafeErrorContext(context: unknown): context is SafeFunctionErrorContext {
  return typeof context === 'string'
    && Object.prototype.hasOwnProperty.call(SAFE_FUNCTION_ERROR_MESSAGES, context);
}

function isEmulator(): boolean {
  return process.env.FUNCTIONS_EMULATOR === 'true';
}

export function safeErrorCode(error: unknown): string {
  if (!error || typeof error !== 'object' || typeof (error as { code?: unknown }).code !== 'string') {
    return 'internal_error';
  }
  const code = (error as { code: string }).code.trim();
  return SAFE_ERROR_CODE_RE.test(code) ? code.toLowerCase() : 'internal_error';
}

export function safeErrorName(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || typeof (error as { name?: unknown }).name !== 'string') {
    return undefined;
  }
  const name = (error as { name: string }).name.trim();
  return SAFE_ERROR_NAME_RE.test(name) ? name : undefined;
}

export function safeErrorContext(context: unknown): SafeFunctionErrorContext | 'unknown_error' {
  return isSafeErrorContext(context) ? context : 'unknown_error';
}

// Best-effort redaction for the EMULATOR-ONLY detail string. This never runs in
// production (callers gate on the emulator), but we still strip the obvious
// sensitive shapes so local logs cannot accidentally surface them.
function redactSensitive(text: string): string {
  return text
    .replace(/users\/[^/\s]+/gi, 'users/<uid>')
    .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, '<cpf>')
    .replace(/AIza[0-9A-Za-z_-]{10,}/g, '<key>')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer <token>')
    .replace(/\b[0-9a-f]{16,}\b/gi, '<hash>');
}

function emulatorSafeDetail(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const message = (error as { message?: unknown }).message;
  if (typeof message !== 'string' || message.length === 0) return undefined;
  return redactSensitive(message).slice(0, MAX_DETAIL_LEN);
}

function emulatorEnvDiagnostics(): { firestoreEmulatorHost: boolean; projectId: boolean } {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  return {
    firestoreEmulatorHost: typeof host === 'string' && host.length > 0,
    projectId: Boolean(process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT),
  };
}

export function sanitizeFunctionError(context: unknown, error: unknown): SanitizedFunctionError {
  const safeContext = safeErrorContext(context);
  const messages: Record<string, string> = SAFE_FUNCTION_ERROR_MESSAGES;
  const out: SanitizedFunctionError = {
    status: 'error',
    context: safeContext,
    code: safeErrorCode(error),
    message: messages[safeContext] ?? 'Operation failed',
  };

  const name = safeErrorName(error);
  if (name) out.name = name;

  // Emulator-only diagnostics — kept out of production logs entirely.
  if (isEmulator()) {
    const detail = emulatorSafeDetail(error);
    if (detail) out.detail = detail;
    if (safeContext === 'rate_limit_check') out.env = emulatorEnvDiagnostics();
  }

  return out;
}

export function safeSystemLogDetail(context: unknown): string {
  const safeContext = safeErrorContext(context);
  const messages: Record<string, string> = SAFE_FUNCTION_ERROR_MESSAGES;
  return messages[safeContext] ?? 'Operation failed';
}
