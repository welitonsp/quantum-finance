-- Simula o mínimo do Supabase num Postgres puro, SÓ para testes locais/CI.
-- Nunca aplicar num projeto Supabase real (lá isso já existe).
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
-- claims completas do JWT (como no Supabase); os testes definem request.jwt.claims
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.jwt() to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant usage on schema public to anon, authenticated;
-- Supabase concede privilégios padrão às roles da API; a RLS decide o resto.
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;
