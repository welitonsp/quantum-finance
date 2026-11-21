-- Linha do tempo de auditoria (substitui users/{uid}/audit_logs do Firestore).
-- No Supabase o histórico já é gravado pelo banco (gatilhos em transaction_history,
-- account_history e planning_history): é server-trusted e o cliente não escreve nele.
-- Esta view só junta os três para a tela de auditoria global.
--
-- security_invoker: a consulta roda com as permissões de quem lê, então a RLS de
-- cada tabela de histórico (dono só vê o próprio) continua valendo.
-- Sem DROP: create or replace é idempotente.
create or replace view public.audit_timeline
with (security_invoker = on) as
  select 'tx-' || h.id                         as id,
         'transactions'::text                  as entity,
         h.transaction_id                      as row_id,
         h.user_id,
         h.action,
         h.origin,
         h.changed_fields,
         coalesce(h.after ->> 'description', h.before ->> 'description') as label,
         h.created_at
    from public.transaction_history h
  union all
  select 'acc-' || h.id,
         'accounts'::text,
         h.account_id,
         h.user_id,
         h.action,
         h.origin,
         h.changed_fields,
         coalesce(h.after ->> 'name', h.before ->> 'name'),
         h.created_at
    from public.account_history h
  union all
  select 'plan-' || h.id,
         h.table_name,
         h.row_id,
         h.user_id,
         h.action,
         h.origin,
         h.changed_fields,
         coalesce(h.after ->> 'name', h.before ->> 'name',
                  h.after ->> 'description', h.before ->> 'description',
                  h.after ->> 'category', h.before ->> 'category'),
         h.created_at
    from public.planning_history h;

revoke all on public.audit_timeline from public, anon;
grant select on public.audit_timeline to authenticated;
