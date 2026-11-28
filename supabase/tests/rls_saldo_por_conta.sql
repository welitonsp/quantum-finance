-- Testes do saldo por conta (cash_position): abertura + lançamentos da conta
-- depois da abertura e até hoje; compra no cartão só sai quando a fatura é paga;
-- transferência já está no saldo de abertura; cada usuário só vê o seu.
-- Rodar: psql -v ON_ERROR_STOP=1 -f supabase/tests/rls_saldo_por_conta.sql
\set QUIET on
begin;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000f1'),
  ('00000000-0000-0000-0000-0000000000f2');

insert into public.accounts (id, user_id, name, type, balance_cents, opening_date) values
  ('00000000-0000-0000-0000-00000000b0f1', '00000000-0000-0000-0000-0000000000f1', 'Corrente', 'corrente', 300000, '2026-03-01'),
  ('00000000-0000-0000-0000-00000000b0f2', '00000000-0000-0000-0000-0000000000f1', 'Poupança', 'poupanca', 0,      '2026-03-01'),
  ('00000000-0000-0000-0000-00000000b0f3', '00000000-0000-0000-0000-0000000000f2', 'Alheia',   'corrente', 999900, '2026-03-01');

insert into public.credit_cards (id, user_id, name, limit_cents, closing_day, due_day) values
  ('00000000-0000-0000-0000-00000000c0f1', '00000000-0000-0000-0000-0000000000f1', 'Cartão', 500000, 5, 12);

insert into public.transactions (user_id, description, value_cents, type, category, date, account_id, card_id, paid_invoice_month, deleted_at) values
  -- conta corrente do f1
  ('00000000-0000-0000-0000-0000000000f1', 'Antes da abertura', 50000,  'entrada', 'Salário', '2026-02-28', '00000000-0000-0000-0000-00000000b0f1', null, null, null),
  ('00000000-0000-0000-0000-0000000000f1', 'No dia da abertura', 7000,  'saida',   'Outros',  '2026-03-01', '00000000-0000-0000-0000-00000000b0f1', null, null, null),
  ('00000000-0000-0000-0000-0000000000f1', 'Salário',          500000,  'entrada', 'Salário', '2026-03-05', '00000000-0000-0000-0000-00000000b0f1', null, null, null),
  ('00000000-0000-0000-0000-0000000000f1', 'Aluguel',          150000,  'saida',   'Moradia', '2026-03-10', '00000000-0000-0000-0000-00000000b0f1', null, null, null),
  ('00000000-0000-0000-0000-0000000000f1', 'Compra no cartão',  40000,  'saida',   'Lazer',   '2026-03-11', '00000000-0000-0000-0000-00000000b0f1', '00000000-0000-0000-0000-00000000c0f1', null, null),
  ('00000000-0000-0000-0000-0000000000f1', 'Fatura paga',       25000,  'saida',   'Outros',  '2026-03-12', '00000000-0000-0000-0000-00000000b0f1', '00000000-0000-0000-0000-00000000c0f1', '2026-02', null),
  ('00000000-0000-0000-0000-0000000000f1', 'Excluída',          11111,  'saida',   'Outros',  '2026-03-13', '00000000-0000-0000-0000-00000000b0f1', null, null, now()),
  ('00000000-0000-0000-0000-0000000000f1', 'Parcela futura',    30000,  'saida',   'Outros',  '2026-04-20', '00000000-0000-0000-0000-00000000b0f1', null, null, null),
  -- sem conta
  ('00000000-0000-0000-0000-0000000000f1', 'Pix recebido',      20000,  'entrada', 'Outros',  '2026-03-14', null, null, null, null),
  ('00000000-0000-0000-0000-0000000000f1', 'Padaria',            1500,  'saida',   'Alimentação', '2026-03-15', null, null, null, null),
  ('00000000-0000-0000-0000-0000000000f1', 'Cartão sem conta',   9000,  'saida',   'Lazer',   '2026-03-15', null, '00000000-0000-0000-0000-00000000c0f1', null, null),
  ('00000000-0000-0000-0000-0000000000f1', 'Futura sem conta',   5000,  'saida',   'Outros',  '2026-05-01', null, null, null, null);

set local role authenticated;

do $$
declare
  v_corrente bigint;
  v_poupanca bigint;
  v_sem      bigint;
  v_rows     int;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', true);

  select balance_cents into v_corrente from public.cash_position('2026-03-31') where account_id = '00000000-0000-0000-0000-00000000b0f1';
  -- 300000 + 500000 − 150000 − 25000 (fatura); sem: antes/no dia da abertura, cartão, excluída, futura
  if v_corrente <> 625000 then
    raise exception 'FALHA: saldo da corrente % (esperado 625000)', v_corrente;
  end if;

  select balance_cents into v_poupanca from public.cash_position('2026-03-31') where account_id = '00000000-0000-0000-0000-00000000b0f2';
  if v_poupanca <> 0 then
    raise exception 'FALHA: saldo da poupança % (esperado 0)', v_poupanca;
  end if;

  select balance_cents into v_sem from public.cash_position('2026-03-31') where account_id is null;
  -- 20000 − 1500; sem compra no cartão nem futura
  if v_sem <> 18500 then
    raise exception 'FALHA: líquido sem conta % (esperado 18500)', v_sem;
  end if;

  -- no fim de abril a parcela futura já saiu
  select balance_cents into v_corrente from public.cash_position('2026-04-30') where account_id = '00000000-0000-0000-0000-00000000b0f1';
  if v_corrente <> 595000 then
    raise exception 'FALHA: saldo da corrente em abril % (esperado 595000)', v_corrente;
  end if;

  -- transferência pela RPC: move o saldo de abertura, sem contar duas vezes
  perform public.create_transfer('00000000-0000-0000-0000-00000000b0f1', '00000000-0000-0000-0000-00000000b0f2',
                                 100000, '2026-03-20', 'Para poupança', 'teste-saldo-conta-1');
  select balance_cents into v_corrente from public.cash_position('2026-03-31') where account_id = '00000000-0000-0000-0000-00000000b0f1';
  select balance_cents into v_poupanca from public.cash_position('2026-03-31') where account_id = '00000000-0000-0000-0000-00000000b0f2';
  if v_corrente <> 525000 or v_poupanca <> 100000 then
    raise exception 'FALHA: transferência mudou saldos para % e % (esperado 525000 e 100000)', v_corrente, v_poupanca;
  end if;

  -- só as próprias contas (2) + a linha sem conta
  select count(*) into v_rows from public.cash_position('2026-03-31');
  if v_rows <> 3 then
    raise exception 'FALHA: % linhas para f1 (esperado 3)', v_rows;
  end if;

  -- outro usuário: só a própria conta, sem lançamentos
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f2', true);
  select count(*) into v_rows from public.cash_position('2026-03-31') where account_id is not null;
  select balance_cents into v_corrente from public.cash_position('2026-03-31') where account_id is not null;
  if v_rows <> 1 or v_corrente <> 999900 then
    raise exception 'FALHA: f2 viu % contas, saldo %', v_rows, v_corrente;
  end if;

  -- sem login: nenhuma conta e líquido zero
  perform set_config('request.jwt.claim.sub', '', true);
  select count(*) into v_rows from public.cash_position('2026-03-31') where account_id is not null;
  select balance_cents into v_sem from public.cash_position('2026-03-31') where account_id is null;
  if v_rows <> 0 or v_sem <> 0 then
    raise exception 'FALHA: sem login viu contas ou saldo';
  end if;
end $$;

-- anon não executa
reset role;
set local role anon;
do $$
begin
  perform public.cash_position('2026-03-31');
  raise exception 'FALHA: anon executou cash_position';
exception when insufficient_privilege then null;
end $$;

rollback;
\echo 'rls_saldo_por_conta: OK'
