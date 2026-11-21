-- Quantidade com vírgula decimal ("1,5"), como o app aceita e mostra.
-- A coluna guarda ponto (check da 0010); a RPC normaliza antes de gravar.
-- Só "create or replace": sem DROP.
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
    (v_uid, btrim(p_product_name), btrim(p_store), p_unit_price_cents, replace(btrim(p_quantity), ',', '.'), p_unit, p_observed_at, p_source_list_id)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.record_price_observation(text, text, bigint, text, text, date, uuid) from public, anon;
grant execute on function public.record_price_observation(text, text, bigint, text, text, date, uuid) to authenticated;
