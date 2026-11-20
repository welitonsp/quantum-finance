-- =============================================================================
-- Quantum Finance — ajustes dos advisors do Supabase (2026-11-20)
--  • tira funções internas da superfície RPC (/rest/v1/rpc): só create_transfer
--    fica exposta, e só para authenticated;
--  • índices cobrindo as FKs (ON DELETE SET NULL ao apagar conta/cartão e
--    consultas por usuário);
--  • create_transfer serializa retries concorrentes da mesma chave de
--    idempotência (revisão do #485): o segundo recebe o id do primeiro.
-- =============================================================================

revoke execute on function
  public.tx_write_history(),
  public.account_write_history(),
  public.planning_write_history(),
  public.set_updated_at(),
  public.guard_owner_immutable(),
  public.tx_guard_immutable(),
  public.recurring_guard_last_executed(),
  public.tx_current_origin(),
  public.tx_history_snapshot(jsonb)
from public, anon, authenticated;

-- Supabase concede EXECUTE por padrão em funções novas do schema public.
-- Daqui em diante, funções novas nascem fechadas e são liberadas uma a uma.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

create index if not exists transactions_account_fk_idx      on public.transactions (account_id, user_id)      where account_id is not null;
create index if not exists transactions_card_fk_idx         on public.transactions (card_id, user_id)         where card_id is not null;
create index if not exists transactions_from_account_fk_idx on public.transactions (from_account_id, user_id) where from_account_id is not null;
create index if not exists transactions_to_account_fk_idx   on public.transactions (to_account_id, user_id)   where to_account_id is not null;
create index if not exists recurring_tasks_user_idx         on public.recurring_tasks (user_id);
-- o card_id parcial antigo fica coberto pelo novo
drop index if exists public.transactions_user_card_idx;

-- create_transfer com trava por chave de idempotência (mantém os grants atuais)
create or replace function public.create_transfer(
  p_from_account_id uuid,
  p_to_account_id   uuid,
  p_value_cents     bigint,
  p_date            date,
  p_description     text,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_tx_id uuid;
  v_n     int;
begin
  if v_uid is null then
    raise exception 'login obrigatório' using errcode = '42501';
  end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 128 then
    raise exception 'chave de idempotência inválida' using errcode = '22023';
  end if;
  if p_from_account_id is null or p_to_account_id is null or p_from_account_id = p_to_account_id then
    raise exception 'contas de origem e destino inválidas' using errcode = '22023';
  end if;
  if p_value_cents is null or p_value_cents <= 0 then
    raise exception 'valor deve ser positivo' using errcode = '22023';
  end if;

  -- serializa chamadas com a MESMA chave: a segunda espera a primeira terminar
  -- e então encontra a transferência já gravada (replay devolve o mesmo id).
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || p_idempotency_key, 0));

  -- replay idempotente: devolve a mesma transferência
  select id into v_tx_id from public.transactions
   where user_id = v_uid and idempotency_key = p_idempotency_key;
  if v_tx_id is not null then
    return v_tx_id;
  end if;

  -- trava as duas contas em ordem estável (evita deadlock) e confere o dono
  perform 1 from public.accounts
   where id in (p_from_account_id, p_to_account_id) and user_id = v_uid
   order by id
   for update;
  get diagnostics v_n = row_count;
  if v_n <> 2 then
    raise exception 'conta não encontrada' using errcode = '42501';
  end if;

  perform set_config('app.tx_origin', 'system', true);
  perform set_config('app.account_action', 'TRANSFER', true);

  update public.accounts set balance_cents = balance_cents - p_value_cents where id = p_from_account_id;
  update public.accounts set balance_cents = balance_cents + p_value_cents where id = p_to_account_id;

  insert into public.transactions (user_id, description, value_cents, type, category, date,
                                   from_account_id, to_account_id, idempotency_key)
  values (v_uid, coalesce(nullif(btrim(p_description), ''), 'Transferência'), p_value_cents,
          'transferencia', 'Transferência', p_date, p_from_account_id, p_to_account_id, p_idempotency_key)
  returning id into v_tx_id;

  perform set_config('app.tx_origin', '', true);
  perform set_config('app.account_action', '', true);
  return v_tx_id;
end;
$$;
