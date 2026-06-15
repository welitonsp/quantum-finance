# Quantum Finance — Base de Conhecimento do Projeto

> Este arquivo é o ponto de entrada de contexto para qualquer agente de IA (Claude, Codex, etc.) que trabalhe no projeto. Mantenha-o atualizado a cada marco relevante. Não use este arquivo para guardar credenciais ou dados sensíveis.

## Estado Consolidado — Pós-ROADMAP-MESTRE-v2 + FASES 9–24 (2026-06-15)

> Blocos anteriores substituídos. Em caso de divergência, **este bloco é a referência**.
> **Regra operacional:** Atualizar este bloco após cada PR mergeado ou marco relevante.

### 1. Status atual
- Branch principal: `main`.
- **ROADMAP-MESTRE-v2 (FASES 0–8): todas mergeadas.**
- **Fase de documentação 2.0: concluída** (5 docs produto + Política Copilot IA).
- **FASES 9–24: mergeadas** (Compras Inteligentes + TTL idempotency + IR + Anti-Tarifa + Finanças Compartilhadas + AppShell + Design System + Centro de Comando + Timeline + Planejamento + Patrimônio + Copilot IA + Cofre/Governança + PWA/App Nativo).
- **Backlog pós-roadmap (FASES 16–24): COMPLETO.**
- Suíte: **60 arquivos · 1161 testes passando · 168 skipped · build OK · PWA 36 entradas pré-cacheadas**.
- Últimas integrações relevantes (cronologia inversa):
  - **PR #235** feat(pwa): FASE 24 — PWA / App Nativo: manifest otimizado (shortcuts, lang pt-BR, orientação, ícones any+maskable), `offline.html`, `OfflineIndicator`, `usePushNotifications` (FCM token em `fcmTokens/`), seção push em GovernancePage, regra Firestore `fcmTokens`.
  - **PR #234** feat(governance): FASE 23 — Cofre & Governança: `GovernancePage.tsx` com LGPD, auditoria, permissões IA e histórico append-only visível.
  - **PR #232** feat(copilot): FASE 22 — Copilot IA: `CopilotPage.tsx` + `CopilotInsightCard.tsx` com contrato visual unificado (tipo, confiança, fontes, confirmação humana).
  - **PR #231** feat(patrimonio): FASE 21 — Módulo Patrimônio & Objetivos: `PatrimonioPage.tsx` com KPIs de patrimônio líquido + hub de 4 módulos.
  - **PR #230** feat(planning): FASE 20 — Módulo Planejamento: `PlanningPage.tsx` unificando BudgetWidget + GoalsPanel; fix PT-PT em BudgetWidget.
  - **PR #229** feat(timeline): FASE 19 — Timeline Financeira dedicada: `TimelinePage.tsx`, KPIs 90d, filtros de evento, lista expansível, wiring Sidebar/Header/CommandPalette.
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

### 1.1 Diretrizes Oficiais (Quantum Finance 2.0)
- **Documento Mestre:** `docs/product/QUANTUM_FINANCE_VISAO_ESTRATEGICA_2_0.md` é a referência estratégica oficial.
- **Política IA:** `docs/product/POLITICA_COPILOT_IA_QUANTUM_2026-06-12.md` — todo PR futuro com IA deve declarar: dados usados, auditoria, idempotência, App Check, Zod, centavos, fallback de baixa confiança.
- **Módulo Compras Inteligentes:** Implementado na FASE 9 (PR #218). NFC-e real permanece **bloqueada**. Ver `docs/product/THREAT_MODEL_COMPRAS_INTELIGENTES_NFCE_2026-06-12.md`.
- **SGC (Sistema Gestão de Compras):** Descontinuado como produto autônomo. Serviu apenas como referência conceitual para a FASE 9.
- **Próxima Fase:** Backlog pós-roadmap — ver seção 8.

### 1.2 Zonas Proibidas de Alteração
É terminantemente **proibido** alterar os seguintes componentes/regras fora de uma fase própria autorizada:
- A regra dos centavos e o uso obrigatório de `Decimal.js`.
- A validação `Zod strict()` nos payloads.
- O **Modelo A** (escritas e histórico atômicos).
- Trilha de histórico (`history append-only`).
- Política de logs sanitizados (sem PII).
- Idempotência server-side e App Check.
- Os arquivos/camadas: `firestore.rules`, `Cloud Functions`, `package-lock.json`.

### 2. Fases implementadas e mergeadas

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
| FASE 4 | Plano de Quitação de Dívidas (`debtPlanner.ts`, coleção `debts`) | #203 | ✅ |
| FASE 5 | Reserva de emergência + orçamento vs real + projeção de metas | #204 | ✅ |
| FASE 6 | Timeline financeira 90 dias + recorrências inteligentes + alertas | #205 | ✅ |
| FASE 7 | Agente Financeiro Conversacional auditável (refs por referência, tool registry) | #206 | ✅ |
| FASE 8 | LGPD compliance + MFA + rate limiting + Secret Manager + backups | #207 | ✅ |
| FASE 9 | Compras Inteligentes: listas, itens, check-off, histórico de preços | #218 | ✅ |
| FASE 10 | TTL automático `idempotency/{key}`: campo `expireAt` + Firestore TTL policy (`fieldOverrides`) | #219 | ✅ |
| LEGADO 29–34 | Copilot proativo, Budget AI, Score History, Fluxo Caixa Semanal, Gamification, Risk Score | #181–#186 | ✅ |

### 3. Contratos críticos vivos (inalterados)
- `value_cents` é a fonte canônica. `value` legado **nunca** é usado em cálculo financeiro.
- **Proibido:** `Math.round(value * 100)`, `parseFloat`, `Number(value)` ou heurística float.
- **Modelo A obrigatório:** Todo UPDATE de `transactions/{txId}` exige `_lastOpId` + `history/{_lastOpId}` no mesmo `writeBatch`. Validado por `existsAfter` nas Firestore Rules.
- `importHash` permanece na transação real. **Proibido** em `audit_logs`, `before`/`after` e history.
- Logs sanitizados obrigatoriamente em `src/` — `console.*` cru bloqueado por `consoleLoggingPolicy.test.ts`.
- Firestore Rules alinhadas com código e deploy real.
- Stash legado não deve ser tocado sem ordem explícita.

### 4. App Check — estado real
- **`enforceAppCheck: true`** + **`consumeAppCheckToken: true`** em **todas as 5 Cloud Functions**:
  - `createTransaction`
  - `deleteUserData` (nova — FASE 20B)
  - `categorizeTransactionsBatch`
  - `chatWithQuantumAI`
  - `generateAuditReport`
- Replay protection (`consumeAppCheckToken`) **ativo** em todas as functions.

### 5. LGPD — estado real (Blaze — FASE 20B)
- `DataPrivacyService.ts`: `exportAllUserData()` + `deleteUserAccount()`.
- `DataPrivacyPanel.tsx`: acessível via Settings na sidebar.
- **Hard delete implementado**: `deleteUserData` callable usa `adminDb.recursiveDelete(users/{uid})` + `admin.auth().deleteUser(uid)`.
- Hard delete via Admin SDK: **ATIVO** (requer Blaze — upgrade realizado).

### 6. Novos tipos em `Transaction` (FASES 11–15)
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

### 7. FASE 10D — Migração legada (política inalterada)
- Script de diagnóstico read-only: `functions/scripts/diagnoseLegacyTransactions.js`.
- Migração automática de float → `value_cents` continua **bloqueada**.

### 8. Backlog pós-roadmap — alinhado à Visão Estratégica 2.0
Roadmap FASES 0–10 concluído. Backlog pós-roadmap organizado segundo os **8 módulos oficiais** definidos em `docs/product/QUANTUM_FINANCE_VISAO_ESTRATEGICA_2_0.md`.

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

#### 8.2 Próximas iniciativas — alinhadas aos 8 módulos 2.0
Referência: `docs/product/INVENTARIO_UI_PRODUTO_QUANTUM_2026-06-12.md` (seção 22 — fases seguintes).

| # | Módulo 2.0 | Iniciativa | Status |
|---|---|---|---|
| 19 | **Timeline Financeira** | Página dedicada unindo passado registrado + futuro projetado + recorrências + parcelas + cenários | ✅ PR #229 |
| 20 | **Planejamento** | Consolidar BudgetWidget + alertas + projeção em módulo próprio com histórico de limites | ✅ PR #230 |
| 21 | **Patrimônio & Objetivos** | Unificar AccountsManager + GoalsPanel + DebtModule + CreditCardManager em visão consolidada | ✅ PR #231 |
| 22 | **Copilot IA** | Contrato visual unificado: fonte/dados, insight/recomendação/ação, confiança, confirmação humana | ✅ PR #232 |
| 23 | **Cofre / Governança** | Módulo explícito: LGPD, auditoria, categorias, permissões IA, histórico append-only visível | ✅ PR #234 |
| 24 | **PWA / App Nativo** | Manifest otimizado, offline.html, OfflineIndicator, FCM/push (foundation) | ✅ PR #235 |
| — | **NFC-e** | Leitura de nota fiscal eletrônica | **bloqueada** — aguarda gate de segurança SSRF completo |

#### 8.3 Regras para as próximas fases (extraídas dos docs de produto)
- AppShell/navegação **não pode alterar** `functions/`, `firestore.rules`, schemas, services financeiros, testes, `.env`, `package.json`
- Design System **não pode alterar** cálculos monetários nem centavos inteiros
- Toda feature com IA deve responder: quais dados usa, qual ação sugere, qual confirmação exige, qual evento de auditoria registra
- NFC-e continua **bloqueada** até threat model SSRF completo com validação estrita de host/domínio

### 9. Comandos de validação padrão
```bash
npm run typecheck
npm run lint
npm run test -- --run
npm run test:rules          # requer emulator Firestore (Java/JDK)
npm run build
npm --prefix functions test
npm --prefix functions run build

# E2E (requer emulators rodando)
firebase emulators:start --only auth,firestore
npm run test:e2e
```

### 10. Processo operacional permanente
- Read-only antes de implementação.
- PR pequeno.
- Auditoria independente antes de merge.
- Merge squash.
- Atualizar main local.
- Confirmar git status limpo.
- Atualizar `CLAUDE.md` após marco relevante.

## Referência Rápida de Arquivos Críticos (estado real — 2026-06-13)

| Arquivo | Responsabilidade |
|---|---|
| `src/features/transactions/TransactionsManager.tsx` | Listagem, filtros, relatório mensal, parcelamentos (dividido em FASE 2.2) |
| `src/hooks/useTransactions.ts` | Hook central de CRUD/paginação/import/sync-queue |
| `src/shared/services/FirestoreService.ts` | Barrel → repos por domínio após FASE 2.1 |
| `src/features/transactions/ReconciliationEngine.tsx` | Modal de reconciliação interativa |
| `src/features/transactions/ImportButton.tsx` | Fluxo de importação CSV/OFX/PDF |
| `src/features/transactions/TransactionForm.tsx` | Formulário de criação/edição + toggle parcelamento |
| `src/components/TransactionHistoryDrawer.tsx` | Drawer de histórico por transação |
| `src/hooks/useTransactionHistory.ts` | Hook de histórico por transação |
| `src/hooks/useAuditLogs.ts` | Hook de logs globais |
| `src/components/AuditTimeline.tsx` | Timeline global de auditoria |
| `src/components/FinancialHealthScore.tsx` | Score 0-100 com 4 pilares financeiros |
| `src/components/AnomalyAlerts.tsx` | Alertas de anomalia por categoria (client-side) |
| `src/components/GoalsPanel.tsx` | Metas de poupança com progresso animado |
| `src/components/RecurringManager.tsx` | Gestão de recorrentes (mensal + anual, pause/resume) |
| `src/hooks/useGoals.ts` | CRUD em tempo real de `users/{uid}/goals` |
| `src/hooks/useRecurringAutoExecute.ts` | Scaffold client-side → server-side após FASE 1.4 |
| `src/utils/exportCSV.ts` | `computeMonthlyReport` + `generateMonthlyReportCSV` |
| `src/lib/purchaseSimulator.ts` | Motor puro de simulação de compra (zero I/O, zero float) |
| `src/lib/debtPlanner.ts` | Motor de plano de quitação de dívidas |
| `src/lib/insightsEngine.ts` | Motor unificado de insights (7 widgets, FASE 2.3) |
| `src/features/debts/DebtModule.tsx` | Módulo de dívidas — coleção `debts` |
| `src/features/simulation/PurchaseSimulator.tsx` | UI do simulador de compra com veredito |
| `src/features/shopping/ShoppingPage.tsx` | Página principal de Compras Inteligentes (FASE 9) |
| `src/features/shopping/hooks/useShoppingLists.ts` | CRUD real-time de `users/{uid}/shoppingLists` |
| `src/features/shopping/hooks/usePriceObservations.ts` | Histórico de preços por produto/loja |
| `src/shared/types/shopping.ts` | Tipos: ShoppingList, ShoppingListItem, PriceObservation |
| `src/shared/schemas/shoppingSchemas.ts` | Zod `.strict()` para payloads de Compras |
| `src/shared/types/money.ts` | Tipo `Centavos`, `toCentavos`, `formatBRL`, Decimal.js |
| `src/shared/schemas/financialSchemas.ts` | Schemas Zod para transações |
| `src/shared/lib/firebaseErrorHandling.ts` | `logSanitizedFirebaseError` + `FIREBASE_ERROR_OPERATIONS` |
| `firestore.rules` | Regras de segurança com schema versionado (inclui shoppingLists/priceObservations) |
| `firestore.indexes.json` | Índices compostos para queries paginadas |
| `functions/index.js` | 5 Cloud Functions (createTransaction + 3 IA + deleteUserData) |
| `playwright.config.ts` | Config E2E: Chromium, webServer com VITE_USE_EMULATOR |
| `e2e/tests/` | 5 suítes E2E: smoke, create, filters, import-csv, goals |
| `firestore.indexes.json` | — | 4 índices compostos para `transactions` |
| `functions/index.js` | 461 | 4 Cloud Functions (createTransaction + 3 IA) |
| `playwright.config.ts` | — | Config E2E: Chromium, webServer com VITE_USE_EMULATOR |
| `e2e/tests/` | — | 5 suítes E2E: smoke, create, filters, import-csv, goals |

## Hooks presentes (2026-06-13)

`useAccounts`, `useAppLogic`, `useAuditLogs`, `useBudgets`, `useCategories`, `useCategoryRules`, `useCreditCards`, `useFinancialData`, `useFinancialKPIs`, `useFinancialMetrics`, `useForecast`, `useGoals`, `useImportActions`, `useInsightsEngine`, `useModalState`, `usePriceObservations`, `useRecurring`, `useRecurringAutoExecute`, `useRunningBalance`, `useShoppingLists`, `useTransactionActions`, `useTransactionHistory`, `useTransactions`, `useTransactionsPagination`

## Suíte de testes (2026-06-13 — pós-FASE 9)

- **57 arquivos de teste** (56 passando + 1 skipped — rules)
- **1080 testes passando · 168 skipped** (rules rodam em `npm run test:rules` com emulator)
- **5 suítes E2E Playwright** (requerem emuladores Firebase)

### Testes adicionados na FASE 9
- `src/features/shopping/__tests__/shoppingSchemas.test.ts` — 22 testes (schemas Zod: list, item, check, price observation)

### Arquivos de teste chave
- `src/__tests__/consoleLoggingPolicy.test.ts` — guarda automática contra `console.*` cru em `src/`
- `src/__tests__/firestoreRules.audit.test.ts` — cobertura de regras Firestore (roda com emulator)
- `src/lib/purchaseSimulator.test.ts` — motor de simulação de compra
- `src/lib/debtPlanner.test.ts` — motor de plano de dívidas
- `src/features/shopping/__tests__/shoppingSchemas.test.ts` — schemas de Compras Inteligentes

## Estado Consolidado — Política de Observabilidade e Logging (FASE 9F/9G) — 2026-05-15

### Status Atual

- **Fase 9F e 9G concluídas**: Auditoria completa e sanitização de logs em todo o sistema.
- **Política Preventiva Ativa**: Teste automatizado de análise estática bloqueia regressões de logs crus.
- **Topo da main**: `ea45fe1 test(observability): prevent raw console logging regressions (#110)`.

### Linha do Tempo — Fase 9B a 9G

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

### Política de Observabilidade, Privacidade e Logging

1.  **Console cru é PROIBIDO em produção**:
    - `console.error`, `console.log`, `console.debug` e `console.trace` não devem ser usados no código do diretório `src`.
    - `console.warn` e `console.info` são permitidos apenas quando protegidos por `import.meta.env.DEV` ou como exceções arquiteturais documentadas.

2.  **Erros Firebase e Fluxos Sensíveis**:
    - Devem usar obrigatoriamente `logSanitizedFirebaseError` (ou `sanitizeErrorForLog`).
    - **NUNCA** logar: objeto bruto do erro, stack trace, `uid`, paths `users/{uid}`, payload financeiro (valores/descrições), deltas `before`/`after`, `importHash`, prompts/respostas de IA, tokens ou segredos.

3.  **Guarda Automática (Vitest)**:
    - O teste `src/__tests__/consoleLoggingPolicy.test.ts` varre o código fonte e falha o CI se encontrar violações.
    - Novas exceções ao teste exigem justificativa técnica explícita no código do teste.
    - Exceção granular permitida em `useTransactions.ts` apenas para: `[SyncQueue] operação descartada após tentativas`.

4.  **Privacidade do importHash**:
    - O `importHash` permanece na transação real para deduplicação.
    - **Proibido** em `audit_logs` (bloqueado por Rules).
    - **Proibido** em deltas de histórico (`before`/`after`).

5.  **Manutenção do Modelo A**:
    - A política de logging não relaxa o Modelo A. Todo UPDATE exige `_lastOpId` e `history` pareado no batch.

### Checklist para Novas Implementações

- Antes de criar um `console.*`, prefira o helper sanitizado central.
- Se for log estritamente para depuração local, envolva em `if (import.meta.env.DEV)`.
- Rodar `npm run test -- --run` para garantir que a política de logging não foi violada.
- Rodar `npm run test:rules` se houver alteração em Auditoria ou Firestore Rules.

## Estado Consolidado — Modelo A Obrigatório (FASE 8B/8C) — 2026-05-13

### Status Atual

- FASE 8B (enforcement com `existsAfter`/`getAfter`) e FASE 8C (limpeza de helpers legacy) concluídas.
- **Modelo A obrigatório ativo**: todo UPDATE de transaction exige `_lastOpId` apontando para um `history/{_lastOpId}` criado no mesmo `writeBatch`.
- Helpers legacy sem `_lastOpId` removidos (`updateTransaction`, `deleteTransaction`, `deleteBatchTransactions`, `batchUpdateTransactions`).
- Nenhum caller produtivo realiza UPDATE sem history pareado.
- Topo da main: `dd90dba refactor(audit): remove legacy transaction update helpers (#100)`.
- Trilha de auditoria de UPDATE encerrada. Pendente: QA funcional manual em navegador (FASE 9A).

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

### Explicação Técnica do Modelo A

- Todo UPDATE de `transactions/{txId}` exige o campo `_lastOpId` no payload.
- `_lastOpId` deve referenciar um documento `history/{_lastOpId}` que será criado **no mesmo `writeBatch`**.
- As Firestore Rules validam o pareamento pós-commit com `existsAfter(history/{_lastOpId})` e `getAfter(...)`.
- History pré-existente não pode ser reutilizado como `_lastOpId`.
- UPDATE sem `_lastOpId` válido é rejeitado pelas Rules antes de persistir.

### Matriz Permitida action/origin

| action | origin |
|---|---|
| `UPDATE` | `manual` |
| `UPDATE` | `ai` |
| `UPDATE` | `reconcile` |
| `SOFT_DELETE` | `manual` |
| `BULK_UPDATE` | `bulk` |
| `UNDO_BULK_UPDATE` | `bulk` |

Combinações fora desta matriz são rejeitadas pelas Rules.

### Fluxos Produtivos Cobertos

- Update manual de transação — `updateTransactionWithHistory`
- AI category update — `updateTransactionWithHistory`
- Reconciliação na importação — `updateTransactionWithHistory`
- Soft delete individual — helper `*WithHistory`
- Delete batch — helper `*WithHistory`
- Bulk update — `batchUpdateTransactionsWithHistory`
- Undo bulk update — `undoBulkUpdateWithHistory`

### Proteções Preservadas

- `importHash` imutável; não pode vazar em `before`/`after` do history.
- `value` legado bloqueado em delta de history.
- `uid`/`id` bloqueados em delta de history.
- `createdAt` imutável na transaction.
- `_lastOpId` sem history pareado no batch é bloqueado pelo enforcement `existsAfter`.
- Combinações action/origin fora da matriz rejeitadas.

### Limpeza 8C — PR #100

Removidos de `FirestoreService`:

- `updateTransaction` (UPDATE sem `_lastOpId`)
- `deleteTransaction` (DELETE sem `_lastOpId`)
- `deleteBatchTransactions` (batch DELETE sem `_lastOpId`)
- `batchUpdateTransactions` (bulk sem `_lastOpId`)

Testes unitários legacy correspondentes removidos junto.
Todos os fluxos vivos usam exclusivamente helpers `*WithHistory`.

### Comandos de Validação

```bash
npm run typecheck
npm run lint
npm run test:rules       # 84/84 — emulator obrigatório (Java/JDK)
npm run test -- --run    # 257 passed após remoção legacy
npm run build
```

### Próximas Recomendações

- **FASE 9A — QA funcional manual em navegador**: testar criação, edição, exclusão individual, delete batch, bulk update, undo bulk, importação, reconciliação, AI category e drawer de histórico por transação.
- Não alterar `firestore.rules` sem ampliar cobertura de emulator (`test:rules`).
- Não reintroduzir helper de UPDATE sem `_lastOpId`.

### Riscos Residuais

- QA funcional manual em navegador ainda **pendente**.
- Validações acima refletem CI da consolidação; reexecutar localmente antes de iniciar FASE 9A.
- Sistema **não** declarado pronto para produção; trilha de auditoria de UPDATE encerrada, demais áreas (App Check, E2E Playwright, Sentry, busca server-side) seguem roadmap próprio.

## Decisão Operacional — Spark Manual Create — 2026-05-09

- O projeto `quantum-finance-39235` está no plano Firebase Spark/free; deploy de Cloud Functions exige Blaze por depender de `cloudbuild.googleapis.com` e `artifactregistry.googleapis.com`.
- Criação manual de movimentações **não pode depender obrigatoriamente** da callable `createTransaction` enquanto o projeto permanecer no Spark.
- Caminho ativo Spark: `useTransactions.add` -> `FirestoreService.createManualTransactionWithHistory` -> `writeBatch` criando `users/{uid}/transactions/{txId}` e `users/{uid}/transactions/{txId}/history/create` no mesmo commit.
- `firestore.rules` permite `source=manual` somente quando o `history/create` consistente existe no estado pós-batch; history `CREATE/manual` isolado continua bloqueado e history segue append-only.
- Campos proibidos em criação manual client-side permanecem bloqueados: `id`, `uid`, `value`, `importHash` e metadados de conciliação/importação.
- A callable `createTransaction` permanece no código como caminho server-trusted futuro para Blaze; `enforceAppCheck: true` não deve ser removido por engano.
- Rebaixamento aceito: sem Admin SDK não há autoridade server-trusted plena; a mitigação Spark depende de Rules rigorosas e testes de emulator.

## Decisão Técnica — FASE 7E-1 Idempotência Spark Manual — 2026-05-11

- O `txId` final da criação manual Spark é reservado uma vez em `useTransactions.add`/`addBatch` antes de enfileirar a operação.
- A `AddOp` pendente preserva esse `txId` entre retries; `processQueue` repassa sempre o mesmo ID para `FirestoreService.createManualTransactionWithHistory(uid, data, txId)`.
- `FirestoreService.createManualTransactionWithHistory` aceita `txId` explícito fora do payload financeiro, usa esse ID no documento `transactions/{txId}` e mantém `history/create` como ID fixo.
- O payload financeiro continua sem `id`, `uid`, `value` legado e `importHash`; `value_cents` segue como valor canônico.
- Em erro ambíguo de commit, o helper lê `transactions/{txId}` e `history/create`; se ambos já existem e batem com o payload canônico, retorna sucesso com o mesmo `txId`. Documento divergente ou history ausente propagam o erro original.
- `firestore.rules` não foi alterado nesta fase; a idempotência foi implementada apenas por ID estável no cliente e verificação segura pós-erro.
- A callable `createTransaction` e `functions/index.js` permanecem intactos para futuro modo Blaze/server-trusted.

## Sincronização — 2026-05-09

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
- Fase 5 Auditoria Forte: concluída
- Fase 7B App Check (**ESTADO DESATUALIZADO — ver bloco 2026-06-03**):
  - ~~enforceAppCheck ativo SOMENTE em createTransaction~~ → **ATUAL: enforce em TODAS as 4 callables**
  - consumeAppCheckToken: NÃO ativo (ainda válido)
  - ~~callables IA: SEM enforcement~~ → **ATUAL: todas com enforceAppCheck: true**
  - rollback original: remover enforceAppCheck da linha 30 de functions/index.js + deploy (obsoleto)
- Testes: 200+ unitários + testes de rules com emulator + testes de callable
- CI: typecheck + lint + test + functions test + rules test + build
- Itens resolvidos neste PR:
  - Teste da callable createTransaction agora valida exatamente 2 writes atômicos: transaction + history
  - Teste da callable valida payloads seguros e ausência de uid, id, value legado e importHash
  - Teste negativo cobre chamada unauthenticated sem escrita
  - Validação strict cobre campos server-owned adicionais: uid, id, value, createdAt e updatedAt
  - Guardrail estático garante enforceAppCheck somente em createTransaction e consumeAppCheckToken desativado
  - Mensagem frontend para falha de App Check/failed-precondition ficou explícita
  - AuditTimeline ganhou paginação incremental com load more
  - AllowedCategory consolidado em um único export de schema
  - Estilos/metadados de categoria consolidados em helper compartilhado
  - Branches locais obsoletas soltas removidas, preservando main e a branch atual; branches presas a worktrees foram mantidas por segurança
- Próximas pendências:
  - App Check enforcement nas callables de IA (após observação)
  - consumeAppCheckToken (replay protection)
  - Sentry/Crashlytics
  - E2E Playwright
  - P1-5 busca server-side
  - Fase 6 IA e automações

## Status Auditoria de Recorrentes — FASE 6C

Auditoria de recorrentes (`ADD_RECURRING` / `UPDATE_RECURRING` / `DELETE_RECURRING`) permanece **client-side fail-silent** como **P3 controlado**.

- Fluxo em `src/hooks/useRecurring.ts` grava operação principal e dispara `AuditService.logAction` em `void` (fire-and-forget). Não-atômico.
- Risco contido em **self-forgery dentro do próprio uid** — usuário pode gravar audit_log semanticamente válido sem operação principal correlata, porque `firestore.rules:isValidAuditLog` valida sintaxe mas não coerência action↔entity.
- **Sem impacto em** `value_cents`, `importHash` ou `LedgerService`. `recurringTasks` é metadado de intenção; ocorrências reais materializadas viram `Transaction` via callable server-trusted (FASE 5).
- Migração para Cloud Functions adiada até que recorrentes ganhem semântica de auto-execução de movimento. Reavaliar como **FASE 6D** se essa semântica surgir ou se auditoria externa exigir trilha não-forjável.
- Cobertura de Firestore Rules reforçada com **bloco B19 (5 testes negativos)** em `src/__tests__/firestoreRules.audit.test.ts`: entity inválida, cross-uid, schemaVersion incorreta, chave extra fora da whitelist, `details` acima de 500 chars.

## Estado Consolidado — FASE 5A Auditoria Forte

### Estado Atual

- Branch principal: `main`.
- Topo da main: `76065bb test(audit): cover firestore rules for audit logs (#64)`.
- Working tree confirmado limpo.
- Nenhum PR aberto no checkpoint de consolidação da FASE 5A.
- FASE 5A parcialmente consolidada com PRs #62, #63 e #64.

### Contexto da FASE 5

- A FASE 5 iniciou após o encerramento da FASE 4 — Conciliação Avançada.
- Investigação inicial encontrou P0 de auditoria:
  - auditoria era client-side e semanticamente forjável;
  - criação manual não gerava histórico por transação;
  - rules de audit/history eram permissivas demais em create client-side;
  - não havia teste automatizado de Firestore Rules.
- Estratégia adotada:
  - modelo híbrido incremental;
  - não bloquear create client-side ainda;
  - primeiro corrigir cobertura mínima;
  - depois endurecer rules;
  - depois criar harness de rules com emulator;
  - Cloud Functions/server-trusted fica para fase posterior.

### PR #62 — Criação manual registra histórico

- Commit: `4cbf6b8 fix(audit): record history for manual transaction creation (#62)`.
- Arquivos principais:
  - `src/hooks/useTransactions.ts`.
  - `src/hooks/useTransactions.test.ts`.

Entrega:

- Criação manual chama `FirestoreService.addTransaction`.
- Após obter o ID real, registra `AuditService.logTransactionHistory`.
- History usa `action='CREATE'`.
- History usa `origin='manual'`.
- `after` usa payload canônico sanitizado.
- `changedFields` contém campos criados relevantes.
- `amount_cents` vem de `value_cents`.
- `id`, `uid`, `importHash` e `value` legado não entram no delta.
- Falha no log não impede criação, mantendo padrão fail-silent do `AuditService`.

Validação:

- Teste em `src/hooks/useTransactions.test.ts`.
- Suíte passou com 23 arquivos / 200 testes após a fase.

### PR #63 — Hardening client-compatible das Firestore Rules

- Commit: `101affe security(audit): harden audit log rules (#63)`.
- Arquivo principal:
  - `firestore.rules`.

Entrega em `transactions/{txId}/history`:

- Create client-side do owner preservado.
- Update/delete bloqueados.
- `data.txId == txId` do path.
- Action whitelist:
  - `CREATE`.
  - `UPDATE`.
  - `SOFT_DELETE`.
  - `RESTORE`.
  - `BULK_UPDATE`.
  - `UNDO_BULK_UPDATE`.
  - `IMPORT`.
- Origin whitelist:
  - `manual`.
  - `import`.
  - `reconcile`.
  - `bulk`.
  - `system`.
  - `recurring`.
  - `ai`.
- `changedFields` limitado e com campos conhecidos.
- `before`/`after` rejeitam:
  - `id`.
  - `uid`.
  - `value`.
  - `importHash`.
- `createdAt == request.time`.
- `schemaVersion == 1`.
- `amount_cents` inteiro seguro.

Entrega em `audit_logs`:

- Create client-side do owner preservado.
- Update/delete bloqueados.
- Actions aceitas:
  - `IMPORT_TRANSACTION`.
  - `BULK_UPDATE`.
  - `UNDO_BULK_UPDATE`.
- Validações conservadoras de `txId`, `importHash`, `amount_cents`, `details`, `metadata` e `amount_display`.
- Compatibilidade preservada com `LedgerService`, inclusive `amount_display` numérico.

Observação:

- Rules foram endurecidas, mas auditoria ainda não é server-trusted.

### PR #64 — Harness/testes de Firestore Rules

- Commit: `76065bb test(audit): cover firestore rules for audit logs (#64)`.
- Arquivos principais:
  - `src/__tests__/firestoreRules.audit.test.ts`.
  - `firebase.json`.
  - `package.json`.
  - `package-lock.json`.

Entrega:

- Adicionou `@firebase/rules-unit-testing`.
- Adicionou script `npm run test:rules`.
- Adicionou configuração de emulator no `firebase.json`.
- Criou cobertura automatizada para rules de:
  - `users/{uid}/transactions/{txId}/history`;
  - `users/{uid}/audit_logs`;
  - proteção de `importHash` em transactions.

Cobertura confirmada:

- History CREATE válido pelo owner.
- History com `txId` divergente rejeitado.
- Action inválida rejeitada.
- Origin inválida rejeitada.
- Before/after com `id`, `uid`, `value`, `importHash` rejeitados.
- Update/delete em history bloqueados.
- Usuário A bloqueado no path do usuário B.
- Audit_log `IMPORT_TRANSACTION` válido.
- Audit_log `BULK_UPDATE` válido.
- Audit_log com action inválida rejeitado.
- Update/delete em audit_logs bloqueados.
- Usuário A bloqueado no path do usuário B.
- Update tentando alterar `importHash` rejeitado.

Observação importante:

- `npm run test -- --run` deixa os testes de rules como skipped.
- Os testes de rules rodam separadamente por `npm run test:rules`.

### Validação Final Conhecida

- `npm run typecheck`: OK.
- `npm run lint`: OK.
- `npm run test -- --run`: OK.
  - 23 arquivos passaram.
  - 200 testes passaram.
  - 18 testes de rules aparecem como skipped na suíte padrão.
- `npm run build`: OK.
- `npm run test:rules`: OK.
  - Firestore Emulator iniciado com Java/JDK Temurin 21.
  - 1 arquivo de rules testado.
  - 18 testes passaram.
  - 0 falhas.
  - Script saiu com code 0.
- `git status`: clean.
- `gh pr status`: nenhum PR aberto.

### Requisito de Ambiente

- `npm run test:rules` exige Java/JDK instalado e disponível no PATH.
- Ambiente validado com OpenJDK Temurin 21.0.11 LTS.
- Se falhar com `Could not spawn java -version`, instalar JDK:

```bash
winget install EclipseAdoptium.Temurin.21.JDK
```

- Após instalar, fechar e reabrir PowerShell/VS Code antes de rodar:

```bash
java -version
npm run test:rules
```

### Riscos Residuais

- Auditoria ainda é client-side.
- Usuário autenticado ainda pode criar logs semanticamente válidos no próprio path.
- Rules reduzem superfície de fraude/erro, mas não substituem autoridade server-side.
- Auditoria server-trusted real ainda depende de fase futura com Cloud Functions/Admin SDK ou arquitetura equivalente.
- `npm run test:rules` ainda precisa estar integrado ao CI para impedir regressões automáticas em PRs futuros.

### Próxima Etapa Recomendada

**FASE 5A-2C — integrar `npm run test:rules` ao CI/GitHub Actions**.

Depois:

- Avaliar server-trusted audit via Cloud Functions/Admin SDK.
- Ou continuar cobertura de auditoria para recorrentes, IA/autocategoria, exclusão/restauração e bulk/undo.

> As seções históricas abaixo foram preservadas para manter contexto. Em caso de divergência, o estado consolidado da FASE 5A no topo deste arquivo é a referência mais recente.

## Estado Consolidado — FASE 4 Conciliação Avançada — encerramento

### Estado Atual

- Branch principal: `main`.
- Topo da main: `febd3e4 feat(reconciliation): add status filter to transactions (#60)`.
- Working tree confirmado limpo no QA final da FASE 4.
- Nenhum PR aberto no QA final da FASE 4.
- Testes atuais: 22 arquivos / 199 testes.

### PR #58 — Contrato persistente de conciliação

- Commit: `c485b95 feat(reconciliation): add persistent status contract (#58)`.
- Arquivos principais:
  - `src/shared/types/transaction.ts`.
  - `src/shared/schemas/financialSchemas.ts`.
  - `src/shared/services/FirestoreService.ts`.
  - `firestore.rules`.

Campos opcionais adicionados:

- `reconciliationStatus?: 'reconciled'`.
- `reconciliationSource?: 'import'`.
- `reconciledAt?`.
- `reconciledBy?`.

Regras:

- Ausência de `reconciliationStatus` significa não conciliada.
- Schemas aceitam somente `reconciled` e `import`.
- `confidenceScore` e `matchedTransactionId` seguem rejeitados.
- Documentos antigos seguem compatíveis.
- Status não é obrigatório.

### PR #59 — Escrita do status na conciliação

- Commit: `adeb539 feat(reconciliation): persist status on reconcile (#59)`.
- Arquivos principais:
  - `src/features/transactions/ImportButton.tsx`.
  - `src/features/transactions/__tests__/reconciliationRouting.test.ts`.

Entrega:

- Transações reconciliadas recebem:
  - `reconciliationStatus: 'reconciled'`.
  - `reconciliationSource: 'import'`.
  - `reconciledAt: serverTimestamp()`.
  - `reconciledBy: uid`.
- Novas importadas não recebem campos de conciliação.
- Reconciliadas continuam via `FirestoreService.updateTransaction`.
- Novas continuam via `onImportTransactions`.
- Histórico mantém `action=UPDATE + origin=reconcile`.
- Delta audita campos persistentes e exclui `id`, `uid`, `importHash`, `value`.

### PR #60 — Filtro operacional

- Commit: `febd3e4 feat(reconciliation): add status filter to transactions (#60)`.
- Arquivo principal:
  - `src/features/transactions/TransactionsManager.tsx`.

Entrega:

- Filtro `Conciliação` no painel avançado.
- Opções:
  - Todas.
  - Conciliadas.
  - Não conciliadas.
- Regra:
  - `reconciliationStatus === 'reconciled'` significa conciliada.
  - Ausência ou valor diferente de `reconciled` significa não conciliada.
- Chip ativo:
  - `Conciliação: Conciliadas`.
  - `Conciliação: Não conciliadas`.
- `clearAllFilters` reseta o filtro.
- Botão de filtros avançados considera o novo filtro.
- Filtro é client-side sobre transações carregadas.

### QA Final da FASE 4

- Veredito: **APROVADO**.

Validações:

- `npm run typecheck`: OK.
- `npm run lint`: OK.
- `npm run test -- --run`: OK, 22 arquivos / 199 testes.
- `npm run build`: OK.

Achados:

- P0: nenhum.
- P1: nenhum.
- P2: nenhum.
- P3: nenhum defeito funcional identificado.

Integridade financeira:

- `value_cents` continua canônico.
- Nenhum cálculo financeiro novo com float.
- `LedgerService` intacto.
- `importHash` intacto.
- Parser intacto.

### Riscos Residuais

- Filtro de conciliação é client-side e atua apenas sobre movimentações carregadas.
- Documentos antigos sem `reconciliationStatus` aparecem como não conciliados.
- Ainda não há filtro server-side/indexado.
- Ainda não há teste visual/E2E dedicado para o select de conciliação.
- Histórico continua sendo trilha auditável separada; se o log falhar após update bem-sucedido, pode haver divergência parcial entre documento e histórico.

### Estado Final da FASE 4

- **FASE 4 — Conciliação Avançada: concluída.**
- Próxima fase recomendada: **FASE 5 — Auditoria Forte**.

> As seções históricas abaixo foram preservadas para manter contexto. Em caso de divergência, o estado consolidado de encerramento da FASE 4 é a referência mais recente.

## Estado Consolidado — FASE 4 Conciliação Avançada — após PRs #55 e #56

### Estado Atual

- Branch principal: `main`.
- Topo da main: `88ba74d fix(reconciliation): audit all changed fields on reconcile (#56)`.
- Working tree confirmado limpo no QA checkpoint da FASE 4A-4D.
- Nenhum PR aberto no QA checkpoint da FASE 4A-4D.
- Testes atuais: 22 arquivos / 196 testes.

### FASE 4C — Label específico de conciliação no histórico — PR #55

- Commit: `128421e feat(reconciliation): label reconciled history entries (#55)`.
- Arquivo alterado:
  - `src/components/TransactionHistoryDrawer.tsx`.

Entrega:

- `UPDATE + origin=reconcile` agora aparece visualmente como `Conciliada`.
- Origem visual `reconcile` aparece como `Conciliação`.
- `UPDATE` comum segue como `Atualizada`.
- Action persistida continua `UPDATE`.
- Histórico antigo com `origin=reconcile` passa a ser reinterpretado visualmente como `Conciliada`.

Escopo preservado:

- Não alterou `ImportButton`.
- Não alterou `AuditService`.
- Não alterou `ReconciliationEngine`.
- Não alterou schemas.
- Não alterou Firestore rules.
- Não alterou `LedgerService`.
- Não alterou `importHash`.
- Não alterou parser/persistência/package files.

Validações:

- `npm run typecheck`: passou.
- `npm run lint`: passou.
- `npm run test -- --run`: passou com 22 arquivos / 195 testes.
- `npm run build`: passou.

### FASE 4D — Auditoria completa dos campos alterados na conciliação — PR #56

- Commit: `88ba74d fix(reconciliation): audit all changed fields on reconcile (#56)`.
- Arquivos alterados:
  - `src/features/transactions/ImportButton.tsx`.
  - `src/features/transactions/__tests__/reconciliationRouting.test.ts`.

Entrega:

- Adicionado helper local `buildReconciliationHistoryDelta`.
- `processResolvedImportBatch` passou a receber/usar `existingTransactions` para comparar "before" em memória com o payload final conciliado.
- `changedFields` é calculado com `Object.is`.
- Campos auditados:
  - `category`.
  - `description`.
  - `date`.
  - `type`.
  - `source`.
  - `value_cents`.
  - `fitId`.
- `before`/`after` parciais contêm apenas campos realmente alterados.
- Exclui `id`, `uid`, `importHash`, `value` legado.
- Preserva `action: 'UPDATE'`.
- Preserva `origin: 'reconcile'`.
- Reconciliadas continuam por `FirestoreService.updateTransaction`.
- Novas continuam por `onImportTransactions`.

Teste:

- `reconciliationRouting.test.ts` agora cobre auditoria de conciliação com campos alterados, before/after esperados, `origin=reconcile` e ausência de campos proibidos.

Escopo preservado:

- Não alterou `ReconciliationEngine`.
- Não alterou `TransactionHistoryDrawer`.
- Não alterou `AuditService`.
- Não alterou `FirestoreService`.
- Não alterou `LedgerService`.
- Não alterou schemas.
- Não alterou Firestore rules.
- Não alterou `importHash`.
- Não alterou parser/package files.

Validações:

- `npm run typecheck`: passou.
- `npm run lint`: passou.
- `npm run test -- --run`: passou com 22 arquivos / 196 testes.
- `npm run build`: passou.

### QA Checkpoint da FASE 4A-4D

- Veredito: **APROVADO**.
- Branch: `main`.
- Working tree: clean.
- Topo: `88ba74d fix(reconciliation): audit all changed fields on reconcile (#56)`.

Validações:

- `npm run typecheck`: OK.
- `npm run lint`: OK.
- `npm run test -- --run`: OK, 22 arquivos / 196 testes.
- `npm run build`: OK.

Checklist:

- 4A OK: candidato visível antes do clique; mesmo `mergeCandidate` usado no `handleMerge`; critérios data até 3 dias e valor até 1% preservados.
- 4B OK: `findMergeCandidate` testado com cobertura de null/data/valor/match/primeiro válido/labels/reasons/value_cents.
- 4C OK: `UPDATE + origin=reconcile` aparece como `Conciliada`; origem visual como `Conciliação`; `UPDATE` comum segue `Atualizada`; action persistida segue `UPDATE`.
- 4D OK: reconciliadas continuam por `updateTransaction`; novas por `onImportTransactions`; histórico preserva `action=UPDATE` e `origin=reconcile`; delta cobre campos relevantes e exclui `id`, `uid`, `importHash`, `value`.
- Integridade financeira OK: `value_cents` canônico, sem nova soma float, `LedgerService`, `importHash`, parser, rules e schemas intactos.

Achados:

- P0: nenhum.
- P1: nenhum.
- P2: nenhum.
- P3: nenhum defeito funcional identificado.

### Riscos e Lacunas Ainda Abertas

- Delta detalhado depende de `existingTransactions` conter a transação conciliada no momento do commit do import.
- Sem "before" confiável, histórico registra conciliação mas pode ficar sem delta detalhado.
- Semântica persistida continua sendo `action=UPDATE + origin=reconcile`.
- Ainda não há status persistente de conciliação no Firestore.
- Match ainda seleciona o primeiro candidato válido, não o melhor global.
- Descrição ainda não participa do critério de match.
- Sem filtros de conciliadas/não conciliadas no `TransactionsManager`.
- Sem teste `.test.tsx`/E2E do fluxo visual completo de conciliação.

### Próxima Fase Recomendada

**FASE 4E — status persistente de conciliação**.

- Deve começar com investigação read-only.
- Pode envolver `transaction.ts`, schemas e `firestore.rules`.
- Não alterar `LedgerService`.
- Não alterar `importHash`.
- Não alterar parser.
- Não alterar rota de persistência sem análise.
- Avaliar se o status persistente deve incluir:
  - `reconciliationStatus`.
  - `reconciledAt`.
  - `reconciledBy`.
  - `matchedTransactionId`.
  - `reconciliationSource`.
  - `confidenceScore`.
- Não implementar tudo de uma vez sem plano.

> As seções históricas abaixo foram preservadas para manter contexto. Em caso de divergência, o estado consolidado de encerramento da FASE 4 no topo deste arquivo é a referência mais recente.

## Estado Consolidado — FASE 4 Conciliação Avançada — após PRs #52 e #53

### Estado Atual

- Branch principal: `main`.
- Topo da main: `2172796 test(reconciliation): cover merge candidate matching logic (#53)`.
- Working tree confirmado limpo.
- Nenhum PR aberto no encerramento das FASES 4A e 4B.

### FASE 4A — Explicabilidade visual da conciliação — PR #52

- Commit: `34d378d feat(reconciliation): explain merge candidate matches (#52)`.
- Arquivo alterado: `src/features/transactions/ReconciliationEngine.tsx`.

Entrega:

- `findMergeCandidate` passou a retornar informações explicáveis do candidato.
- O card de conciliação agora mostra a transação existente candidata antes do clique em "Conciliar".
- Exibe descrição, data, valor, confiança e razões do match.
- Confiança visual: `Exato`, `Alto`, `Médio`.
- Razões: valor exato/compatível e data igual/próxima.
- O candidato exibido é o mesmo usado no clique de conciliação.

Escopo preservado:

- Não alterou `ImportButton`.
- Não alterou persistência.
- Não alterou `LedgerService`.
- Não alterou `importHash`.
- Não alterou schemas.
- Não alterou Firestore rules.
- Não alterou parser/useParserWorker.
- Não alterou package files.

Risco residual:

- A lógica ainda escolhe o primeiro candidato válido, não necessariamente o melhor candidato global.
- A confiança visual deverá ser revista se thresholds mudarem.

### FASE 4B — Testes unitários da lógica de match — PR #53

- Commit: `2172796 test(reconciliation): cover merge candidate matching logic (#53)`.
- Arquivos:
  - `src/features/transactions/ReconciliationEngine.tsx`.
  - `src/features/transactions/__tests__/reconciliationMatch.test.ts`.

Entrega:

- Exporta `findMergeCandidate`.
- Exporta `MergeCandidateInfo`.
- Adiciona teste unitário da função pura de match.
- Testes cobrem:
  - retorno `null` sem existentes;
  - data acima de 3 dias;
  - valor acima de 1%;
  - match dentro de 3 dias/1%;
  - primeiro candidato válido na ordem do array;
  - `confidenceLabel` `Exato`, `Alto`, `Médio`;
  - reasons de valor exato/compatível;
  - reasons de data igual/próxima;
  - uso canônico de `value_cents`;
  - independência de descrição no critério atual.

Validação:

- `npm run typecheck`: passou.
- `npm run lint`: passou.
- `npm run test -- --run`: passou com 22 arquivos / 195 testes.
- `npm run build`: passou.

Observação:

- PR #53 teve falha de Firebase Hosting Preview por cota de canais (`channel quota reached`), mas CI principal de Typecheck/Lint/Test/Build passou. O merge foi autorizado por falha de infraestrutura, não de código.

### Estado Atual dos Testes

- Antes da FASE 4B: 21 arquivos / 183 testes.
- Depois da FASE 4B: 22 arquivos / 195 testes.

### Próxima Fase Recomendada

**FASE 4C — label específico de conciliação no histórico**.

- Deve começar com investigação read-only.
- Não alterar schema/rules inicialmente.
- Não alterar `LedgerService`.
- Não alterar `importHash`.
- Preferir solução incremental e auditável.

### Riscos e Lacunas Ainda Abertas

- Match ainda seleciona o primeiro candidato válido, não o melhor global.
- Descrição ainda não participa do critério de match.
- Não há status persistente de conciliação no Firestore.
- Histórico ainda pode exibir reconciliação como `UPDATE`/"Atualizada", sem label semântico específico.
- Sem filtros de conciliadas/não conciliadas no `TransactionsManager`.
- Sem teste `.test.tsx`/E2E do fluxo visual completo de conciliação.

> Registro histórico de 4A/4B preservado para contexto. Em caso de divergência, o estado consolidado de encerramento da FASE 4 no topo deste arquivo é a referência mais recente.

## Estado Consolidado — Pós FASE 3 Importação Avançada — 2026-05-04

- Branch principal: `main`.
- Topo da main: `aad22df feat(import): add Brazilian bank mapping templates (#50)`.
- Working tree esperado: limpo; QA final confirmou working tree pós-build limpo.
- Nenhum PR aberto no encerramento da Fase 3.
- **FASE 3 — Importação Avançada**: concluída.
- **QA Final da Fase 3**: aprovado.

### PRs Consolidados da Fase 3

- **#43 — feat(import): add detailed import report**: expandiu `ImportButton.tsx` com relatório final de importação, incluindo arquivo/origem, período, lidas, novas, ignoradas, importáveis, reconciliadas, inválidas, entradas, saídas e saldo. Os totais operam sobre `value_cents`.
- **#44 — feat(import): improve local deduplication fingerprint**: fortaleceu a fingerprint local usada na deduplicação da importação, reduzindo falsos negativos entre registros do arquivo e transações já carregadas sem alterar `importHash`.
- **#45 — feat(import): add cross-page candidate search helper**: criou `src/features/transactions/importCandidateSearch.ts` com busca read-only em `users/{uid}/transactions`, filtrada por período, ordenada por data, limitada por teto seguro e com fallback para `[]` em entradas inválidas ou erro.
- **#47 — feat(import): integrate cross-page candidate search**: integrou o helper ao fluxo do `ImportButton.tsx` em background, com timeout/fallback, status discreto no preview e marcação de duplicatas prováveis no histórico sem bloquear a importação.
- **#48 — feat(import): add accessible PDF password flow**: substituiu o fluxo baseado em prompt por estado `password_required` e painel acessível para senha de PDF, com label, foco, erro de senha, cancelamento e submissão explícita.
- **#49 — feat(import): show custom categories in preview**: conectou categorias do usuário ao preview da importação e passou a exibir opções padrão e personalizadas no seletor de categoria antes de confirmar a importação.
- **#50 — feat(import): add Brazilian bank mapping templates**: adicionou templates e aliases para bancos/formatos brasileiros no mapeamento CSV (`Nubank`, `Inter`, `Itaú`, `Bradesco`, `Banco do Brasil`, `Caixa`, `Santander`, `C6`, `Mercado Pago`, `PicPay` e `Genérico CSV BR`), além de sugestão automática consolidada.

### Validações Finais da Fase 3

- `npm run typecheck`: passou.
- `npm run lint`: passou.
- `npm run test -- --run`: passou, 21 arquivos / 183 testes.
- `npm run build`: passou.
- Working tree pós-build: limpo.
- Achados bloqueantes: P0 nenhum, P1 nenhum, P2 nenhum, P3 bloqueante nenhum.

### Integridade Financeira Preservada

- `value_cents` continua sendo a fonte canônica.
- Somas da importação e do preview operam em centavos inteiros.
- `LedgerService` preservado.
- `importHash` preservado.
- Transações reconciliadas continuam indo por `updateTransaction`, não por importação duplicada.

### Riscos Residuais Pós-Fase 3

- Templates CSV dependem dos headers exportados pelos bancos.
- CSVs com débito/crédito separados ainda exigem revisão manual.
- QA manual visual em navegador não foi executado.
- Ainda não há cobertura `.test.tsx`/E2E para UI de importação.

### Próxima Fase Recomendada

**FASE 4 — Conciliação Avançada**.

Regra obrigatória: antes da Fase 4, iniciar com investigação read-only, plano técnico curto e aprovação explícita antes de qualquer implementação.

> As seções históricas abaixo foram preservadas para manter contexto. Em caso de divergência, o estado consolidado de 2026-05-04 acima é a referência mais recente.

## Estado Consolidado — 2026-05-03

- Branch principal: main
- Último commit consolidado conhecido: `d215c1d feat(import): add cross-page candidate search helper (#45)` — confirmado via `git log --oneline -1 main`.
- Working tree esperado: limpo.
- Repositório: welitonsp/quantum-finance
- Caminho local: `C:\quantum-finance`
- Stack principal: React 19, TypeScript, Vite, Tailwind, Firebase/Firestore, Framer Motion, Chart.js, pdfjs-dist.

## PRs Recentes Consolidados

- **#41** — fix(a11y): resolve residual P3 accessibility issues (múltiplos arquivos do módulo Movimentações).
- **#42** — feat(ux): optimize transaction groups and persistent summary (`TransactionsManager.tsx`).
- **#43** — feat(import): add detailed import report (`ImportButton.tsx`).
- **#44** — feat(import): improve local deduplication fingerprint (`ImportButton.tsx`).
- **#45** — feat(import): add cross-page candidate search helper (`importCandidateSearch.ts`).
- **#47** — feat(import): integrate cross-page candidate search (`ImportButton.tsx`).
- **#48** — feat(import): add accessible PDF password flow (`ImportButton.tsx`).
- **#49** — feat(import): show custom categories in preview (`ImportButton.tsx`).
- **#50** — feat(import): add Brazilian bank mapping templates (`ImportButton.tsx`).

Histórico mais antigo (#17–#40) cobriu: hotfixes P0/P1 financeiros, rodada completa de acessibilidade WCAG 2.1 AA (UX-1A a UX-1G), e série de filtros UX-2A a UX-2H.

## Estado do Módulo Movimentações

- Série UX-2 concluída até UX-2H.
- Resíduos P3 de acessibilidade resolvidos no PR #41.
- Quatro modais principais auditados e acessíveis:
  - `TransactionHistoryDrawer`
  - `AuditTimeline`
  - Modal de importação (`ImportButton`)
  - `ReconciliationEngine`
- Todos com `role="dialog"`, `aria-modal="true"`, `aria-label`/`aria-labelledby`, focus trap manual, fechamento por Escape e retorno de foco ao trigger.
- Sem QA-FINAL formal executado até a data deste registro. Validação até o momento é contínua via PRs com typecheck/lint/test/build verdes em CI.

## Otimizações de Performance Já Aplicadas

- PR #42 entregou otimização de grupos e summary persistente em `TransactionsManager.tsx`.
- Virtualização real da lista (react-virtual / @tanstack/react-virtual) ainda **NÃO** implementada.
- Running balance (saldo acumulado por linha) ainda **NÃO** implementado.

## FASE 3 — Importação Avançada

> Registro histórico do checkpoint intermediário de 2026-05-03. A Fase 3 foi concluída e aprovada em QA final em 2026-05-04; ver seção consolidada no topo deste arquivo.

### Itens entregues

- **PR #43**: relatório detalhado de importação em `ImportButton.tsx`.
- **PR #44**: fingerprint local robusta de deduplicação em `ImportButton.tsx`.
- **PR #45**: helper read-only criado em `src/features/transactions/importCandidateSearch.ts`.

### Assinatura real do helper (confirmada no código)

```ts
export type FindImportCandidateTransactionsParams = {
  uid: string;
  periodStart: string;
  periodEnd: string;
  maxCandidates?: number;
};

export async function findImportCandidateTransactions({
  uid,
  periodStart,
  periodEnd,
  maxCandidates,
}: FindImportCandidateTransactionsParams): Promise<Transaction[]>
```

### Características do helper

- Consulta apenas `users/{uid}/transactions`.
- Não usa `collectionGroup`.
- Não usa coleção global.
- Valida `uid.trim()`, formato ISO de datas e `periodStart <= periodEnd` antes de consultar — retorna `[]` em entrada inválida.
- Filtra por `date >= periodStart` e `date <= periodEnd`.
- Usa `orderBy('date', 'asc')`.
- Usa `limit(maxCandidates)`.
- `maxCandidates` padrão 300, teto 500.
- Em erro, retorna `[]` com `console.warn`.
- Filtra documentos com `isDeleted === true` ou `deletedAt` presente.
- Ainda **NÃO** está integrado no `ImportButton`.

### Itens pendentes da Fase 3 (não iniciados)

- Modal de senha PDF substituindo `window.prompt()` (P2-2).
- Categorias personalizadas na PreviewPanel da importação.
- Suporte a múltiplos arquivos em um único fluxo.
- Parser de QR Code Pix / nota fiscal eletrônica.
- Templates de mapeamento por banco (Nubank, Bradesco, Itaú).

> Atualização 2026-05-04: integração cross-page (#47), senha PDF acessível (#48), categorias personalizadas no preview (#49) e templates brasileiros (#50) foram concluídos e aprovados. Suporte a múltiplos arquivos e parser de QR Code Pix/nota fiscal eletrônica não fazem parte do estado aprovado da Fase 3; reavaliar somente se forem repriorizados.

## Próxima Microfase Planejada

**FASE 4 — Conciliação Avançada**.

Regra de entrada: iniciar com investigação read-only, sem alterações em código funcional, para mapear o estado atual de `Transaction`, `ReconciliationEngine`, `ImportButton`, `useTransactions`, `LedgerService` e regras Firestore antes de propor implementação.

Escopo recomendado para investigação inicial:

- contrato de status de conciliação em `Transaction`;
- motor automático de conciliação;
- ciclo mensal de conciliação;
- bloqueio/lock de transações reconciliadas;
- impactos em auditoria, importação e atualização via `updateTransaction`.

Histórico: a antiga microfase **FASE 3C-1B** foi concluída pelo PR #47.

## Fases Futuras Não Iniciadas

- **Fase 4 — Conciliação Avançada** — campo `status` no Transaction, motor automático, ciclo mensal, lock de conciliados.
- **Fase 5** — Auditoria Forte (paginação do `AuditTimeline`, exportação de relatório, alertas de anomalia).
- **Fase 6** — IA e Automações (regras persistidas, detecção de recorrência, alertas proativos, RAG financeiro).
- **Fase 7** — Prontidão para Produção (Firebase App Check, índices Firestore documentados, Sentry, E2E Playwright, mover chave Gemini para backend).

## Regras Técnicas Permanentes

Estas regras são invioláveis. Qualquer agente que trabalhe no projeto deve respeitá-las:

- `value_cents` é a fonte canônica de valor. `value` é legado/display.
- Cálculos financeiros **NUNCA** podem usar float; sempre operar em centavos inteiros.
- Dados sensíveis ficam exclusivamente sob `users/{uid}/...` no Firestore.
- `importHash` não deve ser alterado sem decisão explícita do owner do projeto.
- `LedgerService` não deve ser alterado sem justificativa técnica forte.
- Transações reconciliadas usam `updateTransaction` (caminho Firestore original), nunca `importTransactions` (que cria documento novo).
- Não instalar dependências sem autorização.
- Não alterar `package.json` ou `package-lock.json` sem autorização.
- Toda fase usa branch própria.
- Antes de implementação crítica: investigação read-only, plano técnico curto e aprovação explícita.

## Pendências Conhecidas

- `src/components/DashboardContent.tsx:106` contém comentário `// FIX P0.2: usar valores reais de moduleBalances (PR 1 conectou via useFinancialData)`. Pendência fora do Módulo Movimentações; deve ser investigada em fase própria.
- Prop `hasUndoSnapshot` recebida pelo `TransactionsManager` mas não consumida internamente. Risco baixo, documentado.
- Projeto possui 21 arquivos `.test.ts` e 0 `.test.tsx`. Lacuna futura em testes de componente React/UI.

## Comandos de Validação Padrão

```bash
npm run typecheck
npm run lint
npm run test -- --run
npm run build
```

Estes quatro comandos devem passar antes de qualquer commit/PR.

## Convenções de Commit

- `feat(escopo): descrição` — para novas features.
- `fix(escopo): descrição` — para correções.
- `chore(escopo): descrição` — para manutenção/infra.
- Escopos comuns: `ux`, `a11y`, `transactions`, `import`, `audit`, `reconciliation`.

## Referência Rápida de Arquivos Críticos

| Arquivo | Tamanho | Responsabilidade |
|---|---|---|
| `src/features/transactions/TransactionsManager.tsx` | 1481 linhas | Listagem, filtros, ordenação, agrupamento, ações em lote |
| `src/features/transactions/ImportButton.tsx` | 456 linhas | Fluxo de importação CSV/OFX/PDF (refatorado pós-PR #137+) |
| `src/features/transactions/ReconciliationEngine.tsx` | 554 linhas | Modal de reconciliação interativa |
| `src/components/TransactionHistoryDrawer.tsx` | 334 linhas | Drawer de histórico por transação |
| `src/components/AuditTimeline.tsx` | 219 linhas | Drawer de timeline global de auditoria |
| `src/hooks/useTransactions.ts` | 1131 linhas | Hook central de CRUD/paginação/import/sync-queue |
| `src/hooks/useTransactionsPagination.ts` | — | Paginação extraída de useTransactions (PR #157) |
| `src/hooks/useTransactionHistory.ts` | 218 linhas | Hook de histórico por transação |
| `src/hooks/useAuditLogs.ts` | 261 linhas | Hook de logs globais |
| `src/hooks/useRunningBalance.ts` | — | Saldo acumulado por linha com overflow guard (PR #154) |
| `src/shared/services/FirestoreService.ts` | 886 linhas | Helpers de escrita atômica (Modelo A) |
| `firestore.rules` | 1019 linhas | Regras de segurança com schema versionado v2 |
| `functions/index.js` | 461 linhas | 4 Cloud Functions (createTransaction + 3 IA) |

## Collections Firestore com Regras Explícitas (2026-06-13)

Todas sob `/users/{userId}/`:

| Subcoleção | Responsabilidade |
|---|---|
| `transactions/{txId}` | Transações financeiras (fonte canônica: `value_cents`) |
| `transactions/{txId}/history/{historyId}` | History append-only por transação (Modelo A) |
| `accounts/{accountId}` | Contas bancárias e carteiras |
| `audit_logs/{logId}` | Logs de auditoria globais |
| `system_logs/{logId}` | Logs de sistema sanitizados |
| `usage/ai_calls` | Contador de chamadas de IA |
| `budgets/{budgetId}` | Orçamentos por categoria |
| `categoryRules/{ruleId}` | Regras automáticas de categorização |
| `categories/{categoryId}` | Categorias personalizadas |
| `creditCards/{cardId}` | Cartões de crédito (limite, closingDay, vencimento) |
| `recurringTasks/{taskId}` | Tarefas recorrentes |
| `recurring/{taskId}` | Recorrentes (alias) |
| `simulations/{simId}` | Simulações Monte Carlo |
| `debts/{debtId}` | Dívidas com juros e parcelamento (FASE 4) |
| `goals/{goalId}` | Metas de poupança (FASE 5) |
| `scoreHistory/{monthId}` | Score histórico mensal |
| `challenges/{challengeId}` | Desafios de economia (gamification) |
| `idempotency/{keyId}` | Chaves de idempotência (write exclusivo do Admin SDK — deny clients) |
| `consents/{consentId}` | Consentimentos LGPD |
| `dataProcessingLog/{logId}` | Log de processamento de dados (LGPD — server-only) |
| `shoppingLists/{listId}` | Listas de compras com itens embutidos (FASE 9) |
| `priceObservations/{obsId}` | Histórico de preços por produto/loja — append-mostly, update bloqueado (FASE 9) |
| `fcmTokens/{tokenId}` | Tokens FCM para push notifications — owner escreve/deleta, leitura exclusiva Admin SDK (FASE 24) |
| `/{document=**}` | Deny-all catch-all |
