import { describe, expect, it } from 'vitest';
import { isPrivilegedKey, isSupabaseConfigured, resolveSupabaseConfig } from '../client';

const b64url = (obj: unknown) =>
  btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fakeJwt = (role: string) => `${b64url({ alg: 'HS256' })}.${b64url({ role })}.assinatura`;

describe('supabase client config', () => {
  it('sem variáveis: não configurado e sem erro', () => {
    expect(isSupabaseConfigured({})).toBe(false);
    expect(resolveSupabaseConfig({})).toBeNull();
  });

  it('aceita URL https e chave anon', () => {
    const cfg = resolveSupabaseConfig({
      VITE_SUPABASE_URL: 'https://abc.supabase.co/',
      VITE_SUPABASE_ANON_KEY: fakeJwt('anon'),
    });
    expect(cfg?.url).toBe('https://abc.supabase.co');
  });

  it('aceita chave publishable nova', () => {
    expect(isPrivilegedKey('sb_publishable_xyz')).toBe(false);
  });

  it('recusa service_role e sb_secret no bundle', () => {
    expect(isPrivilegedKey(fakeJwt('service_role'))).toBe(true);
    expect(isPrivilegedKey('sb_secret_xyz')).toBe(true);
    expect(() => resolveSupabaseConfig({
      VITE_SUPABASE_URL: 'https://abc.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'sb_secret_xyz',
    })).toThrow(/privilegiada/);
  });

  it('recusa http fora de localhost e não ecoa a chave no erro', () => {
    expect(() => resolveSupabaseConfig({
      VITE_SUPABASE_URL: 'http://abc.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'sb_publishable_segredo',
    })).toThrow(/https/);
    try {
      resolveSupabaseConfig({ VITE_SUPABASE_URL: 'nao-e-url', VITE_SUPABASE_ANON_KEY: 'sb_publishable_segredo' });
    } catch (e) {
      expect(String(e)).not.toContain('segredo');
    }
  });

  it('permite http em localhost (Supabase local)', () => {
    expect(resolveSupabaseConfig({
      VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
      VITE_SUPABASE_ANON_KEY: 'sb_publishable_local',
    })?.url).toBe('http://127.0.0.1:54321');
  });
});
