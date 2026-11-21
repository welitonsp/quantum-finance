-- Testes da view audit_timeline: junta os históricos e respeita a RLS de cada um.
-- Rodar: psql -v ON_ERROR_STOP=1 -f supabase/tests/rls_linha_do_tempo.sql
\set QUIET on
begin;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000e1'),
  ('00000000-0000-0000-0000-0000000000e2');

create function pg_temp.login(uid text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid, true);
$$;
grant execute on function pg_temp.login(text) to authenticated;

set local role authenticated;

-- usuário e1: uma conta e uma meta (os gatilhos gravam o histórico)
select pg_temp.login('00000000-0000-0000-0000-0000000000e1') \g /dev/null
insert into public.accounts (name, type) values ('Conta Linha do Tempo', 'corrente');
insert into public.goals (name, target_cents) values ('Meta Linha do Tempo', 100000);

-- usuário e2: uma meta
select pg_temp.login('00000000-0000-0000-0000-0000000000e2') \g /dev/null
insert into public.goals (name, target_cents) values ('Meta do Outro', 5000);

select pg_temp.login('00000000-0000-0000-0000-0000000000e1') \g /dev/null
do $$ begin
  if (select count(*) from public.audit_timeline where entity = 'accounts' and label = 'Conta Linha do Tempo' and action = 'CREATE') <> 1 then
    raise exception 'FALHA: criação da conta ausente na linha do tempo';
  end if;
  if (select count(*) from public.audit_timeline where entity = 'goals' and label = 'Meta Linha do Tempo') <> 1 then
    raise exception 'FALHA: criação da meta ausente na linha do tempo';
  end if;
  if exists (select 1 from public.audit_timeline where label = 'Meta do Outro'
             or user_id <> '00000000-0000-0000-0000-0000000000e1') then
    raise exception 'FALHA: linha do tempo expôs histórico de outro usuário';
  end if;
end $$;

-- anônimo não lê a view
reset role;
set local role anon;
do $$ begin
  perform 1 from public.audit_timeline;
  raise exception 'FALHA: anon leu a linha do tempo';
exception when insufficient_privilege then null;
end $$;

rollback;
\echo 'rls_linha_do_tempo: OK'
