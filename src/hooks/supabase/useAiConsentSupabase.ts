// Espelho em tempo real do consentimento de IA (public.user_consents).
// O gate real fica no servidor; aqui só refletimos o estado na UI, fail-closed.
import type { UseAiConsentReturn } from '../useAiConsent';
import { useSupabaseTable } from './useSupabaseTable';

interface AiConsentRow { ai: boolean | null }

const AI_CONSENT_OPTIONS = {
  table: 'user_consents',
  columns: 'ai',
  orderBy: 'created_at',
  map: (row: AiConsentRow) => row.ai === true,
  loadOp: 'ai_consent_read',
} as const;

export function useAiConsentSupabase(uid: string): UseAiConsentReturn {
  const { items, loading, error } = useSupabaseTable<AiConsentRow, boolean>(uid, AI_CONSENT_OPTIONS);
  // qualquer erro de leitura → sem consentimento
  return { aiGranted: !error && items[0] === true, loading };
}
