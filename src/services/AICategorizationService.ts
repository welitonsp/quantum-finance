import {
  doc, getDoc, setDoc, updateDoc, addDoc,
  collection, increment, serverTimestamp,
  type Timestamp,
} from 'firebase/firestore';
import { db } from '../shared/api/firebase/index';
import { GeminiService } from '../features/ai-chat/GeminiService';

// ─── Constants ────────────────────────────────────────────────────────────────

const DAILY_AI_LIMIT = 50;
const MAX_CONCURRENT = 3;

// ─── Module-level singleton state ─────────────────────────────────────────────
// Keyed by normalized description — safe to share across users (results are
// description-based, not user-specific).

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

// ─── Internal: AI execution via Gemini Cloud Function ────────────────────────

async function runRealAI(description: string): Promise<string> {
  try {
    const result = await GeminiService.categorizeTransactionsBatch([
      { id: '__single__', description }
    ]);
    const cat = result?.[0]?.category;
    // FIX P1.7: usa Gemini real via Cloud Function (não mais mock)
    return (typeof cat === 'string' && cat.trim()) ? cat : 'Outros';
  } catch {
    // Nunca propagar erro — fail-safe é 'Outros'
    return 'Outros';
  }
}

async function execute(entry: QueueEntry): Promise<void> {
  try {
    const cat = await runRealAI(entry.key);
    cache.set(entry.key, cat);
    entry.resolve(cat); // resolve wrapper handles inFlight cleanup + logging
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

// ─── Internal: Firestore rate limiting ───────────────────────────────────────

async function checkAndIncrementUsage(uid: string): Promise<boolean> {
  try {
    const ref   = doc(db, 'users', uid, 'usage', 'ai_calls');
    const snap  = await getDoc(ref);
    const now   = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    if (!snap.exists()) {
      await setDoc(ref, { count: 1, lastReset: serverTimestamp() });
      return true;
    }

    const data        = snap.data();
    const lastResetMs = (data['lastReset'] as Timestamp | undefined)?.toMillis?.() ?? 0;

    if (now - lastResetMs > dayMs) {
      // New day — reset counter atomically
      await setDoc(ref, { count: 1, lastReset: serverTimestamp() });
      return true;
    }

    if ((data['count'] as number | undefined ?? 0) >= DAILY_AI_LIMIT) return false;

    await updateDoc(ref, { count: increment(1) });
    return true;
  } catch {
    // Rate limit check errors never block the caller — fail open
    return true;
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
 * Returns a category for the given description via the AI mock.
 *
 * Guarantees:
 * - Cache hits bypass rate limit and network entirely
 * - In-flight key is reserved synchronously before any await, preventing races
 * - Daily rate limit (DAILY_AI_LIMIT) checked per-user via Firestore
 * - Max MAX_CONCURRENT calls run simultaneously
 * - Never throws — always returns 'Outros' on any failure
 */
export async function categorizeWithAI(
  description: string,
  uid:         string
): Promise<string> {
  try {
    const key = normalize(description);
    if (!key) return 'Outros';

    // 1. Cache hit — no network, no rate limit increment
    const cached = cache.get(key);
    if (cached !== undefined) return cached;

    // 2. In-flight dedup — return shared promise for identical concurrent calls
    const flying = inFlight.get(key);
    if (flying) return flying;

    // 3. Reserve key synchronously BEFORE any await — prevents race conditions
    //    where two callers both miss the inFlight check during async gaps.
    let externalResolve!: (cat: string) => void;
    const promise = new Promise<string>(res => { externalResolve = res; });
    inFlight.set(key, promise);

    // 4. Rate limit check (async — Firestore read)
    const allowed = await checkAndIncrementUsage(uid);
    if (!allowed) {
      inFlight.delete(key);
      externalResolve('Outros');
      void writeSystemLog(uid, 'ERROR', `daily AI limit reached (${DAILY_AI_LIMIT}/day)`);
      return promise;
    }

    // 5. Queue with concurrency control
    //    Resolve wrapper handles cleanup + logging so execute() stays generic.
    waiting.push({
      key,
      resolve: (cat: string) => {
        inFlight.delete(key);
        void writeSystemLog(uid, 'AI_CALL', `${key} → ${cat}`);
        externalResolve(cat);
      },
    });
    drain();

    return promise;
  } catch {
    // Global fail-safe — UI must never crash because of AI categorization
    return 'Outros';
  }
}
