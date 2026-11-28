-- Testes do TOTP exigido pelo banco: com fator verificado, sessão aal1 não lê
-- nem grava; aal2 lê e grava; sem fator, aal1 segue funcionando.
-- Rodar: psql -v ON_ERROR_STOP=1 -f supabase/tests/rls_mfa_exigido.sql
\set QUIET on
begin;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000d1'),
  ('00000000-0000-0000-0000-0000000000d2');
insert into auth.mfa_factors (user_id, status) values
  ('00000000-0000-0000-0000-0000000000d1', 'verified'),
  ('00000000-0000-0000-0000-0000000000d2', 'unverified');

insert into public.accounts (user_id, name, type, balance_cents) values
  ('00000000-0000-0000-0000-0000000000d1', 'Com TOTP', 'corrente', 100),
  ('00000000-0000-0000-0000-0000000000d2', 'Sem TOTP', 'corrente', 200);

set local role authenticated;

do $$
declare
  n int;
  sem_politica text;
begin
  -- d1 com TOTP, sessão só com senha (aal1): não vê nem grava
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', true);
  perform set_config('request.jwt.claims', '{"aal":"aal1"}', true);
  select count(*) into n from public.accounts;
  if n <> 0 then raise exception 'FALHA: aal1 com TOTP viu % contas', n; end if;
  begin
    insert into public.accounts (name, type) values ('Invasor', 'corrente');
    raise exception 'FALHA: aal1 com TOTP gravou conta';
  exception when insufficient_privilege then null;
  end;

  -- d1 com o código (aal2): vê e grava
  perform set_config('request.jwt.claims', '{"aal":"aal2"}', true);
  select count(*) into n from public.accounts;
  if n <> 1 then raise exception 'FALHA: aal2 viu % contas (esperado 1)', n; end if;
  insert into public.accounts (name, type) values ('Nova', 'corrente');

  -- d2 só com fator não verificado: aal1 continua funcionando
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d2', true);
  perform set_config('request.jwt.claims', '{"aal":"aal1"}', true);
  select count(*) into n from public.accounts;
  if n <> 1 then raise exception 'FALHA: sem TOTP viu % contas (esperado 1)', n; end if;

  -- toda tabela com RLS tem a política restritiva
  select string_agg(c.relname, ', ') into sem_politica
    from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
   where ns.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
     and not exists (select 1 from pg_policies p
                      where p.schemaname = 'public' and p.tablename = c.relname
                        and p.policyname = c.relname || '_mfa' and p.permissive = 'RESTRICTIVE');
  if sem_politica is not null then
    raise exception 'FALHA: tabelas sem política de TOTP: %', sem_politica;
  end if;
end $$;

rollback;
\echo 'rls_mfa_exigido: OK'
