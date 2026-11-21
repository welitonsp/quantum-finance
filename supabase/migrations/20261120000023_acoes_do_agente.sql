-- =============================================================================
-- Quantum Finance — ações confirmadas do Agente no Supabase
-- Substitui a callable executeAgentAction: o LLM nunca grava; a tela envia a
-- proposta JÁ confirmada pelo humano e esta função revalida tudo no servidor,
-- grava a ação (histórico com origem 'ai') e o Diário de Decisões na mesma
-- transação, com idempotência por chave e limite de 60 por hora.
-- Erros que a tela roteia: SQLSTATE QF412 com o motivo em DETAIL
-- (confirmation_required, use_installment_form). Sem DROP.
-- =============================================================================

alter table public.ai_decisions
  add column if not exists idempotency_key text
    check (idempotency_key is null or char_length(idempotency_key) between 8 and 128),
  add column if not exists result jsonb
    check (result is null or jsonb_typeof(result) = 'object');
create unique index if not exists ai_decisions_user_idempotency_uidx
  on public.ai_decisions (user_id, idempotency_key) where idempotency_key is not null;
create index if not exists ai_decisions_user_created_idx on public.ai_decisions (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Ajudantes de validação (só usados por dentro da função principal)
-- ---------------------------------------------------------------------------
create or replace function public.agent_only_keys(p_obj jsonb, p_allowed text[], p_label text)
returns void language plpgsql immutable set search_path = '' as $$
declare v_extra text;
begin
  select string_agg(k, ', ' order by k) into v_extra
    from jsonb_object_keys(p_obj) k where not (k = any (p_allowed));
  if v_extra is not null then
    raise exception '%: campos não permitidos: %.', p_label, v_extra using errcode = '22023';
  end if;
end;
$$;

create or replace function public.agent_object(p_value jsonb, p_label text)
returns jsonb language plpgsql immutable set search_path = '' as $$
begin
  if p_value is null or jsonb_typeof(p_value) <> 'object' then
    raise exception '% deve ser um objeto.', p_label using errcode = '22023';
  end if;
  return p_value;
end;
$$;

create or replace function public.agent_text(p_value jsonb, p_field text, p_min int, p_max int)
returns text language plpgsql immutable set search_path = '' as $$
declare v text;
begin
  if p_value is null or jsonb_typeof(p_value) <> 'string' then
    raise exception '% deve ser uma string.', p_field using errcode = '22023';
  end if;
  v := btrim(p_value #>> '{}');
  if char_length(v) not between p_min and p_max then
    raise exception '% deve ter entre % e % caracteres.', p_field, p_min, p_max using errcode = '22023';
  end if;
  return v;
end;
$$;

create or replace function public.agent_cents(p_value jsonb, p_field text)
returns bigint language plpgsql immutable set search_path = '' as $$
declare v numeric;
begin
  if p_value is null or jsonb_typeof(p_value) <> 'number' then
    raise exception '% deve ser um inteiro de centavos positivo e seguro.', p_field using errcode = '22023';
  end if;
  v := (p_value #>> '{}')::numeric;
  if v <= 0 or v <> trunc(v) or v > 9007199254740991 then
    raise exception '% deve ser um inteiro de centavos positivo e seguro.', p_field using errcode = '22023';
  end if;
  return v::bigint;
end;
$$;

create or replace function public.agent_ymd(p_value jsonb, p_field text)
returns date language plpgsql immutable set search_path = '' as $$
declare v text; d date;
begin
  if p_value is null or jsonb_typeof(p_value) <> 'string' or (p_value #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception '% deve ser uma data no formato YYYY-MM-DD.', p_field using errcode = '22023';
  end if;
  v := p_value #>> '{}';
  begin
    d := v::date;
  exception when others then
    raise exception '% deve ser uma data válida (YYYY-MM-DD).', p_field using errcode = '22023';
  end;
  if to_char(d, 'YYYY-MM-DD') <> v then
    raise exception '% deve ser uma data válida (YYYY-MM-DD).', p_field using errcode = '22023';
  end if;
  return d;
end;
$$;

create or replace function public.agent_uuid(p_value jsonb, p_field text)
returns uuid language plpgsql immutable set search_path = '' as $$
declare v text := public.agent_text(p_value, p_field, 1, 128);
begin
  if v !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception '% não é um identificador válido.', p_field using errcode = '22023';
  end if;
  return v::uuid;
end;
$$;

revoke all on function public.agent_only_keys(jsonb, text[], text) from public, anon, authenticated;
revoke all on function public.agent_object(jsonb, text) from public, anon, authenticated;
revoke all on function public.agent_text(jsonb, text, int, int) from public, anon, authenticated;
revoke all on function public.agent_cents(jsonb, text) from public, anon, authenticated;
revoke all on function public.agent_ymd(jsonb, text) from public, anon, authenticated;
revoke all on function public.agent_uuid(jsonb, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Execução da ação confirmada
-- ---------------------------------------------------------------------------
create or replace function public.execute_agent_action(p_request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_req       jsonb;
  v_proposal  jsonb;
  v_raw       jsonb;
  v_kind      text;
  v_intent    text;
  v_question  text;
  v_tools     text[] := '{}';
  v_snapshot  text;
  v_sim       jsonb;
  v_key       text;
  v_payload   jsonb;
  v_amount    bigint;
  v_date      date;
  v_desc      text;
  v_category  text;
  v_card      uuid;
  v_from      uuid;
  v_to        uuid;
  v_target    uuid;
  v_n         int;
  v_id        uuid;
  v_decision  uuid;
  v_result    jsonb;
  v_existing  jsonb;
  v_rem       bigint;
  v_paid      int;
  v_inst      int;
  i           int;
begin
  if v_uid is null then
    raise exception 'não autenticado' using errcode = '42501';
  end if;

  -- envelope -----------------------------------------------------------------
  v_req := public.agent_object(p_request, 'Payload');
  perform public.agent_only_keys(v_req,
    array['proposal', 'intent', 'question', 'toolsUsed', 'snapshotRef', 'simulationResult', 'idempotencyKey'], 'Envelope');
  v_proposal := public.agent_object(v_req -> 'proposal', 'proposal');
  perform public.agent_only_keys(v_proposal, array['kind', 'status', 'payload'], 'proposal');

  v_kind := v_proposal ->> 'kind';
  if jsonb_typeof(v_proposal -> 'kind') is distinct from 'string' or v_kind not in
     ('register_purchase', 'register_debt_payment', 'create_budget', 'contribute_to_goal', 'register_income', 'register_transfer') then
    raise exception 'proposal.kind inválido.' using errcode = '22023';
  end if;

  -- gate de confirmação humana
  if jsonb_typeof(v_proposal -> 'status') is distinct from 'string' or v_proposal ->> 'status' <> 'confirmed' then
    raise exception 'Ação só pode ser executada após confirmação humana explícita (status "confirmed").'
      using errcode = 'QF412', detail = 'confirmation_required';
  end if;

  v_raw := public.agent_object(v_proposal -> 'payload', 'proposal.payload');

  -- payload por tipo ------------------------------------------------------------
  if v_kind in ('register_purchase', 'register_income') then
    if v_kind = 'register_purchase' then
      perform public.agent_only_keys(v_raw, array['description', 'amountCents', 'date', 'category', 'installments', 'cardId'], v_kind);
    else
      perform public.agent_only_keys(v_raw, array['description', 'amountCents', 'date', 'category'], v_kind);
    end if;
    v_desc     := public.agent_text(v_raw -> 'description', 'description', 1, 140);
    v_amount   := public.agent_cents(v_raw -> 'amountCents', 'amountCents');
    v_date     := public.agent_ymd(v_raw -> 'date', 'date');
    v_category := case when v_raw ? 'category' then public.agent_text(v_raw -> 'category', 'category', 1, 80) else 'Outros' end;
    v_payload  := jsonb_build_object('description', v_desc, 'amountCents', v_amount,
                                     'date', to_char(v_date, 'YYYY-MM-DD'), 'category', v_category);
    if v_raw ? 'installments' then
      if jsonb_typeof(v_raw -> 'installments') <> 'number'
         or (v_raw ->> 'installments')::numeric <> trunc((v_raw ->> 'installments')::numeric)
         or (v_raw ->> 'installments')::numeric not between 1 and 120 then
        raise exception 'installments deve ser inteiro entre 1 e 120.' using errcode = '22023';
      end if;
      -- decisão de produto: o Agente só registra compra à vista
      if (v_raw ->> 'installments')::int > 1 then
        raise exception 'O assistente registra apenas compras à vista. Para parcelar, use o formulário de compra.'
          using errcode = 'QF412', detail = 'use_installment_form';
      end if;
      v_payload := v_payload || jsonb_build_object('installments', 1);
    end if;
    if v_raw ? 'cardId' then
      v_card := public.agent_uuid(v_raw -> 'cardId', 'cardId');
      v_payload := v_payload || jsonb_build_object('cardId', v_card);
    end if;
  elsif v_kind = 'register_transfer' then
    perform public.agent_only_keys(v_raw, array['fromAccountId', 'toAccountId', 'amountCents', 'date', 'description'], v_kind);
    v_from := public.agent_uuid(v_raw -> 'fromAccountId', 'fromAccountId');
    v_to   := public.agent_uuid(v_raw -> 'toAccountId', 'toAccountId');
    if v_from = v_to then
      raise exception 'fromAccountId e toAccountId devem ser contas diferentes.' using errcode = '22023';
    end if;
    v_amount := public.agent_cents(v_raw -> 'amountCents', 'amountCents');
    v_date   := public.agent_ymd(v_raw -> 'date', 'date');
    v_desc   := case when v_raw ? 'description' then public.agent_text(v_raw -> 'description', 'description', 1, 160) else 'Transferência' end;
    v_payload := jsonb_build_object('fromAccountId', v_from, 'toAccountId', v_to, 'amountCents', v_amount,
                                    'date', to_char(v_date, 'YYYY-MM-DD'), 'description', v_desc);
  elsif v_kind in ('register_debt_payment', 'contribute_to_goal') then
    perform public.agent_only_keys(v_raw,
      array[case when v_kind = 'register_debt_payment' then 'debtId' else 'goalId' end, 'amountCents', 'date'], v_kind);
    v_target := public.agent_uuid(v_raw -> (case when v_kind = 'register_debt_payment' then 'debtId' else 'goalId' end),
                                  case when v_kind = 'register_debt_payment' then 'debtId' else 'goalId' end);
    v_amount := public.agent_cents(v_raw -> 'amountCents', 'amountCents');
    v_date   := public.agent_ymd(v_raw -> 'date', 'date');
    v_payload := jsonb_build_object(case when v_kind = 'register_debt_payment' then 'debtId' else 'goalId' end, v_target,
                                    'amountCents', v_amount, 'date', to_char(v_date, 'YYYY-MM-DD'));
  else -- create_budget
    perform public.agent_only_keys(v_raw, array['category', 'limitCents', 'competencia'], v_kind);
    v_category := public.agent_text(v_raw -> 'category', 'category', 1, 60);
    v_amount   := public.agent_cents(v_raw -> 'limitCents', 'limitCents');
    if jsonb_typeof(v_raw -> 'competencia') is distinct from 'string'
       or (v_raw ->> 'competencia') !~ '^\d{4}-(0[1-9]|1[0-2])$' then
      raise exception 'competencia deve ser YYYY-MM.' using errcode = '22023';
    end if;
    v_payload := jsonb_build_object('category', v_category, 'limitCents', v_amount, 'competencia', v_raw ->> 'competencia');
  end if;

  -- contexto da decisão ---------------------------------------------------------
  v_intent := v_req ->> 'intent';
  if jsonb_typeof(v_req -> 'intent') is distinct from 'string' or v_intent not in
     ('get_balances', 'get_invoice', 'explain_month', 'cashflow_briefing', 'simulate_purchase', 'plan_debt_payment',
      'create_budget_proposal', 'contribute_to_goal_proposal', 'register_income_proposal', 'register_transfer_proposal') then
    raise exception 'intent inválido.' using errcode = '22023';
  end if;
  if jsonb_typeof(v_req -> 'toolsUsed') is distinct from 'array' or jsonb_array_length(v_req -> 'toolsUsed') > 16 then
    raise exception 'toolsUsed deve ser um array com no máximo 16 itens.' using errcode = '22023';
  end if;
  for i in 0 .. jsonb_array_length(v_req -> 'toolsUsed') - 1 loop
    v_tools := v_tools || public.agent_text(v_req -> 'toolsUsed' -> i, format('toolsUsed[%s]', i), 1, 60);
  end loop;
  v_question := public.agent_text(v_req -> 'question', 'question', 1, 2000);
  if v_req ? 'snapshotRef' then
    v_snapshot := public.agent_text(v_req -> 'snapshotRef', 'snapshotRef', 1, 200);
  end if;
  if v_req ? 'simulationResult' then
    v_sim := public.agent_object(v_req -> 'simulationResult', 'simulationResult');
  end if;
  if jsonb_typeof(v_req -> 'idempotencyKey') = 'string'
     and (v_req ->> 'idempotencyKey') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_key := lower(v_req ->> 'idempotencyKey');
  end if;

  -- idempotência e limite -------------------------------------------------------
  perform pg_advisory_xact_lock(hashtextextended('agent:' || v_uid::text, 0));
  if v_key is not null then
    select result into v_existing from public.ai_decisions where user_id = v_uid and idempotency_key = v_key;
    if found then
      return v_existing;
    end if;
  end if;
  if (select count(*) from public.ai_decisions
       where user_id = v_uid and created_at > now() - interval '1 hour') >= 60 then
    raise exception 'limite de ações do assistente por hora atingido' using errcode = 'QF429';
  end if;

  perform set_config('app.tx_origin', 'ai', true);

  -- execução --------------------------------------------------------------------
  if v_kind in ('register_purchase', 'register_income') then
    if v_card is not null and not exists (select 1 from public.credit_cards where id = v_card and user_id = v_uid) then
      raise exception 'Cartão não encontrado.' using errcode = 'P0002';
    end if;
    insert into public.transactions (user_id, description, value_cents, type, category, date, card_id)
    values (v_uid, v_desc, v_amount, case when v_kind = 'register_purchase' then 'saida' else 'entrada' end,
            v_category, v_date, v_card)
    returning id into v_id;

  elsif v_kind = 'register_transfer' then
    perform 1 from public.accounts where id in (v_from, v_to) and user_id = v_uid order by id for update;
    get diagnostics v_n = row_count;
    if v_n <> 2 then
      raise exception 'Conta de origem ou destino não encontrada.' using errcode = 'P0002';
    end if;
    update public.accounts set balance_cents = balance_cents - v_amount where id = v_from;
    update public.accounts set balance_cents = balance_cents + v_amount where id = v_to;
    insert into public.transactions (user_id, description, value_cents, type, category, date, from_account_id, to_account_id)
    values (v_uid, v_desc, v_amount, 'transferencia', 'Transferência', v_date, v_from, v_to)
    returning id into v_id;

  elsif v_kind = 'contribute_to_goal' then
    update public.goals set current_cents = current_cents + v_amount
     where id = v_target and user_id = v_uid
     returning id into v_id;
    if v_id is null then
      raise exception 'Meta não encontrada.' using errcode = 'P0002';
    end if;

  elsif v_kind = 'register_debt_payment' then
    select remaining_cents, paid_installments, installments into v_rem, v_paid, v_inst
      from public.debts where id = v_target and user_id = v_uid for update;
    if not found then
      raise exception 'Dívida não encontrada.' using errcode = 'P0002';
    end if;
    v_rem  := greatest(0, v_rem - v_amount);
    v_paid := least(v_inst, v_paid + 1);
    update public.debts
       set remaining_cents = v_rem, paid_installments = v_paid, active = not (v_paid >= v_inst or v_rem = 0)
     where id = v_target
     returning id into v_id;

  else -- create_budget
    insert into public.budgets (user_id, category, target_cents, period, month)
    values (v_uid, v_category, v_amount, 'monthly', v_payload ->> 'competencia')
    returning id into v_id;
  end if;

  v_decision := gen_random_uuid();
  v_result := jsonb_build_object('id', v_id, 'decisionId', v_decision);
  insert into public.ai_decisions (id, user_id, intent, question, user_decision, outcome_status, proposed_action,
                                   tools_used, snapshot_ref, simulation_result, idempotency_key, result)
  values (v_decision, v_uid, v_intent, v_question, 'confirmed', 'applied',
          jsonb_build_object('kind', v_kind, 'payload', v_payload),
          v_tools, v_snapshot, v_sim, v_key, v_result);

  perform set_config('app.tx_origin', '', true);
  return v_result;
end;
$$;

revoke all on function public.execute_agent_action(jsonb) from public, anon;
grant execute on function public.execute_agent_action(jsonb) to authenticated;
