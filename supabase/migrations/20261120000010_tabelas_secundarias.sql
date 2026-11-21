-- =============================================================================
-- Quantum Finance — Etapa 3: tabelas secundárias
-- Sucessoras das subcoleções users/{uid}/: consents, dataProcessingLog,
-- shoppingLists, priceObservations, challenges, scoreHistory, fcmTokens e
-- decisions. Mesmo padrão das outras: user_id = auth.uid() por padrão, RLS
-- "só o dono", datas de criação sempre do servidor, dinheiro em centavos bigint.
-- =============================================================================

-- Consentimentos LGPD (um registro por usuário) -------------------------------
create table public.user_consents (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  analytics  boolean not null default false,
  ai         boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Registro de tratamento de dados (LGPD) — append-only para o cliente ---------
create table public.data_processing_log (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  event_type text not null check (event_type in (
    'consent_granted', 'export_requested', 'deletion_requested', 'portability')),
  details    text check (char_length(details) <= 200),
  created_at timestamptz not null default now()
);
create index data_processing_log_user_idx on public.data_processing_log (user_id, created_at desc);

-- Listas de compras (itens embutidos, como no Firestore) ----------------------
create table public.shopping_lists (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name                  text not null check (char_length(btrim(name)) between 1 and 80),
  scheduled_date        date,
  estimated_total_cents bigint not null default 0 check (estimated_total_cents >= 0),
  actual_total_cents    bigint check (actual_total_cents >= 0),
  status                text not null default 'open' check (status in ('open', 'in_progress', 'done')),
  linked_transaction_id uuid,
  items                 jsonb not null default '[]'::jsonb
                        check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) <= 200),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index shopping_lists_user_idx on public.shopping_lists (user_id, created_at desc);

-- Histórico de preços por produto/loja — sem edição pelo cliente --------------
create table public.price_observations (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  product_name     text not null check (char_length(btrim(product_name)) between 1 and 120),
  store            text not null check (char_length(btrim(store)) between 1 and 80),
  unit_price_cents bigint not null check (unit_price_cents > 0),
  quantity         text not null check (quantity ~ '^\d{1,6}(\.\d{1,3})?$'),
  unit             text not null check (unit in ('un', 'kg', 'g', 'L', 'mL', 'cx', 'pct', 'dz')),
  observed_at      date not null,
  source_list_id   uuid,
  created_at       timestamptz not null default now()
);
create index price_observations_product_idx on public.price_observations (user_id, product_name, observed_at desc);

-- Desafios de economia --------------------------------------------------------
create table public.challenges (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category       text not null check (char_length(btrim(category)) between 1 and 80),
  target_pct     smallint not null check (target_pct between 1 and 100),
  baseline_cents bigint not null check (baseline_cents >= 0),
  deadline_days  smallint not null check (deadline_days between 1 and 365),
  start_date     date not null,
  end_date       date not null,
  xp             integer not null default 0 check (xp >= 0),
  status         text not null default 'active' check (status in ('active', 'won', 'lost')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint challenges_dates check (end_date >= start_date)
);
create index challenges_user_idx on public.challenges (user_id);

-- Score financeiro mensal -----------------------------------------------------
create table public.score_history (
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  month           text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  score           smallint not null check (score between 0 and 100),
  taxa_poupanca   numeric(12, 4) not null default 0,
  endividamento   numeric(12, 4) not null default 0,
  reserva_meses   numeric(12, 4) not null default 0,
  comprometimento numeric(12, 4) not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (user_id, month)
);

-- Tokens de push do próprio aparelho: o dono grava, vê e apaga ---------------
create table public.push_tokens (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  token      text not null check (char_length(token) between 20 and 4096),
  created_at timestamptz not null default now(),
  primary key (user_id, token)
);

-- Diário de decisões do Agente: gravado pelo servidor; o dono só lê -----------
create table public.ai_decisions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  intent          text not null check (char_length(intent) between 1 and 80),
  question        text not null default '' check (char_length(question) <= 500),
  user_decision   text not null default 'none' check (user_decision in ('confirmed', 'rejected', 'expired', 'none')),
  outcome_status  text not null default 'pending' check (outcome_status in ('pending', 'applied', 'reverted', 'n/a')),
  proposed_action jsonb not null default '{}'::jsonb check (jsonb_typeof(proposed_action) = 'object'),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index ai_decisions_user_idx on public.ai_decisions (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Datas do servidor, dono imutável e RLS
-- ---------------------------------------------------------------------------
create or replace function public.force_server_created_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_at := now();
  return new;
end;
$$;
revoke execute on function public.force_server_created_at() from public, anon, authenticated;

-- Tabelas com chave pelo usuário (sem coluna id): dono e criação imutáveis.
create or replace function public.guard_user_key_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id or new.created_at is distinct from old.created_at then
    raise exception 'dono e data de criação do registro são imutáveis' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_user_key_immutable() from public, anon, authenticated;

do $$
declare t text;
begin
  -- tabelas com updated_at
  foreach t in array array['user_consents', 'shopping_lists', 'challenges', 'score_history', 'ai_decisions'] loop
    execute format('create trigger %I before insert on public.%I for each row execute function public.force_server_timestamps()', t || '_server_timestamps', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_set_updated_at', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.%I()', t || '_guard_owner', t,
                   case when t in ('user_consents', 'score_history') then 'guard_user_key_immutable' else 'guard_owner_immutable' end);
  end loop;
  -- tabelas só com created_at
  foreach t in array array['data_processing_log', 'price_observations', 'push_tokens'] loop
    execute format('create trigger %I before insert on public.%I for each row execute function public.force_server_created_at()', t || '_server_created_at', t);
  end loop;

  foreach t in array array['user_consents', 'data_processing_log', 'shopping_lists', 'price_observations',
                           'challenges', 'score_history', 'push_tokens', 'ai_decisions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;

  -- dono lê
  foreach t in array array['user_consents', 'data_processing_log', 'shopping_lists', 'price_observations',
                           'challenges', 'score_history', 'push_tokens', 'ai_decisions'] loop
    execute format('create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))', t || '_owner_select', t);
  end loop;
  -- dono cria
  foreach t in array array['user_consents', 'data_processing_log', 'shopping_lists', 'price_observations',
                           'challenges', 'score_history', 'push_tokens'] loop
    execute format('create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t || '_owner_insert', t);
  end loop;
  -- dono edita
  foreach t in array array['user_consents', 'shopping_lists', 'challenges', 'score_history'] loop
    execute format('create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t || '_owner_update', t);
  end loop;
  -- dono apaga
  foreach t in array array['shopping_lists', 'challenges', 'push_tokens'] loop
    execute format('create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t || '_owner_delete', t);
  end loop;
end $$;

-- registros append-only e tabelas do servidor: sem UPDATE/DELETE do cliente
revoke update, delete, truncate on public.data_processing_log, public.price_observations from authenticated;
revoke update, truncate on public.push_tokens from authenticated;
revoke insert, update, delete, truncate on public.ai_decisions from authenticated;
revoke delete, truncate on public.user_consents, public.score_history from authenticated;

-- Tempo real para as telas que observam mudanças
do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'publicação supabase_realtime ausente (ambiente local) — ignorado';
    return;
  end if;
  foreach t in array array['user_consents', 'shopping_lists', 'challenges', 'ai_decisions'] loop
    if not exists (select 1 from pg_publication_tables
                    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
