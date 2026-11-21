-- Testes de delete_my_account: exige login recente e apaga só o próprio usuário (em cascata).
-- Rodar: psql -v ON_ERROR_STOP=1 -f supabase/tests/rls_excluir_conta.sql
\set QUIET on
begin;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000f1'),
  ('00000000-0000-0000-0000-0000000000f2');

create function pg_temp.login(uid text, auth_age_seconds int) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid, true),
         set_config('request.jwt.claims', json_build_object(
           'sub', uid,
           'amr', json_build_array(json_build_object(
             'method', 'password',
             'timestamp', extract(epoch from now())::bigint - auth_age_seconds))
         )::text, true);
$$;
grant execute on function pg_temp.login(text, int) to authenticated;

set local role authenticated;

-- dados dos dois usuários
select pg_temp.login('00000000-0000-0000-0000-0000000000f1', 0) \g /dev/null
insert into public.goals (name, target_cents) values ('Meta F1', 1000);
insert into public.accounts (id, name, type, balance_cents)
values ('10000000-0000-0000-0000-0000000000f1', 'Conta F1', 'corrente', 50000);
insert into public.transactions (description, value_cents, type, category, date, account_id)
values ('Mercado F1', 1234, 'saida', 'Alimentação', '2026-11-10', '10000000-0000-0000-0000-0000000000f1');
insert into public.user_consents (ai, analytics) values (true, true);
select pg_temp.login('00000000-0000-0000-0000-0000000000f2', 0) \g /dev/null
insert into public.goals (name, target_cents) values ('Meta F2', 2000);

-- registro LGPD pela função: tipos permitidos, consent_granted recusado, sem INSERT direto
select public.log_data_processing_event('export_requested', '  pedido pela tela  ') \g /dev/null
do $$ begin
  if (select details from public.data_processing_log
       where user_id = '00000000-0000-0000-0000-0000000000f2' and event_type = 'export_requested') <> 'pedido pela tela' then
    raise exception 'FALHA: registro LGPD não gravado pela função';
  end if;
  begin
    perform public.log_data_processing_event('consent_granted');
    raise exception 'FALHA: cliente gravou consent_granted';
  exception when sqlstate '22023' then null;
  end;
  begin
    insert into public.data_processing_log (event_type) values ('portability');
    raise exception 'FALHA: INSERT direto no registro LGPD';
  exception when insufficient_privilege then null;
  end;
  for i in 1..29 loop
    perform public.log_data_processing_event('portability');
  end loop;
  begin
    perform public.log_data_processing_event('portability');
    raise exception 'FALHA: limite por hora não aplicado';
  exception when sqlstate 'QF429' then null;
  end;
end $$;

-- login antigo (10 min) é recusado com QF401
select pg_temp.login('00000000-0000-0000-0000-0000000000f1', 600) \g /dev/null
do $$ begin
  perform public.delete_my_account();
  raise exception 'FALHA: excluiu conta sem login recente';
exception when sqlstate 'QF401' then null;
end $$;

-- sem claim amr também é recusado
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1"}', true) \g /dev/null
do $$ begin
  perform public.delete_my_account();
  raise exception 'FALHA: excluiu conta sem amr';
exception when sqlstate 'QF401' then null;
end $$;

-- login recente: apaga o usuário e os dados dele em cascata, sem tocar no outro
select pg_temp.login('00000000-0000-0000-0000-0000000000f1', 30) \g /dev/null
select public.delete_my_account() \g /dev/null

reset role;
do $$ begin
  if exists (select 1 from auth.users where id = '00000000-0000-0000-0000-0000000000f1') then
    raise exception 'FALHA: usuário não foi apagado';
  end if;
  if exists (select 1 from public.goals where name = 'Meta F1')
     or exists (select 1 from public.accounts where id = '10000000-0000-0000-0000-0000000000f1')
     or exists (select 1 from public.transactions where description = 'Mercado F1')
     or exists (select 1 from public.transaction_history where user_id = '00000000-0000-0000-0000-0000000000f1')
     or exists (select 1 from public.planning_history where user_id = '00000000-0000-0000-0000-0000000000f1')
     or exists (select 1 from public.user_consents where user_id = '00000000-0000-0000-0000-0000000000f1')
     or exists (select 1 from public.data_processing_log where user_id = '00000000-0000-0000-0000-0000000000f1') then
    raise exception 'FALHA: dados do usuário não foram apagados em cascata';
  end if;
  if not exists (select 1 from auth.users where id = '00000000-0000-0000-0000-0000000000f2')
     or not exists (select 1 from public.goals where name = 'Meta F2') then
    raise exception 'FALHA: exclusão atingiu outro usuário';
  end if;
end $$;

-- anon não executa
set local role anon;
do $$ begin
  perform public.delete_my_account();
  raise exception 'FALHA: anon executou delete_my_account';
exception when insufficient_privilege then null;
end $$;

rollback;
\echo 'rls_excluir_conta: OK'
