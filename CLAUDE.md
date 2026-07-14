# Quantum Finance — Base de Conhecimento do Projeto

> Este arquivo é o ponto de entrada de contexto para qualquer agente de IA (Claude, Codex, etc.) que trabalhe no projeto. Mantenha-o atualizado a cada marco relevante. Não use este arquivo para guardar credenciais ou dados sensíveis.
> **Histórico de fases/PRs:** [docs/HISTORICO-FASES.md](docs/HISTORICO-FASES.md) · **Decisões arquiteturais:** [docs/DECISOES-ARQUITETURA.md](docs/DECISOES-ARQUITETURA.md)

## Estado Atual — 2026-07-10 (Auditoria Big Four + remediação M-01/M-02 + Radar de Compras)

- Branch principal: `main` — PRs #363–#430 mergeados. Working tree esperado: limpo. **Nenhum PR aberto.**
- Suíte: **1900+ unit + 227 rules + 303 functions + 28 E2E** (auditoria externa 2ª rodada: F-01/F-02/F-03/F-04/F-05/F-06/F-07/F-09/F-10).

### Remediação Auditoria Externa (2ª rodada, 2026-07-11 — nota inicial 6,2/10)

Laudo externo independente elevou findings de segurança/LGPD/confiabilidade. **9 findings fechados** (PRs #406–#417), todos com CI verde:
- **F-02/F-03 (shared-finance) — FECHADOS (#416 F-03, #417 F-02):** fase **server-trust** completa. Validador puro `functions/src/sharedFinanceValidation.ts` (`validateInviteAcceptance` + `validateExpenseShares`). Callables `acceptGroupInvite` (aceite atômico/single-use/expiração), `createGroupExpense` e `settleGroupExpenseShare` (integridade de shares: soma==total, uids do grupo; quita só a própria cota). Rules: entrada no grupo via convite e create/update de despesa → **server-only** (`if false`/removidas as funções), reduzindo expressões. `useGroups` chama as callables. Rules 226→227.
- **F-01 (consent IA) — FECHADO (#408):** `assertAiConsent(uid)` fail-closed antes do Gemini nas 3 callables de IA (chat/categorização/auditoria). UI mirror = follow-up.
- **F-04 (export LGPD) — PARCIAL (#412):** `EXPORTABLE_SUBCOLLECTIONS` completa (10→20 subcoleções). *Delete de user já é completo (recursiveDelete recursivo).* Falta: limpeza do `groups` global + export server-side (fase shared-finance).
- **F-05 (invariante monetário) — FECHADO (#407):** removida a única conversão float ativa (`Math.round(saldo*100)`→`toCentavos`) em `queryContextBuilder`. Demais `*100` são percentuais legítimos.
- **F-06 (step-up delete) — FECHADO (#411):** `deleteUserData` exige `auth_time` recente (5 min) → `failed-precondition`; cliente reusa UX `REQUIRES_RECENT_LOGIN`.
- **F-07 (recorrentes catch-up) — FECHADO (#410):** `isTaskDueToday` usa `>=` (catch-up idempotente) + clamp de fim de mês.
- **F-09 (custo/DoS) — PARCIAL (#409):** `setGlobalOptions({ maxInstances: 20 })`. Billing alerts/quota/paginação = infra/owner.
- **F-10 (memória chat) — FECHADO (#406):** `ConversationMemory` efêmera (sessionStorage + TTL 24h + purge no logout).
- **F-04-groups — FECHADO (#419):** `deleteUserData` limpa `groups` global (owner → recursiveDelete; membro → arrayRemove). F-04 completo.
- **F-12 (a11y) — categoria de LABELS FECHADA + enforçada (#420/#421/#422/#423):** 42 warnings `label-has-associated-control` → 0 (padrão `useId`+`htmlFor`/`id` em ~15 formulários), regra **elevada a `error`** no eslint (regressão quebra CI). Warnings a11y totais 65→23. **Restam (revisão VISUAL):** `no-autofocus` (9), `no-static-element-interactions`+`click-events` (14) — divs clicáveis precisam de suporte a teclado/role, melhor com a UI à vista.
- **F-08 (supply chain) — FECHADO (#425):** `firebase-tools` fixado em **15.23.0** (decisão do owner) e **todas as GitHub Actions pinadas por commit SHA** (com comentário da tag) nos 4 workflows; Dependabot segue atualizando de forma revisável.
- **F-14 (Core Web Vitals) — FECHADO (#427):** workflow `lighthouse.yml` (não-bloqueante, `@lhci/cli@0.15.1`) roda em **perfil móvel** no push para main + sob demanda, publicando o relatório LHR (temporary-public-storage). `lighthouserc.json` = medição (sem assertions que quebrem o build). Validado no CI. Web-Vitals RUM + budgets por rota = evolução futura.
- **F-11 (offline durável) — FECHADO (#429 frente 1 + #430 frente 2):** frente 1 = `initializeFirestore` com `persistentLocalCache`+`persistentMultipleTabManager` (leituras offline + fila durável de escritas diretas; memória sob emulador/test). frente 2 = **outbox IndexedDB** (`src/shared/lib/offlineOutbox.ts`, escopado por uid, `idempotencyKey`, texto puro por decisão do owner, fail-safe) para a criação via callable: `outboxPut`/`outboxDelete`/`replayOutbox` no `useTransactions` reusando a máquina otimista (dedup por idempotencyKey). Escopo: só criação (update/delete já durável pela frente 1). `offlineOutbox.ts` excluído do coverage (IndexedDB não exercitável em jsdom; fail-safe testado).
- **PENDENTES (infra / revisão visual):** **F-13** (cobrir `components/**`/`features/**` antes de expandir gate); **F-15** (métricas/SLOs/alertas — infra); resto do **F-12** (autofocus/divs clicáveis — revisão visual).

### Auditoria Big Four + Tese Extraordinária (2026-07-09)

- **Laudo:** `docs/audit/AUDITORIA_BIG_FOUR_2026-07-09.md` — nota **8.7/10** (Qualified Opinion). Backend/segurança em nível Big Tech; gap em *assurance* automatizado.
- **Findings — estado da remediação:**
  - **M-02 (a11y) — FECHADO no núcleo (PR #365):** `eslint-plugin-jsx-a11y` no flat config, enforçado no CI; regras objetivas em `error` (zeradas), volumosas em `warn` com ratchet documentado. 3 correções ARIA reais (CommandPalette/ProactiveBriefing/AuditTimeline).
  - **M-01 (cobertura) — 🎯 METAS ATINGIDAS + reforço em andamento (PRs #366…#396+#398+#399+#400):** scope `src/lib/**` + `src/shared/lib/**` + `src/hooks/**` + 345 testes novos. **Cobertura real (pós-#400): stmts 77.48 / branches 68.19 / funcs 79.40 / lines 80.78** — bem acima das metas (branches≥65, lines≥75). **Gates fixados p/ stmts 77 / branches 68 / funcs 79 / lines 80** (#404, catraca logo abaixo do real; real pós-#403: stmts 78.03 / branches 68.55 / funcs 79.83 / lines 81.29). **⚠️ Nota #383:** o PR #382 ratchetou branches p/ 60 **acima** da real → CI do `main` vermelho; #383 destravou (→60.04) e a campanha subiu via motores puros + hooks até 65.52 (metas), com reforço em useDebts/useCategories/useChallenges/useRecurring/recurringRepo (→68.55). **Regra: só ratchetar com ≥0.5% de margem real medida no CI.** Reforço opcional restante: useForecast (Web Worker — não exercitável em jsdom), utils 0% (financialData/categoryRules/importActions/timingEvents), workers (parserWorker/pdfParser), motores com branches soltos (insightsEngine).
  - **L-01 (float audit) — FECHADO (PR #368):** `round2` em `reportEngine.ts` é falso positivo — display-only (`fromCentavos` → reais → 2 casas), aritmética interna em centavos inteiros. Documentado com comentário inline.
  - **M-03 (verificações reais) — ABERTO, owner-pending:** MFA E2E, FCM push, NFC-e real — exigem validação em dispositivo pelo owner. **Roteiro passo a passo:** [docs/audit/M03_CHECKLIST_VERIFICACOES_REAIS.md](docs/audit/M03_CHECKLIST_VERIFICACOES_REAIS.md) (código/unit já no verde; falta só a prova em ambiente real, fora do alcance de CI).
- **Tese de produto:** `docs/product/QUANTUM_FINANCE_TESE_EXTRAORDINARIA_2026-07-09.md` — 3 ativos-fosso + 5 premissas Fable 5 + sequência de fases.
- **Nota de processo:** rodar `npm run typecheck` antes de pushar — vitest/coverage usam esbuild e não type-checam (branded types como `Centavos` escapam localmente; quebraram #366 no CI).

### FASE Radar de Compras — 1ª entrega (2026-07-09, PR #363)

- Primeiro movimento da Tese: `src/features/shopping/lib/shoppingRadar.ts` (motor PURO, zero I/O, centavos inteiros + basis points) deriva **alertas de alta** (loja da observação mais recente) e **oportunidades de economia** (mesmo produto mais barato noutra loja) das `priceObservations` de NFC-e real.
- `ShoppingRadarCard.tsx` (card-âncora, gating "UI que some") acima do `PriceIntelligencePanel`. Extensão aditiva `latestStore` em `priceIntelligence.ts`.
- **Sem escrita/rede/mutação** — camada de insight pura. Próximas fases: Ação de 1 Toque → Gêmeo Financeiro → Selo de Integridade → Copiloto que Cumpre.

### FASE FCM Background Push — FECHADA (2026-07-04, PR #359)

- `vite.config.ts` → `injectManifest` com SW customizado `src/sw.ts`: caching com paridade total ao generateSW anterior + `onBackgroundMessage` (config via `import.meta.env`; sob emulador messaging não inicializa — E2E intacto). Stub morto `public/firebase-messaging-sw.js` removido. devDeps workbox-*.
- Nova scheduled **`sendPushReminders`** (11:00 UTC = 08:00 BRT, após `executeScheduledRecurrents`): briefing diário para usuários com push ativo — recorrentes vencendo hoje + faturas fechando hoje. **Payload sem PII** (só contagens e total BRL por aritmética inteira — `functions/src/pushReminders.ts`, puro, 9 testes). Tokens mortos removidos best-effort.
- **Verificação real pendente (owner):** ativar push em Governança num dispositivo e confirmar recebimento do briefing (ou mensagem de teste via console FCM).

### FASE Cesta Pessoal / Inteligência de Preços — FECHADA (2026-07-04, PRs #357/#358)

1. **#357** Motor puro `src/features/shopping/lib/priceIntelligence.ts` (padrão cardProjection: zero I/O, zero float): `canonicalProductKey` (normalização com remoção de acentos), `buildPriceCatalog` (snapshot por loja, melhor loja, tendência última vs penúltima na mesma loja), `deltaBps` (variação em basis points INTEIROS, round-half-up por aritmética inteira), `compareBasketAcrossStores` (cesta cotada por loja, melhor cobertura total, economia em centavos). +13 testes.
2. **#358** `PriceIntelligencePanel` no ShoppingPage: "Onde comprar \<lista\>" (cotação por loja da primeira lista aberta, troféu na mais barata, economia) + "Movimentos de preço" (top 5 por |variação|, clique abre PriceHistoryPanel). Invisível sem observações. +5 testes.

Fecha o diferencial de produto: NFC-e importada (#356) → `priceObservations` → comparação de cesta e alertas de variação derivados de notas fiscais reais.

### FASE Compras Inteligentes / NFC-e — FECHADA (2026-07-04, PRs #352/#354/#355/#356)

Modelo seguro entregue completo, **zero rede no fluxo do usuário**:
1. **#352** Parser XML local (`src/features/shopping/lib/nfceParser.ts`) — modelo 65, chave DV módulo-11, centavos Decimal.js fail-closed, descrição fiscal imutável, CPF do comprador nunca extraído.
2. **#354** Parser HTML colado local (`nfceHtmlParser.ts`, layout portal nacional) + `parseNfceDocument` (roteador XML/HTML).
3. **#355** Gate SSRF (`functions/src/nfceUrlGate.ts`) — allowlist por UF (GO inicial), URL sempre reconstruída da chave, +48 testes cobrindo o threat model §12–§16, guardrail estático anti-rede no próprio módulo.
4. **#356** UI de importação (`NfceImportPanel` no ShoppingPage) — colar XML/HTML → revisão humana obrigatória (preço/qtde/unidade editáveis) → 1 `priceObservation` por item via callable `recordPriceObservation` (rate-limited).

**DECISÃO DE PRODUTO/SEGURANÇA (owner, 2026-07-04): a callable `fetchNfce` (fetch automático de NFC-e na SEFAZ) fica ADIADA.** O fluxo por QR Code/colagem já entrega o valor sem abrir superfície de rede; CAPTCHA da SEFAZ frequentemente inviabiliza o fetch automático de qualquer forma. O gate SSRF permanece pronto e testado para quando/se a decisão mudar. **Proibido implementar fetch/scraping de SEFAZ sem nova decisão explícita do owner.** Ver `docs/DECISOES-ARQUITETURA.md` e `docs/product/FASE_COMPRAS_RADAR_GITHUB_NFCE_2026-07-04.md`.
### Ciclo segurança comercial (PRs #346–#353, 2026-07-04)

- **PRs mergeados:**
  - **#346** CSP sem `'unsafe-inline'` em `script-src` + `base-uri`/`form-action`/`frame-ancestors`/`manifest-src`/`upgrade-insecure-requests` (`firebase.json`).
  - **#347** **Zero vulnerabilidades npm** (raiz e functions) via overrides cirúrgicos (uuid, teeny-request, ts-deepmerge, js-yaml); gate CI de audit das functions em `--audit-level=moderate`. firebase-admin@14 descartado (peer do firebase-functions só aceita ^13).
  - **#348** Rate limit por uid nas 6 callables de escrita não-IA (`functions/src/opRateLimit.ts`, doc `users/{uid}/usage/op_{key}`): createTransaction 120/h, createTransfer 30/h, executeAgentAction 60/h, logAuditEvent 240/h, recordPriceObservation 240/h, deleteUserData 5/dia. Gate após validação + fast-path de idempotência. IA já tinha 50/dia.
  - **#349 + #351** **MFA TOTP completo**: resolver de sign-in (`src/shared/lib/mfa.ts` + prompt em `LoginScreen.tsx`) e painel de inscrição em Settings (`src/features/settings/MfaPanel.tsx`).
  - **#353** **TOTP habilitado no projeto** (Identity Platform) via `functions/scripts/enableTotpMfa.js` (Admin SDK `projectConfigManager`, SMS intocado, adjacentIntervals=5). **Executado e validado em produção 2026-07-04** — ver `docs/security/ENABLE_TOTP_MFA_2026-07-04.md`. MFA funcional de ponta a ponta; teste E2E manual pelo owner pendente.
- **Diagnóstico de floats legados em produção (2026-07-04): zero documentos legados** — 4 transações, todas com `value_cents`. Nada a migrar.
- Suíte: **1444 unit + 219 rules + 273 functions + 28 E2E**.

### Fatos vivos herdados dos ciclos anteriores

- **Cloud Functions: 9 callables** (`createTransaction`, `executeAgentAction`, `createTransfer`, `deleteUserData`, `categorizeTransactionsBatch`, `chatWithQuantumAI`, `generateAuditReport`, `logAuditEvent`, `recordPriceObservation`) + **2 scheduled** (`executeScheduledRecurrents` 04:00 UTC; `sendPushReminders` 11:00 UTC — briefing FCM diário, payload sem PII, PR #359).
- **Logs/auditoria 100% server-trusted** onde viável (#336/#337). Mantidos client-side por decisão: recorrentes (P3 controlado) e `IMPORT_TRANSACTION` (acoplado ao `runTransaction` atômico do Modelo A).
- **`OnboardingWizard.tsx`** (#342) abre quando `accounts.length === 0 && transactions.length === 0`. **E2E precisa descartá-lo:** helper `e2e/helpers/onboarding.ts` (`dismissOnboardingIfPresent`) nos 6 specs (#345).
- Cobertura real: statements ~60.9% / lines ~64.9% (gates 60/64). Bundle principal 484 KB (budget 500 KB).
- Stashes locais podem existir; não são estado canônico da `main`.

> Histórico detalhado dos ciclos #325–#345: ver [docs/HISTORICO-FASES.md](docs/HISTORICO-FASES.md).

## Agente — Contrato de Mutação Confirmada

- **Contrato:** o LLM/chat **nunca** grava; toda mutação atravessa **proposta estruturada** (`ActionProposal` Zod `.strict()`) → **confirmação humana** → callable **`executeAgentAction`**. O backend revalida `status==='confirmed'`, grava em `users/{uid}/transactions` + history `origin: 'ai'` + `/decisions`, e mantém idempotência por `idempotencyKey`.
- **Ações materializadas:** `register_purchase` à vista (`type: 'saida'`), `register_income` à vista (`type: 'entrada'`), `contribute_to_goal`, `register_debt_payment`, `create_budget` e `register_transfer` (movimenta saldo das 2 contas atomicamente, mesma semântica de `createTransfer`, atrás da flag `VITE_ENABLE_AGENT_ROUTER`).
- **Parcelamento → formulário (decisão de produto fixada):** o Agente registra **apenas compras à vista**; `installments>1` em `register_purchase` é recusado pelo validador server-trusted (`functions/src/agentActionValidation.ts`) com `code: 'failed-precondition'` + `reason: 'use_installment_form'`. O cliente detecta o erro e abre `TransactionForm` pré-preenchido via `onRegisterPurchase` em `App.tsx` (PR #334). **NÃO duplicar lógica monetária de parcelas no Admin SDK.**
- **Intent router:** `geminiIntentClassifier` → `routeIntent` → `ActionConfirmationSheet` → `useAgentAction`, atrás da flag **`VITE_ENABLE_AGENT_ROUTER` (ON em produção desde PR #325)**. Falha no classificador → chat normal (zero regressão).
- **Query enrichment (PR #326):** quando o router retorna `type: 'answer'`, `buildQueryContext` injeta bloco estruturado (saldo, resumo mensal, cashflow ou cartão) antes do prompt Gemini.
- **Contexto de recorrentes (PR #327):** `recurringTasks` passados ao `AIAssistantChat` e incluídos no `FinancialContext` do `GeminiService`.
- **E2E:** `e2e/tests/06-agent-confirmed-mutation.spec.ts` cobre despesa e receita, determinístico, sem LLM real.
- **Doc normativo:** `docs/AI_AGENT_CONFIRMED_MUTATION_FLOW.md` e `docs/AI_TOOL_ROUTER.md`.

## Bloqueios Estruturais (não iniciar sem decisão)

- **NFC-e fetch automático (`fetchNfce`)** — **ADIADO por decisão de produto/segurança do owner (2026-07-04)**, mesmo com o gate SSRF pronto e testado (#355). O fluxo por QR Code/colagem (fase fechada, PRs #352–#356) já entrega o valor sem abrir rede. Não implementar fetch/scraping de SEFAZ sem nova decisão explícita.
- **Open Finance / BACEN** — bloqueado por mTLS/orçamento.
- ~~FCM background push~~ — **DESTRAVADO e ENTREGUE (PR #359, 2026-07-04)**: `vite.config.ts` migrado para `injectManifest` com SW customizado `src/sw.ts` (caching idêntico ao generateSW anterior + `onBackgroundMessage`); scheduled `sendPushReminders` envia briefing diário sem PII. Stub morto `public/firebase-messaging-sw.js` removido.

## Zonas Proibidas de Alteração

É terminantemente **proibido** alterar os seguintes componentes/regras fora de uma fase própria autorizada:
- A regra dos centavos e o uso obrigatório de `Decimal.js`.
- A validação `Zod strict()` nos payloads.
- O **Modelo A** (escritas e histórico atômicos).
- Trilha de histórico (`history append-only`).
- Política de logs sanitizados (sem PII).
- Idempotência server-side e App Check.
- Os arquivos/camadas: `firestore.rules`, `Cloud Functions`, `package-lock.json`.
- `functions/` **não importa** `src/` (zonas de domínio separadas).

**Regras adicionais para features:**
- AppShell/navegação **não pode alterar** `functions/`, `firestore.rules`, schemas, services financeiros, testes, `.env`, `package.json`.
- Design System **não pode alterar** cálculos monetários nem centavos inteiros.
- Toda feature com IA deve declarar: dados usados, ação sugerida, confirmação exigida, evento de auditoria registrado.
- NFC-e por colagem (zero rede) está **entregue**; fetch automático de SEFAZ permanece **adiado** por decisão do owner (2026-07-04) — não implementar sem nova decisão explícita.

## Contratos Críticos Vivos

- `value_cents` é a fonte canônica. `value` legado **nunca** é usado em cálculo financeiro.
- **Proibido:** `Math.round(value * 100)`, `parseFloat`, `Number(value)` ou heurística float.
- **`paidInvoiceMonth`** (YYYY-MM) identifica pagamentos de fatura de cartão em transações `saida`; ausência classifica como cobrança normal do cartão em `calcCardMetrics`.
- **Divisão de parcelas:** proibido `Math.floor(total / n)` — usar padrão modulo-safe: `remainder = total % n; perInstallment = (total - remainder) / n; last = perInstallment + remainder`.
- **Limite efetivo de cartão:** `cardProjection.ts` é o motor puro canônico. `effectiveAvailableCents = max(0, limite − (fatura atual + parcelas futuras))`. Parcelas canceladas (soft-delete) não comprometem o limite.
- **Competência canônica:** `src/shared/lib/competencia.ts` (`computeCompetencia`, regra `dia > closingDay`). **Atenção a duas convenções:** `computeCompetencia` rotula pelo mês de **fechamento/cobrança**; `invoiceCompetenciaForDate` (em `cardProjection.ts`) e `paidInvoiceMonth` rotulam pelo mês de **início** da janela — diferem em 1 mês.
- **Modelo A obrigatório:** todo UPDATE de `transactions/{txId}` exige `_lastOpId` + `history/{_lastOpId}` no mesmo `writeBatch`. Validado por `existsAfter` nas Firestore Rules.
- `importHash` permanece na transação real. **Proibido** em `audit_logs`, `before`/`after` e history.
- Logs sanitizados obrigatoriamente em `src/` — `console.*` cru bloqueado por `consoleLoggingPolicy.test.ts`.
- Migração automática de float → `value_cents` continua **bloqueada** (script diagnóstico read-only: `functions/scripts/diagnoseLegacyTransactions.js`).
- `value` legado, `uid`, `id`, `createdAt` bloqueados em deltas de history.
- Firestore Rules alinhadas com código e deploy real; não alterar sem ampliar cobertura de emulator (`test:rules`).

## Cloud Functions — 9 Callables (estado atual)

`functions/src/index.ts` define `ENFORCE_APP_CHECK = process.env.FUNCTIONS_EMULATOR !== 'true'`. Todas as callables usam `enforceAppCheck: ENFORCE_APP_CHECK` e `consumeAppCheckToken: ENFORCE_APP_CHECK`. Em produção: ON. Sob Functions Emulator: OFF (permite E2E/local sem token real).

| Callable | Escopo |
|---|---|
| `createTransaction` | Criação de transação server-trusted |
| `executeAgentAction` | Ações confirmadas do Agente (FASE H) |
| `createTransfer` | Transferência server-trusted — move saldo das 2 contas, idempotente (PR #313) |
| `deleteUserData` | Hard delete LGPD via Admin SDK |
| `categorizeTransactionsBatch` | Categorização em lote via IA |
| `chatWithQuantumAI` | Chat conversacional com Gemini |
| `generateAuditReport` | Relatório de auditoria |
| `logAuditEvent` | `audit_logs` de transação server-trusted (`BULK_UPDATE`/`UNDO_BULK_UPDATE`) — PR #337 |
| `recordPriceObservation` | `priceObservations` server-trusted — PR #339 |

Replay protection (`consumeAppCheckToken`) **ativo** em todas em produção.

## LGPD — Estado Atual (Blaze)

- `DataPrivacyService.ts`: `exportAllUserData()` + `deleteUserAccount()`.
- `DataPrivacyPanel.tsx`: acessível via Settings na sidebar.
- **Hard delete:** `deleteUserData` callable usa `adminDb.recursiveDelete(users/{uid})` + `admin.auth().deleteUser(uid)`. **ATIVO** (requer Blaze — upgrade realizado).

## Tipos em `Transaction`

```ts
// Parcelamento
installmentGroupId?:    string;
installmentIndex?:      number;
installmentCount?:      number;
installmentTotalCents?: Centavos;

// Recorrentes
dueMonth?:          number;        // 1–12, anuais
lastExecutedMonth?: string;        // formato YYYY-MM
```

## Migração Legada (FASE 10D)

- Script de diagnóstico read-only: `functions/scripts/diagnoseLegacyTransactions.js`.
- Migração automática de float → `value_cents` continua **bloqueada**.

## Processo Operacional Permanente

- Read-only antes de implementação.
- PR pequeno (≤5 arquivos por branch).
- Auditoria independente antes de merge.
- Merge squash.
- Atualizar main local após merge.
- Confirmar git status limpo.
- Atualizar `CLAUDE.md` após marco relevante.
- **Firebase Hosting preview channels:** TTL máximo `3d` (`expires: 3d` em `.github/workflows/firebase-hosting-pull-request.yml`). TTL default de 7d satura a cota de canais.

## Comandos de Validação Padrão

```bash
npm run typecheck
npm run lint
npm run test -- --run
npm run test:rules          # requer emulator Firestore (Java/JDK Temurin 21)
npm run build
npm --prefix functions test
npm --prefix functions run build

# E2E (requer emulators rodando)
firebase emulators:start --only auth,firestore,functions
npm run test:e2e
```

## Convenções de Commit

- `feat(escopo): descrição`
- `fix(escopo): descrição`
- `chore(escopo): descrição`
- `docs(escopo): descrição`
- Escopos comuns: `transactions`, `agent`, `cards`, `import`, `audit`, `ci`, `functions`, `config`, `security`.

## Política de Observabilidade e Logging

1. **Console cru é PROIBIDO em `src/`:** `console.error`, `console.log`, `console.debug`, `console.trace` não devem ser usados. `console.warn` e `console.info` apenas com `import.meta.env.DEV` ou exceção arquitetural documentada.

2. **Erros Firebase e fluxos sensíveis:** usar obrigatoriamente `logSanitizedFirebaseError` (ou `sanitizeErrorForLog`). **NUNCA** logar: objeto bruto do erro, stack trace, `uid`, paths `users/{uid}`, payload financeiro (valores/descrições), deltas `before`/`after`, `importHash`, prompts/respostas de IA, tokens ou segredos.

3. **Guarda automática (Vitest):** `src/__tests__/consoleLoggingPolicy.test.ts` varre o código e falha o CI em violações. Novas exceções exigem justificativa técnica explícita no código do teste. Exceção granular permitida em `useTransactions.ts` apenas para: `[SyncQueue] operação descartada após tentativas`.

4. **Privacidade do `importHash`:** permanece na transação real para deduplicação; **proibido** em `audit_logs` (bloqueado por Rules) e em deltas de histórico (`before`/`after`).

5. **Modelo A não relaxado:** a política de logging não altera o requisito de `_lastOpId` + `history` pareado no batch em qualquer UPDATE.

**Checklist para novas implementações:**
- Antes de criar `console.*`, prefira o helper sanitizado central.
- Log de depuração local: envolva em `if (import.meta.env.DEV)`.
- Rodar `npm run test -- --run` para validar política de logging.
- Rodar `npm run test:rules` se houver alteração em Firestore Rules ou auditoria.

## Modelo A — Explicação Técnica

Todo UPDATE de `transactions/{txId}` exige:
- Campo `_lastOpId` no payload, apontando para `history/{_lastOpId}` criado **no mesmo `writeBatch`**.
- As Rules validam com `existsAfter(history/{_lastOpId})` e `getAfter(...)`.
- History pré-existente **não pode** ser reutilizado como `_lastOpId`.
- UPDATE sem `_lastOpId` válido é rejeitado pelas Rules antes de persistir.

**Matriz action/origin permitida:**

| action | origin |
|---|---|
| `UPDATE` | `manual` |
| `UPDATE` | `ai` |
| `UPDATE` | `reconcile` |
| `SOFT_DELETE` | `manual` |
| `BULK_UPDATE` | `bulk` |
| `UNDO_BULK_UPDATE` | `bulk` |

Combinações fora desta matriz são rejeitadas pelas Rules.

**Proteções preservadas:**
- `importHash` imutável; não pode vazar em `before`/`after`.
- `value` legado bloqueado em delta de history.
- `uid`/`id` bloqueados em delta de history.
- `createdAt` imutável na transaction.
- `_lastOpId` sem history pareado no batch → bloqueado por `existsAfter`.

## Auditoria de Recorrentes (P3 Controlado)

Recorrentes (`ADD_RECURRING`/`UPDATE_RECURRING`/`DELETE_RECURRING`) permanecem **client-side fail-silent** como P3 controlado:
- `useRecurring.ts` dispara `AuditService.logAction` em `void` (fire-and-forget). Não-atômico.
- Risco contido em self-forgery dentro do próprio uid. Sem impacto em `value_cents`, `importHash` ou `LedgerService`.
- Migração para Cloud Functions adiada até que recorrentes ganhem semântica de auto-execução. Reavaliar como FASE 6D se necessário.
- Cobertura de Rules: bloco B19 (5 testes negativos) em `firestoreRules.audit.test.ts`.
- Rationale completo: [docs/DECISOES-ARQUITETURA.md](docs/DECISOES-ARQUITETURA.md#auditoria-de-recorrentes--fase-6c-por-que-p3-controlado).

## Diretrizes e Documentos de Referência

- **Documento Mestre:** `docs/product/QUANTUM_FINANCE_VISAO_ESTRATEGICA_2_0.md`
- **Política IA Copilot:** `docs/product/POLITICA_COPILOT_IA_QUANTUM_2026-06-12.md` — todo PR com IA deve declarar: dados usados, auditoria, idempotência, App Check, Zod, centavos, fallback de baixa confiança.
- **Arquitetura UI/UX:** `docs/UI_UX_ARCHITECTURE.md` — sem `react-router`, navegação por `currentPage`/`NavigationContext`; sem migrar libs de gráficos.
- **Agente — fluxo de mutação:** `docs/AI_AGENT_CONFIRMED_MUTATION_FLOW.md`
- **Intent router:** `docs/AI_TOOL_ROUTER.md`
- **Threat Model NFC-e:** `docs/product/THREAT_MODEL_COMPRAS_INTELIGENTES_NFCE_2026-06-12.md`
- **LGPD/RIPD:** `docs/RIPD.md`
- **Histórico de fases e PRs:** [docs/HISTORICO-FASES.md](docs/HISTORICO-FASES.md)
- **Decisões arquiteturais:** [docs/DECISOES-ARQUITETURA.md](docs/DECISOES-ARQUITETURA.md)

## Collections Firestore

Todas sob `/users/{userId}/`:

| Subcoleção | Responsabilidade |
|---|---|
| `transactions/{txId}` | Transações financeiras (fonte canônica: `value_cents`) |
| `transactions/{txId}/history/{historyId}` | History append-only por transação (Modelo A) |
| `accounts/{accountId}` | Contas bancárias e carteiras |
| `audit_logs/{logId}` | Logs de auditoria globais |
| `system_logs/{logId}` | Logs de sistema sanitizados |
| `usage/ai_calls` | Contador de chamadas de IA — server-only, deny client writes (PR #313) |
| `budgets/{budgetId}` | Orçamentos por categoria |
| `categoryRules/{ruleId}` | Regras automáticas de categorização |
| `categories/{categoryId}` | Categorias personalizadas |
| `creditCards/{cardId}` | Cartões de crédito (limite, closingDay, vencimento) |
| `recurringTasks/{taskId}` | Tarefas recorrentes |
| `recurring/{taskId}` | Recorrentes (alias) |
| `simulations/{simId}` | Simulações Monte Carlo |
| `debts/{debtId}` | Dívidas com juros e parcelamento |
| `goals/{goalId}` | Metas de poupança |
| `scoreHistory/{monthId}` | Score histórico mensal |
| `challenges/{challengeId}` | Desafios de economia (gamification) |
| `idempotency/{keyId}` | Chaves de idempotência — write exclusivo do Admin SDK (deny clients) |
| `consents/{consentId}` | Consentimentos LGPD |
| `dataProcessingLog/{logId}` | Log de processamento de dados (LGPD — server-only) |
| `shoppingLists/{listId}` | Listas de compras com itens embutidos |
| `priceObservations/{obsId}` | Histórico de preços por produto/loja — create server-only via callable `recordPriceObservation` (PR #339), update bloqueado |
| `fcmTokens/{tokenId}` | Tokens FCM para push — owner escreve/deleta, leitura exclusiva Admin SDK |
| `decisions/{decisionId}` | Diário de Decisões do Agente — append-mostly, update restrito a transição de status |
| `/{document=**}` | Deny-all catch-all |

## Referência Rápida de Arquivos Críticos

| Arquivo | Responsabilidade |
|---|---|
| `src/features/transactions/TransactionsManager.tsx` | Listagem, filtros, relatório mensal, parcelamentos |
| `src/hooks/useTransactions.ts` | Hook central de CRUD/paginação/import/sync-queue |
| `src/shared/services/FirestoreService.ts` | Barrel → repos por domínio |
| `src/features/transactions/ReconciliationEngine.tsx` | Modal de reconciliação interativa |
| `src/features/transactions/ImportButton.tsx` | Fluxo de importação CSV/OFX/PDF |
| `src/features/transactions/TransactionForm.tsx` | Formulário de criação/edição + toggle parcelamento |
| `src/components/TransactionHistoryDrawer.tsx` | Drawer de histórico por transação |
| `src/hooks/useTransactionHistory.ts` | Hook de histórico por transação |
| `src/hooks/useAuditLogs.ts` | Hook de logs globais |
| `src/components/AuditTimeline.tsx` | Timeline global de auditoria |
| `src/components/FinancialHealthScore.tsx` | Score 0-100 com 4 pilares financeiros |
| `src/components/GoalsPanel.tsx` | Metas de poupança com progresso animado |
| `src/components/RecurringManager.tsx` | Gestão de recorrentes (mensal + anual, pause/resume) |
| `src/hooks/useGoals.ts` | CRUD em tempo real de `users/{uid}/goals` |
| `src/components/OnboardingWizard.tsx` | Wizard de primeira experiência (accounts=0 && transactions=0) — PR #342 |
| `src/utils/exportCSV.ts` | `computeMonthlyReport` + `generateMonthlyReportCSV` |
| `src/lib/purchaseSimulator.ts` | Motor puro de simulação de compra (zero I/O, zero float) |
| `src/lib/debtStrategy.ts` | Motor de estratégia de quitação (avalanche/bola-de-neve). **Não existe `debtPlanner.ts`** |
| `src/hooks/useDebts.ts` | CRUD de `debts` + `calcMonthlyPaymentCents` (amortização PV/r/n) |
| `src/lib/insightsEngine.ts` | Motor unificado de insights |
| `src/lib/cardProjection.ts` | Motor de projeção de faturas e limite efetivo |
| `src/shared/lib/competencia.ts` | `computeCompetencia` — regra canônica `dia > closingDay` |
| `src/features/debts/DebtModule.tsx` | Módulo de dívidas |
| `src/features/simulation/PurchaseSimulator.tsx` | UI do simulador de compra com veredito |
| `src/features/calendar/CalendarPage.tsx` | Calendário mensal: recorrentes, faturas, metas |
| `src/features/shopping/ShoppingPage.tsx` | Página principal de Compras Inteligentes |
| `src/features/shopping/hooks/useShoppingLists.ts` | CRUD real-time de `users/{uid}/shoppingLists` |
| `src/features/shopping/hooks/usePriceObservations.ts` | Histórico de preços por produto/loja |
| `src/features/ai-agent/ActionConfirmationSheet.tsx` | Confirmação humana do Agente |
| `src/hooks/useAgentAction.ts` | Ponte client→callable `executeAgentAction` |
| `src/features/ai-agent/intentRouter.ts` | Roteador de intenções do Agente |
| `src/features/ai-agent/geminiIntentClassifier.ts` | Classificador Gemini injetável/testável |
| `src/features/ai-agent/proposalPresentation.ts` | Helper puro de apresentação de propostas |
| `src/shared/types/money.ts` | Tipo `Centavos`, `toCentavos`, `formatBRL`, Decimal.js |
| `src/shared/schemas/financialSchemas.ts` | Schemas Zod para transações |
| `src/shared/schemas/agentSchemas.ts` | `ActionProposal` Zod `.strict()` + `AGENT_INTENTS` |
| `src/shared/lib/firebaseErrorHandling.ts` | `logSanitizedFirebaseError` + `FIREBASE_ERROR_OPERATIONS` |
| `firestore.rules` | Regras de segurança com schema versionado |
| `firestore.indexes.json` | Índices compostos para queries paginadas |
| `functions/src/index.ts` | Cloud Functions (TS→`lib/`): 7 callables |
| `functions/src/agentActionValidation.ts` | Validador puro de ações do Agente (server-trusted) |
| `playwright.config.ts` | Config E2E: Chromium, webServer com VITE_USE_EMULATOR |
| `e2e/tests/` | 6 suítes E2E: smoke, create, filters, import-csv, goals, agent-confirmed-mutation |

## Hooks Presentes

`useAccounts`, `useAgentAction`, `useAppLogic`, `useAuditLogs`, `useBudgets`, `useCategories`, `useCategoryRules`, `useCreditCards`, `useFinancialData`, `useFinancialKPIs`, `useFinancialMetrics`, `useForecast`, `useGoals`, `useImportActions`, `useInsightsEngine`, `useModalState`, `usePriceObservations`, `useRecurring`, `useRunningBalance`, `useShoppingLists`, `useTransactionActions`, `useTransactionHistory`, `useTransactions`, `useTransactionsPagination`
