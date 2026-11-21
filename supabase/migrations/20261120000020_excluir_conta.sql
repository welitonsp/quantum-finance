-- Exclusão da conta pelo próprio usuário (LGPD), substitui a callable deleteUserData.
-- Apaga o registro em auth.users; todas as tabelas do usuário têm
-- "references auth.users on delete cascade", então os dados vão junto.
--
-- Login recente obrigatório (mesma regra do Firebase: até 5 minutos): o claim
-- "amr" do JWT do Supabase guarda quando cada método de login foi usado, e não
-- muda quando a sessão é renovada. Sem login recente → erro QF401 (o app pede
-- para entrar de novo). Sem DROP.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_last_auth bigint;
begin
  if v_uid is null then
    raise exception 'não autenticado' using errcode = '42501';
  end if;

  select max((m ->> 'timestamp')::bigint)
    into v_last_auth
    from jsonb_array_elements(
           case when jsonb_typeof(auth.jwt() -> 'amr') = 'array' then auth.jwt() -> 'amr' else '[]'::jsonb end
         ) as m
   where (m ->> 'timestamp') ~ '^\d{1,12}$';

  if v_last_auth is null or v_last_auth < extract(epoch from now())::bigint - 300 then
    raise exception 'login recente exigido para excluir a conta' using errcode = 'QF401';
  end if;

  delete from auth.users where id = v_uid;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
