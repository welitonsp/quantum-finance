import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Cliente Supabase do navegador (migração Firebase → Supabase, etapa 1).
 *
 * Usa só identificadores PÚBLICOS: a URL do projeto e a chave anônima/publishable.
 * A proteção dos dados é a RLS no banco (supabase/migrations), nunca a chave.
 * Chave service_role/secret JAMAIS entra no bundle — o guard abaixo recusa.
 *
 * Criação preguiçosa: enquanto o app ainda roda no Firebase, nada é inicializado
 * sem as variáveis, e nenhuma tela quebra.
 */

export interface SupabasePublicConfig {
  url: string;
  anonKey: string;
}

type EnvLike = Record<string, string | boolean | undefined>;

function readEnv(env: EnvLike): SupabasePublicConfig | null {
  const url = typeof env.VITE_SUPABASE_URL === 'string' ? env.VITE_SUPABASE_URL.trim() : '';
  const anonKey = typeof env.VITE_SUPABASE_ANON_KEY === 'string' ? env.VITE_SUPABASE_ANON_KEY.trim() : '';
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

/** Recusa chaves privilegiadas no bundle (service_role JWT ou sb_secret_). */
export function isPrivilegedKey(key: string): boolean {
  if (key.startsWith('sb_secret_')) return true;
  const parts = key.split('.');
  if (parts.length !== 3) return false;
  try {
    const body = parts[1] ?? '';
    const payload = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/'))) as { role?: unknown };
    return payload.role === 'service_role';
  } catch {
    return false;
  }
}

/** Valida a configuração pública; lança erro sem ecoar o valor da chave. */
export function resolveSupabaseConfig(env: EnvLike): SupabasePublicConfig | null {
  const cfg = readEnv(env);
  if (!cfg) return null;
  let parsed: URL;
  try {
    parsed = new URL(cfg.url);
  } catch {
    throw new Error('VITE_SUPABASE_URL inválida.');
  }
  const isLocal = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  if (parsed.protocol !== 'https:' && !isLocal) {
    throw new Error('VITE_SUPABASE_URL precisa usar https.');
  }
  if (isPrivilegedKey(cfg.anonKey)) {
    throw new Error('Chave privilegiada do Supabase no cliente: use a chave anon/publishable.');
  }
  return { url: parsed.origin, anonKey: cfg.anonKey };
}

let _client: SupabaseClient | null = null;

export function isSupabaseConfigured(env: EnvLike = import.meta.env as EnvLike): boolean {
  return readEnv(env) !== null;
}

/** Devolve o cliente único; lança se as variáveis não estiverem configuradas. */
export function getSupabase(): SupabaseClient {
  if (_client) return _client;
  const cfg = resolveSupabaseConfig(import.meta.env as EnvLike);
  if (!cfg) {
    throw new Error('Supabase não configurado: defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.');
  }
  _client = createClient(cfg.url, cfg.anonKey, {
    auth: {
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return _client;
}
