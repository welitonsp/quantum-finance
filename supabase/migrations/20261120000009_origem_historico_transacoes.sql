-- =============================================================================
-- Quantum Finance — origem correta no histórico de transações
--
-- Escrita direta do cliente fica com origem 'manual' (tx_current_origin). As
-- edições feitas pela IA, pela reconciliação e em lote precisam gravar a origem
-- certa no histórico append-only, como o Modelo A fazia no Firestore. Esta RPC
-- aplica um patch restrito a uma lista de transações do próprio usuário,
-- marcando a origem só dentro da transação SQL (set_config local).
--
--  • security invoker: a RLS "só o dono" continua valendo;
--  • só campos editáveis entram no patch; o resto é recusado;
--  • 'bulk_undo' grava a ação UNDO_BULK_UPDATE (trigger atualizado abaixo).
-- =============================================================================

create or replace function public.tx_write_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before  jsonb;
  v_after   jsonb;
  v_changed text[];
  v_action  text;
  v_origin  text := public.tx_current_origin();
begin
  if tg_op = 'INSERT' then
    v_after  := public.tx_history_snapshot(to_jsonb(new));
    insert into public.transaction_history (transaction_id, user_id, action, origin, changed_fields, before, after)
    values (new.id, new.user_id, 'CREATE', v_origin, '{}', null, v_after);
    return new;
  end if;

  -- exclusão do usuário (LGPD) em cascata: não há o que auditar
  if not exists (select 1 from auth.users where id = new.user_id) then
    return new;
  end if;

  -- UPDATE: grava só os campos que mudaram
  select coalesce(array_agg(n.key order by n.key), '{}')
    into v_changed
    from jsonb_each(public.tx_history_snapshot(to_jsonb(new))) n
    join jsonb_each(public.tx_history_snapshot(to_jsonb(old))) o using (key)
   where n.value is distinct from o.value;

  if cardinality(v_changed) = 0 then
    return new; -- nada relevante mudou (ex.: só updated_at)
  end if;

  select jsonb_object_agg(key, value) into v_before
    from jsonb_each(public.tx_history_snapshot(to_jsonb(old))) where key = any (v_changed);
  select jsonb_object_agg(key, value) into v_after
    from jsonb_each(public.tx_history_snapshot(to_jsonb(new))) where key = any (v_changed);

  v_action := case
    when old.deleted_at is null and new.deleted_at is not null then 'SOFT_DELETE'
    when old.deleted_at is not null and new.deleted_at is null then 'RESTORE'
    when v_origin = 'bulk' and current_setting('app.tx_action', true) = 'UNDO_BULK_UPDATE' then 'UNDO_BULK_UPDATE'
    when v_origin = 'bulk' then 'BULK_UPDATE'
    else 'UPDATE'
  end;

  insert into public.transaction_history (transaction_id, user_id, action, origin, changed_fields, before, after)
  values (new.id, new.user_id, v_action, v_origin, v_changed, v_before, v_after);
  return new;
end;
$$;


revoke execute on function public.tx_write_history() from public, anon, authenticated;

create or replace function public.update_transactions_with_origin(
  p_ids    uuid[],
  p_patch  jsonb,
  p_origin text
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_origin text;
  v_count  integer;
  v_bad    text;
begin
  if p_origin not in ('manual', 'ai', 'reconcile', 'bulk', 'bulk_undo') then
    raise exception 'origem inválida' using errcode = '22023';
  end if;
  if p_ids is null or cardinality(p_ids) = 0 then
    return 0;
  end if;
  if cardinality(p_ids) > 500 then
    raise exception 'lote grande demais (máximo 500)' using errcode = '22023';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb then
    raise exception 'patch vazio' using errcode = '22023';
  end if;
  select k into v_bad from jsonb_object_keys(p_patch) k
   where k not in ('description', 'value_cents', 'type', 'category', 'date', 'account_id', 'card_id',
                   'is_recurring', 'tags', 'source', 'fit_id', 'competencia', 'paid_invoice_month',
                   'reconciliation_status', 'reconciled_at')
   limit 1;
  if v_bad is not null then
    raise exception 'campo não editável: %', v_bad using errcode = '22023';
  end if;

  v_origin := case when p_origin = 'bulk_undo' then 'bulk' else p_origin end;
  perform set_config('app.tx_origin', v_origin, true);
  perform set_config('app.tx_action', case when p_origin = 'bulk_undo' then 'UNDO_BULK_UPDATE' else '' end, true);

  update public.transactions t set
    description           = case when p_patch ? 'description' then p_patch->>'description' else t.description end,
    value_cents           = case when p_patch ? 'value_cents' then (p_patch->>'value_cents')::bigint else t.value_cents end,
    type                  = case when p_patch ? 'type' then p_patch->>'type' else t.type end,
    category              = case when p_patch ? 'category' then p_patch->>'category' else t.category end,
    date                  = case when p_patch ? 'date' then (p_patch->>'date')::date else t.date end,
    account_id            = case when p_patch ? 'account_id' then (p_patch->>'account_id')::uuid else t.account_id end,
    card_id               = case when p_patch ? 'card_id' then (p_patch->>'card_id')::uuid else t.card_id end,
    is_recurring          = case when p_patch ? 'is_recurring' then (p_patch->>'is_recurring')::boolean else t.is_recurring end,
    tags                  = case when p_patch ? 'tags' then array(select jsonb_array_elements_text(p_patch->'tags')) else t.tags end,
    source                = case when p_patch ? 'source' then p_patch->>'source' else t.source end,
    fit_id                = case when p_patch ? 'fit_id' then p_patch->>'fit_id' else t.fit_id end,
    competencia           = case when p_patch ? 'competencia' then p_patch->>'competencia' else t.competencia end,
    paid_invoice_month    = case when p_patch ? 'paid_invoice_month' then p_patch->>'paid_invoice_month' else t.paid_invoice_month end,
    reconciliation_status = case when p_patch ? 'reconciliation_status' then p_patch->>'reconciliation_status' else t.reconciliation_status end,
    reconciled_at         = case when p_patch ? 'reconciled_at' then (p_patch->>'reconciled_at')::timestamptz else t.reconciled_at end
  where t.id = any (p_ids)
    and t.deleted_at is null;
  get diagnostics v_count = row_count;

  -- não deixa a marcação vazar para outras escritas da mesma transação
  perform set_config('app.tx_origin', '', true);
  perform set_config('app.tx_action', '', true);
  return v_count;
end;
$$;

revoke execute on function public.update_transactions_with_origin(uuid[], jsonb, text) from public, anon;
grant execute on function public.update_transactions_with_origin(uuid[], jsonb, text) to authenticated;
