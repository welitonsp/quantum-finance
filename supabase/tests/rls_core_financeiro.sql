-- Testes de RLS e do histórico append-only do núcleo financeiro.
-- Rodar: psql -v ON_ERROR_STOP=1 -f supabase/tests/rls_core_financeiro.sql
-- Cada bloco falha com exceção se o contrato for violado. Tudo roda numa
-- transação que termina em ROLLBACK: não deixa dados para trás.
\set QUIET on
begin;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-00000000000b');

-- helper: troca o usuário logado da sessão
create function pg_temp.login(uid text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid, true);
$$;
grant execute on function pg_temp.login(text) to anon, authenticated;

-- Usuário A cria conta, cartão e transação ----------------------------------
set local role authenticated;
select pg_temp.login('00000000-0000-0000-0000-00000000000a') \g /dev/null

insert into public.accounts (id, name, type, balance_cents)
values ('10000000-0000-0000-0000-00000000000a', 'Conta A', 'corrente', 150000);
insert into public.credit_cards (id, name, limit_cents, closing_day, due_day)
values ('20000000-0000-0000-0000-00000000000a', 'Cartão A', 500000, 5, 12);
insert into public.transactions (id, description, value_cents, type, category, date, account_id, import_hash)
values ('30000000-0000-0000-0000-00000000000a', 'Mercado', 12345, 'saida', 'Alimentação', '2026-11-10',
        '10000000-0000-0000-0000-00000000000a', 'hash-secreto');

do $$ begin
  if (select user_id from public.transactions where id = '30000000-0000-0000-0000-00000000000a')
     <> '00000000-0000-0000-0000-00000000000a' then
    raise exception 'FALHA: user_id não veio de auth.uid()';
  end if;
  if (select count(*) from public.transaction_history where transaction_id = '30000000-0000-0000-0000-00000000000a' and action = 'CREATE') <> 1 then
    raise exception 'FALHA: CREATE não gravou histórico';
  end if;
  if exists (select 1 from public.transaction_history where after ? 'import_hash' or after ? 'user_id' or after ? 'id' or after ? 'created_at') then
    raise exception 'FALHA: campo proibido vazou no histórico';
  end if;
end $$;

-- Atualização gera UPDATE com só o campo alterado
update public.transactions set value_cents = 20000 where id = '30000000-0000-0000-0000-00000000000a';
do $$
declare h record;
begin
  select * into h from public.transaction_history
   where transaction_id = '30000000-0000-0000-0000-00000000000a' and action = 'UPDATE';
  if h is null or h.changed_fields <> array['value_cents'] or (h.before->>'value_cents')::bigint <> 12345
     or (h.after->>'value_cents')::bigint <> 20000 or h.origin <> 'manual' then
    raise exception 'FALHA: histórico de UPDATE incorreto: %', row_to_json(h);
  end if;
end $$;

-- Origem 'ai' via set_config (como uma RPC server-side faria)
select set_config('app.tx_origin', 'ai', true) \g /dev/null
update public.transactions set category = 'Lazer' where id = '30000000-0000-0000-0000-00000000000a';
select set_config('app.tx_origin', '', true) \g /dev/null
do $$ begin
  if not exists (select 1 from public.transaction_history where origin = 'ai' and changed_fields = array['category']) then
    raise exception 'FALHA: origem ai não registrada';
  end if;
end $$;

-- Soft delete vira SOFT_DELETE e sai dos agregados
update public.transactions set deleted_at = now() where id = '30000000-0000-0000-0000-00000000000a';
do $$ begin
  if not exists (select 1 from public.transaction_history where action = 'SOFT_DELETE') then
    raise exception 'FALHA: SOFT_DELETE não registrado';
  end if;
  if exists (select 1 from public.monthly_totals where month = '2026-11' and expense_cents > 0) then
    raise exception 'FALHA: transação apagada entrou no agregado';
  end if;
end $$;
update public.transactions set deleted_at = null where id = '30000000-0000-0000-0000-00000000000a';

-- Campos imutáveis
do $$ begin
  begin
    update public.transactions set import_hash = 'outro' where id = '30000000-0000-0000-0000-00000000000a';
    raise exception 'FALHA: import_hash foi alterado';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.transactions set created_at = now() - interval '1 day' where id = '30000000-0000-0000-0000-00000000000a';
    raise exception 'FALHA: created_at foi alterado';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Cliente não apaga transação nem mexe no histórico
do $$ begin
  begin
    delete from public.transactions where id = '30000000-0000-0000-0000-00000000000a';
    raise exception 'FALHA: DELETE de transação permitido';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.transaction_history (transaction_id, user_id, action, origin)
    values ('30000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'UPDATE', 'manual');
    raise exception 'FALHA: INSERT direto no histórico permitido';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.transaction_history set origin = 'ai';
    raise exception 'FALHA: UPDATE no histórico permitido';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.transaction_history;
    raise exception 'FALHA: DELETE no histórico permitido';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Transferência: cliente não grava direto; só pela RPC atômica e idempotente
insert into public.accounts (id, name, type) values ('10000000-0000-0000-0000-0000000000a2', 'Poupança A', 'poupanca');
do $$
declare t1 uuid; t2 uuid;
begin
  begin
    insert into public.transactions (description, value_cents, type, category, date, from_account_id, to_account_id)
    values ('Transferência', 99999, 'transferencia', 'Outros', '2026-11-11',
            '10000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000000a2');
    raise exception 'FALHA: cliente gravou transferência direto';
  exception when insufficient_privilege then null;
  end;
  t1 := public.create_transfer('10000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000000a2',
                               99999, '2026-11-11', 'Reserva', 'idem-transfer-0001');
  t2 := public.create_transfer('10000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000000a2',
                               99999, '2026-11-11', 'Reserva', 'idem-transfer-0001');
  if t1 <> t2 then raise exception 'FALHA: replay criou outra transferência'; end if;
  if (select balance_cents from public.accounts where id = '10000000-0000-0000-0000-00000000000a') <> 150000 - 99999
     or (select balance_cents from public.accounts where id = '10000000-0000-0000-0000-0000000000a2') <> 99999 then
    raise exception 'FALHA: saldos não moveram exatamente uma vez';
  end if;
  if (select count(*) from public.account_history where action = 'TRANSFER') <> 2 then
    raise exception 'FALHA: histórico das contas não registrou a transferência';
  end if;
  begin
    update public.transactions set value_cents = 1 where id = t1;
    if found then raise exception 'FALHA: cliente alterou transferência'; end if;
  end;
end $$;
insert into public.transactions (description, value_cents, type, category, date, paid_invoice_month)
values ('Pagamento fatura', 88888, 'saida', 'Outros', '2026-11-12', '2026-10');
insert into public.transactions (description, value_cents, type, category, date)
values ('Salário', 500000, 'entrada', 'Salário', '2026-11-05');
do $$
declare m record;
begin
  select * into m from public.monthly_totals where month = '2026-11';
  if m.income_cents <> 500000 or m.expense_cents <> 20000 then
    raise exception 'FALHA: agregado mensal errado: %', row_to_json(m);
  end if;
  if (select expense_cents from public.monthly_category_totals where month = '2026-11' and category = 'Lazer') <> 20000 then
    raise exception 'FALHA: agregado por categoria errado';
  end if;
end $$;

-- Usuário B não vê nem altera nada de A --------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000b') \g /dev/null
do $$
declare n int;
begin
  if (select count(*) from public.accounts) + (select count(*) from public.credit_cards)
     + (select count(*) from public.transactions) + (select count(*) from public.transaction_history)
     + (select count(*) from public.monthly_totals) <> 0 then
    raise exception 'FALHA: B enxerga dados de A';
  end if;
  update public.transactions set value_cents = 1 where id = '30000000-0000-0000-0000-00000000000a';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHA: B alterou transação de A'; end if;
  delete from public.accounts where id = '10000000-0000-0000-0000-00000000000a';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHA: B apagou conta de A'; end if;
  -- B não cria registro em nome de A
  begin
    insert into public.accounts (user_id, name, type) values ('00000000-0000-0000-0000-00000000000a', 'X', 'corrente');
    raise exception 'FALHA: B criou conta em nome de A';
  exception when insufficient_privilege then null;
  end;
  -- B não transfere usando conta de A
  begin
    perform public.create_transfer('10000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000000a2',
                                   1, '2026-11-11', 'x', 'idem-transfer-b-01');
    raise exception 'FALHA: B transferiu com contas de A';
  exception when insufficient_privilege then null;
  end;
  -- B não aponta transação para a conta de A (FK composta)
  begin
    insert into public.transactions (description, value_cents, type, category, date, account_id)
    values ('Invasão', 100, 'saida', 'Outros', '2026-11-10', '10000000-0000-0000-0000-00000000000a');
    raise exception 'FALHA: B usou conta de A';
  exception when foreign_key_violation then null;
  end;
end $$;

-- Validações de forma --------------------------------------------------------
do $$ begin
  begin
    insert into public.transactions (description, value_cents, type, category, date) values ('Zero', 0, 'saida', 'Outros', '2026-11-10');
    raise exception 'FALHA: valor zero aceito';
  exception when check_violation then null;
  end;
  begin
    insert into public.transactions (description, value_cents, type, category, date, installment_group_id, installment_index, installment_count)
    values ('Parcela', 100, 'saida', 'Outros', '2026-11-10', gen_random_uuid(), 4, 3);
    raise exception 'FALHA: parcela 4 de 3 aceita';
  exception when check_violation then null;
  end;
end $$;

-- A apaga a poupança usada numa transferência: permitido e auditado ----------
select pg_temp.login('00000000-0000-0000-0000-00000000000a') \g /dev/null
delete from public.accounts where id = '10000000-0000-0000-0000-0000000000a2';
do $$ begin
  if not exists (select 1 from public.account_history where account_id = '10000000-0000-0000-0000-0000000000a2' and action = 'DELETE') then
    raise exception 'FALHA: exclusão de conta sem histórico';
  end if;
  if exists (select 1 from public.transactions where to_account_id is not null and type = 'transferencia') then
    raise exception 'FALHA: referência da conta apagada não foi zerada';
  end if;
  begin
    delete from public.account_history;
    raise exception 'FALHA: cliente apagou histórico de conta';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Visitante sem login não lê nada --------------------------------------------
reset role;
set local role anon;
do $$ begin
  begin
    perform 1 from public.transactions;
    raise exception 'FALHA: anon leu transações';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
-- Exclusão LGPD do usuário apaga tudo em cascata (sem erro de FK do histórico)
delete from auth.users where id = '00000000-0000-0000-0000-00000000000a';
do $$ begin
  if exists (select 1 from public.accounts) or exists (select 1 from public.transactions)
     or exists (select 1 from public.transaction_history) or exists (select 1 from public.account_history) then
    raise exception 'FALHA: sobrou dado após excluir o usuário';
  end if;
end $$;
\echo 'OK: todos os testes de RLS do núcleo financeiro passaram'
rollback;
