-- Testes de run_due_recurring_tasks: lança só as vencidas do mês, uma vez,
-- com dia limitado ao fim do mês, anual no mês certo, e cliente sem acesso.
-- Rodar: psql -v ON_ERROR_STOP=1 -f supabase/tests/rls_recorrentes_agendados.sql
\set QUIET on
begin;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000c1'),
  ('00000000-0000-0000-0000-0000000000c2');

insert into public.recurring_tasks (user_id, description, value_cents, category, type, frequency, due_day, due_month, active) values
  ('00000000-0000-0000-0000-0000000000c1', 'Aluguel',   150000, 'Moradia', 'saida',   'mensal', 5,  null, true),
  ('00000000-0000-0000-0000-0000000000c1', 'Salário',   500000, 'Renda',   'entrada', 'mensal', 31, null, true),
  ('00000000-0000-0000-0000-0000000000c1', 'Futuro',    1000,   'Outros',  'saida',   'mensal', 20, null, true),
  ('00000000-0000-0000-0000-0000000000c1', 'Pausada',   1000,   'Outros',  'saida',   'mensal', 1,  null, false),
  ('00000000-0000-0000-0000-0000000000c2', 'IPVA',      90000,  'Carro',   'saida',   'anual',  10, 2,    true),
  ('00000000-0000-0000-0000-0000000000c2', 'Seguro',    50000,  'Carro',   'saida',   'anual',  10, 3,    true);

do $$
declare n int;
begin
  -- 15/02/2026: só aluguel (dia 5) e IPVA (anual de fevereiro, dia 10) vencem
  n := public.run_due_recurring_tasks('2026-02-15');
  if n <> 2 then raise exception 'FALHA: esperava 2 lançamentos em 15/02, veio %', n; end if;
  if exists (select 1 from public.transactions where description in ('Futuro', 'Salário', 'Pausada', 'Seguro')) then
    raise exception 'FALHA: lançou recorrente não vencida, pausada ou de outro mês';
  end if;
  if (select last_executed_month from public.recurring_tasks where description = 'Aluguel') <> '2026-02' then
    raise exception 'FALHA: mês executado não marcado';
  end if;

  -- 28/02/2026 (último dia): recupera Futuro (dia 20) e Salário (31 → 28)
  n := public.run_due_recurring_tasks('2026-02-28');
  if n <> 2 then raise exception 'FALHA: esperava 2 lançamentos em 28/02, veio %', n; end if;
  if (select date from public.transactions where description = 'Salário') <> '2026-02-28' then
    raise exception 'FALHA: dia 31 não foi limitado ao fim de fevereiro';
  end if;
  if (select count(*) from public.transactions where is_recurring) <> 4 then
    raise exception 'FALHA: lançamento sem marca de recorrente';
  end if;
  if (select count(*) from public.transaction_history where origin = 'system') <> 4 then
    raise exception 'FALHA: histórico sem origem system';
  end if;
  if exists (select 1 from public.transactions where description = 'Pausada') then
    raise exception 'FALHA: lançou recorrente pausada';
  end if;

  -- rodar de novo no mesmo mês não duplica
  n := public.run_due_recurring_tasks('2026-02-28');
  if n <> 0 then raise exception 'FALHA: duplicou no mesmo mês (%)', n; end if;

  -- março: mensais de novo + seguro anual de março
  n := public.run_due_recurring_tasks('2026-03-10');
  if n <> 2 then raise exception 'FALHA: março deveria lançar aluguel e seguro, veio %', n; end if;
end $$;

-- cliente não chama o agendador
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', true) \g /dev/null
do $$ begin
  perform public.run_due_recurring_tasks('2026-04-30');
  raise exception 'FALHA: cliente executou o agendador';
exception when insufficient_privilege then null;
end $$;

rollback;
\echo 'rls_recorrentes_agendados: OK'
