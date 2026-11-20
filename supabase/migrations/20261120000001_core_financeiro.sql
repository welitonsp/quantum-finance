-- =============================================================================
-- Quantum Finance — Etapa 2 (parte 1): núcleo financeiro no Supabase/Postgres
--
-- Substitui users/{uid}/{accounts,creditCards,transactions,transactions/history}
-- do Firestore. Contratos preservados do CLAUDE.md:
--   • dinheiro SEMPRE em centavos inteiros (bigint), nunca float;
--   • histórico append-only, gravado na MESMA transação SQL da escrita
--     (sucessor do "Modelo A": atômico por definição, via trigger);
--   • import_hash, user_id, id e created_at nunca entram em before/after;
--   • isolamento por usuário via RLS (sucessor de firestore.rules);
--   • transação nunca é apagada pelo cliente: só soft delete (deleted_at).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Utilitários
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Contas
-- ---------------------------------------------------------------------------
create table public.accounts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name          text not null check (char_length(btrim(name)) between 1 and 80),
  type          text not null check (type in ('corrente', 'poupanca', 'investimento', 'cartao', 'divida')),
  balance_cents bigint not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- alvo das FKs compostas (id, user_id): impede apontar para conta de outro usuário
  unique (id, user_id)
);
create index accounts_user_idx on public.accounts (user_id);

-- ---------------------------------------------------------------------------
-- Cartões de crédito
-- ---------------------------------------------------------------------------
create table public.credit_cards (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 80),
  limit_cents bigint not null default 0 check (limit_cents >= 0),
  closing_day smallint not null check (closing_day between 1 and 31),
  due_day     smallint not null check (due_day between 1 and 31),
  color       text not null default '#6366f1' check (char_length(color) <= 32),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, user_id)
);
create index credit_cards_user_idx on public.credit_cards (user_id);

-- ---------------------------------------------------------------------------
-- Transações
-- ---------------------------------------------------------------------------
create table public.transactions (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null default auth.uid() references auth.users (id) on delete cascade,
  description             text not null check (char_length(btrim(description)) between 1 and 200),
  value_cents             bigint not null check (value_cents > 0),
  type                    text not null check (type in ('entrada', 'saida', 'transferencia')),
  category                text not null check (char_length(btrim(category)) between 1 and 80),
  date                    date not null,
  account_id              uuid,
  card_id                 uuid,
  from_account_id         uuid,
  to_account_id           uuid,
  installment_group_id    uuid,
  installment_index       smallint check (installment_index >= 1),
  installment_count       smallint check (installment_count between 1 and 120),
  installment_total_cents bigint check (installment_total_cents > 0),
  is_recurring            boolean not null default false,
  tags                    text[] not null default '{}' check (cardinality(tags) <= 20),
  source                  text not null default 'manual' check (source in ('csv', 'ofx', 'pdf', 'manual')),
  fit_id                  text check (char_length(fit_id) <= 128),
  import_hash             text check (char_length(import_hash) <= 128),
  competencia             text check (competencia ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  paid_invoice_month      text check (paid_invoice_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  reconciliation_status   text check (reconciliation_status = 'reconciled'),
  reconciled_at           timestamptz,
  deleted_at              timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  -- parcelas: grupo, índice e total andam juntos e o índice cabe no total
  constraint transactions_installment_shape check (
    (installment_group_id is null and installment_index is null and installment_count is null)
    or (installment_group_id is not null and installment_index is not null
        and installment_count is not null and installment_index <= installment_count)
  ),
  -- transferência exige origem e destino distintos
  constraint transactions_transfer_shape check (
    type <> 'transferencia'
    or (from_account_id is not null and to_account_id is not null and from_account_id <> to_account_id)
  ),

  -- FKs compostas: a conta/cartão referenciado tem que ser do MESMO usuário.
  -- ON DELETE SET NULL (coluna) zera só a referência, nunca o user_id.
  foreign key (account_id, user_id)      references public.accounts (id, user_id)     on delete set null (account_id),
  foreign key (from_account_id, user_id) references public.accounts (id, user_id)     on delete set null (from_account_id),
  foreign key (to_account_id, user_id)   references public.accounts (id, user_id)     on delete set null (to_account_id),
  foreign key (card_id, user_id)         references public.credit_cards (id, user_id) on delete set null (card_id)
);

create index transactions_user_date_idx on public.transactions (user_id, date desc) where deleted_at is null;
create index transactions_user_card_idx on public.transactions (user_id, card_id) where card_id is not null;
create index transactions_installment_idx on public.transactions (user_id, installment_group_id) where installment_group_id is not null;
-- deduplicação de importação (sucessor do importHash no Firestore)
create unique index transactions_user_import_hash_uidx on public.transactions (user_id, import_hash) where import_hash is not null;

-- ---------------------------------------------------------------------------
-- Histórico append-only (sucessor de transactions/{id}/history)
-- ---------------------------------------------------------------------------
create table public.transaction_history (
  id             bigint generated always as identity primary key,
  transaction_id uuid not null references public.transactions (id) on delete cascade,
  user_id        uuid not null references auth.users (id) on delete cascade,
  action         text not null check (action in ('CREATE', 'UPDATE', 'SOFT_DELETE', 'RESTORE', 'BULK_UPDATE', 'UNDO_BULK_UPDATE')),
  origin         text not null check (origin in ('manual', 'ai', 'reconcile', 'bulk', 'import', 'system')),
  changed_fields text[] not null default '{}',
  before         jsonb,
  after          jsonb,
  created_at     timestamptz not null default now()
);
create index transaction_history_tx_idx on public.transaction_history (transaction_id, created_at desc);
create index transaction_history_user_idx on public.transaction_history (user_id, created_at desc);

-- Campos que NUNCA entram no delta do histórico (contrato do CLAUDE.md).
create or replace function public.tx_history_snapshot(row_data jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select row_data - 'id' - 'user_id' - 'created_at' - 'updated_at' - 'import_hash';
$$;

-- Origem da escrita: RPCs server-side fazem
--   perform set_config('app.tx_origin', 'ai', true);
-- antes de gravar. Escrita direta do cliente fica como 'manual'.
create or replace function public.tx_current_origin()
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  o text := coalesce(nullif(current_setting('app.tx_origin', true), ''), 'manual');
begin
  if o not in ('manual', 'ai', 'reconcile', 'bulk', 'import', 'system') then
    raise exception 'origem de escrita inválida' using errcode = '22023';
  end if;
  return o;
end;
$$;

create or replace function public.tx_write_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before  jsonb;
  v_after   jsonb;
  v_changed text[];
  v_action  text;
  v_origin  text := public.tx_current_origin();
begin
  if tg_op = 'INSERT' then
    v_after  := public.tx_history_snapshot(to_jsonb(new));
    insert into public.transaction_history (transaction_id, user_id, action, origin, changed_fields, before, after)
    values (new.id, new.user_id, 'CREATE', v_origin, '{}', null, v_after);
    return new;
  end if;

  -- UPDATE: grava só os campos que mudaram
  select coalesce(array_agg(n.key order by n.key), '{}')
    into v_changed
    from jsonb_each(public.tx_history_snapshot(to_jsonb(new))) n
    join jsonb_each(public.tx_history_snapshot(to_jsonb(old))) o using (key)
   where n.value is distinct from o.value;

  if cardinality(v_changed) = 0 then
    return new; -- nada relevante mudou (ex.: só updated_at)
  end if;

  select jsonb_object_agg(key, value) into v_before
    from jsonb_each(public.tx_history_snapshot(to_jsonb(old))) where key = any (v_changed);
  select jsonb_object_agg(key, value) into v_after
    from jsonb_each(public.tx_history_snapshot(to_jsonb(new))) where key = any (v_changed);

  v_action := case
    when old.deleted_at is null and new.deleted_at is not null then 'SOFT_DELETE'
    when old.deleted_at is not null and new.deleted_at is null then 'RESTORE'
    when v_origin = 'bulk' then 'BULK_UPDATE'
    else 'UPDATE'
  end;

  insert into public.transaction_history (transaction_id, user_id, action, origin, changed_fields, before, after)
  values (new.id, new.user_id, v_action, v_origin, v_changed, v_before, v_after);
  return new;
end;
$$;

-- Campos imutáveis após a criação.
create or replace function public.tx_guard_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
     or new.user_id is distinct from old.user_id
     or new.created_at is distinct from old.created_at
     or new.import_hash is distinct from old.import_hash then
    raise exception 'campo imutável da transação' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger transactions_guard_immutable
  before update on public.transactions
  for each row execute function public.tx_guard_immutable();

create trigger transactions_set_updated_at
  before update on public.transactions
  for each row execute function public.set_updated_at();

create trigger transactions_write_history
  after insert or update on public.transactions
  for each row execute function public.tx_write_history();

create trigger accounts_set_updated_at
  before update on public.accounts
  for each row execute function public.set_updated_at();

create trigger credit_cards_set_updated_at
  before update on public.credit_cards
  for each row execute function public.set_updated_at();

-- user_id de contas/cartões também é imutável
create or replace function public.guard_owner_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id or new.id is distinct from old.id then
    raise exception 'dono do registro é imutável' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger accounts_guard_owner before update on public.accounts
  for each row execute function public.guard_owner_immutable();
create trigger credit_cards_guard_owner before update on public.credit_cards
  for each row execute function public.guard_owner_immutable();

-- ---------------------------------------------------------------------------
-- RLS (sucessor de firestore.rules)
-- ---------------------------------------------------------------------------
alter table public.accounts            enable row level security;
alter table public.credit_cards        enable row level security;
alter table public.transactions        enable row level security;
alter table public.transaction_history enable row level security;

-- Visitante sem login não toca em nada.
revoke all on public.accounts, public.credit_cards, public.transactions, public.transaction_history from anon;

-- Histórico: só leitura para o dono; escrita exclusiva do trigger.
revoke insert, update, delete, truncate on public.transaction_history from authenticated;
-- Transações: sem DELETE pelo cliente (soft delete via deleted_at).
revoke delete, truncate on public.transactions from authenticated;

create policy accounts_owner_select on public.accounts for select to authenticated
  using (user_id = (select auth.uid()));
create policy accounts_owner_insert on public.accounts for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy accounts_owner_update on public.accounts for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy accounts_owner_delete on public.accounts for delete to authenticated
  using (user_id = (select auth.uid()));

create policy credit_cards_owner_select on public.credit_cards for select to authenticated
  using (user_id = (select auth.uid()));
create policy credit_cards_owner_insert on public.credit_cards for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy credit_cards_owner_update on public.credit_cards for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy credit_cards_owner_delete on public.credit_cards for delete to authenticated
  using (user_id = (select auth.uid()));

create policy transactions_owner_select on public.transactions for select to authenticated
  using (user_id = (select auth.uid()));
create policy transactions_owner_insert on public.transactions for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy transactions_owner_update on public.transactions for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy transaction_history_owner_select on public.transaction_history for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Agregados mensais (substituem os rollups e o teto de 500 transações)
--   • transferência não é receita nem despesa;
--   • pagamento de fatura (paid_invoice_month) não é consumo;
--   • soft-deleted fica fora.
-- security_invoker: a view respeita a RLS de quem consulta.
-- ---------------------------------------------------------------------------
create view public.monthly_totals
with (security_invoker = true)
as
select
  user_id,
  to_char(date, 'YYYY-MM') as month,
  coalesce(sum(value_cents) filter (where type = 'entrada'), 0)::bigint as income_cents,
  coalesce(sum(value_cents) filter (where type = 'saida' and paid_invoice_month is null), 0)::bigint as expense_cents,
  count(*) filter (where type <> 'transferencia')::bigint as tx_count
from public.transactions
where deleted_at is null
group by user_id, to_char(date, 'YYYY-MM');

create view public.monthly_category_totals
with (security_invoker = true)
as
select
  user_id,
  to_char(date, 'YYYY-MM') as month,
  category,
  sum(value_cents)::bigint as expense_cents
from public.transactions
where deleted_at is null and type = 'saida' and paid_invoice_month is null
group by user_id, to_char(date, 'YYYY-MM'), category;

revoke all on public.monthly_totals, public.monthly_category_totals from anon;
grant select on public.monthly_totals, public.monthly_category_totals to authenticated;
