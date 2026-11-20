-- Datas de criação SEMPRE do servidor.
-- Sem isto, um INSERT do cliente podia mandar created_at retroativo (o default
-- só vale quando a coluna é omitida e o histórico não guarda created_at).
-- Espelha as regras de create do Firestore (createdAt == request.time).
-- O trigger BEFORE INSERT sobrescreve qualquer valor enviado pelo cliente.

create or replace function public.force_server_timestamps()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_at := now();
  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function public.force_server_timestamps() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['accounts', 'credit_cards', 'transactions', 'categories', 'category_rules',
                           'budgets', 'goals', 'debts', 'recurring_tasks'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_server_timestamps', t);
    execute format('create trigger %I before insert on public.%I for each row execute function public.force_server_timestamps()',
                   t || '_server_timestamps', t);
  end loop;
end $$;
