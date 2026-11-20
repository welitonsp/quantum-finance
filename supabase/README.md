# Supabase — banco do Quantum Finance

Migração do Firebase para Supabase + Vercel (plano: etapa 2 em diante).

- `migrations/` — SQL aplicado em ordem no projeto Supabase. Nunca editar uma
  migration já aplicada: criar outra nova.
- `tests/rls_*.sql` — testes de RLS e do histórico append-only. Rodam no CI
  (`.github/workflows/supabase-sql.yml`) num Postgres 16 puro.
- `tests/local_auth_stub.sql` — simula `auth.uid()` e as roles `anon` e
  `authenticated` do Supabase. **Só para teste**: nunca aplicar no projeto real.

## Rodar localmente

```bash
psql -v ON_ERROR_STOP=1 -f supabase/tests/local_auth_stub.sql
for f in supabase/migrations/*.sql; do psql -v ON_ERROR_STOP=1 -f "$f"; done
psql -v ON_ERROR_STOP=1 -f supabase/tests/rls_core_financeiro.sql
```

## Contratos mantidos do Firebase

| Firebase | Supabase |
| --- | --- |
| `value_cents` inteiro | `bigint` em centavos, `check (value_cents > 0)` |
| Modelo A (`_lastOpId` + history no batch) | trigger grava `transaction_history` na mesma transação SQL |
| History append-only | sem INSERT/UPDATE/DELETE para o cliente |
| `importHash` fora de before/after | removido por `tx_history_snapshot` |
| `firestore.rules` | RLS `user_id = auth.uid()` + FKs compostas por usuário |
| Rollups mensais | views `monthly_totals` e `monthly_category_totals` |
| callable `createTransfer` | RPC `create_transfer` (atômica, idempotente); cliente não grava transferência direto |
| `accounts/{id}/history` | `account_history` append-only, inclusive para conta apagada |
