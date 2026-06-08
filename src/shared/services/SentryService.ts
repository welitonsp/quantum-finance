import * as Sentry from '@sentry/react';

const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;
const ENV = import.meta.env.MODE; // 'production' | 'development' | 'test'

// Fields that must never reach Sentry (PII / financeiro)
const SCRUB_KEYS = [
  'uid', 'userId', 'email', 'displayName', 'photoURL',
  'value', 'value_cents', 'amount', 'amount_cents',
  'description', 'importHash', 'fitId',
  'before', 'after', 'changedFields',
  'password', 'token', 'secret', 'key', 'apiKey',
];

function scrubObject(obj: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SCRUB_KEYS.some(bad => k.toLowerCase().includes(bad.toLowerCase()))) {
      clean[k] = '[Filtered]';
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      clean[k] = scrubObject(v as Record<string, unknown>);
    } else {
      clean[k] = v;
    }
  }
  return clean;
}

export function initSentry(): void {
  if (!DSN || ENV !== 'production') return;

  Sentry.init({
    dsn: DSN,
    environment: ENV,
    // Capture 10% of sessions for performance monitoring in prod
    tracesSampleRate: 0.1,
    // Never send raw event data — scrub before send
    beforeSend(event) {
      if (event.extra) {
        event.extra = scrubObject(event.extra as Record<string, unknown>);
      }
      if (event.contexts) {
        event.contexts = scrubObject(event.contexts as Record<string, unknown>) as typeof event.contexts;
      }
      // Strip user PII
      delete event.user;
      return event;
    },
    // Ignore noisy browser extension errors
    ignoreErrors: [
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',
      /^Network Error$/,
      /^Failed to fetch$/,
    ],
  });
}

export function captureError(context: string, error: unknown): void {
  if (!DSN || ENV !== 'production') return;
  Sentry.withScope(scope => {
    scope.setTag('context', context);
    Sentry.captureException(error);
  });
}
