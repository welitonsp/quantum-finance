-- Testes de RLS das tabelas secundárias (consentimentos, LGPD, compras, preços,
-- desafios, score, push e decisões do Agente).
-- Rodar: psql -v ON_ERROR_STOP=1 -f supabase/tests/rls_secundarias.sql
\set QUIET on
begin;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000d1'),
  ('00000000-0000-0000-0000-0000000000d2');

create function pg_temp.login(uid text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid, true);
$$;
grant execute on function pg_temp.login(text) to authenticated;

-- decisão do Agente gravada pelo servidor (fora da RLS)
insert into public.ai_decisions (user_id, intent, question) values
  ('00000000-0000-0000-0000-0000000000d1', 'register_purchase', 'Registrar compra?');

set local role authenticated;
select pg_temp.login('00000000-0000-0000-0000-0000000000d1') \g /dev/null

insert into public.user_consents (ai, analytics) values (true, false);
insert into public.shopping_lists (id, name, items, created_at)
values ('50000000-0000-0000-0000-000000000001', 'Mercado', '[{"id":"i1","productName":"arroz"}]', '2000-01-01');
select public.record_price_observation('arroz', 'Atacadão', 2390, '1', 'kg', '2026-11-10') \g /dev/null
insert into public.challenges (category, target_pct, baseline_cents, deadline_days, start_date, end_date)
values ('Lazer', 20, 50000, 30, '2026-11-01', '2026-12-01');
insert into public.score_history (month, score, taxa_poupanca) values ('2026-11', 72, 0.15);
insert into public.push_tokens (token) values ('token-de-teste-com-mais-de-20-caracteres');

do $$ begin
  -- dono, datas do servidor e upsert do consentimento
  if (select user_id from public.shopping_lists where id = '50000000-0000-0000-0000-000000000001')
     <> '00000000-0000-0000-0000-0000000000d1' then
    raise exception 'FALHA: user_id não veio de auth.uid()';
  end if;
  if (select created_at from public.shopping_lists where id = '50000000-0000-0000-0000-000000000001') < now() - interval '1 minute' then
    raise exception 'FALHA: created_at retroativo aceito';
  end if;
  insert into public.user_consents (ai, analytics) values (false, true)
    on conflict (user_id) do update set ai = excluded.ai, analytics = excluded.analytics;
  if (select ai from public.user_consents) then raise exception 'FALHA: upsert do consentimento'; end if;
  -- consentimento concedido vira registro LGPD gravado pelo banco (ai, depois analytics)
  if (select string_agg(details, ',' order by id) from public.data_processing_log) is distinct from 'ai,analytics' then
    raise exception 'FALHA: consentimento não gerou registro LGPD';
  end if;
  if (select user_id from public.price_observations) <> '00000000-0000-0000-0000-0000000000d1' then
    raise exception 'FALHA: observação de preço sem o dono do login';
  end if;
  if (select count(*) from public.ai_decisions) <> 1 then raise exception 'FALHA: dono não lê a própria decisão'; end if;
  -- dono apaga o próprio token (ex.: ao desativar o push) e grava de novo
  delete from public.push_tokens where token = 'token-de-teste-com-mais-de-20-caracteres';
  if exists (select 1 from public.push_tokens) then raise exception 'FALHA: dono não apagou o próprio token'; end if;
  insert into public.push_tokens (token) values ('token-de-teste-com-mais-de-20-caracteres');
end $$;

-- Recusas: append-only, servidor-only, formato
do $$ begin
  begin
    update public.data_processing_log set details = 'x';
    raise exception 'FALHA: cliente editou registro LGPD';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.price_observations;
    raise exception 'FALHA: cliente apagou observação de preço';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.ai_decisions (user_id, intent) values ('00000000-0000-0000-0000-0000000000d1', 'forjada');
    raise exception 'FALHA: cliente criou decisão do Agente';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.record_price_observation('feijão', 'X', 0, '1', 'kg', '2026-11-10');
    raise exception 'FALHA: preço zero aceito';
  exception when check_violation then null;
  end;
  begin
    insert into public.price_observations (product_name, store, unit_price_cents, quantity, unit, observed_at)
    values ('feijão', 'X', 100, '1', 'kg', '2026-11-10');
    raise exception 'FALHA: cliente gravou observação de preço sem a função';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.data_processing_log (event_type) values ('export_requested');
    raise exception 'FALHA: cliente forjou registro LGPD';
  exception when insufficient_privilege then null;
  end;
  -- limite de 240 observações por hora (1 já gravada acima)
  for i in 1..239 loop
    perform public.record_price_observation('item ' || i, 'Loja', 100, '1', 'un', '2026-11-10');
  end loop;
  begin
    perform public.record_price_observation('item 240', 'Loja', 100, '1', 'un', '2026-11-10');
    raise exception 'FALHA: limite por hora não aplicado';
  exception when sqlstate '53400' then null;
  end;
  begin
    update public.score_history set user_id = '00000000-0000-0000-0000-0000000000d2';
    raise exception 'FALHA: troca de dono no score aceita';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Outro usuário não vê nem altera nada de D1
select pg_temp.login('00000000-0000-0000-0000-0000000000d2') \g /dev/null
do $$ begin
  if exists (select 1 from public.user_consents) or exists (select 1 from public.shopping_lists)
     or exists (select 1 from public.price_observations) or exists (select 1 from public.challenges)
     or exists (select 1 from public.score_history) or exists (select 1 from public.ai_decisions)
     or exists (select 1 from public.data_processing_log) or exists (select 1 from public.push_tokens) then
    raise exception 'FALHA: D2 leu dados de D1';
  end if;
  update public.challenges set xp = 999;
  delete from public.shopping_lists;
  delete from public.push_tokens;
end $$;

reset role;
do $$ begin
  if (select xp from public.challenges) <> 0 or not exists (select 1 from public.shopping_lists)
     or not exists (select 1 from public.push_tokens) then
    raise exception 'FALHA: D2 alterou dados de D1';
  end if;
end $$;

-- Visitante sem login não lê nada
set local role anon;
do $$ begin
  begin
    perform 1 from public.shopping_lists;
    raise exception 'FALHA: anon leu listas';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Exclusão LGPD apaga tudo em cascata
reset role;
delete from auth.users where id = '00000000-0000-0000-0000-0000000000d1';
do $$ begin
  if exists (select 1 from public.user_consents) or exists (select 1 from public.shopping_lists)
     or exists (select 1 from public.price_observations) or exists (select 1 from public.challenges)
     or exists (select 1 from public.score_history) or exists (select 1 from public.ai_decisions)
     or exists (select 1 from public.data_processing_log) or exists (select 1 from public.push_tokens) then
    raise exception 'FALHA: sobrou dado após excluir o usuário';
  end if;
end $$;

\echo 'OK: todos os testes de RLS das tabelas secundárias passaram'
rollback;
