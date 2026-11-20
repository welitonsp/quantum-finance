-- =============================================================================
-- Quantum Finance — ajustes dos advisors do Supabase (2026-11-20)
--  • tira funções internas da superfície RPC (/rest/v1/rpc): só create_transfer
--    fica exposta, e só para authenticated;
--  • índices cobrindo as FKs (ON DELETE SET NULL ao apagar conta/cartão e
--    consultas por usuário).
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
