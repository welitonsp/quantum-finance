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

---

## Logs Server-Trusted — `system_logs` e `audit_logs` de Transação (P2 hardening 2026-07-02)

**Contexto:** A auditoria tripla de 2026-07-02 (ver [checklist](audit/CHECKLIST_HARDENING_2026-07-02.md)) apontou que `users/{uid}/system_logs` (chamadas de IA) e `users/{uid}/audit_logs` de `BULK_UPDATE`/`UNDO_BULK_UPDATE` eram gravados **client-side** (`addDoc` direto), permitindo self-forgery — o próprio usuário podia forjar entradas sem a operação correlata ter ocorrido.

**Decisão adotada:**
- **`system_logs`:** já existia um caminho server-side (`writeStructuredLog` em `functions/src/index.ts`, usado por `chatWithQuantumAI`, `generateAuditReport` e `categorizeTransactionsBatch`). A escrita client-side redundante em `AICategorizationService.ts` (`writeSystemLog`, tipo `AI_CALL`) foi removida — cada chamada de `categorizeWithAI` já dispara `categorizeTransactionsBatch`, que loga `BATCH` server-side. Rules: `create` client-side em `system_logs` agora é **sempre negado**.
- **`audit_logs` de transação:** nova callable **`logAuditEvent`** (Admin SDK) recebe `BULK_UPDATE`/`UNDO_BULK_UPDATE` e grava com `serverTimestamp()`. `AuditService.logTransactionAudit` substitui `AuditService.logAction` nesses 2 casos em `useTransactions.ts`. Validação pura em `functions/src/auditLogValidation.ts` (padrão de `transferValidation.ts`). Rules: `isValidAuditAction` não aceita mais `BULK_UPDATE`/`UNDO_BULK_UPDATE` no create client-side.

**O que NÃO migrou (fora de escopo, mantido client-side):**
- **`ADD_RECURRING`/`UPDATE_RECURRING`/`DELETE_RECURRING`:** decisão "P3 controlado" permanece vigente (ver seção "Auditoria de Recorrentes — FASE 6C" acima) — risco de self-forgery já aceito e mitigado por Rules; sem semântica de auto-execução que justifique o custo de migrar.
- **`IMPORT_TRANSACTION`:** grava dentro da **mesma `runTransaction` atômica** do Modelo A em `LedgerService.ts` (cria a transação + history + audit_log num único commit client-side). Mover para Admin SDK exigiria reescrever todo o pipeline de import como callable — fora do escopo desta migração pontual e dentro da zona proibida de "escritas e histórico atômicos" sem fase própria autorizada.

**Cobertura:** `src/__tests__/firestoreRules.audit.test.ts` blocos B10/B10b (deny) e T (system_logs deny + read allow); `functions/test/auditLogValidation.test.js` (validador puro).

---

## Migração de Floats Legados — Desbloqueio Parcial e Controlado (FASE 10D, rodada 2)

**Contexto:** a migração automática de `value` (float) → `value_cents` seguia bloqueada por decisão (`CLAUDE.md` — "Migração de Legado"). Toda a ferramenta existente (`functions/scripts/{diagnoseLegacyTransactions,legacyMigrationPolicy,executeLegacyMigration,rollbackLegacyMigration,backupLegacyCandidates}.js`) era, de propósito, só dry-run/plan — nenhum caminho real de escrita existia. O motivo original: não há regra de arredondamento segura para escalas ambíguas (ex.: um `value` inteiro como `1234` pode ser R$ 1234,00 ou R$ 12,34) sem `Math.round`/`parseFloat`, terminantemente proibidos no projeto.

**Decisão adotada nesta rodada:** desbloquear **apenas** o subconjunto inequívoco — documentos classificados `migrationEligible` por `legacyMigrationPolicy.classifyLegacyTransaction` (já têm `value_cents` seguro, `Number.isSafeInteger`; falta só o bump de `schemaVersion`/`source`, zero matemática monetária nova). Casos `adminRepairRequired`/`unknownShape`/escala ambígua **continuam bloqueados** — exigem decisão humana caso a caso, nunca conversão automática.

**Implementação — `functions/scripts/executeLegacyMigrationSafe.js` (novo arquivo, separado de propósito):**
- `executeLegacyMigration.js` **não foi tocado** — permanece um dry-run planner puro, com seu guardrail estático original intacto (`functions/test/executeLegacyMigration.test.js` continua garantindo ausência total de tokens de escrita nesse arquivo). A nova capacidade de escrita vive **só** no novo arquivo, isolada e fácil de re-bloquear (bastaria remover esse arquivo).
- `--execute` é obrigatório explicitamente; sem ele, lança erro fixo (não há modo dry-run aqui — para relatório sem escrita, usa-se `executeLegacyMigration.js`).
- Exige `--backup-file` apontando para um backup válido de `backupLegacyCandidates.js`, revalidado com a mesma lógica de checksum/schema de `rollbackLegacyMigration.js` (`validateBackupPackage`, reaproveitado, não duplicado).
- **Fail-closed em lote:** classifica todos os documentos do lote antes de escrever qualquer um; se **qualquer** documento não for `migrationEligible`, ou não estiver coberto pelo backup validado, a execução inteira aborta sem escrever nada. Não existe "escrever os elegíveis e pular o resto".
- O patch escrito é sempre `{ schemaVersion: 2, source? }` — o mesmo que `buildMigrationPlan` (já existente, não duplicado) calcula. Nunca `value_cents`/`value`.

**Passo 0 — concluído em 2026-07-04:** `diagnoseLegacyTransactions.js` (read-only) rodado contra o Firestore de produção real (`quantum-finance-39235`). Resultado: **4 transações totais analisadas, todas já com `value_cents` válido; zero (`hasLegacyValue: 0`) documentos com o campo float legado `value`.** `conversionCandidateTotal: 0` — nenhum documento `migrationEligible` no momento. `executeLegacyMigrationSafe.js` permanece destravado (capacidade pronta) mas **sem alvo real para executar** nesta base. Reavaliar se o volume de transações crescer significativamente ou se uma importação futura reintroduzir documentos no formato legado.

**Cobertura:** `functions/test/executeLegacyMigrationSafe.test.js` — flag obrigatória, fail-closed em lote misto, checksum de backup inválido rejeita antes de qualquer leitura, relatório sanitizado, guardrail estático de matemática financeira proibida (reafirmado, não relaxado).
