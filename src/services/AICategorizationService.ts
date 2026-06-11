import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../shared/api/firebase/index';
import { GeminiService } from '../features/ai-chat/GeminiService';
import { ALLOWED_CATEGORIES } from '../shared/schemas/financialSchemas';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_CONCURRENT = 3;

// ─── Module-level singleton state ─────────────────────────────────────────────

const normalize = (text: string): string =>
  text
    .toLowerCase()
    .replace(/\d+/g, '')
    .replace(/[^\w\s]/g, '')
    .trim();

const cache    = new Map<string, string>();
const inFlight = new Map<string, Promise<string>>();

let active = 0;

interface QueueEntry {
  key:     string;
  resolve: (category: string) => void;
}
const waiting: QueueEntry[] = [];

function safeCategory(category: string | undefined): string {
  return ALLOWED_CATEGORIES.includes(category as (typeof ALLOWED_CATEGORIES)[number])
    ? category!
    : 'Outros';
}

// ─── Internal: AI execution via Gemini Cloud Function ────────────────────────

async function runRealAI(description: string): Promise<string> {
  try {
    const result = await GeminiService.categorizeTransactionsBatch([
      { id: '__single__', description }
    ]);
    const cat = result?.[0]?.category;
    return safeCategory(typeof cat === 'string' ? cat.trim() : undefined);
  } catch {
    return 'Outros';
  }
}

async function execute(entry: QueueEntry): Promise<void> {
  try {
    const cat = await runRealAI(entry.key);
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

// ─── Internal: structured logging ────────────────────────────────────────────

async function writeSystemLog(
  uid:    string,
  type:   'AI_CALL' | 'ERROR' | 'BATCH',
  detail: string
): Promise<void> {
  try {
    await addDoc(collection(db, 'users', uid, 'system_logs'), {
      type,
      detail,
      createdAt: serverTimestamp(),
    });
  } catch {
    // Logging failure is never critical — silently ignored
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns a category for the given description via the AI Cloud Function.
 *
 * Guarantees:
 * - Cache hits bypass network entirely
 * - In-flight key reserved synchronously, preventing duplicate concurrent calls
 * - Daily rate limit enforced server-side (Cloud Function atomic transaction)
 * - Max MAX_CONCURRENT calls run simultaneously
 * - Never throws — always returns 'Outros' on any failure
 *
 * Note: rate limiting is enforced exclusively server-side. A client-side
 * pre-check was removed because it caused each call to consume 2 quota units
 * instead of 1 (client increment + server increment = effective limit of 25/day).
 */
export async function categorizeWithAI(
  description: string,
  uid:         string
): Promise<string> {
  try {
    const key = normalize(description);
    if (!key) return 'Outros';

    // 1. Cache hit — no network
    const cached = cache.get(key);
    if (cached !== undefined) return cached;

    // 2. In-flight dedup — share promise for identical concurrent calls
    const flying = inFlight.get(key);
    if (flying) return flying;

    // 3. Reserve key synchronously BEFORE any await — prevents race conditions
    let externalResolve!: (cat: string) => void;
    const promise = new Promise<string>(res => { externalResolve = res; });
    inFlight.set(key, promise);

    // 4. Queue with concurrency control
    waiting.push({
      key,
      resolve: (cat: string) => {
        inFlight.delete(key);
        void writeSystemLog(uid, 'AI_CALL', 'ai_category_completed');
        externalResolve(cat);
      },
    });
    drain();

    return promise;
  } catch {
    return 'Outros';
  }
}
