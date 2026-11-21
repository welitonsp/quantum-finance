-- 1) Diário de decisões: guarda os campos de auditoria que o executeAgentAction
--    já grava hoje (toolsUsed, snapshotRef, simulationResult).
-- 2) Observação de preço: o app aceita quantidade com qualquer precisão
--    ("1,2345"); a RPC normaliza vírgula e arredonda para 3 casas antes de gravar.
-- Só "add column if not exists" e "create or replace": sem DROP.
alter table public.ai_decisions
  add column if not exists tools_used text[] not null default '{}'
    check (cardinality(tools_used) <= 16),
  add column if not exists snapshot_ref text
    check (snapshot_ref is null or char_length(snapshot_ref) between 1 and 200),
  add column if not exists simulation_result jsonb
    check (simulation_result is null or jsonb_typeof(simulation_result) = 'object');

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
  v_qty text := replace(btrim(coalesce(p_quantity, '')), ',', '.');
begin
  -- arredonda para 3 casas (g/mL); formato inválido segue para o check da coluna
  if v_qty ~ '^\d+\.\d{4,}$' then
    v_qty := trim_scale(round(v_qty::numeric, 3))::text;
  end if;
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
    (v_uid, btrim(p_product_name), btrim(p_store), p_unit_price_cents, v_qty, p_unit, p_observed_at, p_source_list_id)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.record_price_observation(text, text, bigint, text, text, date, uuid) from public, anon;
grant execute on function public.record_price_observation(text, text, bigint, text, text, date, uuid) to authenticated;
