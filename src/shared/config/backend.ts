/**
 * Backend de dados/login escolhido no build (migração Firebase → Supabase).
 * Uma única chave liga login E dados juntos: a sessão Supabase só autentica
 * leituras/escritas no Supabase, então os dois não podem divergir.
 */
export type DataBackend = 'firebase' | 'supabase';

export const DATA_BACKEND: DataBackend =
  import.meta.env.VITE_AUTH_PROVIDER === 'supabase' ? 'supabase' : 'firebase';
