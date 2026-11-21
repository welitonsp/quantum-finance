-- Importação (linha com import_hash) entra no histórico com origem 'import';
-- criação manual continua 'manual'.
\set QUIET on
begin;
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000e1');
create function pg_temp.login(uid text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid, true);
$$;
grant execute on function pg_temp.login(text) to authenticated;
set local role authenticated;
select pg_temp.login('00000000-0000-0000-0000-0000000000e1') \g /dev/null

insert into public.transactions (id, description, value_cents, type, category, date, source, import_hash)
values ('70000000-0000-0000-0000-000000000001', 'Mercado', 1500, 'saida', 'Alimentação', '2026-11-10', 'csv', 'hash-de-teste-1');
insert into public.transactions (id, description, value_cents, type, category, date)
values ('70000000-0000-0000-0000-000000000002', 'Padaria', 800, 'saida', 'Alimentação', '2026-11-10');

do $$ begin
  if (select origin from public.transaction_history where transaction_id = '70000000-0000-0000-0000-000000000001') <> 'import' then
    raise exception 'FALHA: importação gravada sem origem import';
  end if;
  if (select origin from public.transaction_history where transaction_id = '70000000-0000-0000-0000-000000000002') <> 'manual' then
    raise exception 'FALHA: criação manual mudou de origem';
  end if;
end $$;

\echo 'OK: todos os testes de origem da importação passaram'
rollback;
