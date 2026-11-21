-- Registro LGPD de pedidos feitos pela tela de privacidade (exportação, exclusão,
-- portabilidade). O INSERT direto do cliente segue fechado (0011): só esta função
-- grava, para o próprio usuário, com tipos permitidos e limite de 30 por hora.
-- "consent_granted" continua só pelo gatilho do consentimento. Sem DROP.
create or replace function public.log_data_processing_event(
  p_event_type text,
  p_details    text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'não autenticado' using errcode = '42501';
  end if;
  if p_event_type is null or p_event_type not in ('export_requested', 'deletion_requested', 'portability') then
    raise exception 'tipo de registro não permitido' using errcode = '22023';
  end if;
  if (select count(*) from public.data_processing_log
       where user_id = v_uid and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'limite de registros por hora atingido' using errcode = 'QF429';
  end if;

  insert into public.data_processing_log (user_id, event_type, details)
  values (v_uid, p_event_type, left(nullif(btrim(p_details), ''), 200));
end;
$$;

revoke all on function public.log_data_processing_event(text, text) from public, anon;
grant execute on function public.log_data_processing_event(text, text) to authenticated;
