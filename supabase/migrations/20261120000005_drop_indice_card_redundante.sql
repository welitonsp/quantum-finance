-- Remove o índice parcial antigo de card_id, já coberto por
-- transactions_card_fk_idx (criado na 20261120000003).
-- Separado da 0003 porque o conector pede confirmação interativa para DROP;
-- aplicar pelo SQL editor do painel do Supabase.
drop index if exists public.transactions_user_card_idx;
