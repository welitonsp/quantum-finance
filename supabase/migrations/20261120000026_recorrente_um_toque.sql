-- =============================================================================
-- Quantum Finance — "Ações de 1 toque" das recorrentes no Supabase
-- O card de 1 toque lança a conta pelo Agente (execute_agent_action) e depois
-- marca a recorrente como paga no mês. last_executed_month é controlado pelo
-- servidor (gatilho recurring_guard_last_executed), então a marca passa por esta
-- função, que também põe is_recurring na transação criada (origem 'ai').
--
-- Correção do agendador (0024): o 1 toque pode marcar o MÊS SEGUINTE com até 7
-- dias de antecedência. Com "is distinct from" o pg_cron relançaria o mês atual;
-- agora só lança quando last_executed_month é nulo ou ANTERIOR ao mês. Sem DROP.
-- =============================================================================

create or replace function public.mark_recurring_executed(
  p_task_id        uuid,
  p_transaction_id uuid,
  p_month          text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if v_uid is null then
    raise exception 'login necessário' using errcode = 'QF401';
  end if;
  -- só o mês anterior, o atual ou o seguinte (o card mostra contas a até 7 dias)
  if p_month is null
     or p_month !~ '^\d{4}-(0[1-9]|1[0-2])$'
     or p_month < to_char(v_today - interval '1 month', 'YYYY-MM')
     or p_month > to_char(v_today + interval '1 month', 'YYYY-MM') then
    raise exception 'mês inválido' using errcode = '22023';
  end if;

  perform 1 from public.recurring_tasks where id = p_task_id and user_id = v_uid for update;
  if not found then
    raise exception 'recorrente não encontrada' using errcode = 'P0002';
  end if;
  perform 1 from public.transactions where id = p_transaction_id and user_id = v_uid;
  if not found then
    raise exception 'transação não encontrada' using errcode = 'P0002';
  end if;

  perform set_config('app.tx_origin', 'ai', true);
  update public.transactions set is_recurring = true
   where id = p_transaction_id and user_id = v_uid and not is_recurring;
  perform set_config('app.tx_origin', '', true);

  update public.recurring_tasks set last_executed_month = p_month
   where id = p_task_id and user_id = v_uid
     and (last_executed_month is null or last_executed_month < p_month);
end;
$$;

revoke all on function public.mark_recurring_executed(uuid, uuid, text) from public, anon;
grant execute on function public.mark_recurring_executed(uuid, uuid, text) to authenticated;

-- Agendador: mesmo corpo da 0024, trocando "is distinct from" por "nulo ou anterior".
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
       and (last_executed_month is null or last_executed_month < v_month)
       and least(due_day, v_last_day) <= extract(day from p_today)
       and (frequency = 'mensal' or (frequency = 'anual' and due_month = extract(month from p_today)))
  loop
    begin
      -- relê com trava: duas execuções simultâneas não lançam em dobro
      select * into v_task from public.recurring_tasks
       where id = v_task.id and active
         and (last_executed_month is null or last_executed_month < v_month)
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
