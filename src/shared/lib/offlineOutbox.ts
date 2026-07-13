// src/shared/lib/offlineOutbox.ts
// F-11 (frente 2) — Outbox DURÁVEL para a criação canônica de transações.
//
// A criação passa pela callable `createTransaction` (server-trusted, Modelo A), que
// NÃO funciona offline. A fila do useTransactions é em memória (perde-se no reload).
// Este outbox persiste a INTENÇÃO de criar (idempotencyKey + payload) em IndexedDB,
// escopada por uid, para reproduzi-la ao voltar online / reabrir o app.
//
// - Replay é seguro: a callable já usa `idempotencyKey` (dedup server-side).
// - Escopo: apenas CRIAÇÃO (update/delete usam escrita direta ao Firestore, já
//   durável via persistentLocalCache — frente 1).
// - Armazenamento em TEXTO PURO (decisão do owner): consistente com o cache do
//   Firestore, que também guarda dados financeiros em IndexedDB sem criptografia.
// - Best-effort e FAIL-SAFE: sem IndexedDB (SSR/test/modo privado), tudo vira no-op
//   e a criação segue pelo caminho online normal.

const DB_NAME = 'qf_offline';
const STORE = 'createOutbox';
const DB_VERSION = 1;

export interface OutboxEntry {
  /** Chave de idempotência — primary key; garante dedup no replay. */
  idempotencyKey: string;
  uid: string;
  /** Payload de criação (dados da transação já normalizados). */
  data: Record<string, unknown>;
  /** Epoch ms de quando foi enfileirado. */
  createdAt: number;
}

function getIndexedDb(): IDBFactory | null {
  try {
    return typeof indexedDB !== 'undefined' ? indexedDB : null;
  } catch {
    return null;
  }
}

function openDb(): Promise<IDBDatabase | null> {
  const factory = getIndexedDb();
  if (!factory) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = factory.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'idempotencyKey' });
          store.createIndex('uid', 'uid', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** Executa uma escrita no store e resolve (void) quando a transação completa. */
function runWrite(fn: (store: IDBObjectStore) => void): Promise<void> {
  return openDb().then((db) => {
    if (!db) return;
    return new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE, 'readwrite');
        fn(tx.objectStore(STORE));
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); resolve(); };
        tx.onabort = () => { db.close(); resolve(); };
      } catch {
        try { db.close(); } catch { /* noop */ }
        resolve();
      }
    });
  }).catch(() => undefined);
}

/** Persiste (ou substitui) uma intenção de criação pendente. */
export function outboxPut(entry: OutboxEntry): Promise<void> {
  return runWrite((store) => { store.put(entry); });
}

/** Remove a intenção após confirmação (ou descarte definitivo). */
export function outboxDelete(idempotencyKey: string): Promise<void> {
  return runWrite((store) => { store.delete(idempotencyKey); });
}

/** Lista as intenções pendentes de um usuário (mais antigas primeiro). */
export function outboxList(uid: string): Promise<OutboxEntry[]> {
  return openDb().then((db) => {
    if (!db) return [];
    return new Promise<OutboxEntry[]>((resolve) => {
      try {
        const tx = db.transaction(STORE, 'readonly');
        const index = tx.objectStore(STORE).index('uid');
        const req = index.getAll(uid);
        req.onsuccess = () => {
          const rows = (req.result as OutboxEntry[]) ?? [];
          rows.sort((a, b) => a.createdAt - b.createdAt);
          db.close();
          resolve(rows);
        };
        req.onerror = () => { db.close(); resolve([]); };
      } catch {
        try { db.close(); } catch { /* noop */ }
        resolve([]);
      }
    });
  }).catch(() => []);
}
