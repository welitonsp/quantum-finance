-- Testes do gate da IA: consentimento fail-closed, limite de 50/dia, virada do
-- dia e contador invisível para o cliente.
-- Rodar: psql -v ON_ERROR_STOP=1 -f supabase/tests/rls_uso_da_ia.sql
\set QUIET on
begin;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000c1'),  -- consentiu
  ('00000000-0000-0000-0000-0000000000c2'),  -- sem linha de consentimento
  ('00000000-0000-0000-0000-0000000000c3');  -- consentimento com ai = false
insert into public.user_consents (user_id, ai) values
  ('00000000-0000-0000-0000-0000000000c1', true),
  ('00000000-0000-0000-0000-0000000000c3', false);

set local role authenticated;

-- sem login → QF401
do $$ begin
  perform set_config('request.jwt.claim.sub', '', true);
  begin
    perform public.consume_ai_call();
    raise exception 'FALHA: sem login passou';
  exception when sqlstate 'QF401' then null;
  end;
end $$;

-- sem consentimento (sem linha e com ai=false) → 42501 com o motivo
do $$
declare v_detail text;
begin
  foreach v_detail in array array['00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c3'] loop
    perform set_config('request.jwt.claim.sub', v_detail, true);
    begin
      perform public.consume_ai_call();
      raise exception 'FALHA: IA sem consentimento passou (%)', v_detail;
    exception when insufficient_privilege then
      get stacked diagnostics v_detail = pg_exception_detail;
      if v_detail <> 'ai_consent_required' then raise exception 'FALHA: detalhe %', v_detail; end if;
    end;
  end loop;
end $$;

-- com consentimento: 50 chamadas passam, a 51ª é QF429
do $$
declare
  i int;
  v_left int;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', true);
  for i in 1..50 loop
    v_left := public.consume_ai_call();
  end loop;
  if v_left <> 0 then raise exception 'FALHA: restante % após 50', v_left; end if;
  begin
    perform public.consume_ai_call();
    raise exception 'FALHA: 51ª chamada passou';
  exception when sqlstate 'QF429' then null;
  end;
  -- cliente não lê nem mexe no contador
  begin
    perform 1 from public.ai_usage;
    raise exception 'FALHA: cliente leu ai_usage';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.ai_usage set calls = 0;
    raise exception 'FALHA: cliente zerou ai_usage';
  exception when insufficient_privilege then null;
  end;
end $$;

-- virada do dia: contador volta a 1
reset role;
update public.ai_usage set day = day - 1 where user_id = '00000000-0000-0000-0000-0000000000c1';
set local role authenticated;
do $$ begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', true);
  if public.consume_ai_call() <> 49 then raise exception 'FALHA: dia novo não zerou'; end if;
end $$;

-- anon não executa
reset role;
do $$ begin
  if has_function_privilege('anon', 'public.consume_ai_call()', 'execute') then
    raise exception 'FALHA: anon tem EXECUTE em consume_ai_call';
  end if;
end $$;

rollback;
\echo 'rls_uso_da_ia: OK'
