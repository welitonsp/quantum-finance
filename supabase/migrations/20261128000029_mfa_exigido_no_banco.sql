-- =============================================================================
-- Quantum Finance — verificação em duas etapas exigida pelo banco
--
-- Antes o TOTP só existia na tela: com a senha, uma sessão aal1 lia e gravava
-- tudo direto pela API. Agora toda tabela do schema public ganha uma política
-- RESTRITIVA: quem tem um fator TOTP verificado só passa com sessão aal2.
-- Quem não ativou o TOTP continua como antes.
--
-- public.mfa_ok() é security definer porque o papel authenticated não lê
-- auth.mfa_factors. Não devolve dados do fator, só verdadeiro/falso.
-- Sem DROP de tabela; as políticas existentes continuam valendo (restritiva
-- soma uma condição a mais com AND).
-- =============================================================================

create or replace function public.mfa_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
      or not exists (
        select 1 from auth.mfa_factors f
         where f.user_id = auth.uid() and f.status = 'verified'
      );
$$;

revoke all on function public.mfa_ok() from public, anon;
grant execute on function public.mfa_ok() to authenticated;

do $$
declare
  t text;
begin
  for t in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
  loop
    if not exists (
      select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_mfa'
    ) then
      execute format(
        'create policy %I on public.%I as restrictive for all to authenticated using (public.mfa_ok()) with check (public.mfa_ok())',
        t || '_mfa', t);
    end if;
  end loop;
end $$;
