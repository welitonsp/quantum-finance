import { describe, it, expect, vi, beforeEach } from 'vitest';

type Handler = () => void;
let handlers: Handler[] = [];
let statusCb: ((s: string) => void) | undefined;
let subscribed = false;
const channel = {
  on: vi.fn((_ev: string, _cfg: unknown, h: Handler) => {
    // supabase-js recusa .on depois do subscribe — o mesmo erro que derrubava o app
    if (subscribed) throw new Error('cannot add `postgres_changes` callbacks after `subscribe()`');
    handlers.push(h);
    return channel;
  }),
  subscribe: vi.fn((cb: (s: string) => void) => { subscribed = true; statusCb = cb; return channel; }),
};
const client = {
  channel: vi.fn(() => channel),
  removeChannel: vi.fn(() => Promise.resolve()),
};
vi.mock('../client', () => ({ getSupabase: () => client }));

import { subscribeSharedChannel } from '../sharedChannel';

const watch = [{ table: 'categories', filter: 'user_id=eq.u1' }];

describe('subscribeSharedChannel', () => {
  beforeEach(() => {
    handlers = []; statusCb = undefined; subscribed = false;
    vi.clearAllMocks();
  });

  it('dois assinantes do mesmo nome dividem um canal e ambos recebem eventos', () => {
    const a = vi.fn(); const b = vi.fn();
    const subA = vi.fn(); const subB = vi.fn();
    const leaveA = subscribeSharedChannel('categories:u1', watch, a, subA);
    const leaveB = subscribeSharedChannel('categories:u1', watch, b, subB);
    expect(client.channel).toHaveBeenCalledTimes(1);
    expect(channel.on).toHaveBeenCalledTimes(1);
    expect(channel.on.mock.calls[0]?.[1]).toEqual({ event: '*', schema: 'public', table: 'categories', filter: 'user_id=eq.u1' });

    handlers[0]?.();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    statusCb?.('SUBSCRIBED');
    expect(subA).toHaveBeenCalledTimes(1);
    expect(subB).toHaveBeenCalledTimes(1);

    leaveA();
    expect(client.removeChannel).not.toHaveBeenCalled();
    handlers[0]?.();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);
    leaveB();
    expect(client.removeChannel).toHaveBeenCalledTimes(1);
  });

  it('o mesmo callback em duas telas conta como dois assinantes; depois de fechar, reabre', () => {
    const fn = vi.fn();
    const leave1 = subscribeSharedChannel('accounts:u1', watch, fn);
    const leave2 = subscribeSharedChannel('accounts:u1', watch, fn);
    leave1();
    expect(client.removeChannel).not.toHaveBeenCalled();
    leave2();
    expect(client.removeChannel).toHaveBeenCalledTimes(1);

    subscribed = false;
    subscribeSharedChannel('accounts:u1', watch, fn)();
    expect(client.channel).toHaveBeenCalledTimes(2);
  });
});
