-- =============================================================================
-- Quantum Finance — Etapa 2 (parte 2): planejamento
-- categories, category_rules, budgets, goals, debts, recurring_tasks
-- Sucessor das subcoleções homônimas em users/{uid}. Dinheiro em centavos bigint.
-- =============================================================================

create table public.categories (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name            text not null check (char_length(btrim(name)) between 1 and 60),
  normalized_name text not null check (char_length(btrim(normalized_name)) between 1 and 80),
  type            text not null check (type in ('entrada', 'saida', 'ambos')),
  color           text not null check (char_length(color) between 1 and 80),
  icon            text check (char_length(icon) <= 24),
  is_default      boolean not null default false,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, normalized_name)
);

create table public.category_rules (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  keyword    text not null check (char_length(btrim(keyword)) between 1 and 80),
  category   text not null check (char_length(btrim(category)) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index category_rules_user_idx on public.category_rules (user_id);

create table public.budgets (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category     text not null check (char_length(btrim(category)) between 1 and 80),
  target_cents bigint not null check (target_cents > 0),
  period       text not null default 'monthly' check (period = 'monthly'),
  month        text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, month, category)
);

create table public.goals (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name          text not null check (char_length(btrim(name)) between 1 and 80),
  target_cents  bigint not null check (target_cents > 0),
  current_cents bigint not null default 0 check (current_cents >= 0),
  deadline      date,
  emoji         text check (char_length(emoji) <= 16),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index goals_user_idx on public.goals (user_id);

create table public.debts (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name              text not null check (char_length(btrim(name)) between 1 and 80),
  creditor          text not null default '' check (char_length(creditor) <= 80),
  total_cents       bigint not null check (total_cents > 0),
  remaining_cents   bigint not null check (remaining_cents >= 0),
  -- taxa MENSAL (0.0185 = 1,85% a.m.). Não é dinheiro: numeric exato, nunca float.
  interest_rate     numeric(9, 6) not null default 0 check (interest_rate >= 0 and interest_rate < 1),
  installments      smallint not null check (installments between 1 and 600),
  paid_installments smallint not null default 0 check (paid_installments >= 0),
  due_day_of_month  smallint not null check (due_day_of_month between 1 and 31),
  start_date        date not null,
  category          text not null check (category in ('emprestimo', 'financiamento', 'cartao', 'cheque_especial', 'outro')),
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint debts_paid_le_total check (paid_installments <= installments),
  constraint debts_remaining_le_total check (remaining_cents <= total_cents)
);
create index debts_user_idx on public.debts (user_id);

create table public.recurring_tasks (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default auth.uid() references auth.users (id) on delete cascade,
  description         text not null check (char_length(btrim(description)) between 1 and 200),
  value_cents         bigint not null check (value_cents > 0),
  category            text not null check (char_length(btrim(category)) between 1 and 80),
  type                text not null default 'saida' check (type in ('entrada', 'saida')),
  frequency           text not null default 'mensal' check (frequency in ('mensal', 'anual')),
  due_day             smallint not null check (due_day between 1 and 31),
  due_month           smallint check (due_month between 1 and 12),
  active              boolean not null default true,
  last_executed_month text check (last_executed_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint recurring_annual_needs_month check (frequency <> 'anual' or due_month is not null)
);
create index recurring_tasks_due_idx on public.recurring_tasks (due_day) where active;

-- ---------------------------------------------------------------------------
-- updated_at, dono imutável e RLS "só o dono" — iguais para as 6 tabelas
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['categories', 'category_rules', 'budgets', 'goals', 'debts', 'recurring_tasks'] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_set_updated_at', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.guard_owner_immutable()', t || '_guard_owner', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))', t || '_owner_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t || '_owner_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t || '_owner_update', t);
    -- categorias não são apagadas pelo cliente: desativa-se com is_active = false
    if t <> 'categories' then
      execute format('create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t || '_owner_delete', t);
    end if;
  end loop;
end $$;
revoke delete, truncate on public.categories from authenticated;

-- ---------------------------------------------------------------------------
-- Histórico append-only do planejamento (sucessor de recurringTasks/{id}/history
-- e afins). Gravado por trigger na mesma transação: nenhuma escrita do cliente
-- passa sem registro. Sem FK para a linha de origem: a exclusão fica registrada.
-- ---------------------------------------------------------------------------
create table public.planning_history (
  id             bigint generated always as identity primary key,
  table_name     text not null check (table_name in ('categories', 'category_rules', 'budgets', 'goals', 'debts', 'recurring_tasks')),
  row_id         uuid not null,
  user_id        uuid not null references auth.users (id) on delete cascade,
  action         text not null check (action in ('CREATE', 'UPDATE', 'DELETE')),
  origin         text not null check (origin in ('manual', 'ai', 'reconcile', 'bulk', 'import', 'system')),
  changed_fields text[] not null default '{}',
  before         jsonb,
  after          jsonb,
  created_at     timestamptz not null default now()
);
create index planning_history_row_idx on public.planning_history (table_name, row_id, created_at desc);
create index planning_history_user_idx on public.planning_history (user_id, created_at desc);

create or replace function public.planning_write_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old     jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) - 'id' - 'user_id' - 'created_at' - 'updated_at' end;
  v_new     jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) - 'id' - 'user_id' - 'created_at' - 'updated_at' end;
  v_row_id  uuid := case when tg_op = 'DELETE' then old.id else new.id end;
  v_user_id uuid := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
  v_changed text[] := '{}';
begin
  -- exclusão do usuário (LGPD) em cascata: não há o que auditar
  if not exists (select 1 from auth.users where id = v_user_id) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'UPDATE' then
    select coalesce(array_agg(n.key order by n.key), '{}') into v_changed
      from jsonb_each(v_new) n join jsonb_each(v_old) o using (key)
     where n.value is distinct from o.value;
    if cardinality(v_changed) = 0 then
      return new;
    end if;
    select jsonb_object_agg(key, value) into v_old from jsonb_each(v_old) where key = any (v_changed);
    select jsonb_object_agg(key, value) into v_new from jsonb_each(v_new) where key = any (v_changed);
  end if;
  insert into public.planning_history (table_name, row_id, user_id, action, origin, changed_fields, before, after)
  values (tg_table_name, v_row_id, v_user_id,
          case tg_op when 'INSERT' then 'CREATE' when 'DELETE' then 'DELETE' else 'UPDATE' end,
          public.tx_current_origin(), v_changed, v_old, v_new);
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['categories', 'category_rules', 'budgets', 'goals', 'debts', 'recurring_tasks'] loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.planning_write_history()', t || '_write_history', t);
  end loop;
end $$;

alter table public.planning_history enable row level security;
revoke all on public.planning_history from anon;
revoke insert, update, delete, truncate on public.planning_history from authenticated;
create policy planning_history_owner_select on public.planning_history for select to authenticated
  using (user_id = (select auth.uid()));

-- last_executed_month é do agendador (pg_cron, etapa 6); o cliente não o forja.
create or replace function public.recurring_guard_last_executed()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon')
     and new.last_executed_month is distinct from (case when tg_op = 'UPDATE' then old.last_executed_month end) then
    raise exception 'last_executed_month é controlado pelo servidor' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger recurring_tasks_guard_last_executed
  before insert or update on public.recurring_tasks
  for each row execute function public.recurring_guard_last_executed();
