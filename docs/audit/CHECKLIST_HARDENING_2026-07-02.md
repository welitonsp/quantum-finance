# Checklist de Hardening — Quantum Finance (Auditoria Tripla 2026-07-02)

> Consolidação das 3 auditorias (Claude independente + Codex + Gemini). Fonte de verdade única do backlog pós-auditoria. Marcar `[x]` ao concluir. Ordem = prioridade de execução.
> Relatórios-fonte: `AUDITORIA_CODEX_2026-07-02.md`, `AUDITORIA_GEMINI_2026-07-02.md`.

## Legenda
- **P0** = bloqueador (deploy/segurança/saldo). **P1** = crítico antes de comercializar. **P2** = melhoria importante. **P3** = refinamento.
- Status: ⬜ pendente · 🔄 em andamento · ✅ concluído · ❌ falso positivo (não fazer).

---

## ✅ PR 1 — P0 — Consertar deploy da `main` — CONCLUÍDO (#328)
- [x] Removido bloco `recurringTasks.active` de `firestore.indexes.json:51-57`.
- [x] Deploy restaurado; CI verde.
- **Merge:** `d612b39`

## ✅ PR 2 — P1 — Alinhar `competencia` (parcelas quebradas) — CONCLUÍDO (#329)
- [x] `'competencia'` adicionado a `txAllowedKeys()` em `firestore.rules`.
- [x] `competencia` removido do `afterSnapshot` em `installmentRepo.ts:88` (expression limit).
- [x] 3 testes de emulator adicionados (describe R): allow, opcional, campo proibido.
- **Nota:** path completo de installment já estava na borda do limite de 1000 expressões do avaliador Firestore — migração para Cloud Function registrada como P2.
- **Merge:** `b8b8a61`

## ✅ PR 3 — P1 — Blindar `groups/{groupId}/expenses` — CONCLUÍDO (#330)
- [x] `isValidExpenseUpdate()`: todos os campos exceto `shares`/`updatedAt` imutáveis; `updatedAt == request.time`.
- [x] `isExpensePayerOrGroupOwner()`: delete restrito a `payerUid` ou `ownerUid` do grupo.
- [x] 6 testes de emulator (describe S): tamper deny × 3, delete allow/deny × 2, update válido allow.
- **Merge:** `ec7f03d`

## ✅ PR 4 — P1 — Vulnerabilidades de `functions` + gate no CI — CONCLUÍDO (#331)
- [x] `overrides: { "form-data": ">=2.5.6" }` em `functions/package.json`; resolvido para `4.0.6`.
- [x] Step `Functions Security Audit (deny high+)` adicionado ao `ci.yml`.
- [x] `npm audit --audit-level=high` → 0 high, exit 0.
- **Merge:** `0072715`

---

## 🟡 P2 — Melhorias importantes (pós-bloqueadores)
- [x] **Logs server-trusted:** `system_logs` (chamadas de IA) migrado 100% para Admin SDK — removida a escrita client-side redundante em `AICategorizationService.ts` (o callable `categorizeTransactionsBatch` já loga server-side via `writeStructuredLog`); Rules negam `create` client-side (**PR #336**). `audit_logs` de `BULK_UPDATE`/`UNDO_BULK_UPDATE` migrado para a nova callable `logAuditEvent` (Admin SDK) + `AuditService.logTransactionAudit` (**PR #337**). **Mantido client-side, por decisão:** `ADD/UPDATE/DELETE_RECURRING` (P3 controlado vigente) e `IMPORT_TRANSACTION` (acoplado à `runTransaction` atômica do Modelo A em `LedgerService.ts`). Ver `docs/DECISOES-ARQUITETURA.md#logs-server-trusted--system_logs-e-audit_logs-de-transação-p2-hardening-2026-07-02`.
- [x] **Cobertura de PII:** melhorar `piiMasker.ts` (nomes soltos sem prefixo PIX) + testes adversariais. **PR #333** — EVP, telefone fixo, pagamento+nome Title Case; 6 novos testes.
- [x] **Recorrentes:** aposentar `useRecurringAutoExecute` client-side. **PR #332** — hook + 31 testes removidos; backend `executeScheduledRecurrents` cobre.
- [x] **UX agente:** ao detectar `installments>1`, pré-preencher o formulário de parcelamento. **PR #334** — `onRegisterPurchase` em `AIAssistantChat` + wiring em `App.tsx`.
- [x] **Rules complexas (1490 linhas):** avaliação feita — o grosso da complexidade (`transactions`/`accounts`/`recurringTasks` com history atômico do Modelo A) é zona proibida e Spark-dependente; migração ampla não é justificável. Fechado com um quick win pontual: `priceObservations` migrado para a callable `recordPriceObservation` (Admin SDK) — Rules negam `create` client-side, `isValidPriceObservationCreate`/`isValidShoppingUnit` removidas (órfãs). `shoppingLists`/`debts` seguem candidatas para uma rodada futura, se necessário.
- [x] **Bundle:** gate `scripts/check-bundle-size.mjs` no CI pós-build (500 KB global, 600 KB para workers/firebase). **PR #335**
- [ ] **Listeners:** avaliar BFF/agregação para reduzir múltiplos `onSnapshot` no first paint.

## 🟢 P3 — Refinamentos
- [x] CSP estrito no `firebase.json`. **PR #335** — img-src, object-src none, worker-src, frame-src corrigidos.
- [x] Copy de erro sem mencionar `.env`/termos internos. **PR #332** — AIAssistantChat.tsx.
- [x] Padronizar PT-BR vs PT-PT ("ficheiro"). **PR #332** — 7 arquivos de parser/import.
- [x] Skeleton loaders premium + empty states de Recharts: `DashboardCharts.tsx`, `TrendsChart.tsx`, `ForecastWidget.tsx`, `ReportsDashboard.tsx`, `ReportsContent.tsx` (5 arquivos) migrados para os primitivos compartilhados `EmptyState`/`Skeleton`. **PR #338**. **Achado:** `CategoryPieChart.tsx` e `TimelineWidget.tsx`/`SimulationCenter.tsx` não precisavam de mudança — o primeiro está morto (não importado em lugar nenhum do app) e os outros dois já não têm estado vazio alcançável (timeline sempre projeta 90 dias; simulação já mostra loader).
- [x] Coverage/perf como gates de CI. **PR #335** — statements 60, lines 64 (catraca apertada).
- [ ] Migração de floats legados (script read-only existe; migração ainda bloqueada por decisão).
- [ ] UI premium: glassmorphism, tipografia variável, animações de valores no dashboard.
- [ ] Onboarding/wizard de primeira experiência.

---

## ❌ Falsos positivos (NÃO implementar — refutados por leitura de código)
- ❌ **Gemini SEC-001 "bypass de `status:confirmed` = P0":** callable é Auth + App Check escopada ao próprio `uid`; forjar status só afeta o próprio ledger (self-forgery), sem escalonamento. Human-in-the-loop protege contra o LLM, não contra o usuário. Propostas assinadas server-side = defesa em profundidade opcional (P3), não bloqueador.
- ❌ **Gemini SEC-002 "PII crua vai ao LLM":** falso. `maskPII` + `buildSafePromptRows` mascaram CPF/CNPJ/email/PIX/telefone antes de enviar. (Melhoria de cobertura vira P2 acima.)
- ❌ **Gemini ARCH-001 "recorrentes só client-side":** desatualizado. `executeScheduledRecurrents` (onSchedule diária) já existe em `functions/src/index.ts:1449`.

---

## Estado da suíte (atualizado 2026-07-02 — após PRs #332–#335)
- Unit: **~1358 passed** (31 testes do hook aposentado removidos; +6 PII) · typecheck/lint/build verdes.
- ⚠️ Verde no CI NÃO cobre a regressão de `competencia` (installmentRepo usa Firestore mockado; sem teste de emulator). Corrigir na PR 2.

## Regras de processo (não perder o fio)
- PR pequeno (≤5 arquivos). Auditoria independente antes do merge. Squash. Atualizar `main` local. `git status` limpo.
- Zona proibida (Rules/Functions/package-lock/Decimal.js/Zod strict/history) exige ampliar cobertura de emulator junto.
- Atualizar este checklist a cada PR mergeado.
