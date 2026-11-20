-- =============================================================================
-- created_at imutável em contas, cartões e nas 6 tabelas de planejamento
-- (revisão do #487). O histórico ignora created_at no delta; sem esta trava, o
-- cliente poderia retroagir a data de criação sem deixar rastro.
-- Transações já tinham essa trava (tx_guard_immutable).
-- =============================================================================
create or replace function public.guard_owner_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id
     or new.id is distinct from old.id
     or new.created_at is distinct from old.created_at then
    raise exception 'dono, id e data de criação do registro são imutáveis' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_owner_immutable() from public, anon, authenticated;
