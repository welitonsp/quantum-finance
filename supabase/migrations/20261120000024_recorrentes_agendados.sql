-- =============================================================================
-- Quantum Finance — recorrentes automáticos no Supabase
-- Substitui a função agendada executeScheduledRecurrents: todo dia às 04:00 UTC
-- (01:00 em Brasília) o pg_cron lança as recorrentes vencidas do mês que ainda
-- não foram lançadas (inclui atraso: se um dia falhar, o próximo recupera).
-- Idempotente por last_executed_month; dia 31 vira o último dia do mês.
-- Só o agendador chama a função (nenhum papel da API tem EXECUTE). Sem DROP.
-- =============================================================================

create or replace function public.run_due_recurring_tasks(
  p_today date default (now() at time zone 'America/Sao_Paulo')::date
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_month    text := to_char(p_today, 'YYYY-MM');
  v_last_day int  := extract(day from (date_trunc('month', p_today) + interval '1 month - 1 day'))::int;
  v_task     record;
  v_due      date;
  v_count    int := 0;
begin
  for v_task in
    select id from public.recurring_tasks
     where active
       and last_executed_month is distinct from v_month
       and least(due_day, v_last_day) <= extract(day from p_today)
       and (frequency = 'mensal' or (frequency = 'anual' and due_month = extract(month from p_today)))
  loop
    begin
      -- relê com trava: duas execuções simultâneas não lançam em dobro
      select * into v_task from public.recurring_tasks
       where id = v_task.id and active and last_executed_month is distinct from v_month
       for update skip locked;
      if not found then
        continue;
      end if;
      v_due := make_date(extract(year from p_today)::int, extract(month from p_today)::int, least(v_task.due_day, v_last_day));

      perform set_config('app.tx_origin', 'system', true);
      insert into public.transactions (user_id, description, value_cents, type, category, date, is_recurring)
      values (v_task.user_id, v_task.description, v_task.value_cents, v_task.type, v_task.category, v_due, true);
      update public.recurring_tasks set last_executed_month = v_month where id = v_task.id;
      perform set_config('app.tx_origin', '', true);
      v_count := v_count + 1;
    exception when others then
      -- uma tarefa com problema não impede as outras; nada do usuário vai para o log
      perform set_config('app.tx_origin', '', true);
      raise warning 'recorrente não lançada (sqlstate %)', sqlstate;
    end;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.run_due_recurring_tasks(date) from public, anon, authenticated;

-- Agendamento diário (só onde o pg_cron existe, como no Supabase)
do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron indisponível (ambiente local) — agendamento ignorado';
    return;
  end if;
  create extension if not exists pg_cron;
  perform cron.schedule('qf-recorrentes-diario', '0 4 * * *', 'select public.run_due_recurring_tasks()');
end $$;
