import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConversationMemory } from './ConversationMemory';

const KEY = 'qf_conversation_u1';

function turn(content: string, timestamp = new Date().toISOString()) {
  return { role: 'user' as const, content, timestamp };
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});
afterEach(() => vi.useRealTimers());

describe('ConversationMemory — persistência efêmera', () => {
  it('usa sessionStorage (não localStorage)', () => {
    const mem = new ConversationMemory('u1');
    mem.append(turn('olá'));
    expect(sessionStorage.getItem(KEY)).not.toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('purga resíduo legado em localStorage ao construir', () => {
    localStorage.setItem(KEY, JSON.stringify([turn('antigo')]));
    const mem = new ConversationMemory('u1');
    void mem;
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('append + getHistory mantêm a ordem e limitam a 10', () => {
    const mem = new ConversationMemory('u1');
    for (let i = 0; i < 12; i++) mem.append(turn(`m${i}`));
    const hist = mem.getHistory();
    expect(hist).toHaveLength(10);
    expect(hist[0]!.content).toBe('m2');
    expect(hist[9]!.content).toBe('m11');
  });

  it('descarta falas mais antigas que o TTL de 24h', () => {
    const mem = new ConversationMemory('u1');
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    const fresh = new Date().toISOString();
    // grava direto no storage para simular histórico antigo
    sessionStorage.setItem(KEY, JSON.stringify([turn('velha', old), turn('nova', fresh)]));
    const hist = mem.getHistory();
    expect(hist.map(t => t.content)).toEqual(['nova']);
  });

  it('clear remove a memória do usuário', () => {
    const mem = new ConversationMemory('u1');
    mem.append(turn('x'));
    mem.clear();
    expect(mem.getHistory()).toEqual([]);
  });
});

describe('ConversationMemory.purgeAll', () => {
  it('remove todas as memórias (todos os uids) de session e localStorage', () => {
    sessionStorage.setItem('qf_conversation_a', '[]');
    sessionStorage.setItem('qf_conversation_b', '[]');
    localStorage.setItem('qf_conversation_c', '[]');
    sessionStorage.setItem('outra_chave', 'manter');

    ConversationMemory.purgeAll();

    expect(sessionStorage.getItem('qf_conversation_a')).toBeNull();
    expect(sessionStorage.getItem('qf_conversation_b')).toBeNull();
    expect(localStorage.getItem('qf_conversation_c')).toBeNull();
    expect(sessionStorage.getItem('outra_chave')).toBe('manter'); // não mexe em chaves alheias
  });
});
