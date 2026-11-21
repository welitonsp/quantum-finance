-- audit_timeline: só leitura para authenticated.
-- Os default privileges do Supabase dão INSERT/UPDATE/DELETE em relações novas do
-- schema public, e o revoke da 0018 não tirava do authenticated. A view já não é
-- atualizável (UNION ALL), mas deixamos a permissão exata. Sem DROP.
revoke insert, update, delete, truncate, references, trigger on public.audit_timeline from authenticated;
