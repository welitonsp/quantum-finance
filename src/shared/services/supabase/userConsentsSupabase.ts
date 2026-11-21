// Consentimentos LGPD no Supabase (tabela public.user_consents, um registro por usuário).
// O gatilho do banco registra cada concessão em data_processing_log.
import { getSupabase } from '../../api/supabase/client';
import { logSanitizedFirebaseError } from '../../lib/firebaseErrorHandling';
import type { UserConsents } from '../UserConsentsService';

interface ConsentRow {
  analytics: boolean | null;
  ai: boolean | null;
  updated_at: string | null;
}

function toDateLike(iso: string | null): UserConsents['updatedAt'] {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : { toDate: () => new Date(ms) };
}

/** Sem registro ou com erro de leitura: nada consentido (fail-closed). */
export async function getUserConsentsSupabase(_uid: string): Promise<UserConsents> {
  const { data, error } = await getSupabase()
    .from('user_consents').select('analytics, ai, updated_at').maybeSingle();
  if (error) {
    logSanitizedFirebaseError('user_consents_read', error);
    return { analytics: false, ai: false, updatedAt: null };
  }
  const row = data as ConsentRow | null;
  return {
    analytics: row?.analytics === true,
    ai: row?.ai === true,
    updatedAt: toDateLike(row?.updated_at ?? null),
  };
}

export async function saveUserConsentsSupabase(
  uid: string,
  consents: Omit<UserConsents, 'updatedAt'>,
): Promise<void> {
  const { error } = await getSupabase().from('user_consents').upsert(
    { user_id: uid, analytics: consents.analytics, ai: consents.ai },
    { onConflict: 'user_id' },
  );
  if (error) {
    logSanitizedFirebaseError('user_consents_save', error);
    throw new Error('Não foi possível salvar os consentimentos.');
  }
}
