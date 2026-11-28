-- =============================================================================
-- Quantum Finance — totais do painel somados no servidor
-- O painel somava receitas, despesas e saldo no navegador, só com as
-- transações já carregadas (500 por página). Acima disso os totais ficavam
-- errados. Esta função soma tudo no banco e devolve 3 números em centavos.
--
-- Regras (as mesmas do painel):
--   * receita  = type 'entrada';
--   * despesa  = type 'saida' que NÃO é pagamento de fatura (paid_invoice_month
--     nulo): a compra no cartão já contou como gasto;
--   * transferência entre contas próprias não é receita nem despesa;
--   * transações excluídas (deleted_at) não contam;
--   * mês pelo campo date, de p_from a p_to (inclusive).
--   net_all_cents = receitas − despesas de todos os tempos (o saldo do painel
--   soma isso aos saldos das contas).
--
-- Só leitura: security invoker, então a RLS de transactions vale como em
-- qualquer select do próprio usuário. Sem DROP.
-- =============================================================================

create or replace function public.dashboard_totals(p_from date, p_to date)
returns table (income_cents bigint, expense_cents bigint, net_all_cents bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    coalesce(sum(t.value_cents) filter (
      where t.type = 'entrada' and t.date between p_from and p_to), 0)::bigint,
    coalesce(sum(t.value_cents) filter (
      where t.type = 'saida' and t.paid_invoice_month is null
        and t.date between p_from and p_to), 0)::bigint,
    coalesce(sum(case
      when t.type = 'entrada' then t.value_cents
      when t.type = 'saida' and t.paid_invoice_month is null then -t.value_cents
      else 0
    end), 0)::bigint
  from public.transactions t
  where t.user_id = auth.uid()
    and t.deleted_at is null;
$$;

revoke all on function public.dashboard_totals(date, date) from public, anon;
grant execute on function public.dashboard_totals(date, date) to authenticated;
