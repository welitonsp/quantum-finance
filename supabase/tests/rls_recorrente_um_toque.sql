-- Testes do 1 toque: marca a recorrente e a transação só do próprio usuário,
-- mês limitado, nunca volta o mês, e o agendador respeita o mês adiantado.
-- Rodar: psql -v ON_ERROR_STOP=1 -f supabase/tests/rls_recorrente_um_toque.sql
\set QUIET on
begin;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000d1'),
  ('00000000-0000-0000-0000-0000000000d2');

create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated;

with t as (
  insert into public.recurring_tasks (user_id, description, value_cents, category, type, frequency, due_day, active)
  values ('00000000-0000-0000-0000-0000000000d1', 'Internet', 9990, 'Moradia', 'saida', 'mensal', 2, true)
  returning id
) insert into ids select 'task', id from t;
with t as (
  insert into public.transactions (user_id, description, value_cents, type, category, date)
  values ('00000000-0000-0000-0000-0000000000d1', 'Internet', 9990, 'saida', 'Moradia', current_date)
  returning id
) insert into ids select 'tx', id from t;
with t as (
  insert into public.transactions (user_id, description, value_cents, type, category, date)
  values ('00000000-0000-0000-0000-0000000000d2', 'Alheia', 100, 'saida', 'Outros', current_date)
  returning id
) insert into ids select 'tx_outro', id from t;

set local role authenticated;

do $$
declare
  v_task uuid := (select v from ids where k = 'task');
  v_tx   uuid := (select v from ids where k = 'tx');
  v_cur  text := to_char((now() at time zone 'America/Sao_Paulo')::date, 'YYYY-MM');
  v_next text := to_char((now() at time zone 'America/Sao_Paulo')::date + interval '1 month', 'YYYY-MM');
  v_far  text := to_char((now() at time zone 'America/Sao_Paulo')::date + interval '3 months', 'YYYY-MM');
begin
  -- outro usuário não marca a tarefa alheia
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d2', true);
  begin
    perform public.mark_recurring_executed(v_task, v_tx, v_cur);
    raise exception 'FALHA: marcou recorrente de outro usuário';
  exception when sqlstate 'P0002' then null;
  end;

  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', true);
  -- transação de outro usuário é recusada
  begin
    perform public.mark_recurring_executed(v_task, (select v from ids where k = 'tx_outro'), v_cur);
    raise exception 'FALHA: usou transação de outro usuário';
  exception when sqlstate 'P0002' then null;
  end;
  -- mês fora da janela ou mal formado
  begin
    perform public.mark_recurring_executed(v_task, v_tx, v_far);
    raise exception 'FALHA: aceitou mês distante';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.mark_recurring_executed(v_task, v_tx, '2026-13');
    raise exception 'FALHA: aceitou mês inválido';
  exception when sqlstate '22023' then null;
  end;

  -- caminho feliz: mês seguinte (antecipado), transação marcada com origem ai
  perform public.mark_recurring_executed(v_task, v_tx, v_next);
  if (select last_executed_month from public.recurring_tasks where id = v_task) <> v_next then
    raise exception 'FALHA: mês não marcado';
  end if;
  if not (select is_recurring from public.transactions where id = v_tx) then
    raise exception 'FALHA: transação sem is_recurring';
  end if;
  if not exists (select 1 from public.transaction_history where transaction_id = v_tx and origin = 'ai') then
    raise exception 'FALHA: histórico sem origem ai';
  end if;

  -- nunca volta o mês
  perform public.mark_recurring_executed(v_task, v_tx, v_cur);
  if (select last_executed_month from public.recurring_tasks where id = v_task) <> v_next then
    raise exception 'FALHA: mês voltou para trás';
  end if;
end $$;

-- agendador não relança o mês atual de uma recorrente já marcada no seguinte
reset role;
do $$
declare n int;
begin
  n := public.run_due_recurring_tasks((now() at time zone 'America/Sao_Paulo')::date);
  if exists (select 1 from public.transactions where user_id = '00000000-0000-0000-0000-0000000000d1' and is_recurring and id <> (select v from ids where k = 'tx')) then
    raise exception 'FALHA: agendador relançou recorrente já paga adiantada';
  end if;
end $$;

-- anon não executa
do $$ begin
  if has_function_privilege('anon', 'public.mark_recurring_executed(uuid, uuid, text)', 'execute') then
    raise exception 'FALHA: anon tem EXECUTE em mark_recurring_executed';
  end if;
end $$;

rollback;
\echo 'rls_recorrente_um_toque: OK'
