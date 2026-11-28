import { describe, expect, it, vi } from 'vitest';
import { sharedRead } from './useSupabaseTable';

const ok = (data: unknown) => () => Promise.resolve({ data, error: null });

describe('sharedRead — leituras idênticas na mesma tarefa', () => {
  it('junta pedidos com a mesma chave feitos na mesma tarefa', async () => {
    const run = vi.fn(ok([1]));
    const [a, b, c] = await Promise.all([
      sharedRead('u|categories', run),
      sharedRead('u|categories', run),
      sharedRead('u|categories', run),
    ]);
    expect(run).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(a.data).toEqual([1]);
  });

  it('não junta chaves diferentes (outro usuário ou tabela)', async () => {
    const run = vi.fn(ok([]));
    await Promise.all([
      sharedRead('u1|categories', run),
      sharedRead('u2|categories', run),
      sharedRead('u1|goals', run),
    ]);
    expect(run).toHaveBeenCalledTimes(3);
  });

  it('faz nova consulta em tarefa seguinte, mesmo com a anterior pendente', async () => {
    let resolveFirst: (v: { data: unknown; error: unknown }) => void = () => {};
    const slow = vi.fn(() => new Promise<{ data: unknown; error: unknown }>((r) => { resolveFirst = r; }));
    const first = sharedRead('u|accounts', slow);
    await new Promise((r) => setTimeout(r, 0)); // próxima tarefa
    const fast = vi.fn(ok(['novo']));
    const second = sharedRead('u|accounts', fast);
    expect(fast).toHaveBeenCalledTimes(1);
    expect((await second).data).toEqual(['novo']);
    resolveFirst({ data: ['antigo'], error: null });
    expect((await first).data).toEqual(['antigo']);
  });

  it('libera a chave quando a leitura termina', async () => {
    const run = vi.fn(ok([]));
    await sharedRead('u|budgets', run);
    await sharedRead('u|budgets', run);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('repassa o erro da consulta a todos que juntaram', async () => {
    const failure = { message: 'falhou' };
    const run = vi.fn(() => Promise.resolve({ data: null, error: failure }));
    const [a, b] = await Promise.all([sharedRead('u|debts', run), sharedRead('u|debts', run)]);
    expect(run).toHaveBeenCalledTimes(1);
    expect(a.error).toBe(failure);
    expect(b.error).toBe(failure);
  });
});
