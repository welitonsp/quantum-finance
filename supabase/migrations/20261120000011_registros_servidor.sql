-- =============================================================================
-- Quantum Finance — registros que só o servidor grava
-- No Firestore, dataProcessingLog e priceObservations negavam escrita direta do
-- cliente. A 0010 deixou INSERT aberto ao dono; aqui fechamos de novo:
--  * data_processing_log: gravado só pelo banco (gatilho do consentimento) e,
--    depois, pelas Edge Functions de exportação/exclusão (service_role).
--  * price_observations: só pela função record_price_observation, que valida e
--    limita a 240 registros por hora por usuário (igual à callable antiga).
-- =============================================================================

drop policy if exists data_processing_log_owner_insert on public.data_processing_log;
drop policy if exists price_observations_owner_insert on public.price_observations;
revoke insert on public.data_processing_log, public.price_observations from authenticated;

-- Consentimento concedido gera o registro LGPD na mesma transação ------------
create or replace function public.log_consent_granted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.ai and (tg_op = 'INSERT' or not old.ai) then
    insert into public.data_processing_log (user_id, event_type, details)
    values (new.user_id, 'consent_granted', 'ai');
  end if;
  if new.analytics and (tg_op = 'INSERT' or not old.analytics) then
    insert into public.data_processing_log (user_id, event_type, details)
    values (new.user_id, 'consent_granted', 'analytics');
  end if;
  return new;
end;
$$;
revoke all on function public.log_consent_granted() from public, anon, authenticated;

drop trigger if exists user_consents_log_granted on public.user_consents;
create trigger user_consents_log_granted
  after insert or update on public.user_consents
  for each row execute function public.log_consent_granted();

-- Observação de preço: validada, do próprio usuário, com limite por hora ------
create or replace function public.record_price_observation(
  p_product_name     text,
  p_store            text,
  p_unit_price_cents bigint,
  p_quantity         text,
  p_unit             text,
  p_observed_at      date,
  p_source_list_id   uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'não autenticado' using errcode = '42501';
  end if;
  -- serializa as chamadas do mesmo usuário para o limite não ser furado em paralelo
  perform pg_advisory_xact_lock(hashtextextended('price_observations:' || v_uid::text, 0));
  if (select count(*) from public.price_observations
       where user_id = v_uid and created_at > now() - interval '1 hour') >= 240 then
    raise exception 'rate_limited' using errcode = '53400';
  end if;
  insert into public.price_observations
    (user_id, product_name, store, unit_price_cents, quantity, unit, observed_at, source_list_id)
  values
    (v_uid, btrim(p_product_name), btrim(p_store), p_unit_price_cents, p_quantity, p_unit, p_observed_at, p_source_list_id)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.record_price_observation(text, text, bigint, text, text, date, uuid) from public, anon;
grant execute on function public.record_price_observation(text, text, bigint, text, text, date, uuid) to authenticated;
