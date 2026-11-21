-- =============================================================================
-- Quantum Finance — finanças compartilhadas (grupos) no Supabase
-- Espelha as regras do Firestore e das callables acceptGroupInvite,
-- createGroupExpense e settleGroupExpenseShare:
--   * só membros leem o grupo, os membros, as despesas e as cotas;
--   * criar grupo, convidar, aceitar/recusar convite, lançar despesa e quitar
--     cota passam por funções do servidor (o cliente não grava direto);
--   * aceite é atômico, de uso único, com prazo e exige o e-mail do convite;
--   * cotas: uids do grupo, sem repetição, centavos inteiros, soma == total;
--   * cada membro quita só a própria cota; quem pagou ou o dono quitam qualquer uma.
-- Sem DROP: aplica igual pelo conector.
-- =============================================================================

create table if not exists public.groups (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 80),
  description text check (description is null or char_length(description) <= 300),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists groups_owner_idx on public.groups (owner_id);

create table if not exists public.group_members (
  group_id     uuid not null references public.groups (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  email        text not null default '' check (char_length(email) <= 254),
  joined_at    timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists group_members_user_idx on public.group_members (user_id);

create table if not exists public.group_invites (
  id                   uuid primary key default gen_random_uuid(),
  group_id             uuid not null references public.groups (id) on delete cascade,
  group_name           text not null check (char_length(group_name) between 1 and 80),
  inviter_id           uuid not null references auth.users (id) on delete cascade,
  inviter_display_name text not null check (char_length(inviter_display_name) between 1 and 80),
  invitee_email        text not null check (char_length(invitee_email) between 3 and 254 and invitee_email = lower(invitee_email)),
  status               text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  expires_at           timestamptz not null default now() + interval '7 days',
  created_at           timestamptz not null default now(),
  responded_at         timestamptz
);
create index if not exists group_invites_group_idx on public.group_invites (group_id);
create index if not exists group_invites_email_idx on public.group_invites (invitee_email) where status = 'pending';
create unique index if not exists group_invites_one_pending
  on public.group_invites (group_id, invitee_email) where status = 'pending';

create table if not exists public.group_expenses (
  id                 uuid primary key default gen_random_uuid(),
  group_id           uuid not null references public.groups (id) on delete cascade,
  description        text not null check (char_length(btrim(description)) between 1 and 160),
  total_cents        bigint not null check (total_cents > 0),
  category           text not null default 'Outros' check (char_length(category) between 1 and 60),
  date               date not null,
  payer_id           uuid not null references auth.users (id) on delete cascade,
  payer_display_name text not null check (char_length(payer_display_name) between 1 and 80),
  split_method       text not null check (split_method in ('igual', 'proporcional', 'personalizado')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists group_expenses_group_idx on public.group_expenses (group_id, date desc);
create index if not exists group_expenses_payer_idx on public.group_expenses (payer_id);

create table if not exists public.group_expense_shares (
  expense_id   uuid not null references public.group_expenses (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  amount_cents bigint not null check (amount_cents >= 0),
  paid         boolean not null default false,
  paid_at      timestamptz,
  primary key (expense_id, user_id)
);
create index if not exists group_expense_shares_user_idx on public.group_expense_shares (user_id);

-- updated_at do servidor
do $$
declare t text;
begin
  foreach t in array array['groups', 'group_expenses'] loop
    if not exists (select 1 from pg_trigger where tgname = t || '_set_updated_at') then
      execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
                     t || '_set_updated_at', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Ajudantes de RLS (security definer evita recursão na política de membros)
-- ---------------------------------------------------------------------------
create or replace function public.is_group_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.group_members
                  where group_id = p_group_id and user_id = (select auth.uid()));
$$;

create or replace function public.is_group_owner(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.groups
                  where id = p_group_id and owner_id = (select auth.uid()));
$$;

revoke all on function public.is_group_member(uuid) from public, anon;
revoke all on function public.is_group_owner(uuid) from public, anon;
grant execute on function public.is_group_member(uuid) to authenticated;
grant execute on function public.is_group_owner(uuid) to authenticated;

-- e-mail do login atual, normalizado
create or replace function public.current_user_email()
returns text
language sql
stable
set search_path = ''
as $$
  select lower(btrim(coalesce(auth.jwt() ->> 'email', '')));
$$;
revoke all on function public.current_user_email() from public, anon;
grant execute on function public.current_user_email() to authenticated;

-- ---------------------------------------------------------------------------
-- RLS e privilégios: leitura por política; escrita só pelas funções abaixo,
-- exceto editar nome/descrição e apagar (dono), apagar convite (dono) e
-- apagar despesa (quem pagou ou dono).
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['groups', 'group_members', 'group_invites', 'group_expenses', 'group_expense_shares'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon', t);
    execute format('revoke insert, update, delete, truncate, references, trigger on public.%I from authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

grant update (name, description) on public.groups to authenticated;
grant delete on public.groups, public.group_invites, public.group_expenses to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'groups_member_select') then
    create policy groups_member_select on public.groups for select to authenticated
      using (owner_id = (select auth.uid()) or public.is_group_member(id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'groups_owner_update') then
    create policy groups_owner_update on public.groups for update to authenticated
      using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'groups_owner_delete') then
    create policy groups_owner_delete on public.groups for delete to authenticated
      using (owner_id = (select auth.uid()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'group_members_member_select') then
    create policy group_members_member_select on public.group_members for select to authenticated
      using (public.is_group_member(group_id));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'group_invites_select') then
    create policy group_invites_select on public.group_invites for select to authenticated
      using (public.is_group_member(group_id) or invitee_email = public.current_user_email());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'group_invites_owner_delete') then
    create policy group_invites_owner_delete on public.group_invites for delete to authenticated
      using (public.is_group_owner(group_id));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'group_expenses_member_select') then
    create policy group_expenses_member_select on public.group_expenses for select to authenticated
      using (public.is_group_member(group_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'group_expenses_payer_owner_delete') then
    create policy group_expenses_payer_owner_delete on public.group_expenses for delete to authenticated
      using (public.is_group_member(group_id)
             and (payer_id = (select auth.uid()) or public.is_group_owner(group_id)));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'group_expense_shares_member_select') then
    create policy group_expense_shares_member_select on public.group_expense_shares for select to authenticated
      using (exists (select 1 from public.group_expenses e
                      where e.id = expense_id and public.is_group_member(e.group_id)));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Funções de escrita
-- ---------------------------------------------------------------------------
create or replace function public.create_group(
  p_name         text,
  p_description  text default null,
  p_display_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text := public.current_user_email();
  v_id    uuid;
begin
  if v_uid is null then
    raise exception 'não autenticado' using errcode = '42501';
  end if;
  if (select count(*) from public.groups
       where owner_id = v_uid and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'limite de grupos por hora atingido' using errcode = 'QF429';
  end if;

  insert into public.groups (owner_id, name, description)
  values (v_uid, btrim(coalesce(p_name, '')), nullif(btrim(coalesce(p_description, '')), ''))
  returning id into v_id;

  insert into public.group_members (group_id, user_id, display_name, email)
  values (v_id, v_uid,
          left(coalesce(nullif(btrim(coalesce(p_display_name, '')), ''), nullif(v_email, ''), 'Membro'), 80),
          left(v_email, 254));
  return v_id;
end;
$$;

create or replace function public.create_group_invite(
  p_group_id             uuid,
  p_invitee_email        text,
  p_inviter_display_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text := lower(btrim(coalesce(p_invitee_email, '')));
  v_group public.groups%rowtype;
  v_id    uuid;
begin
  if v_uid is null then
    raise exception 'não autenticado' using errcode = '42501';
  end if;
  select * into v_group from public.groups where id = p_group_id;
  if not found or v_group.owner_id <> v_uid then
    raise exception 'só o dono do grupo convida' using errcode = '42501';
  end if;
  if char_length(v_email) > 254 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'e-mail inválido' using errcode = '22023';
  end if;
  if (select count(*) from public.group_invites
       where inviter_id = v_uid and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'limite de convites por hora atingido' using errcode = 'QF429';
  end if;

  select id into v_id from public.group_invites
   where group_id = p_group_id and invitee_email = v_email and status = 'pending'
     and expires_at > now();
  if found then
    return v_id;
  end if;
  -- convite pendente vencido sai do caminho do índice único
  update public.group_invites set status = 'rejected', responded_at = now()
   where group_id = p_group_id and invitee_email = v_email and status = 'pending';

  insert into public.group_invites (group_id, group_name, inviter_id, inviter_display_name, invitee_email)
  values (p_group_id, v_group.name, v_uid,
          left(coalesce(nullif(btrim(coalesce(p_inviter_display_name, '')), ''), 'Membro'), 80),
          v_email)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.accept_group_invite(
  p_group_id     uuid,
  p_invite_id    uuid,
  p_display_name text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_email  text := public.current_user_email();
  v_invite public.group_invites%rowtype;
begin
  if v_uid is null then
    raise exception 'não autenticado' using errcode = '42501';
  end if;
  select * into v_invite from public.group_invites
   where id = p_invite_id and group_id = p_group_id
   for update;
  if not found then
    raise exception 'convite não encontrado' using errcode = 'P0002';
  end if;
  if v_invite.status <> 'pending' then
    raise exception 'convite já respondido' using errcode = '22023';
  end if;
  if v_email = '' or v_email <> v_invite.invitee_email then
    raise exception 'convite é de outro e-mail' using errcode = '42501';
  end if;
  if v_invite.expires_at <= now() then
    raise exception 'convite vencido' using errcode = '22023';
  end if;
  if exists (select 1 from public.group_members where group_id = p_group_id and user_id = v_uid) then
    raise exception 'já é membro do grupo' using errcode = '22023';
  end if;

  insert into public.group_members (group_id, user_id, display_name, email)
  values (p_group_id, v_uid,
          left(coalesce(nullif(btrim(coalesce(p_display_name, '')), ''), v_email), 80),
          left(v_email, 254));
  update public.group_invites set status = 'accepted', responded_at = now() where id = p_invite_id;
  return true;
end;
$$;

create or replace function public.reject_group_invite(p_invite_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := public.current_user_email();
begin
  if auth.uid() is null then
    raise exception 'não autenticado' using errcode = '42501';
  end if;
  update public.group_invites set status = 'rejected', responded_at = now()
   where id = p_invite_id and status = 'pending' and v_email <> '' and invitee_email = v_email;
  if not found then
    raise exception 'convite não encontrado' using errcode = 'P0002';
  end if;
  return true;
end;
$$;

create or replace function public.create_group_expense(
  p_group_id           uuid,
  p_description        text,
  p_total_cents        bigint,
  p_category           text,
  p_date               text,
  p_split_method       text,
  p_payer_display_name text,
  p_shares             jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_desc  text := btrim(coalesce(p_description, ''));
  v_share jsonb;
  v_user  uuid;
  v_amt   numeric;
  v_sum   numeric := 0;
  v_seen  uuid[] := '{}';
  v_id    uuid;
begin
  if v_uid is null then
    raise exception 'não autenticado' using errcode = '42501';
  end if;
  if not exists (select 1 from public.group_members where group_id = p_group_id and user_id = v_uid) then
    raise exception 'não é membro do grupo' using errcode = '42501';
  end if;
  if char_length(v_desc) not between 1 and 160 then
    raise exception 'descrição inválida' using errcode = '22023';
  end if;
  if p_date is null or p_date !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'data inválida' using errcode = '22023';
  end if;
  if p_split_method is null or p_split_method not in ('igual', 'proporcional', 'personalizado') then
    raise exception 'método de divisão inválido' using errcode = '22023';
  end if;
  if p_total_cents is null or p_total_cents <= 0 then
    raise exception 'total inválido' using errcode = '22023';
  end if;
  if p_shares is null or jsonb_typeof(p_shares) <> 'array' or jsonb_array_length(p_shares) = 0 then
    raise exception 'cotas ausentes' using errcode = '22023';
  end if;
  if (select count(*) from public.group_expenses
       where payer_id = v_uid and created_at > now() - interval '1 hour') >= 120 then
    raise exception 'limite de despesas por hora atingido' using errcode = 'QF429';
  end if;

  -- valida todas as cotas antes de gravar
  for v_share in select value from jsonb_array_elements(p_shares) loop
    if jsonb_typeof(v_share) <> 'object'
       or jsonb_typeof(v_share -> 'uid') is distinct from 'string'
       or (v_share ->> 'uid') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'cota com membro inválido' using errcode = '22023';
    end if;
    v_user := (v_share ->> 'uid')::uuid;
    if not exists (select 1 from public.group_members where group_id = p_group_id and user_id = v_user) then
      raise exception 'cota de quem não é membro' using errcode = '42501';
    end if;
    if v_user = any (v_seen) then
      raise exception 'cota repetida' using errcode = '22023';
    end if;
    v_seen := v_seen || v_user;
    if jsonb_typeof(v_share -> 'amountCents') is distinct from 'number' then
      raise exception 'valor da cota inválido' using errcode = '22023';
    end if;
    v_amt := (v_share ->> 'amountCents')::numeric;
    if v_amt < 0 or v_amt <> trunc(v_amt) or v_amt > 9007199254740991 then
      raise exception 'valor da cota inválido' using errcode = '22023';
    end if;
    if jsonb_typeof(v_share -> 'paid') is distinct from 'boolean' then
      raise exception 'situação da cota inválida' using errcode = '22023';
    end if;
    v_sum := v_sum + v_amt;
  end loop;
  if v_sum <> p_total_cents then
    raise exception 'soma das cotas difere do total' using errcode = '22023';
  end if;

  insert into public.group_expenses (group_id, description, total_cents, category, date, payer_id,
                                     payer_display_name, split_method)
  values (p_group_id, v_desc, p_total_cents,
          left(coalesce(nullif(btrim(coalesce(p_category, '')), ''), 'Outros'), 60),
          p_date::date, v_uid,
          left(coalesce(nullif(btrim(coalesce(p_payer_display_name, '')), ''),
                        (select display_name from public.group_members where group_id = p_group_id and user_id = v_uid)), 80),
          p_split_method)
  returning id into v_id;

  -- nome de cada cota vem do cadastro do membro (não do cliente)
  insert into public.group_expense_shares (expense_id, user_id, display_name, amount_cents, paid, paid_at)
  select v_id, m.user_id, m.display_name, (s.value ->> 'amountCents')::bigint,
         (s.value ->> 'paid')::boolean,
         case when (s.value ->> 'paid')::boolean then now() end
    from jsonb_array_elements(p_shares) s
    join public.group_members m on m.group_id = p_group_id and m.user_id = (s.value ->> 'uid')::uuid;
  return v_id;
end;
$$;

create or replace function public.settle_group_expense_share(
  p_expense_id uuid,
  p_target_uid uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_target  uuid := coalesce(p_target_uid, auth.uid());
  v_expense public.group_expenses%rowtype;
  v_owner   uuid;
begin
  if v_uid is null then
    raise exception 'não autenticado' using errcode = '42501';
  end if;
  select * into v_expense from public.group_expenses where id = p_expense_id for update;
  if not found then
    raise exception 'despesa não encontrada' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.group_members where group_id = v_expense.group_id and user_id = v_uid) then
    raise exception 'não é membro do grupo' using errcode = '42501';
  end if;
  select owner_id into v_owner from public.groups where id = v_expense.group_id;
  if v_target <> v_uid and v_uid <> v_expense.payer_id and v_uid <> v_owner then
    raise exception 'só quem pagou ou o dono quitam a cota de outro membro' using errcode = '42501';
  end if;

  update public.group_expense_shares
     set paid = true, paid_at = coalesce(paid_at, now())
   where expense_id = p_expense_id and user_id = v_target;
  if not found then
    raise exception 'cota não encontrada' using errcode = 'P0002';
  end if;
  update public.group_expenses set updated_at = now() where id = p_expense_id;
  return true;
end;
$$;

revoke all on function public.create_group(text, text, text) from public, anon;
revoke all on function public.create_group_invite(uuid, text, text) from public, anon;
revoke all on function public.accept_group_invite(uuid, uuid, text) from public, anon;
revoke all on function public.reject_group_invite(uuid) from public, anon;
revoke all on function public.create_group_expense(uuid, text, bigint, text, text, text, text, jsonb) from public, anon;
revoke all on function public.settle_group_expense_share(uuid, uuid) from public, anon;
grant execute on function public.create_group(text, text, text) to authenticated;
grant execute on function public.create_group_invite(uuid, text, text) to authenticated;
grant execute on function public.accept_group_invite(uuid, uuid, text) to authenticated;
grant execute on function public.reject_group_invite(uuid) to authenticated;
grant execute on function public.create_group_expense(uuid, text, bigint, text, text, text, text, jsonb) to authenticated;
grant execute on function public.settle_group_expense_share(uuid, uuid) to authenticated;

-- Tempo real para a tela de grupos
do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'publicação supabase_realtime ausente (ambiente local) — ignorado';
    return;
  end if;
  foreach t in array array['groups', 'group_members', 'group_invites', 'group_expenses', 'group_expense_shares'] loop
    if not exists (select 1 from pg_publication_tables
                    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
