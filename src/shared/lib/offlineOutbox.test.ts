import { afterEach, describe, expect, it, vi } from 'vitest';
import { outboxPut, outboxDelete, outboxList } from './offlineOutbox';

// jsdom não implementa IndexedDB — o módulo deve degradar graciosamente (fail-safe),
// para que a criação de transação NUNCA quebre por causa do outbox.
describe('offlineOutbox — fail-safe sem IndexedDB', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('put/delete resolvem sem lançar e list retorna [] quando IndexedDB ausente', async () => {
    await expect(
      outboxPut({ idempotencyKey: 'k1', uid: 'u1', data: { description: 'x' }, createdAt: 1 }),
    ).resolves.toBeUndefined();
    await expect(outboxDelete('k1')).resolves.toBeUndefined();
    await expect(outboxList('u1')).resolves.toEqual([]);
  });

  it('não lança mesmo se indexedDB.open estourar', async () => {
    vi.stubGlobal('indexedDB', {
      open: () => { throw new Error('boom'); },
    } as unknown as IDBFactory);
    await expect(outboxPut({ idempotencyKey: 'k2', uid: 'u1', data: {}, createdAt: 2 })).resolves.toBeUndefined();
    await expect(outboxList('u1')).resolves.toEqual([]);
  });
});
