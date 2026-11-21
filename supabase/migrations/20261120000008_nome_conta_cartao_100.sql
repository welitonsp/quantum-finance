-- Alinha o limite do nome de contas e cartões ao app (Zod .max(100) e as
-- antigas Firestore Rules). O schema inicial limitava a 80 caracteres, o que
-- faria nomes válidos de 81–100 caracteres falharem só no Supabase.
-- Idempotente: substitui a constraint inline gerada (<tabela>_name_check).

alter table public.accounts drop constraint if exists accounts_name_check;
alter table public.accounts
  add constraint accounts_name_check check (char_length(btrim(name)) between 1 and 100);

alter table public.credit_cards drop constraint if exists credit_cards_name_check;
alter table public.credit_cards
  add constraint credit_cards_name_check check (char_length(btrim(name)) between 1 and 100);
