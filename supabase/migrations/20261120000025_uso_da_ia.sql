-- =============================================================================
-- Quantum Finance — limite diário e consentimento da IA no Supabase
-- Substitui assertAiConsent + checkAndIncrementRateLimit das Cloud Functions de
-- IA (chat, relatório e categorização). A função de borda quantum-ai chama
-- consume_ai_call() com o JWT do próprio usuário ANTES de falar com o Gemini:
--   * sem consentimento de IA (user_consents.ai) → 42501, detalhe ai_consent_required
--     (fail-closed: sem linha de consentimento também nega);
--   * 50 chamadas no dia (horário de Brasília) → QF429;
--   * sem login → QF401.
-- O contador fica numa tabela que o cliente não lê nem grava. Sem DROP.
-- =============================================================================

create table if not exists public.ai_usage (
  user_id uuid primary key references auth.users (id) on delete cascade,
  day     date not null,
  calls   integer not null default 0 check (calls >= 0)
);

alter table public.ai_usage enable row level security;
revoke all on table public.ai_usage from public, anon, authenticated;

create or replace function public.consume_ai_call()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_today   date := (now() at time zone 'America/Sao_Paulo')::date;
  v_limit   constant integer := 50;
  v_consent boolean;
  v_calls   integer;
begin
  if v_uid is null then
    raise exception 'login necessário' using errcode = 'QF401';
  end if;

  select c.ai into v_consent from public.user_consents c where c.user_id = v_uid;
  if not coalesce(v_consent, false) then
    raise exception 'Consentimento de uso de IA não concedido. Ative-o em Configurações › Privacidade.'
      using errcode = '42501', detail = 'ai_consent_required';
  end if;

  insert into public.ai_usage as u (user_id, day, calls)
  values (v_uid, v_today, 1)
  on conflict (user_id) do update
     set day   = excluded.day,
         calls = case when u.day = excluded.day then u.calls + 1 else 1 end
   where u.day <> excluded.day or u.calls < v_limit
  returning u.calls into v_calls;

  if v_calls is null then
    raise exception 'Limite diário de % chamadas de IA atingido.', v_limit using errcode = 'QF429';
  end if;

  return v_limit - v_calls;
end;
$$;

revoke all on function public.consume_ai_call() from public, anon;
grant execute on function public.consume_ai_call() to authenticated;
