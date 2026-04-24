// ─── Module-level singleton state ────────────────────────────────────────────
// Safe to be module-level: keyed by normalized description, not by uid.

const normalize = (text: string): string =>
  text
    .toLowerCase()
    .replace(/\d+/g, '')
    .replace(/[^\w\s]/g, '')
    .trim();

/** Result cache: normalized description → category */
const cache = new Map<string, string>();

/** In-flight dedup: prevents duplicate concurrent calls for the same description */
const inFlight = new Map<string, Promise<string>>();

const MAX_CONCURRENT = 3;
let active = 0;

interface QueueEntry {
  key:     string;
  resolve: (category: string) => void;
}
const waiting: QueueEntry[] = [];

function runMockAI(): Promise<string> {
  // Simulates 300–500ms network latency; replace body with real AI call when ready
  const delay = 300 + Math.random() * 200;
  return new Promise<string>(resolve => setTimeout(() => resolve('Outros'), delay));
}

async function execute(entry: QueueEntry): Promise<void> {
  try {
    const cat = await runMockAI();
    cache.set(entry.key, cat);
    entry.resolve(cat);
  } finally {
    active--;
    drain();
  }
}

function drain(): void {
  while (active < MAX_CONCURRENT && waiting.length > 0) {
    const entry = waiting.shift()!;
    active++;
    void execute(entry);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns a category for the given description via the AI mock.
 *
 * Guarantees:
 * - Cached results are returned synchronously (next microtask)
 * - Identical in-flight descriptions share one Promise (no duplicate calls)
 * - At most MAX_CONCURRENT (3) AI calls run simultaneously
 * - Never throws — safe to fire-and-forget
 */
export function categorizeWithAI(description: string): Promise<string> {
  const key = normalize(description);
  if (!key) return Promise.resolve('Outros');

  const cached = cache.get(key);
  if (cached !== undefined) return Promise.resolve(cached);

  const flying = inFlight.get(key);
  if (flying) return flying;

  const promise = new Promise<string>(resolve => {
    waiting.push({ key, resolve });
    drain();
  });

  inFlight.set(key, promise);
  void promise.then(() => inFlight.delete(key));
  return promise;
}
