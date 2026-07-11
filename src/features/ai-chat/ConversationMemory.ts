// src/features/ai-chat/ConversationMemory.ts
// Stores the last N conversation turns for context continuity.
//
// Privacidade (finding M-03/F-10): falas do chat podem conter dados financeiros.
// Persistência agora é EFÊMERA por padrão:
//  - sessionStorage (escopo da aba; some ao fechar/encerrar a sessão do navegador),
//  - TTL de 24h (falas antigas são descartadas na leitura),
//  - purga de qualquer resíduo legado em localStorage (migração one-way),
//  - `purgeAll()` para logout / exclusão de conta LGPD.

export interface ConversationTurn {
  role:      'user' | 'assistant';
  content:   string;
  timestamp: string; // ISO-8601
}

const MAX_TURNS  = 10;
const KEY_PREFIX = 'qf_conversation_';
/** Falas mais antigas que isto são descartadas na leitura. */
const TTL_MS = 24 * 60 * 60 * 1000; // 24h

/** Acesso a sessionStorage com guarda (SSR / modo privado / storage desabilitado). */
function sessionStore(): Storage | null {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage : null;
  } catch {
    return null;
  }
}

function isFresh(turn: ConversationTurn, now: number): boolean {
  const t = Date.parse(turn.timestamp);
  // Sem timestamp válido → trata como fresca (não descarta por erro de parse).
  return Number.isNaN(t) ? true : now - t <= TTL_MS;
}

export class ConversationMemory {
  private readonly storageKey: string;

  constructor(uid: string) {
    this.storageKey = `${KEY_PREFIX}${uid}`;
    // Migração: remove qualquer resíduo persistido em localStorage por versões anteriores.
    ConversationMemory.purgeLegacyLocalStorage(this.storageKey);
  }

  /** Returns all stored turns (oldest first), já filtradas por TTL. */
  getHistory(): ConversationTurn[] {
    const store = sessionStore();
    if (!store) return [];
    try {
      const raw = store.getItem(this.storageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      const now   = Date.now();
      const fresh = (parsed as ConversationTurn[]).filter(t => isFresh(t, now));
      // Reescreve se o TTL removeu algo (mantém o storage enxuto).
      if (fresh.length !== (parsed as ConversationTurn[]).length) this.saveHistory(fresh);
      return fresh;
    } catch {
      return [];
    }
  }

  /** Appends a new turn, then trims to MAX_TURNS. */
  append(turn: ConversationTurn): void {
    try {
      const history = this.getHistory();
      history.push(turn);
      this.saveHistory(history);
    } catch {
      // storage unavailable — silently ignore
    }
  }

  /** Removes all stored turns for this user. */
  clear(): void {
    try {
      sessionStore()?.removeItem(this.storageKey);
    } catch {
      // silently ignore
    }
  }

  /** Trims stored history to MAX_TURNS (keeps the most recent). */
  trimToLimit(): void {
    try {
      const history = this.getHistory();
      if (history.length > MAX_TURNS) {
        this.saveHistory(history.slice(-MAX_TURNS));
      }
    } catch {
      // silently ignore
    }
  }

  /**
   * Remove TODA memória de conversa (todos os uids) de sessionStorage e localStorage.
   * Chamar no logout e na exclusão de conta (LGPD).
   */
  static purgeAll(): void {
    for (const getStore of [() => sessionStore(), () => { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; } }]) {
      const store = getStore();
      if (!store) continue;
      try {
        const keys: string[] = [];
        for (let i = 0; i < store.length; i++) {
          const k = store.key(i);
          if (k && k.startsWith(KEY_PREFIX)) keys.push(k);
        }
        keys.forEach(k => store.removeItem(k));
      } catch {
        // silently ignore
      }
    }
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  private static purgeLegacyLocalStorage(key: string): void {
    try {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
    } catch {
      // silently ignore
    }
  }

  private saveHistory(history: ConversationTurn[]): void {
    const store = sessionStore();
    if (!store) return;
    const trimmed = history.slice(-MAX_TURNS);
    store.setItem(this.storageKey, JSON.stringify(trimmed));
  }
}
