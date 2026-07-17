# Correlation ID Contract - Quantum Finance

## 1. Resumo

`correlationId` e um identificador operacional opaco usado para rastreabilidade de operacoes transacionais criticas client-orchestrated. Ele ajuda a correlacionar eventos de history criados pela mesma operacao sem expor payload financeiro ou metadados sensiveis.

`correlationId` nao e identificador financeiro, nao e id de usuario, nao substitui `importHash` e nao deve ser usado como chave de deduplicacao de importacao.

## 2. Contrato atual

- Formato permitido: `/^[A-Za-z0-9_-]{16,80}$/`.
- Tamanho permitido: minimo 16 e maximo 80 caracteres.
- Prefixos permitidos: `op_`, `bulk_`, `undo_`.
- Geracao: `crypto.randomUUID()` ou fallback seguro com `crypto.getRandomValues`.
- Persistencia permitida: somente no root do documento `users/{uid}/transactions/{txId}/history/{historyId}`.
- Em operacoes unitarias `UPDATE` e `SOFT_DELETE`, `correlationId === _lastOpId === historyId`.
- Em operacoes `BULK_UPDATE` e `UNDO_BULK_UPDATE`, um `correlationId` de lote pode agrupar varios documentos de history, enquanto cada transaction continua usando seu proprio `_lastOpId`.
- `correlationId` nao altera o schema financeiro da transaction root.

## 3. Locais permitidos

- Root do documento de `history`.
- Logs sanitizados futuros, somente se nao carregarem payload financeiro ou dados sensiveis.
- Documentacao tecnica de futuras expansoes de tracing.

Qualquer novo local de persistencia ou emissao deve ser aprovado em fase propria.

## 4. Locais proibidos

- Root da transaction.
- `history.before`.
- `history.after`.
- `audit_logs` globais nesta fase.
- UI renderizada.
- Payload financeiro.
- `importHash`.
- Campos ou valores derivados de `description`, `category`, `value`, `value_cents`, `uid`, `txId` real ou path Firestore.

## 5. Regras de privacidade

- Nunca derivar `correlationId` de `uid`, `txId`, `importHash`, descricao, categoria, valor, data ou path Firestore.
- Nunca usar `Math.random` sozinho para gerar `correlationId`.
- Nunca registrar payload financeiro junto ao `correlationId`.
- Nunca usar `correlationId` como identificador exibivel para usuario final.
- Nunca usar `correlationId` para reconstruir `value_cents`, inferir origem financeira ou deduplicar importacao.

## 6. Firestore Rules

As Firestore Rules validam tipo, formato e tamanho do `correlationId`. Valores vazios, longos demais, numericos, objetos ou com caracteres fora de `[A-Za-z0-9_-]` sao rejeitados.

As Rules tambem bloqueiam `correlationId` dentro de snapshots `history.before` e `history.after`, junto com os campos sensiveis ou tecnicos ja proibidos: `id`, `uid`, `value`, `importHash` e `_lastOpId`.

O Modelo A permanece preservado: updates de transaction exigem `_lastOpId` e history pareado no mesmo commit. Para `UPDATE` e `SOFT_DELETE` unitarios, o `correlationId` do history deve corresponder ao `_lastOpId`. Para `BULK_UPDATE` e `UNDO_BULK_UPDATE`, o `correlationId` de lote pode ser diferente para agrupar suboperacoes.

## 7. Expansoes futuras

As areas abaixo permanecem fora do contrato atual e so podem ser ampliadas por nova fase, PR dedicado e, quando necessario, ADR:

- importacao;
- IA e categorizacao;
- `functions/index.js`;
- callables;
- `audit_logs` globais;
- relatorios;
- observabilidade externa.

## 8. Checklist para futuras PRs

- O `correlationId` e opaco?
- O `correlationId` evita `uid`, `txId`, `importHash`, descricao, categoria, valor, data e path?
- O `correlationId` fica fora do root da transaction?
- O `correlationId` fica fora de `history.before` e `history.after`?
- As Firestore Rules cobrem o novo campo/local?
- Existem testes negativos para formato, tamanho, tipo e vazamento em snapshots?
- `audit_logs` globais foram evitados ou a expansao foi justificada em fase propria?
- Logs seguem a politica sanitizada e nao incluem payload financeiro?
