-- =============================================================================
-- Quantum Finance — importação registrada com origem 'import' no histórico
-- A importação de extrato grava direto pela API (em lotes), então o gatilho via
-- origem 'manual'. Toda linha importada tem import_hash (deduplicação) e a
-- criação manual não tem; o gatilho passa a usar isso para marcar 'import',
-- como o fluxo de importação do Firestore fazia. Sem DROP: aplica igual pelo conector.
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
    -- linha com import_hash vem da importação de extrato (CSV/OFX/PDF)
    if v_origin = 'manual' and new.import_hash is not null then
      v_origin := 'import';
    end if;
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
