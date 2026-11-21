-- Testes de execute_agent_action: confirmação humana, validação, idempotência,
-- histórico com origem 'ai', diário de decisões e isolamento por usuário.
-- Rodar: psql -v ON_ERROR_STOP=1 -f supabase/tests/rls_acoes_agente.sql
\set QUIET on
begin;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-0000000000b2');

create function pg_temp.login(uid text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid, true),
         set_config('request.jwt.claims', json_build_object('sub', uid)::text, true);
$$;
grant execute on function pg_temp.login(text) to authenticated;

create function pg_temp.req(kind text, payload jsonb, status text default 'confirmed', extra jsonb default '{}')
returns jsonb language sql as $$
  select jsonb_build_object(
    'proposal', jsonb_build_object('kind', kind, 'status', status, 'payload', payload),
    'intent', 'simulate_purchase', 'question', 'Registrar?', 'toolsUsed', jsonb_build_array('saldo')) || extra;
$$;
grant execute on function pg_temp.req(text, jsonb, text, jsonb) to authenticated;

create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated;

set local role authenticated;

-- usuário 2 tem uma conta (para provar que b1 não usa conta alheia)
select pg_temp.login('00000000-0000-0000-0000-0000000000b2') \g /dev/null
with x as (insert into public.accounts (name, type, balance_cents)
  values ('Alheia', 'corrente', 1000) returning id) insert into ids select 'conta_b2', id from x;

select pg_temp.login('00000000-0000-0000-0000-0000000000b1') \g /dev/null
with x as (insert into public.accounts (name, type, balance_cents)
  values ('Corrente', 'corrente', 10000) returning id) insert into ids select 'c1', id from x;
with x as (insert into public.accounts (name, type, balance_cents)
  values ('Poupança', 'poupanca', 0) returning id) insert into ids select 'c2', id from x;
with x as (insert into public.goals (name, target_cents)
  values ('Viagem', 100000) returning id) insert into ids select 'meta', id from x;
with x as (insert into public.debts
  (name, total_cents, remaining_cents, installments, due_day_of_month, start_date, category)
  values ('Empréstimo', 3000, 3000, 3, 10, '2026-01-01', 'emprestimo') returning id) insert into ids select 'divida', id from x;

do $$
declare r jsonb; r2 jsonb; chave text := '8f14e45f-ceea-4e67-a3b1-2c5f0e3d9a10';
begin
  -- sem confirmação: recusa com motivo estável
  begin
    perform public.execute_agent_action(pg_temp.req('register_purchase',
      '{"description":"Mercado","amountCents":1500,"date":"2026-11-20"}', 'pending'));
    raise exception 'FALHA: ação sem confirmação executada';
  exception when sqlstate 'QF412' then
    declare d text; begin get stacked diagnostics d = pg_exception_detail;
      if d <> 'confirmation_required' then raise exception 'FALHA: motivo % ', d; end if; end;
  end;

  -- parcelado vai para o formulário
  begin
    perform public.execute_agent_action(pg_temp.req('register_purchase',
      '{"description":"TV","amountCents":300000,"date":"2026-11-20","installments":10}'));
    raise exception 'FALHA: compra parcelada aceita';
  exception when sqlstate 'QF412' then
    declare d text; begin get stacked diagnostics d = pg_exception_detail;
      if d <> 'use_installment_form' then raise exception 'FALHA: motivo % ', d; end if; end;
  end;

  -- validação: campo extra, centavos fracionados, data inválida
  begin
    perform public.execute_agent_action(pg_temp.req('register_purchase',
      '{"description":"X","amountCents":100,"date":"2026-11-20","hack":1}'));
    raise exception 'FALHA: campo extra aceito';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.execute_agent_action(pg_temp.req('register_purchase',
      '{"description":"X","amountCents":10.5,"date":"2026-11-20"}'));
    raise exception 'FALHA: centavos fracionados aceitos';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.execute_agent_action(pg_temp.req('register_income',
      '{"description":"X","amountCents":100,"date":"2026-02-30"}'));
    raise exception 'FALHA: data inválida aceita';
  exception when sqlstate '22023' then null;
  end;

  -- compra à vista com idempotência
  r := public.execute_agent_action(pg_temp.req('register_purchase',
    '{"description":"  Mercado ","amountCents":1500,"date":"2026-11-20","category":"Alimentação"}',
    'confirmed', jsonb_build_object('idempotencyKey', chave)));
  r2 := public.execute_agent_action(pg_temp.req('register_purchase',
    '{"description":"Mercado","amountCents":1500,"date":"2026-11-20","category":"Alimentação"}',
    'confirmed', jsonb_build_object('idempotencyKey', chave)));
  if r <> r2 then raise exception 'FALHA: repetição com a mesma chave gerou outra ação'; end if;
  if (select count(*) from public.transactions where description = 'Mercado') <> 1 then
    raise exception 'FALHA: transação duplicada ou descrição não aparada';
  end if;
  if (select origin from public.transaction_history where transaction_id = (r ->> 'id')::uuid) <> 'ai' then
    raise exception 'FALHA: histórico da compra sem origem ai';
  end if;
  if (select user_decision || '/' || outcome_status from public.ai_decisions where id = (r ->> 'decisionId')::uuid)
     <> 'confirmed/applied' then
    raise exception 'FALHA: diário de decisões não gravado';
  end if;

  -- receita
  r := public.execute_agent_action(pg_temp.req('register_income',
    '{"description":"Salário","amountCents":500000,"date":"2026-11-05"}'));
  if (select type from public.transactions where id = (r ->> 'id')::uuid) <> 'entrada' then
    raise exception 'FALHA: receita não gravada como entrada';
  end if;

  -- transferência move os dois saldos; conta alheia é recusada
  r := public.execute_agent_action(pg_temp.req('register_transfer', jsonb_build_object(
    'fromAccountId', (select v from ids where k = 'c1'), 'toAccountId', (select v from ids where k = 'c2'),
    'amountCents', 2500, 'date', '2026-11-21')));
  if (select balance_cents from public.accounts where id = (select v from ids where k = 'c1')) <> 7500
     or (select balance_cents from public.accounts where id = (select v from ids where k = 'c2')) <> 2500 then
    raise exception 'FALHA: transferência não moveu os saldos';
  end if;
  if exists (select 1 from public.account_history where origin <> 'ai' and action = 'UPDATE') then
    raise exception 'FALHA: histórico da conta sem origem ai';
  end if;
  begin
    perform public.execute_agent_action(pg_temp.req('register_transfer', jsonb_build_object(
      'fromAccountId', (select v from ids where k = 'c1'), 'toAccountId', (select v from ids where k = 'conta_b2'),
      'amountCents', 100, 'date', '2026-11-21')));
    raise exception 'FALHA: transferência para conta alheia';
  exception when sqlstate 'P0002' then null;
  end;

  -- meta, dívida e orçamento
  perform public.execute_agent_action(pg_temp.req('contribute_to_goal', jsonb_build_object(
    'goalId', (select v from ids where k = 'meta'), 'amountCents', 20000, 'date', '2026-11-21')));
  if (select current_cents from public.goals) <> 20000 then raise exception 'FALHA: aporte na meta'; end if;

  perform public.execute_agent_action(pg_temp.req('register_debt_payment', jsonb_build_object(
    'debtId', (select v from ids where k = 'divida'), 'amountCents', 5000, 'date', '2026-11-21')));
  if (select remaining_cents || '/' || paid_installments || '/' || active from public.debts) <> '0/1/false' then
    raise exception 'FALHA: pagamento da dívida (%)', (select remaining_cents || '/' || paid_installments || '/' || active from public.debts);
  end if;

  perform public.execute_agent_action(pg_temp.req('create_budget',
    '{"category":"Lazer","limitCents":40000,"competencia":"2026-12"}'));
  if (select target_cents from public.budgets where category = 'Lazer') <> 40000 then
    raise exception 'FALHA: orçamento não criado';
  end if;
  if exists (select 1 from public.planning_history where origin <> 'ai' and (action = 'UPDATE' or table_name = 'budgets')) then
    raise exception 'FALHA: histórico de planejamento sem origem ai';
  end if;
  if (select count(*) from public.planning_history where origin = 'ai') < 3 then
    raise exception 'FALHA: meta, dívida e orçamento sem histórico ai';
  end if;

  -- escrita direta no diário segue fechada
  begin
    insert into public.ai_decisions (user_id, intent) values (auth.uid(), 'x');
    raise exception 'FALHA: INSERT direto no diário';
  exception when insufficient_privilege then null;
  end;
end $$;

-- o outro usuário não vê nada e não mexe na meta de b1
select pg_temp.login('00000000-0000-0000-0000-0000000000b2') \g /dev/null
do $$ begin
  if exists (select 1 from public.ai_decisions) or exists (select 1 from public.goals) then
    raise exception 'FALHA: b2 vê dados de b1';
  end if;
  begin
    perform public.execute_agent_action(pg_temp.req('contribute_to_goal', jsonb_build_object(
      'goalId', (select v from ids where k = 'meta'), 'amountCents', 1, 'date', '2026-11-21')));
    raise exception 'FALHA: b2 aportou na meta de b1';
  exception when sqlstate 'P0002' then null;
  end;
end $$;

reset role;
set local role anon;
do $$ begin
  perform public.execute_agent_action('{}');
  raise exception 'FALHA: anon executou ação';
exception when insufficient_privilege then null;
end $$;

rollback;
\echo 'rls_acoes_agente: OK'
