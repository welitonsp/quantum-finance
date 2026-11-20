-- Testes de RLS das tabelas de planejamento. Termina em ROLLBACK.
\set QUIET on
begin;
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-00000000000b');
create function pg_temp.login(uid text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid, true);
$$;
grant execute on function pg_temp.login(text) to authenticated;

set local role authenticated;
select pg_temp.login('00000000-0000-0000-0000-00000000000a') \g /dev/null

insert into public.categories (name, normalized_name, type, color) values ('Pets', 'pets', 'saida', '#f00');
insert into public.category_rules (keyword, category) values ('uber', 'Transporte');
insert into public.budgets (category, target_cents, month) values ('Alimentação', 80000, '2026-11');
insert into public.goals (name, target_cents) values ('Reserva', 1000000);
insert into public.debts (name, total_cents, remaining_cents, interest_rate, installments, due_day_of_month, start_date, category)
values ('Carro', 3000000, 2500000, 0.0185, 48, 10, '2026-01-10', 'financiamento');
insert into public.recurring_tasks (description, value_cents, category, due_day) values ('Aluguel', 150000, 'Moradia', 5);

-- create_transfer (versão endurecida): chave já usada por transação comum é rejeitada
insert into public.accounts (id, name, type, balance_cents) values
  ('20000000-0000-0000-0000-0000000000a1', 'Corrente', 'corrente', 50000),
  ('20000000-0000-0000-0000-0000000000a2', 'Poupança', 'poupanca', 0);
insert into public.transactions (description, value_cents, type, category, date, idempotency_key)
values ('Mercado', 1000, 'saida', 'Alimentação', '2026-11-12', 'idem-chave-comum-01');
do $$ begin
  begin
    perform public.create_transfer('20000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a2',
                                   500, '2026-11-12', 'Reserva', 'idem-chave-comum-01');
    raise exception 'FALHA: transferência aceitou chave de outra transação';
  exception when unique_violation then null;
  end;
  if (select balance_cents from public.accounts where id = '20000000-0000-0000-0000-0000000000a1') <> 50000 then
    raise exception 'FALHA: saldo mudou com chave rejeitada';
  end if;
end $$;

do $$ begin
  -- duplicidade de orçamento no mesmo mês/categoria
  begin
    insert into public.budgets (category, target_cents, month) values ('Alimentação', 1, '2026-11');
    raise exception 'FALHA: orçamento duplicado aceito';
  exception when unique_violation then null;
  end;
  -- anual sem mês
  begin
    insert into public.recurring_tasks (description, value_cents, category, due_day, frequency) values ('IPVA', 100, 'Impostos/Taxas', 5, 'anual');
    raise exception 'FALHA: recorrente anual sem mês aceito';
  exception when check_violation then null;
  end;
  -- cliente não forja execução do agendador
  begin
    update public.recurring_tasks set last_executed_month = '2026-11';
    raise exception 'FALHA: cliente alterou last_executed_month';
  exception when insufficient_privilege then null;
  end;
  -- parcelas pagas acima do total
  begin
    update public.debts set paid_installments = 49;
    raise exception 'FALHA: parcelas pagas > total aceito';
  exception when check_violation then null;
  end;
  -- categoria não é apagada pelo cliente (desativa-se)
  begin
    delete from public.categories;
    raise exception 'FALHA: cliente apagou categoria';
  exception when insufficient_privilege then null;
  end;
  -- toda escrita em recorrente deixa histórico, inclusive a exclusão
  update public.recurring_tasks set value_cents = 160000;
  delete from public.recurring_tasks;
  if (select array_agg(action order by id) from public.planning_history where table_name = 'recurring_tasks')
     <> array['CREATE', 'UPDATE', 'DELETE'] then
    raise exception 'FALHA: histórico de recorrente incompleto';
  end if;
  if (select changed_fields from public.planning_history where table_name = 'recurring_tasks' and action = 'UPDATE')
     <> array['value_cents'] then
    raise exception 'FALHA: delta do histórico de recorrente errado';
  end if;
  begin
    delete from public.planning_history;
    raise exception 'FALHA: cliente apagou histórico de planejamento';
  exception when insufficient_privilege then null;
  end;
  -- created_at não pode ser retroagido (o histórico não o registra)
  begin
    update public.goals set created_at = now() - interval '1 year';
    raise exception 'FALHA: created_at da meta alterado';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.accounts set created_at = now() - interval '1 year';
    if found then raise exception 'FALHA: created_at da conta alterado'; end if;
  exception when insufficient_privilege then null;
  end;
  -- dono imutável
  begin
    update public.goals set user_id = '00000000-0000-0000-0000-00000000000b';
    raise exception 'FALHA: dono da meta trocado';
  exception when insufficient_privilege or check_violation then null;
  end;
end $$;

select pg_temp.login('00000000-0000-0000-0000-00000000000b') \g /dev/null
do $$
declare n int;
begin
  if (select count(*) from public.categories) + (select count(*) from public.category_rules)
     + (select count(*) from public.budgets) + (select count(*) from public.goals)
     + (select count(*) from public.debts) + (select count(*) from public.recurring_tasks)
     + (select count(*) from public.planning_history) <> 0 then
    raise exception 'FALHA: B enxerga planejamento de A';
  end if;
  update public.goals set current_cents = 1; get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHA: B alterou meta de A'; end if;
  delete from public.debts; get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHA: B apagou dívida de A'; end if;
  begin
    insert into public.goals (user_id, name, target_cents) values ('00000000-0000-0000-0000-00000000000a', 'X', 1);
    raise exception 'FALHA: B criou meta em nome de A';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
set local role anon;
do $$ begin
  begin
    perform 1 from public.goals;
    raise exception 'FALHA: anon leu metas';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
-- só create_transfer fica na superfície RPC
do $$
declare f text;
begin
  foreach f in array array['public.tx_write_history()', 'public.account_write_history()', 'public.planning_write_history()',
                           'public.set_updated_at()', 'public.guard_owner_immutable()', 'public.tx_guard_immutable()',
                           'public.recurring_guard_last_executed()', 'public.tx_current_origin()', 'public.tx_history_snapshot(jsonb)'] loop
    if has_function_privilege('anon', f, 'execute') or has_function_privilege('authenticated', f, 'execute') then
      raise exception 'FALHA: % exposta via RPC', f;
    end if;
  end loop;
  if has_function_privilege('anon', 'public.create_transfer(uuid, uuid, bigint, date, text, text)', 'execute')
     or not has_function_privilege('authenticated', 'public.create_transfer(uuid, uuid, bigint, date, text, text)', 'execute') then
    raise exception 'FALHA: permissão de create_transfer errada';
  end if;
end $$;
delete from auth.users where id = '00000000-0000-0000-0000-00000000000a';
do $$ begin
  if exists (select 1 from public.goals) or exists (select 1 from public.planning_history) then
    raise exception 'FALHA: sobrou planejamento após excluir o usuário';
  end if;
end $$;
\echo 'OK: todos os testes de RLS de planejamento passaram'
rollback;
