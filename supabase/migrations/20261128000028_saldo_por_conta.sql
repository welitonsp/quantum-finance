-- =============================================================================
-- Quantum Finance — saldo de cada conta calculado no servidor
--
-- Antes: accounts.balance_cents só mudava com transferências. Receitas e
-- despesas não mexiam no saldo da conta, então patrimônio e reserva ficavam
-- parados; e o painel somava esse "saldo atual" com todo o histórico de
-- lançamentos (dupla contagem).
--
-- Agora:
--   * balance_cents = saldo de abertura da conta em opening_date (o usuário
--     informa "saldo em DD/MM/AAAA"); transferências continuam movendo esse
--     valor na hora, como já faziam (create_transfer).
--   * cash_position() devolve o saldo de hoje de cada conta:
--       abertura + entradas − saídas da conta, com data depois da abertura
--       e até hoje (lançamento futuro, como parcela, ainda não saiu).
--   * Compra no cartão (card_id e sem paid_invoice_month) não sai da conta:
--     o dinheiro sai quando a fatura é paga (saída com paid_invoice_month).
--   * Uma linha extra com account_id nulo traz o líquido dos lançamentos sem
--     conta, pela mesma regra, para o painel somar ao total.
--
-- Só leitura, security invoker: a RLS de accounts e transactions vale como
-- em qualquer select do próprio usuário. Sem DROP.
-- =============================================================================

alter table public.accounts
  add column if not exists opening_date date not null
    default ((now() at time zone 'America/Sao_Paulo')::date);

-- Contas que já existiam: a abertura é o dia em que foram criadas.
update public.accounts
   set opening_date = (created_at at time zone 'America/Sao_Paulo')::date
 where opening_date <> (created_at at time zone 'America/Sao_Paulo')::date;

create or replace function public.cash_position(
  p_today date default (now() at time zone 'America/Sao_Paulo')::date
)
returns table (account_id uuid, balance_cents bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select a.id,
         (a.balance_cents + coalesce(sum(case
            when t.type = 'entrada' then t.value_cents
            when t.type = 'saida' and (t.card_id is null or t.paid_invoice_month is not null)
              then -t.value_cents
            else 0
          end), 0))::bigint
    from public.accounts a
    left join public.transactions t
      on t.account_id = a.id
     and t.user_id = a.user_id
     and t.deleted_at is null
     and t.date > a.opening_date
     and t.date <= p_today
   where a.user_id = auth.uid()
   group by a.id, a.balance_cents
  union all
  select null::uuid,
         coalesce(sum(case
            when t.type = 'entrada' then t.value_cents
            when t.type = 'saida' and (t.card_id is null or t.paid_invoice_month is not null)
              then -t.value_cents
            else 0
          end), 0)::bigint
    from public.transactions t
   where t.user_id = auth.uid()
     and t.account_id is null
     and t.deleted_at is null
     and t.date <= p_today;
$$;

revoke all on function public.cash_position(date) from public, anon;
grant execute on function public.cash_position(date) to authenticated;
