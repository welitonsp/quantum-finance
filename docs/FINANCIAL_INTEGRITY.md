# Integridade Financeira

## Contrato monetário

`value_cents` é a fonte canônica de dinheiro em todo o produto. O campo guarda centavos inteiros em `Number.MAX_SAFE_INTEGER` e todo cálculo financeiro deve usar `src/shared/types/money.ts`.

`value` permanece apenas como compatibilidade temporária de leitura de documentos legados. Código novo não deve gravar `value` como fonte primária, e documentos `schemaVersion: 2` sem `value_cents` devem ser tratados como inválidos para cálculo.

Funções aprovadas:

```ts
toCentavos(input)
fromCentavos(cents)
addCentavos(...)
subtractCentavos(base, ...)
absCentavos(cents)
divideCentavos(cents, divisor)
multiplyCentavos(cents, multiplier)
formatBRL(cents)
```

## Validação

Schemas financeiros vivem em `src/shared/schemas/financialSchemas.ts` e usam `.strict()` para bloquear campos desconhecidos. Clientes não podem controlar `id`, `uid`, `createdAt` ou `updatedAt`.

Transações críticas exigem:

- `schemaVersion: 2`
- `value_cents` inteiro positivo
- `type: "entrada" | "saida"`
- `date` em `YYYY-MM-DD`
- `source: "csv" | "ofx" | "pdf" | "manual"`
- `category` em `ALLOWED_CATEGORIES`

## Ledger idempotente

Importações CSV/OFX/PDF são persistidas por `LedgerService` com hash SHA-256 determinístico. A entrada do hash é normalizada com:

- `uid`
- `date`
- descrição normalizada
- `value_cents`
- `type`
- `source`
- `fitId`, quando existir
- `accountId` ou `account`, quando existir

O documento final usa `doc(db, "users", uid, "transactions", hash)`. Importação não usa `addDoc`, porque IDs aleatórios tornam retry e reprocessamento não idempotentes.

Duplicatas não alteram a transação existente nem o `createdAt` original. O fluxo grava `audit_logs` no mesmo `runTransaction` da transação nova.

## Forecast e métricas

Motores de forecast, Monte Carlo e métricas operam em centavos internamente. A UI recebe reais somente na borda de apresentação, por exemplo em gráficos Recharts.

Transações devem ser ordenadas cronologicamente sem mutar arrays de entrada. Datas de referência devem ser injetáveis em testes.

## Snapshots e materialized views

O contrato preparado para agregados está em `SummarySnapshot`:

- totais de receita/despesa em centavos
- caixa líquido em centavos
- saldos de ativos/passivos em centavos
- período de competência
- `schemaVersion: 2`

O próximo passo é materializar snapshots por período em Cloud Functions para reduzir custo de leitura no dashboard sem abandonar o ledger como fonte de verdade.

## Roadmap double-entry

O modelo atual é ledger simples por usuário. O caminho para contabilidade de partidas dobradas é:

1. Criar contas contábeis explícitas para assets, liabilities, income e expenses.
2. Representar cada transação como journal entry com linhas debit/credit balanceadas.
3. Validar soma de débitos igual à soma de créditos em Cloud Functions.
4. Gerar snapshots a partir das journal lines, nunca por mutação direta de saldo.
