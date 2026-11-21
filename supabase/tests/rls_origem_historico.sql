-- Testes da RPC update_transactions_with_origin (origem certa no histórico).
-- Rodar: psql -v ON_ERROR_STOP=1 -f supabase/tests/rls_origem_historico.sql
\set QUIET on
begin;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000c1'),
  ('00000000-0000-0000-0000-0000000000c2');

create function pg_temp.login(uid text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid, true);
$$;
grant execute on function pg_temp.login(text) to authenticated;

set local role authenticated;
select pg_temp.login('00000000-0000-0000-0000-0000000000c1') \g /dev/null

insert into public.transactions (id, description, value_cents, type, category, date) values
  ('40000000-0000-0000-0000-000000000001', 'Uber', 2500, 'saida', 'Outros', '2026-11-10'),
  ('40000000-0000-0000-0000-000000000002', 'Ifood', 4000, 'saida', 'Outros', '2026-11-11');

-- Lote: origem bulk / ação BULK_UPDATE
do $$ declare n int; begin
  n := public.update_transactions_with_origin(
    array['40000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002']::uuid[],
    '{"category": "Transporte"}'::jsonb, 'bulk');
  if n <> 2 then raise exception 'FALHA: lote atualizou % linhas', n; end if;
  if (select count(*) from public.transaction_history where action = 'BULK_UPDATE' and origin = 'bulk'
        and changed_fields = array['category']) <> 2 then
    raise exception 'FALHA: histórico do lote sem origem bulk';
  end if;
end $$;

-- Desfazer: ação UNDO_BULK_UPDATE
do $$ begin
  perform public.update_transactions_with_origin(
    array['40000000-0000-0000-0000-000000000001']::uuid[], '{"category": "Outros"}'::jsonb, 'bulk_undo');
  if not exists (select 1 from public.transaction_history where action = 'UNDO_BULK_UPDATE' and origin = 'bulk') then
    raise exception 'FALHA: desfazer não gravou UNDO_BULK_UPDATE';
  end if;
end $$;

-- IA: origem ai; e a marcação não vaza para a próxima escrita direta
do $$ begin
  perform public.update_transactions_with_origin(
    array['40000000-0000-0000-0000-000000000002']::uuid[], '{"category": "Alimentação"}'::jsonb, 'ai');
  if not exists (select 1 from public.transaction_history where action = 'UPDATE' and origin = 'ai') then
    raise exception 'FALHA: edição da IA sem origem ai';
  end if;
  update public.transactions set description = 'Ifood almoço' where id = '40000000-0000-0000-0000-000000000002';
  if not exists (select 1 from public.transaction_history where origin = 'manual' and changed_fields = array['description']) then
    raise exception 'FALHA: origem vazou para escrita manual seguinte';
  end if;
end $$;

-- Recusas: origem inválida, campo não editável, patch vazio
do $$ begin
  begin
    perform public.update_transactions_with_origin(array['40000000-0000-0000-0000-000000000001']::uuid[], '{"category": "X"}'::jsonb, 'system');
    raise exception 'FALHA: origem system aceita';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.update_transactions_with_origin(array['40000000-0000-0000-0000-000000000001']::uuid[], '{"import_hash": "x"}'::jsonb, 'bulk');
    raise exception 'FALHA: campo import_hash aceito no patch';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.update_transactions_with_origin(array['40000000-0000-0000-0000-000000000001']::uuid[], '{}'::jsonb, 'bulk');
    raise exception 'FALHA: patch vazio aceito';
  exception when invalid_parameter_value then null;
  end;
end $$;

-- Outro usuário não altera transações de C1 (RLS)
select pg_temp.login('00000000-0000-0000-0000-0000000000c2') \g /dev/null
do $$ declare n int; begin
  n := public.update_transactions_with_origin(
    array['40000000-0000-0000-0000-000000000001']::uuid[], '{"category": "Lazer"}'::jsonb, 'bulk');
  if n <> 0 then raise exception 'FALHA: usuário C2 alterou transação de C1'; end if;
end $$;

-- Visitante sem login não executa a RPC
reset role;
set local role anon;
do $$ begin
  begin
    perform public.update_transactions_with_origin(array['40000000-0000-0000-0000-000000000001']::uuid[], '{"category": "Lazer"}'::jsonb, 'bulk');
    raise exception 'FALHA: anon executou a RPC';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
\echo 'OK: todos os testes de origem do histórico passaram'
rollback;
