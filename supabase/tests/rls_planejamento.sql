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
     + (select count(*) from public.debts) + (select count(*) from public.recurring_tasks) <> 0 then
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
\echo 'OK: todos os testes de RLS de planejamento passaram'
rollback;
