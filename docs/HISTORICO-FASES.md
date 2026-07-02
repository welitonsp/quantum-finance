# Quantum Finance — Histórico de Fases e PRs

> Arquivo de arquivo histórico. Contém todos os blocos de "Estado Consolidado" e cronologias de PR removidos do `CLAUDE.md` para reduzir seu tamanho. Regras ativas e contratos críticos permanecem em `CLAUDE.md`. Decisões arquiteturais em `docs/DECISOES-ARQUITETURA.md`.

---

## Estado Consolidado — Agente com mutação confirmada + receita confirmada + UI/correções (#289–#310) (2026-06-29)

> **Ref mais recente nesta seção.** Superado pelo estado em CLAUDE.md (2026-07-02).
> **Regra operacional:** Atualizar após cada PR mergeado ou marco relevante.

### 0. Estado atual (2026-06-29)
- Branch principal: `main` — HEAD `67a4b7f` (`origin/main`, PR #310 mergeado). Working tree esperado: limpo. **ZERO PR aberto.**
- **Trilha #289–#302 mergeada:** hardening do Agente/IA, App Check gated no emulador, confirmação humana obrigatória, CI Firebase Hosting Preview reparado, cobertura E2E do fluxo confirmado e **receita confirmada**.
- **Pós-#302 mergeado (#303–#306):** sync da base de conhecimento (#303), extração de painéis presentacionais do dashboard (#304), deploy `live` idempotente no merge (#305) e **correção do sinal de saldo passivo na edição inline de contas** (#306, antes apontado como P1).
- **Sessão 2026-06-29 (#307–#310 mergeados):** guard de data inválida no filtro temporal do Pareto (#307), sync da base após #303–#307 (#308) e dois grupos Dependabot — `frontend-production` (#309: @tanstack/react-query, react-virtual, framer-motion, recharts 3.8→3.9) e `frontend-development` (#310: @playwright/test, autoprefixer, postcss, typescript-eslint, vite).
- **Cloud Functions permanecem 6.** A callable `executeAgentAction` materializa ações confirmadas e segue como fronteira server-trusted. *(Nota 2026-07-02: atualizado para 7 com a adição de `createTransfer` em #313.)*
- **#271** Dependabot `@types/node` JÁ estava mergeado (commit `ba43fbf`); blocos antigos que o listavam como aberto estavam incorretos. (#287 doc de retomada antigo permanece superseded; recomendar fechar sem merge.)
- Stashes locais podem existir e não fazem parte do estado canônico da `main`; revisar antes de qualquer limpeza.

### 0.1 PRs #289–#310 (cronologia)
| PR | Escopo | Tipo |
|---|---|---|
| #289 | sync deste CLAUDE.md com o wiring do chat agent-router (PR #288) | doc-only |
| #290 | `feat(ai-agent)`: prompt de classificação Gemini reforçado (few-shot + regras) | feature |
| #291 | `chore(security)`: gitignore `functions/.secret.local` (chave Gemini do emulador) | infra/seg |
| #292 | `fix(functions)`: substitui modelo aposentado `gemini-1.5-flash` | fix |
| #293 | `docs(audit)`: pedido de auditoria do 401 do chat IA no emulador + achados correlatos | doc-only |
| #294 | `fix(errors)`: mensagens distintas ao usuário para `unauthenticated` × `resource-exhausted` (`firebaseErrorHandling.ts`) | fix |
| #295 | `fix(functions)`: App Check enforce **gated** sob o emulador de Functions (permite chamadas locais sem token real) | fix |
| #296 | `fix(functions)`: distingue falhas de **rate limit** da IA (erro próprio, não genérico) | fix |
| #297 | `fix(agent)`: exige confirmação humana e sincroniza mutações com o estado do app | fix |
| #298 | `fix(ci)`: **repara autenticação do Firebase Hosting Preview** | fix/CI |
| #299 | `docs(project)`: sync deste CLAUDE.md para #289–#298 | doc-only |
| #300 | `test(agent)`: **E2E do fluxo de mutação confirmada** (propor→confirmar→gravar) | test |
| #301 | `docs(agent)`: documenta o fluxo seguro de mutação confirmada | doc-only |
| #302 | `feat(agent)`: **suporte a registro confirmado de receita** (`register_income`) | feature/test |
| #303 | `docs(project)`: sync da base de conhecimento após o fluxo de receita confirmada | doc-only |
| #304 | `refactor(ui)`: extrai painéis presentacionais do dashboard | refactor |
| #305 | `ci(hosting)`: torna o deploy `live` idempotente no merge | fix/CI |
| #306 | `fix(accounts)`: **preserva o sinal do saldo passivo na edição inline** (era P1) | fix/test |
| #307 | `fix(reports)`: ignora datas inválidas no filtro temporal do Pareto (`NaN` guard) | fix/test |
| #308 | `docs(project)`: sync da base de conhecimento após #303–#307 | doc-only |
| #309 | `chore(deps)`: Dependabot grupo `frontend-production` (4 pacotes) | deps |
| #310 | `chore(deps-dev)`: Dependabot grupo `frontend-development` (5 pacotes) | deps |

### 0.2 Agente — fluxo seguro de mutação confirmada (#300–#302) — estado em 2026-06-29
- **E2E #300/#302** (`e2e/tests/06-agent-confirmed-mutation.spec.ts`): proposta sem gravação imediata; cancelar sem gravar; confirmar grava exatamente 1; UI reflete via `useTransactions`/`onSnapshot`; sucesso só após callable. A suíte cobre despesa e receita, determinística e sem LLM real.
- **Doc normativo:** `docs/AI_AGENT_CONFIRMED_MUTATION_FLOW.md` e `docs/PROJECT_KNOWLEDGE_SYNC_2026-06-27.md`.

### 0.3 Próximos PRs recomendados (em 2026-06-29)
1. **Docs sync pós-#302:** atualizar `CLAUDE.md`, README e docs normativos para remover referências obsoletas a receita recusada/#300 como último marco.
2. **Auditoria de comentário obsoleto:** em PR separado e autorizado, corrigir comentários internos que ainda falem em "4 kinds" ou "receita sem kind" se permanecerem no código após #302. Sem alterar comportamento.
3. **Validação assistida do Gemini/router:** com emuladores e owner presente, validar qualidade do classificador real antes de considerar ligar `VITE_ENABLE_AGENT_ROUTER` fora do E2E.
4. **Próxima ação funcional:** escolher explicitamente entre transferências, cartão/parcelado via formulário ou melhoria de UX do agente. Não duplicar lógica monetária de parcelas no Admin SDK.

---

## Estado Consolidado — Trilha UI/UX Premium (8 PRs) + Backlog do Agente (3 kinds) (2026-06-23)

> Bloco anterior — superado pelo bloco de 2026-06-29 acima.

### 0. Estado atual (2026-06-24)
- Branch principal: `main` — HEAD `ea77b2b` (PR #288 mergeado). Working tree limpo.
- **Sem PR de feature aberto.** Único PR aberto: **#271** Dependabot (`@types/node` 25.9.3→25.9.4, grupo `frontend-development`).
- **Deploy automático de Cloud Functions: ATIVO** (IAM corrigido e verificado em 2026-06-20). Todo push na `main` redeploya **rules + hosting + functions** (workflow `Deploy to Firebase Hosting on merge`, jobs `deploy_rules`/`deploy_functions`/`build_and_deploy`). Não é mais necessário deploy manual de functions.

### 0.1 Trilha UI/UX Premium — 8 PRs ✅ COMPLETA (`main @ 747dcb7`)
Plano canônico: `docs/UI_UX_ARCHITECTURE.md` (consolida auditorias Gemini+Codex+Claude). Decisões fixadas: **sem `react-router`** (navegação por `currentPage`/`NavigationContext` + switch em `App.tsx`); **não migrar biblioteca de gráficos** (Chart.js + Recharts coexistem, padronizados via `ChartCard`); reusar telas existentes; **nenhuma regra financeira na UI**.

| PR | Escopo | Status |
|---|---|---|
| #266 | doc canônico `docs/UI_UX_ARCHITECTURE.md` | ✅ |
| — | Gate DevOps: IAM do deploy de functions (least-privilege, 3 blockers 403) | ✅ |
| #267 | 8 primitivos de layout em `src/shared/components/ui/` (`PageHeader`, `DashboardSection`, `MetricCard`, `FinancialCard`, `ChartCard`, `ChartSelector`, `TopTabs`, `BottomSheet`) + barrel + smoke tests | ✅ |
| #268 | `src/shared/components/layout/AppShell.tsx` (rail+topbar+main, slot `bottomNav`) envolvendo o switch `currentPage` | ✅ |
| #269 | `DashboardContent` enxuto: Command Center acima da dobra + 2 `DashboardSection` recolhíveis | ✅ |
| #274 | `TopTabs` acessível em `ReportsContent` (Análises) | ✅ |
| #275 | `MobileBottomNav` (slot `bottomNav`) + padding no main + FAB acima da barra no mobile | ✅ |
| #276 | `ContextualAIButton` (✨ + `BottomSheet`) usado em `ReportsContent` | ✅ |
| #277 | code-split: 7 widgets analíticos → `React.lazy` + Suspense por seção (~52KB / gzip ~18KB fora do bundle inicial) | ✅ |
| #270/#272/#273 | infra: doc de status; timeout E2E; **emulador de functions no E2E** (raiz do flake `02-transaction-create`: callable `createTransaction` sem `--only ...,functions`) | ✅ |

### 0.2 Backlog do Agente — 3 kinds de ação executam server-trusted (2026-06-23)
`executeAgentAction` (`functions/src/index.ts`) executa os 4 kinds, todos idempotentes, com gate de confirmação humana (`status==='confirmed'`) + App Check enforce/consume e gravação em `/decisions` (`outcomeStatus: 'applied'`):
- ✅ **register_purchase** à vista — transação única + history Modelo A (origin `ai`) (#264).
- ✅ **contribute_to_goal** — `currentCents += amount` na meta (#278).
- ✅ **register_debt_payment** — `remaining -= amount`, `paidInstallments + 1`, recalcula `active` (#279).
- ✅ **create_budget** — cria orçamento mensal por categoria (mapeia `limitCents`→`targetAmount`) (#280).
- **Cloud Functions permanecem 6** (a execução dos kinds não criou callables novas).

### 0.3 Decisão de produto — Agente registra só compras à vista (parcelado → formulário)
- **Split de parcelas é decisão de produto, não pendência de fase.** O Agente registra **apenas compras à vista**; parcelamento pertence ao fluxo próprio (formulário/`installmentRepo`: divisão modulo-safe + `addMonthsToDate` + competência por cartão + N transações com history Modelo A). **NÃO se duplica lógica monetária no Admin SDK** (`functions/` não importa `src/`; colide com Zonas Proibidas).
- **Encodado na fronteira de autoridade (validador puro):** `functions/src/agentActionValidation.ts` recusa `installments>1` em `register_purchase` com **erro estruturado** `code: 'failed-precondition'` + `reason: 'use_installment_form'`. `executeAgentAction` propaga `reason` em `HttpsError(...).details` para a UI rotear ao formulário **sem parsear prosa** (sem linguagem de roadmap no erro). Coberto por `node --test` (**147** testes). Schema cliente (`agentSchemas.ts`) permanece permissivo (forma do envelope); a regra de negócio é server-trusted.

### 0.4 Camada de ação do Agente — ACESA no frontend (2026-06-23)
- **`executeAgentAction` agora tem consumidor real.** Fundação reutilizável: `src/hooks/useAgentAction.ts` (ponte client→callable: sela proposta como `confirmed`, revalida Zod strict, idempotencyKey UUID v4, mapeia `details.reason`) + `src/features/ai-agent/ActionConfirmationSheet.tsx` (confirmação humana sobre `BottomSheet`, com nota de auditoria e rota alternativa por `reason`). Primeiro consumidor: **`PurchaseSimulator`** — CTA "Registrar com o Assistente" (à vista) → sheet → `executeAgentAction`; **parcelado roteia direto ao formulário** (sem round-trip). Schema cliente `registerPurchasePayloadSchema` ganhou `category` opcional (alinha com o validador servidor). +21 testes (5 hook + 6 sheet + 4 simulador + contrato).

### 0.5 Intent router — núcleo determinístico ENTREGUE (2026-06-23)
- **Núcleo puro e testável (`src/features/ai-agent/`):** `intentRegistry.ts` (8 intenções, enum fechado → ferramentas read-only + `kind` de ação + `requiredSlots`), `proposalBuilders.ts` (slots → `ActionProposal` pending, Zod strict, defaults date/competência), `intentRouter.ts` (`routeIntent` → `answer`/`proposal`+pergunta/`need_more_info`/`low_confidence`/`unknown_intent`; `heuristicIntentClassifier` determinístico p/ fallback/teste). `AGENT_INTENTS`/`AgentIntent` no `agentSchemas.ts`. +16 testes. Ver `docs/AI_TOOL_ROUTER.md` §7.
- **Adaptador Gemini ENTREGUE (`geminiIntentClassifier.ts`):** reusa o callable `chatWithQuantumAI` como transporte (sem tocar `functions/`); `createGeminiIntentClassifier(transport)` injetável/testável. **O LLM informa valor em reais; conversão p/ centavos via `toCentavos`** (LLM nunca calcula centavos). Saída validada (intenção ∈ enum, confiança 0..1); qualquer falha → confiança 0 → `low_confidence` → chat normal. +11 testes.
- **Wiring no chat ENTREGUE (#288):** `AIAssistantChat.submitMessage` liga `geminiIntentClassifier`→`routeIntent`→`ActionConfirmationSheet`→`useAgentAction` atrás da flag **`VITE_ENABLE_AGENT_ROUTER` (default OFF)**. Despacho: `proposal`→sheet (confirmação humana); `need_more_info`→pede o slot (só o rótulo); `answer`/`low_confidence`/`unknown_intent`/falha→chat normal. Helper puro `src/features/ai-agent/proposalPresentation.ts`. +13 testes (7 helper + 5 chat-wiring). Flag OFF = chat idêntico (zero regressão).
- **Pendente (passo do OWNER, exige emulator):** validar qualidade da classificação Gemini com `firebase emulators:start --only auth,firestore,functions` + `npm run dev`, ajustar `buildClassificationPrompt` se preciso, e então **ligar a flag** `VITE_ENABLE_AGENT_ROUTER=true`. Cadeia de governança garante que classificação errada NÃO escreve (pior caso: proposta recusada no sheet). Ver `docs/EXECUTION_STATUS_2026-06-23.md` §3.1 e `docs/AI_TOOL_ROUTER.md` §7.2.

---

## Estado Consolidado — Reconciliação de Fases + FASE D-2A/E/H-0/H(fundação)/I-J-K (2026-06-19)

> Bloco anterior — superado pelo bloco de 2026-06-23 acima.

### 0. Estado atual (2026-06-19)
- Branch principal: `main` — HEAD `111deb5` (PR #256 mergeado).
- **7 PRs ABERTOS (verdes no CI, aguardando merge):**
  - **#257** `feature/purchase-simulator-effective-limit` — **FASE D-2A**: simulador de compra passa a usar o limite efetivo real do cartão (`cardEffectiveLimitCents`); seletor de cartão + `closingDay`/`committedFutureCents` reais. +7 testes.
  - **#258** `docs/ai-agent-governance-h0` — **FASE H-0** (doc-only): governança do Agente Financeiro — `docs/AI_AGENT_GUARDRAILS.md`, `AI_TOOL_ROUTER.md`, `AI_RESPONSE_CONTRACT.md`, `AI_DECISION_JOURNAL.md` + reconciliação + seção README.
  - **#259** `feature/debt-strategy-engine` — **FASE E**: motor puro `src/lib/debtStrategy.ts` (avalanche × bola-de-neve, rollover, economia de juros, viabilidade) + painel "Plano de Quitação" no `DebtModule.tsx`. +12 testes.
  - **#260** `feature/ai-decisions-journal` — **FASE H (fundação)**: regras Firestore de `users/{uid}/decisions` (bloco N, 10 rules tests) + `src/shared/schemas/agentSchemas.ts` (`ActionProposal` Zod `.strict()`) + `src/lib/agentResponseRenderer.ts` (placeholders/pipes + rejeição de número literal do LLM). +27 testes unitários.
  - **#261** `docs/ijk-phase-closure` — **FASES I/J/K** (doc-only): `docs/RIPD.md`, `INCIDENT_RESPONSE.md`, `ARCHITECTURE_LAYERS.md`, `CHECKLISTS.md`.
  - **#262** `docs/sync-claude-md-fase-deh` — sync deste CLAUDE.md (este PR).
  - **#264** `feature/agent-action-execution` (base `main`; recria o #263, fechado ao deletar a branch base no merge do #260) — **FASE H (ação)**: callable **`executeAgentAction`** (`functions/src/index.ts`) — App Check enforce+consume, idempotência, gate `status==='confirmed'`, escrita atômica tx+history(origin 'ai')+`/decisions`. Validador puro `functions/src/agentActionValidation.ts` + 19 testes (`node --test` 145/145). Increment 1: só `register_purchase` à vista; demais kinds e parcelas → `unimplemented`. **Eleva as Cloud Functions de 5 → 6.**
- Validação: typecheck/lint/build ✅; unit **1222** ✅; rules **182** ✅ (Java 21 + emulator); functions **145** ✅.

### 0.1 Correções de imprecisões do próprio CLAUDE.md (auditoria 2026-06-19)
> Ver `docs/RECONCILIACAO_FASES_PENDENTES_2026-06-19.md`. Duas afirmações dos blocos abaixo estavam **incorretas** vs o código real:
- **`src/lib/debtPlanner.ts` NUNCA existiu.** O plano de quitação por dívida vivia em `DebtModule.tsx` + `useDebts.ts` (`calcMonthlyPaymentCents`, amortização PV/r/n). O motor de **estratégia** (avalanche/bola-de-neve) só passou a existir como **`src/lib/debtStrategy.ts`** (PR #259). Onde os blocos antigos citam `debtPlanner.ts`, leia `debtStrategy.ts` (estratégia) / `useDebts.ts` (amortização). Não existe `debtPlanner.test.ts`; o teste é `src/lib/debtStrategy.test.ts`.
- **FASE 7 / "Agente Conversacional auditável" estava superdimensionada.** O que existia era chat (`GeminiService`→callable `chatWithQuantumAI` + máscara PII + `ProactiveBriefing`), **sem** roteador de intenções, tool registry, contrato de placeholders, `ActionProposal` ou `/decisions`. A governança (H-0, #258), a fundação (H, #260) e a **camada de ação server-trusted** (`executeAgentAction`, #264) foram entregues nesta trilha. Ainda pendente (fases futuras): **intent router no LLM** dentro do chat, execução dos outros 3 kinds de ação e split de parcelas no `register_purchase`.

### 0.2 Coleção Firestore nova (PR #260)
- `users/{uid}/decisions/{decisionId}` — Diário de Decisões do Agente (append-mostly): create owner-only com whitelist + enum de `intent`; update restrito à transição de status; delete client-side bloqueado. Ver `docs/AI_DECISION_JOURNAL.md`.

---

## Estado Consolidado — Pós-ROADMAP-MESTRE-v2 + FASES 9–25 + Trilha Monetária + Auditoria Cartões (2026-06-17)

> Bloco anterior — superado pelos blocos acima.

### 1. Status atual (2026-06-17)
- Branch principal: `main` — HEAD `6dc0102` (PR #255 mergeado). Sem PR aberto.
- **ROADMAP-MESTRE-v2 (FASES 0–8): todas mergeadas.**
- **Fase de documentação 2.0: concluída** (5 docs produto + Política Copilot IA).
- **FASES 9–25: mergeadas** (Compras Inteligentes + TTL idempotency + IR + Anti-Tarifa + Finanças Compartilhadas + AppShell + Design System + Centro de Comando + Timeline + Planejamento + Patrimônio + Copilot IA + Cofre/Governança + PWA/App Nativo + Calendário Financeiro).
- **Backlog pós-roadmap (FASES 16–25): COMPLETO.**
- **Trilha de auditoria monetária (PRs #242–#247): CONCLUÍDA.**
- **Auditoria parcelamentos (PR #250):** P0 correção divisão inteira parcelas em `installmentRepo.ts` e `purchaseSimulator.ts` (algoritmo modulo-safe). P2 em `irEngine.ts` e `reportEngine.ts`.
- **Auditoria cartões/faturas (PR #251):** P1 resolvido — fatura líquida correta ao pagar cartão + `PayInvoiceModal` dedicado. Campo `paidInvoiceMonth` adicionado ao pipeline. P2 `insightsEngine.ts` limpo.
- **FASE C — Parcelamento, fatura projetada e limite efetivo (PRs #253 + #255): CONCLUÍDA.** Motor puro `cardProjection.ts` projeta faturas futuras por competência e calcula limite EFETIVO = limite − (fatura atual + parcelas futuras); UI do `CreditCardManager` exibe limite efetivo + "Comprometido futuro". Competência unificada em `src/shared/lib/competencia.ts` (regra canônica `dia > closingDay`).
- Suíte: **63 arquivos · 1193 testes passando · 173 skipped · build OK · PWA 37 entradas pré-cacheadas**.

### Cronologia de PRs #242–#255 (trilha monetária + cartões)
- **PR #255** feat(cards): FASE C (UI) — `CreditCardManager` exibe limite efetivo (`effectiveAvailableCents`) e bloco "Comprometido futuro" por competência.
- **PR #253** feat(cards): FASE C (lógica) — motor puro `cardProjection.ts`, novos campos em `CardMetrics`, competência canônica `shared/lib/competencia.ts`.
- **PR #252** fix(analytics): exclui pagamentos de fatura do cálculo de despesas (Header/QuantumAIPage e demais agregações).
- **PR #251** fix(cards): fatura líquida (cobranças − pagamentos) + `PayInvoiceModal` + campo `paidInvoiceMonth`.
- **PR #250** fix(installments): divisão modulo-safe + P2 irEngine/reportEngine.
- **PR #249** chore(ci): reduce firebase preview channel ttl.
- **PR #248** docs(project): sync monetary trail completion.
- **PR #247** fix(copilot): `useQuantumCopilot` — `balance * 100` substituído por `toCentavos(balance)`.
- **PR #246** fix(reports): `ReportsContent` — acumulação de totais por categoria em centavos inteiros; `Decimal` BRL intermediário removido.
- **PR #245** fix(lib): `antiTarifaEngine`, `irEngine`, `contextSerializer` — fallbacks monetários manuais substituídos por `toCentavos`.
- **PR #244** fix(shared-finance): `SharedFinancePage` — parsing monetário manual substituído por `toCentavos`.
- **PR #243** fix(transactions): `transactionGroupUtils` — parsing monetário manual substituído por `toCentavos`.
- **PR #242** fix(debts): `DebtModule` — `Number`/`Math.round` em entrada monetária substituídos por `toCentavos`.

### Cronologia de PRs #218–#241 (fases 9-25 + infra)
- **PR #240** chore(ci): migração dos workflows CI e Deploy para Node.js 24.
- **PR #239** chore(deps-dev): Dependabot — bump frontend-development group (6 pacotes).
- **PR #238** fix(ci): estabilização E2E + Deploy Gate pós-FASE 25 — deploy gate alinhado ao check `E2E Tests (Playwright)` + `checks-discovery-timeout: 900`; correção IAM para deploy automático de `firestore.rules` via service account; smoke e import-csv E2E estabilizados.
- **PR #237** chore(deps): Dependabot — bump `lewagon/wait-on-check-action` para v1.8.0.
- **PR #236** feat(calendar): FASE 25 — Calendário Financeiro: `CalendarPage.tsx` com grade mensal navegável, consolidando despesas/receitas fixas recorrentes (`dueDay`), vencimentos e fechamentos de cartão de crédito, e prazos de metas de poupança; painel de eventos por dia; wiring Sidebar/Header/CommandPalette.
- **PR #235** feat(pwa): FASE 24 — PWA / App Nativo: manifest otimizado (shortcuts, lang pt-BR, orientação, ícones any+maskable), `offline.html`, `OfflineIndicator`, `usePushNotifications` (FCM token em `fcmTokens/`), seção push em GovernancePage, regra Firestore `fcmTokens`.
- **PR #234** feat(governance): FASE 23 — Cofre & Governança: `GovernancePage.tsx` com LGPD, auditoria, permissões IA e histórico append-only visível.
- **PR #233** chore(deps-dev): Dependabot — bump `@types/node`.
- **PR #232** feat(copilot): FASE 22 — Copilot IA: `CopilotPage.tsx` + `CopilotInsightCard.tsx` com contrato visual unificado (tipo, confiança, fontes, confirmação humana).
- **PR #231** feat(patrimonio): FASE 21 — Módulo Patrimônio & Objetivos: `PatrimonioPage.tsx` com KPIs de patrimônio líquido + hub de 4 módulos.
- **PR #230** feat(planning): FASE 20 — Módulo Planejamento: `PlanningPage.tsx` unificando BudgetWidget + GoalsPanel; fix PT-PT em BudgetWidget.
- **PR #229** feat(timeline): FASE 19 — Timeline Financeira dedicada: `TimelinePage.tsx`, KPIs 90d, filtros de evento, lista expansível, wiring Sidebar/Header/CommandPalette.
- **PR #227** chore(deps): Dependabot — bump frontend-production group (8 pacotes).
- **PR #226** feat(dashboard): FASE 18 — CentroComandoWidget: alertas acionáveis (orçamentos, faturas, despesas fixas) no topo do Dashboard.
- **PR #225** feat(ui): FASE 17 — Design System mínimo: 8 primitivos em `src/shared/components/ui/` (Spinner, EmptyState, Skeleton, Badge, Card, Button, MoneyDisplay, LoadingPage).
- **PR #224** feat(appshell): FASE 16 — Sidebar 8 módulos oficiais, labels PT-BR, rota `wallet` removida.
- **PR #223** feat(shared-finance): FASE 15 — Finanças Compartilhadas (grupos, split, balancete).
- **PR #222** feat(anti-tarifa): FASE 14 — Agente Anti-Tarifa com detecção de cobranças recorrentes.
- **PR #221** feat(ir): FASE 13 — Módulo IR: informe de rendimentos e apuração de ganho de capital.
- **PR #220** fix(rules): remoção de parâmetros não usados e dead code em `firestore.rules` (zero warnings no deploy).
- **PR #219** chore(functions): FASE 10 — TTL 24h para `idempotency/{key}` via `expireAt` + Firestore TTL policy.
- **PR #218** feat(shopping): FASE 9 — Módulo Compras Inteligentes.
- **#217** docs(project): sync CLAUDE.md pós-ROADMAP-MESTRE-v2.
- **#216** docs(security): Threat Model NFC-e / Compras Inteligentes.
- **#215** docs(product): Inventário comparativo Quantum × SGC.
- **#214** docs(product): Inventário UI/produto Quantum.
- **#213** docs(project): sync CLAUDE com estratégia 2.0.
- **#212** docs(product): Documento Mestre Quantum Finance 2.0.
- **#207** FASE 8: LGPD compliance + MFA + hardening de segurança.
- **#206** FASE 7: Agente Financeiro Conversacional auditável.
- **#205** FASE 6: Timeline financeira 90 dias + recorrências.
- **#204** FASE 5: Reserva de emergência + orçamento vs real + metas.
- **#203** FASE 4: Plano de Quitação de Dívidas.
- **#202** FASE 3: Simulador de Decisão de Compra.
- **#198–#201** FASES 2.1–2.5: split FirestoreService/TransactionsManager, insightsEngine unificado, quick wins UX.
- **#187–#197** FASES 0 e 1.x: P0 bugs + competência cartão + zero float + recorrências server-side + Zod transfer + net worth passivos + segurança.

### Fases implementadas e mergeadas (tabela completa)

| Fase | Escopo | PR | Status |
|---|---|---|---|
| FASE 0 | Fix P0: dupla quota IA, parcelamento não-atômico, transferência no saldo acumulado | #187 #188 #189 | ✅ |
| FASE 1.1 | Competência por fechamento do cartão (`closingDay` + `competencia` YYYY-MM) | #195 | ✅ |
| FASE 1.2 | Pagar fatura do cartão via transferência | #191 | ✅ |
| FASE 1.3 | Zero `toFixed` monetário em cartões e insights | #190 | ✅ |
| FASE 1.4 | Cloud Function agendada para recorrências server-side | #196 | ✅ |
| FASE 1.5 | Zod strict schema em `createTransferWithHistory` | #197 | ✅ |
| FASE 1.6 | Net worth reflete faturas e parcelas futuras como passivo | #193 | ✅ |
| FASE 1.7 | Auditoria de segurança herdada + correções | #192 | ✅ |
| FASE 2.1 | Split `FirestoreService.ts` em repos por domínio | #198 | ✅ |
| FASE 2.2 | Split `TransactionsManager.tsx` em componentes focados | #199 | ✅ |
| FASE 2.3 | `useInsightsEngine` unificado (7 widgets → motor puro testável) | #200 | ✅ |
| FASE 2.5 | Quick wins UX: undo 10s, edição em lote, memória categorização, drill-down | #201 | ✅ |
| FASE 3 | Simulador de Decisão de Compra (`purchaseSimulator.ts`) | #202 | ✅ |
| FASE 4 | Plano de Quitação de Dívidas (coleção `debts` + `DebtModule`/`useDebts`; estratégia avalanche/snowball em `debtStrategy.ts` — PR #259) | #203 | ✅ |
| FASE 5 | Reserva de emergência + orçamento vs real + projeção de metas | #204 | ✅ |
| FASE 6 | Timeline financeira 90 dias + recorrências inteligentes + alertas | #205 | ✅ |
| FASE 7 | Agente Financeiro Conversacional — **apenas chat** (`GeminiService`+`chatWithQuantumAI`+PII mask). Governança H-0 (#258) e fundação H (#260) à parte; ação server-trusted ainda pendente | #206 | 🟡 |
| FASE 8 | LGPD compliance + MFA + rate limiting + Secret Manager + backups | #207 | ✅ |
| FASE 9 | Compras Inteligentes: listas, itens, check-off, histórico de preços | #218 | ✅ |
| FASE 10 | TTL automático `idempotency/{key}`: campo `expireAt` + Firestore TTL policy (`fieldOverrides`) | #219 | ✅ |
| FASE 25 | Calendário Financeiro: `CalendarPage.tsx` com grade mensal, recorrentes, vencimentos/fechamentos de cartão, prazos de metas | #236 | ✅ |
| LEGADO 29–34 | Copilot proativo, Budget AI, Score History, Fluxo Caixa Semanal, Gamification, Risk Score | #181–#186 | ✅ |

### Backlog pós-roadmap — histórico de iniciativas

#### 8.1 Entregues (pós-roadmap)
| # | Iniciativa | Status |
|---|---|---|
| 11 | **Deploy produção** + limpeza de warnings Firestore Rules | ✅ PR #220 |
| 12 | **Open Finance** — BACEN API | ⛔ bloqueado (sem certificado mTLS — sem orçamento) |
| 13 | **Módulo IR** — informe de rendimentos + ganho de capital | ✅ PR #221 |
| 14 | **Agente Anti-Tarifa** — detecção de cobranças recorrentes | ✅ PR #222 |
| 15 | **Finanças Compartilhadas** — grupos, split, balancete | ✅ PR #223 |
| 16 | **AppShell / Navegação** — Sidebar 8 módulos 2.0, PT-BR, rota `wallet` removida | ✅ PR #224 |
| 17 | **Design System mínimo** — 8 primitivos em `src/shared/components/ui/` | ✅ PR #225 |
| 18 | **Centro de Comando** — CentroComandoWidget no topo do Dashboard com alertas acionáveis | ✅ PR #226 |

#### 8.2 Iniciativas de produto — alinhadas aos 8 módulos 2.0
Referência: `docs/product/INVENTARIO_UI_PRODUTO_QUANTUM_2026-06-12.md` (seção 22 — fases seguintes).

| # | Módulo 2.0 | Iniciativa | Status |
|---|---|---|---|
| 19 | **Timeline Financeira** | Página dedicada unindo passado registrado + futuro projetado + recorrências + parcelas + cenários | ✅ PR #229 |
| 20 | **Planejamento** | Consolidar BudgetWidget + alertas + projeção em módulo próprio com histórico de limites | ✅ PR #230 |
| 21 | **Patrimônio & Objetivos** | Unificar AccountsManager + GoalsPanel + DebtModule + CreditCardManager em visão consolidada | ✅ PR #231 |
| 22 | **Copilot IA** | Contrato visual unificado: fonte/dados, insight/recomendação/ação, confiança, confirmação humana | ✅ PR #232 |
| 23 | **Cofre / Governança** | Módulo explícito: LGPD, auditoria, categorias, permissões IA, histórico append-only visível | ✅ PR #234 |
| 24 | **PWA / App Nativo** | Manifest otimizado, offline.html, OfflineIndicator, FCM/push (foundation) | ✅ PR #235 |
| 25 | **Calendário Financeiro** | Grade mensal navegável: recorrentes, vencimentos/fechamentos de cartão, prazos de metas | ✅ PR #236 |
| — | **NFC-e** | Leitura de nota fiscal eletrônica | **bloqueada** — aguarda gate de segurança SSRF completo |

#### 8.3 Infraestrutura / CI / Qualidade entregues (pós-roadmap)
| PR | Escopo | Status |
|---|---|---|
| #247 | fix(copilot): `useQuantumCopilot` — `balance * 100` → `toCentavos(balance)` | ✅ |
| #246 | fix(reports): `ReportsContent` — acumulação em centavos inteiros; remove `Decimal` BRL intermediário | ✅ |
| #245 | fix(lib): `antiTarifaEngine`, `irEngine`, `contextSerializer` — fallbacks monetários → `toCentavos` | ✅ |
| #244 | fix(shared-finance): `SharedFinancePage` — parsing monetário manual → `toCentavos` | ✅ |
| #243 | fix(transactions): `transactionGroupUtils` — parsing monetário manual → `toCentavos` | ✅ |
| #242 | fix(debts): `DebtModule` — `Number`/`Math.round` de entrada monetária → `toCentavos` | ✅ |
| #238 | fix(ci): Deploy Gate alinhado ao check `E2E Tests (Playwright)` + IAM deploy `firestore.rules` + E2E estabilizados | ✅ |
| #240 | chore(ci): migração de todos os workflows para Node.js 24 | ✅ |
| #237 | chore(deps): `lewagon/wait-on-check-action` → v1.8.0 | ✅ |
| #233 | chore(deps-dev): `@types/node` bump | ✅ |
| #239 | chore(deps-dev): frontend-development group (6 pacotes) | ✅ |
| #227 | chore(deps): frontend-production group (8 pacotes) | ✅ |

---

## Suíte de testes (2026-06-16 — pós-FASE 25)

- **60 arquivos de teste · 1161 testes passando · 168 skipped** (rules rodam em `npm run test:rules` com emulator)
- **5 suítes E2E Playwright** (requerem emuladores Firebase)
- FASE 25 (CalendarPage) não adicionou arquivos de teste — componente usa hooks já cobertos.

### Arquivos de teste chave
- `src/__tests__/consoleLoggingPolicy.test.ts` — guarda automática contra `console.*` cru em `src/`
- `src/__tests__/firestoreRules.audit.test.ts` — cobertura de regras Firestore (roda com emulator)
- `src/lib/purchaseSimulator.test.ts` — motor de simulação de compra
- `src/lib/debtStrategy.test.ts` — motor de estratégia de quitação (avalanche/bola-de-neve, PR #259)
- `src/features/shopping/__tests__/shoppingSchemas.test.ts` — schemas Zod de Compras Inteligentes (22 testes)

---

## Fase 9B–9G — Política de Observabilidade e Logging — Linha do Tempo (2026-05-15)

- **Fase 9F e 9G concluídas**: Auditoria completa e sanitização de logs em todo o sistema.
- **Topo da main**: `ea45fe1 test(observability): prevent raw console logging regressions (#110)`.

| PR | Descrição |
|---|---|
| #103 | Normalização central de erros Firebase e log sanitizado (Fase 9B) |
| #104 | Remoção de duplicação de `importHash` em `audit_logs` (Fase 9E-1) |
| #105 | Hardening de Firestore Rules bloqueando `importHash` em `audit_logs` (Fase 9E-2) |
| #106 | Sanitização de logs em hooks Firestore de leitura (Fase 9F-1) |
| #107 | Sanitização de logs de Auth e Error Boundary (Fase 9F-2) |
| #108 | Sanitização de componentes financeiros periféricos (Fase 9F-3) |
| #109 | Sanitização de parsers, workers, simulação, métricas e IA (Fase 9F-4) |
| #110 | Teste preventivo contra regressão de `console.*` cru (Fase 9F-5) |

---

## Modelo A — Implementação e Linha do Tempo (FASE 8B/8C) — 2026-05-13

- FASE 8B (enforcement com `existsAfter`/`getAfter`) e FASE 8C (limpeza de helpers legacy) concluídas.
- Helpers legacy sem `_lastOpId` removidos (`updateTransaction`, `deleteTransaction`, `deleteBatchTransactions`, `batchUpdateTransactions`).
- Topo da main: `dd90dba refactor(audit): remove legacy transaction update helpers (#100)`.

### Linha do Tempo — PRs #87–#100

| PR | Descrição |
|---|---|
| #87 | UPDATE manual com history atômico |
| #88 | DELETE manual individual com history atômico |
| #89 | DELETE batch com history atômico |
| #90 | BULK UPDATE com history atômico |
| #91 | UNDO BULK UPDATE com history atômico |
| #92 | AI category update com history atômico |
| #93 | `_lastOpId` em UPDATE manual/AI |
| #94 | `_lastOpId` em delete helpers |
| #95 | `_lastOpId` em bulk/undo helpers |
| #96 | Testes de Rules para `_lastOpId` |
| #97 | Enforcement Modelo B com `getAfter`/`existsAfter` |
| #98 | Reconciliação migrada para `updateTransactionWithHistory` |
| #99 | Modelo A obrigatório — UPDATE sem `_lastOpId` falha nas Rules |
| #100 | Limpeza 8C — remoção de helpers legacy e testes correspondentes |

### Limpeza 8C — PR #100

Removidos de `FirestoreService`:
- `updateTransaction` (UPDATE sem `_lastOpId`)
- `deleteTransaction` (DELETE sem `_lastOpId`)
- `deleteBatchTransactions` (batch DELETE sem `_lastOpId`)
- `batchUpdateTransactions` (bulk sem `_lastOpId`)

Todos os fluxos vivos usam exclusivamente helpers `*WithHistory`.

---

## Sincronização — 2026-05-09 (PRs #64–#82)

- Topo da main: 65412ba (#82)
- PRs consolidados #64–#82:
  - #64 testes de Firestore Rules com emulator
  - #65 CLAUDE.md atualizado pós-audit 5A
  - #66 CI para testes de rules
  - #67 Cloud Functions skeleton
  - #68 server-trusted createTransaction + audit coverage
  - #69 QA P2/P3 do PR #68
  - #70 integração callable + recurring diff
  - #71 refactor ImportButton + virtualização
  - #72 sanitizar importHash do history
  - #73 bloquear create manual client-side
  - #74 validação estrita payload callable
  - #75 testes de payload validation
  - #76 remover legacy addTransaction
  - #77 testes negativos para recurring rules
  - #78 CI para functions tests
  - #79 App Check frontend monitor-only
  - #80 skip App Check em testes
  - #81 preparar testes callable com App Check context
  - #82 enforceAppCheck ativo em createTransaction

- Itens resolvidos no PR #82:
  - Teste da callable createTransaction agora valida exatamente 2 writes atômicos: transaction + history
  - Teste da callable valida payloads seguros e ausência de uid, id, value legado e importHash
  - Teste negativo cobre chamada unauthenticated sem escrita
  - Validação strict cobre campos server-owned adicionais: uid, id, value, createdAt e updatedAt
  - Mensagem frontend para falha de App Check/failed-precondition ficou explícita
  - AuditTimeline ganhou paginação incremental com load more
  - AllowedCategory consolidado em um único export de schema
  - Estilos/metadados de categoria consolidados em helper compartilhado

---

## FASE 5A — Auditoria Forte (PRs #62–#64)

### Estado Atual (2026-05-09)
- Branch principal: `main`.
- Topo da main: `76065bb test(audit): cover firestore rules for audit logs (#64)`.
- FASE 5A parcialmente consolidada com PRs #62, #63 e #64.

### Contexto da FASE 5
- A FASE 5 iniciou após o encerramento da FASE 4 — Conciliação Avançada.
- Investigação inicial encontrou P0 de auditoria:
  - auditoria era client-side e semanticamente forjável;
  - criação manual não gerava histórico por transação;
  - rules de audit/history eram permissivas demais em create client-side;
  - não havia teste automatizado de Firestore Rules.
- Estratégia adotada: modelo híbrido incremental; não bloquear create client-side ainda; primeiro corrigir cobertura mínima; depois endurecer rules; depois criar harness de rules com emulator.

### PR #62 — Criação manual registra histórico
- Commit: `4cbf6b8 fix(audit): record history for manual transaction creation (#62)`.
- Criação manual chama `FirestoreService.addTransaction`. Após obter o ID real, registra `AuditService.logTransactionHistory`. History usa `action='CREATE'` e `origin='manual'`. `after` usa payload canônico sanitizado. `changedFields` contém campos criados relevantes. `amount_cents` vem de `value_cents`. `id`, `uid`, `importHash` e `value` legado não entram no delta. Falha no log não impede criação.

### PR #63 — Hardening client-compatible das Firestore Rules
- Commit: `101affe security(audit): harden audit log rules (#63)`.
- Em `transactions/{txId}/history`: create client-side do owner preservado; update/delete bloqueados; `data.txId == txId` do path; action whitelist (`CREATE`, `UPDATE`, `SOFT_DELETE`, `RESTORE`, `BULK_UPDATE`, `UNDO_BULK_UPDATE`, `IMPORT`); origin whitelist (`manual`, `import`, `reconcile`, `bulk`, `system`, `recurring`, `ai`); `changedFields` limitado; `before`/`after` rejeitam `id`/`uid`/`value`/`importHash`; `createdAt == request.time`; `schemaVersion == 1`; `amount_cents` inteiro seguro.
- Em `audit_logs`: create client-side do owner preservado; update/delete bloqueados; actions aceitas (`IMPORT_TRANSACTION`, `BULK_UPDATE`, `UNDO_BULK_UPDATE`).

### PR #64 — Harness/testes de Firestore Rules
- Commit: `76065bb test(audit): cover firestore rules for audit logs (#64)`.
- Adicionou `@firebase/rules-unit-testing`, script `npm run test:rules`, configuração de emulator no `firebase.json`.
- Cobertura: history CREATE válido; `txId` divergente rejeitado; action inválida rejeitada; origin inválida rejeitada; before/after com campos proibidos rejeitados; update/delete bloqueados; cross-uid bloqueado; audit_log válido/inválido; `importHash` imutável.
- `npm run test -- --run` deixa os testes de rules como skipped; `npm run test:rules` é o comando correto.
- Requisito de Ambiente: Java/JDK (Temurin 21). Se falhar com `Could not spawn java -version`:
  ```bash
  winget install EclipseAdoptium.Temurin.21.JDK
  ```

---

## FASE 4 — Conciliação Avançada (PRs #52–#60)

### Encerramento da FASE 4 (pós-PR #60)
- Topo da main: `febd3e4 feat(reconciliation): add status filter to transactions (#60)`.
- Testes: 22 arquivos / 199 testes. **QA Final: APROVADO.**

### PR #58 — Contrato persistente de conciliação
- Commit: `c485b95 feat(reconciliation): add persistent status contract (#58)`.
- Campos opcionais adicionados: `reconciliationStatus?: 'reconciled'`, `reconciliationSource?: 'import'`, `reconciledAt?`, `reconciledBy?`.
- Ausência de `reconciliationStatus` significa não conciliada. `confidenceScore` e `matchedTransactionId` seguem rejeitados.

### PR #59 — Escrita do status na conciliação
- Commit: `adeb539 feat(reconciliation): persist status on reconcile (#59)`.
- Transações reconciliadas recebem `reconciliationStatus: 'reconciled'`, `reconciliationSource: 'import'`, `reconciledAt: serverTimestamp()`, `reconciledBy: uid`. Histórico mantém `action=UPDATE + origin=reconcile`.

### PR #60 — Filtro operacional
- Commit: `febd3e4 feat(reconciliation): add status filter to transactions (#60)`.
- Filtro `Conciliação` no painel avançado. Opções: Todas / Conciliadas / Não conciliadas. `reconciliationStatus === 'reconciled'` significa conciliada. Filtro é client-side sobre transações carregadas.

### FASE 4C — Label específico de conciliação — PR #55
- Commit: `128421e feat(reconciliation): label reconciled history entries (#55)`.
- `UPDATE + origin=reconcile` aparece visualmente como `Conciliada`; `UPDATE` comum segue como `Atualizada`.

### FASE 4D — Auditoria completa dos campos alterados — PR #56
- Commit: `88ba74d fix(reconciliation): audit all changed fields on reconcile (#56)`.
- Helper local `buildReconciliationHistoryDelta`. Campos auditados: `category`, `description`, `date`, `type`, `source`, `value_cents`, `fitId`. Exclui `id`, `uid`, `importHash`, `value` legado.

### FASE 4A — Explicabilidade visual da conciliação — PR #52
- Commit: `34d378d feat(reconciliation): explain merge candidate matches (#52)`.
- `findMergeCandidate` retorna candidato explicável; card de conciliação mostra a transação candidata antes do clique. Confiança visual: `Exato`, `Alto`, `Médio`.

### FASE 4B — Testes unitários da lógica de match — PR #53
- Commit: `2172796 test(reconciliation): cover merge candidate matching logic (#53)`.
- Exporta `findMergeCandidate` e `MergeCandidateInfo`. Testes cobrem null/data/valor/match/confidence/reasons/value_cents.

---

## FASE 3 — Importação Avançada (PRs #43–#50)

**QA Final da Fase 3: APROVADO** (2026-05-04). Topo da main: `aad22df feat(import): add Brazilian bank mapping templates (#50)`.

- **#43 — feat(import): add detailed import report**: relatório final de importação (arquivo/origem, período, lidas, novas, ignoradas, importáveis, reconciliadas, inválidas, entradas, saídas e saldo). Totais em `value_cents`.
- **#44 — feat(import): improve local deduplication fingerprint**: fingerprint local robusta na deduplicação.
- **#45 — feat(import): add cross-page candidate search helper**: `src/features/transactions/importCandidateSearch.ts` — busca read-only em `users/{uid}/transactions`, filtrada por período, limit(maxCandidates), padrão 300 / teto 500, fallback `[]`.
- **#47 — feat(import): integrate cross-page candidate search**: integrado ao `ImportButton.tsx` em background, com timeout/fallback e marcação de duplicatas prováveis.
- **#48 — feat(import): add accessible PDF password flow**: estado `password_required` com painel acessível — label, foco, erro de senha, cancelamento e submissão explícita (substitui `window.prompt()`).
- **#49 — feat(import): show custom categories in preview**: categorias personalizadas no seletor de preview.
- **#50 — feat(import): add Brazilian bank mapping templates**: templates e aliases para Nubank, Inter, Itaú, Bradesco, BB, Caixa, Santander, C6, Mercado Pago, PicPay e Genérico CSV BR.

### Assinatura do helper de candidatos (confirmada no código pós-PR #45)

```ts
export type FindImportCandidateTransactionsParams = {
  uid: string;
  periodStart: string;
  periodEnd: string;
  maxCandidates?: number;
};

export async function findImportCandidateTransactions({
  uid, periodStart, periodEnd, maxCandidates,
}: FindImportCandidateTransactionsParams): Promise<Transaction[]>
```

---

## Estado Consolidado — 2026-05-03

- Branch principal: main. Stack: React 19, TypeScript, Vite, Tailwind, Firebase/Firestore, Framer Motion, Chart.js, pdfjs-dist.
- PRs #41–#50 cobriram: residual P3 acessibilidade, otimização de grupos/summary, série completa de importação avançada.
- Histórico mais antigo (#17–#40): hotfixes P0/P1 financeiros, rodada completa de acessibilidade WCAG 2.1 AA (UX-1A a UX-1G), e série de filtros UX-2A a UX-2H.

### Estado do Módulo Movimentações (2026-05-03)
- Série UX-2 concluída até UX-2H.
- Quatro modais principais auditados e acessíveis: `TransactionHistoryDrawer`, `AuditTimeline`, Modal de importação (`ImportButton`), `ReconciliationEngine`. Todos com `role="dialog"`, `aria-modal="true"`, focus trap manual, fechamento por Escape e retorno de foco ao trigger.

### Pendências Conhecidas (registradas em 2026-05-03 — podem estar resolvidas)
- `src/components/DashboardContent.tsx:106` contém comentário `// FIX P0.2: usar valores reais de moduleBalances (PR 1 conectou via useFinancialData)`. Pendência fora do Módulo Movimentações; investigar em fase própria.
- Prop `hasUndoSnapshot` recebida pelo `TransactionsManager` mas não consumida internamente. Risco baixo, documentado.
- Projeto possuía 21 arquivos `.test.ts` e 0 `.test.tsx` em 2026-05-03. Lacuna futura em testes de componente React/UI.

---

## Referência Rápida de Arquivos Críticos (versão antiga — 2026-05-03)

> **NOTA:** Esta tabela está desatualizada. A versão atual com os arquivos corretos está no `CLAUDE.md`. Preservada aqui apenas para rastreabilidade histórica.

| Arquivo | Tamanho (2026-05) | Responsabilidade |
|---|---|---|
| `src/features/transactions/TransactionsManager.tsx` | 1481 linhas | Listagem, filtros, ordenação, agrupamento, ações em lote |
| `src/features/transactions/ImportButton.tsx` | 456 linhas | Fluxo de importação CSV/OFX/PDF (refatorado pós-PR #137+) |
| `src/features/transactions/ReconciliationEngine.tsx` | 554 linhas | Modal de reconciliação interativa |
| `src/components/TransactionHistoryDrawer.tsx` | 334 linhas | Drawer de histórico por transação |
| `src/components/AuditTimeline.tsx` | 219 linhas | Drawer de timeline global de auditoria |
| `src/hooks/useTransactions.ts` | 1131 linhas | Hook central de CRUD/paginação/import/sync-queue |
| `src/hooks/useTransactionHistory.ts` | 218 linhas | Hook de histórico por transação |
| `src/hooks/useAuditLogs.ts` | 261 linhas | Hook de logs globais |
| `src/shared/services/FirestoreService.ts` | 886 linhas | Helpers de escrita atômica (Modelo A) |
| `firestore.rules` | 1019 linhas | Regras de segurança com schema versionado v2 |
| `functions/index.js` | 461 linhas | 4 Cloud Functions (createTransaction + 3 IA) — *desatualizado: agora 7 callables em functions/src/index.ts* |
