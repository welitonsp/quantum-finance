-- Tempo real (postgres_changes) para as tabelas que o app observa.
-- O Supabase não publica tabelas novas por padrão. O Realtime aplica a RLS:
-- cada cliente só recebe eventos das próprias linhas.
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'publicação supabase_realtime ausente (ambiente local) — ignorado';
    return;
  end if;
  foreach t in array array[
    'accounts', 'credit_cards', 'transactions', 'categories', 'category_rules',
    'budgets', 'goals', 'debts', 'recurring_tasks'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$$;
