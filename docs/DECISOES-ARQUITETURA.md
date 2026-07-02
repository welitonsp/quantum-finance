# Quantum Finance — Decisões de Arquitetura

> Registra o **porquê** de escolhas técnicas relevantes. Regras ativas derivadas dessas decisões estão em `CLAUDE.md`. Cronologia de implementação em `docs/HISTORICO-FASES.md`.

---

## CI — Firebase Hosting Preview: por que CLI em vez de `action-hosting-deploy`

**Contexto:** O workflow de preview de PRs usava `FirebaseExtended/action-hosting-deploy@v0`. Começou a falhar sistematicamente a partir de meados de 2026-06 (PR #298 fez a correção).

**Problema em 3 camadas (descobertas pelos logs reais):**
1. A action `FirebaseExtended/action-hosting-deploy@v0` falhava no oauth2 (`Failed to authenticate ... premature close`).
2. Canal fixo `pr-<n>` colidia em re-runs (HTTP 409).
3. **Causa-raiz final:** a rede do runner cortava a resposta da API de Hosting (*premature close*) **depois** de o deploy já ter sido aplicado no servidor — a CLI reportava 409 (no create) ou 400 (`is the current active version`, no release) mesmo com o canal **publicado**.

**Correção adotada (`.github/workflows/firebase-hosting-pull-request.yml`):**
- Migrado da action para **CLI `firebase` + `GOOGLE_APPLICATION_CREDENTIALS`** (mesmo padrão já confiável do workflow de merge `deploy_rules`/`deploy_functions`).
- Canal de preview **único por execução** `pr-<n>-<run_id>-<run_attempt>` (TTL 3d, efêmero, **nunca** `live`).
- Após erro no deploy, o passo consulta `firebase hosting:channel:list` e **trata canal já publicado como sucesso** (retry até 3x caso realmente não tenha publicado).
- Secret: reusa o existente **`FIREBASE_SERVICE_ACCOUNT_QUANTUM_FINANCE_39235`** — **nenhum secret novo**.
- `firebase-tools` fica em **`latest`** (o pin `@14.25.0` foi testado e **reintroduziu a falha de auth** no CI → revertido).

**O que NÃO tocar para "consertar" preview:** `.env`, `.env.local`, `firebase.json`, `.agents`, `skills-lock.json`. O deploy de **hosting `live` no merge** segue via action `action-hosting-deploy@v0` (não reportado quebrado) — não foi alterado.

---

## Decisão Operacional — Spark Manual Create (2026-05-09)

> **Nota 2026-07-02:** O projeto foi migrado para o plano Blaze. Esta decisão é histórica; o caminho server-trusted via `createTransaction` (callable) é agora o caminho canônico.

**Contexto:** O projeto `quantum-finance-39235` estava no plano Firebase Spark/free; deploy de Cloud Functions exige Blaze por depender de `cloudbuild.googleapis.com` e `artifactregistry.googleapis.com`.

**Decisão temporária Spark:** Criação manual de movimentações **não pode depender obrigatoriamente** da callable `createTransaction`. Caminho ativo Spark: `useTransactions.add` → `FirestoreService.createManualTransactionWithHistory` → `writeBatch` criando `users/{uid}/transactions/{txId}` e `users/{uid}/transactions/{txId}/history/create` no mesmo commit.

**Regras Spark:**
- `firestore.rules` permite `source=manual` somente quando o `history/create` consistente existe no estado pós-batch; history `CREATE/manual` isolado continua bloqueado.
- Campos proibidos em criação manual client-side: `id`, `uid`, `value`, `importHash` e metadados de conciliação/importação.
- A callable `createTransaction` permanece no código como caminho server-trusted; `enforceAppCheck: true` não deve ser removido por engano.
- Rebaixamento aceito: sem Admin SDK não há autoridade server-trusted plena; a mitigação Spark depende de Rules rigorosas e testes de emulator.

---

## Decisão Técnica — FASE 7E-1: Idempotência em Criação Manual Spark (2026-05-11)

> **Nota 2026-07-02:** Esta decisão cobre a criação manual client-side. A transferência passou a ter idempotência server-side via `createTransfer` (PR #313, TTL 24h).

**Problema:** Retry de criação manual poderia criar duplicatas se o commit fosse ambíguo.

**Solução adotada:**
- O `txId` final da criação manual Spark é reservado uma vez em `useTransactions.add`/`addBatch` antes de enfileirar a operação.
- A `AddOp` pendente preserva esse `txId` entre retries; `processQueue` repassa sempre o mesmo ID para `FirestoreService.createManualTransactionWithHistory(uid, data, txId)`.
- `FirestoreService.createManualTransactionWithHistory` aceita `txId` explícito fora do payload financeiro, usa esse ID no documento `transactions/{txId}` e mantém `history/create` como ID fixo.
- O payload financeiro continua sem `id`, `uid`, `value` legado e `importHash`; `value_cents` segue como valor canônico.
- Em erro ambíguo de commit, o helper lê `transactions/{txId}` e `history/create`; se ambos já existem e batem com o payload canônico, retorna sucesso com o mesmo `txId`. Documento divergente ou history ausente propagam o erro original.
- `firestore.rules` não foi alterado nesta fase; a idempotência foi implementada apenas por ID estável no cliente e verificação segura pós-erro.

---

## Auditoria de Recorrentes — FASE 6C: Por que P3 Controlado?

**Contexto:** Auditoria de recorrentes (`ADD_RECURRING` / `UPDATE_RECURRING` / `DELETE_RECURRING`) permanece **client-side fail-silent** como **P3 controlado**.

**Risco identificado:**
- Fluxo em `src/hooks/useRecurring.ts` grava operação principal e dispara `AuditService.logAction` em `void` (fire-and-forget). Não-atômico.
- Usuário autenticado pode gravar audit_log semanticamente válido sem operação principal correlata, porque `firestore.rules:isValidAuditLog` valida sintaxe mas não coerência action↔entity.

**Por que aceitar P3 (não P0/P1):**
- Risco contido em **self-forgery dentro do próprio uid** — não afeta outros usuários.
- **Sem impacto em** `value_cents`, `importHash` ou `LedgerService`. `recurringTasks` é metadado de intenção; ocorrências reais materializadas viram `Transaction` via callable server-trusted.

**Decisão:** Migração para Cloud Functions adiada até que recorrentes ganhem semântica de auto-execução de movimento. Reavaliar como **FASE 6D** se essa semântica surgir ou se auditoria externa exigir trilha não-forjável.

**Mitigação atual:** Cobertura de Firestore Rules reforçada com **bloco B19 (5 testes negativos)** em `src/__tests__/firestoreRules.audit.test.ts`: entity inválida, cross-uid, schemaVersion incorreta, chave extra fora da whitelist, `details` acima de 500 chars.

---

## Transferências Server-Trusted — Por que Callable em vez de writeBatch? (PR #313)

**Contexto:** Antes do PR #313, `transferRepo.ts` usava `writeBatch` client-side para criar a transação de transferência. As Firestore Rules negavam `type: 'transferencia'` na criação client-side, então **transferências estavam quebradas em produção** (F-01 da auditoria 2026-07-01).

**Por que não consertar as Rules para permitir transferência client-side:**
- Transferência envolve movimentação de saldo de **duas contas** atomicamente (débito origem + crédito destino). Um writeBatch client-side não tem acesso ao Admin SDK nem pode garantir consistência cross-document com isolamento de server.
- Rules de `accounts/{accountId}` exigiriam lógica complexa de validação server-side de saldos, quebrando o princípio de Rules simples.
- Sem autoridade server-trusted, o client poderia manipular `amount` ou os IDs de conta.

**Decisão adotada (PR #313):**
- Nova callable **`createTransfer`** (7ª Cloud Function): recebe `{fromAccountId, toAccountId, amount, description, date}`, valida, debita `fromAccount.balance`, credita `toAccount.balance`, grava `transactions/{txId}` com `type: 'transferencia'`, grava histories da transação e das duas contas — tudo em uma única operação atômica Admin SDK.
- Idempotência via `idempotency/{idempotencyKey}` com TTL 24h (mesmo padrão de `executeAgentAction` e `createTransaction`).
- Rules negam create/update client-side de `type: 'transferencia'` e de `usage/ai_calls`.
- `transferRepo.ts` passa a chamar a callable com `idempotencyKey` gerado no client.

**Branch `feature/agent-register-transfer`:** implementada sob a premissa antiga ("sem mover saldo, Functions = 6"). Após #313, deve ser rebaseada para delegar à callable `createTransfer`.
