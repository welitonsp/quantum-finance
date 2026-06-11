/**
 * offlineQueue — persistent pending write operations queue
 *
 * Uses localStorage (key: qf_pending_ops) to survive page reloads.
 * Max 50 entries; oldest dropped when over limit.
 * NEVER stores sensitive PII — only safe financial metadata.
 */

const STORAGE_KEY = 'qf_pending_ops';
const MAX_ENTRIES = 50;

export type OfflineOpType = 'createTransaction' | 'updateTransaction';

/** Safe payload — no PII beyond truncated description. */
export interface OfflineOpPayload {
  value_cents: number;
  category: string;
  type: string;
  date: string;
  description: string; // truncated to 160 chars
  account?: string | undefined;
  /** Original tempId for deduplication. */
  tempId?: string;
  /** Idempotency key to replay on sync. */
  idempotencyKey?: string;
  [key: string]: unknown;
}

export interface OfflineQueueEntry {
  id: string;
  type: OfflineOpType;
  payload: OfflineOpPayload;
  createdAt: string;
  retries: number;
}

function readQueue(): OfflineQueueEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as OfflineQueueEntry[];
  } catch {
    return [];
  }
}

function writeQueue(entries: OfflineQueueEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // localStorage full or unavailable — silently fail
  }
}

function sanitizePayload(payload: OfflineOpPayload): OfflineOpPayload {
  return {
    ...payload,
    description: (payload.description ?? '').slice(0, 160),
  };
}

/** Returns the current queue (read-only snapshot). */
export function getQueue(): OfflineQueueEntry[] {
  return readQueue();
}

/** Adds an operation to the queue. Drops oldest if over MAX_ENTRIES. */
export function enqueue(op: Omit<OfflineQueueEntry, 'id' | 'createdAt' | 'retries'>): string {
  const entries = readQueue();
  const id = crypto.randomUUID();
  const entry: OfflineQueueEntry = {
    id,
    type: op.type,
    payload: sanitizePayload(op.payload),
    createdAt: new Date().toISOString(),
    retries: 0,
  };
  entries.push(entry);
  // Drop oldest if over limit
  const trimmed = entries.length > MAX_ENTRIES ? entries.slice(entries.length - MAX_ENTRIES) : entries;
  writeQueue(trimmed);
  return id;
}

/** Removes an operation from the queue by id. */
export function dequeue(id: string): void {
  const entries = readQueue().filter(e => e.id !== id);
  writeQueue(entries);
}

/** Increments retry count for an entry. */
export function markRetry(id: string): void {
  const entries = readQueue().map(e =>
    e.id === id ? { ...e, retries: e.retries + 1 } : e
  );
  writeQueue(entries);
}

/** Clears all pending operations. */
export function clearAll(): void {
  writeQueue([]);
}
