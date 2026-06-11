// src/features/ai-chat/ConversationMemory.ts
// Stores the last N conversation turns in localStorage for context continuity.

export interface ConversationTurn {
  role:      'user' | 'assistant';
  content:   string;
  timestamp: string; // ISO-8601
}

const MAX_TURNS  = 10;
const KEY_PREFIX = 'qf_conversation_';

export class ConversationMemory {
  private readonly storageKey: string;

  constructor(uid: string) {
    this.storageKey = `${KEY_PREFIX}${uid}`;
  }

  /** Returns all stored turns (oldest first). */
  getHistory(): ConversationTurn[] {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed as ConversationTurn[];
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
      // localStorage unavailable — silently ignore
    }
  }

  /** Removes all stored turns for this user. */
  clear(): void {
    try {
      localStorage.removeItem(this.storageKey);
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

  // ─── Private ────────────────────────────────────────────────────────────────

  private saveHistory(history: ConversationTurn[]): void {
    const trimmed = history.slice(-MAX_TURNS);
    localStorage.setItem(this.storageKey, JSON.stringify(trimmed));
  }
}
