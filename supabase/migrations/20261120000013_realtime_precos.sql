-- =============================================================================
-- Quantum Finance — histórico de preços no tempo real
-- Observações de preço gravadas pela função record_price_observation (em outra
-- aba ou aparelho) precisam avisar a tela de Compras, como o onSnapshot fazia.
-- Sem DROP: aplica igual pelo conector.
-- =============================================================================
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'publicação supabase_realtime ausente (ambiente local) — ignorado';
    return;
  end if;
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'price_observations') then
    alter publication supabase_realtime add table public.price_observations;
  end if;
end $$;
