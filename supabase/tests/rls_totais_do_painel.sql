-- Testes dos totais do painel: só soma as transações do próprio usuário, ignora
-- transferências, pagamentos de fatura e excluídas, e respeita o mês.
-- Rodar: psql -v ON_ERROR_STOP=1 -f supabase/tests/rls_totais_do_painel.sql
\set QUIET on
begin;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000e1'),
  ('00000000-0000-0000-0000-0000000000e2');

insert into public.accounts (id, user_id, name, type) values
  ('00000000-0000-0000-0000-00000000a0e1', '00000000-0000-0000-0000-0000000000e1', 'Corrente', 'corrente'),
  ('00000000-0000-0000-0000-00000000a0e2', '00000000-0000-0000-0000-0000000000e1', 'Poupança', 'poupanca');

insert into public.transactions (user_id, description, value_cents, type, category, date, paid_invoice_month, deleted_at, from_account_id, to_account_id) values
  -- usuário e1, março/2026
  ('00000000-0000-0000-0000-0000000000e1', 'Salário',       500000, 'entrada',       'Salário',  '2026-03-05', null,      null,  null, null),
  ('00000000-0000-0000-0000-0000000000e1', 'Mercado',        12345, 'saida',         'Mercado',  '2026-03-10', null,      null,  null, null),
  ('00000000-0000-0000-0000-0000000000e1', 'Fatura de fev',  80000, 'saida',         'Cartão',   '2026-03-12', '2026-02', null,  null, null),
  ('00000000-0000-0000-0000-0000000000e1', 'Para poupança', 100000, 'transferencia', 'Transferência', '2026-03-15', null, null,
     '00000000-0000-0000-0000-00000000a0e1', '00000000-0000-0000-0000-00000000a0e2'),
  ('00000000-0000-0000-0000-0000000000e1', 'Excluída',        9999, 'saida',         'Outros',   '2026-03-20', null,      now(), null, null),
  ('00000000-0000-0000-0000-0000000000e1', 'Último dia',       100, 'saida',         'Outros',   '2026-03-31', null,      null,  null, null),
  -- usuário e1, abril/2026 (fora do mês, conta no saldo de todos os tempos)
  ('00000000-0000-0000-0000-0000000000e1', 'Abril',          20000, 'saida',         'Outros',   '2026-04-01', null,      null,  null, null),
  -- outro usuário
  ('00000000-0000-0000-0000-0000000000e2', 'Alheia',        777777, 'entrada',       'Outros',   '2026-03-05', null,      null,  null, null);

set local role authenticated;

do $$
declare
  r record;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', true);
  select * into r from public.dashboard_totals('2026-03-01', '2026-03-31');
  if r.income_cents <> 500000 then
    raise exception 'FALHA: receita do mês % (esperado 500000)', r.income_cents;
  end if;
  -- 12345 + 100: sem fatura, sem transferência, sem excluída, sem abril
  if r.expense_cents <> 12445 then
    raise exception 'FALHA: despesa do mês % (esperado 12445)', r.expense_cents;
  end if;
  -- 500000 − 12345 − 100 − 20000
  if r.net_all_cents <> 467555 then
    raise exception 'FALHA: saldo de todos os tempos % (esperado 467555)', r.net_all_cents;
  end if;

  -- outro usuário só vê o próprio
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e2', true);
  select * into r from public.dashboard_totals('2026-03-01', '2026-03-31');
  if r.income_cents <> 777777 or r.expense_cents <> 0 or r.net_all_cents <> 777777 then
    raise exception 'FALHA: usuário e2 viu totais errados (%, %, %)', r.income_cents, r.expense_cents, r.net_all_cents;
  end if;

  -- sem login: tudo zero
  perform set_config('request.jwt.claim.sub', '', true);
  select * into r from public.dashboard_totals('2026-03-01', '2026-03-31');
  if r.income_cents <> 0 or r.expense_cents <> 0 or r.net_all_cents <> 0 then
    raise exception 'FALHA: sem login devolveu totais';
  end if;
end $$;

-- anon não executa
reset role;
set local role anon;
do $$
begin
  perform public.dashboard_totals('2026-03-01', '2026-03-31');
  raise exception 'FALHA: anon executou dashboard_totals';
exception when insufficient_privilege then null;
end $$;

rollback;
\echo 'rls_totais_do_painel: OK'
