-- Quantidade da observação de preço precisa ser positiva (o schema do app já
-- recusa 0). Com o formato da 0010 (^\d{1,6}(\.\d{1,3})?$), "só zeros e ponto"
-- é exatamente o caso zero. Idempotente e sem DROP.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'price_observations_quantity_positive'
      and conrelid = 'public.price_observations'::regclass
  ) then
    alter table public.price_observations
      add constraint price_observations_quantity_positive check (quantity !~ '^[0.]+$');
  end if;
end $$;
