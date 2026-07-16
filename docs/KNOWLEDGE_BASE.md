# Quantum Finance — Base de Conhecimento Consolidada

> **Documento único de referência** para qualquer IA ou estação de trabalho nova.
> Leia este arquivo + `CLAUDE.md` (contexto de IA) para ter o quadro completo do projeto.
> Última atualização: **2026-07-16** · Mantenedor: owner do projeto.
>
> Documentos separados que complementam este: [`PENDENCIAS.md`](./PENDENCIAS.md) (fonte única de pendências)
> · [`DECISOES-ARQUITETURA.md`](./DECISOES-ARQUITETURA.md) (decisões detalhadas com histórico)
> · [`audit/`](./audit/) (laudos datados Big Four + Externa)

---

## 1. Estado Atual do Projeto

**Data de referência:** 2026-07-16

| Item | Estado |
|------|--------|
| Branch principal | `main` — limpo |
| Suíte de testes | **2034 unit** + 227 rules + 303 functions + 28 E2E |
| Gates de cobertura | stmts 77 / branches 68 / funcs 79 / lines 80 |
| Auditoria Big Four | **8.7/10** — `docs/audit/AUDITORIA_BIG_FOUR_2026-07-09.md` |
| Auditoria Externa | 6,2/10 pré → **13 fechados · 1 parcial (F-09) · 1 aberto (F-15)** |
| Pendências de código | **ZERO** — apenas infra/owner restam |
| Tese Extraordinária | **5/5 fases entregues** ✅ |
| Onda Big Tech Premium | **4 features entregues** (itens 17–20 do PENDENCIAS) |

### O que está pendente (resumo — detalhe em `PENDENCIAS.md`)

| # | Item | Tipo |
|---|------|------|
| M-03 | MFA TOTP + FCM push + NFC-e em dispositivo real | owner/dispositivo |
| F-09 | Billing alerts, quotas, paginação (GCP console) | infra/owner |
| F-15 | SLOs, métricas estruturadas e alertas de scheduled functions | infra |
| L-05 | APM/tracing distribuído (Web-Vitals RUM + budgets por rota) | infra/futuro |

---

## 2. Histórico de Fases Entregues

### Tese Extraordinária (5/5)

| Fase | Feature | Commit/PR |
|------|---------|-----------|
| 1 | Radar de Compras | PR #363 |
| 2 | Ação de 1 Toque — `OneTouchActionsCard` | `83deafc` |
| 3 | Gêmeo Financeiro — Monte Carlo com DNA real | `c5176d7` |
| 4 | Selo de Integridade — 4 pilares + Diário de Decisões IA | `acbdc54` |
| 5 | Copiloto que Cumpre — `AIJournalDrawer` + track record | `b6bee7b` |

### Ciclos anteriores relevantes

| Fase | O que entregou |
|------|---------------|
| F-01 | `assertAiConsent` fail-closed + UI mirror (`AiConsentGate`) |
| F-02 | Grupos server-trusted (`createGroupExpense`/`settleGroupExpenseShare`) |
| F-03 | Convite atômico single-use (`acceptGroupInvite`) |
| F-06 | Step-up auth `auth_time ≤ 5min` no `deleteUserData` |
| F-07 | Recorrentes catch-up idempotente com clamp de fim de mês |
| F-08 | `firebase-tools@15.23.0` fixado + Actions pinadas por SHA |
| F-11 | Offline: `persistentLocalCache` + outbox IndexedDB |
| F-12 | A11y: 65→0 warnings + sidebar 20→7 + TopTabs ARIA + ⌘K |
| F-13 | Cobertura risk-based: 116 novos testes em 4 fatias |
| M-01 | Cobertura 0%: `useSpendingPower`/`useCategoryRules`/`useImportActions` (+21 testes) |
| M-02 | `eslint-plugin-jsx-a11y` + gate CI (fechado junto com F-12) |

### Onda Big Tech Premium (2026-07-16)

| # | Feature | Arquivo | Commit |
|---|---------|---------|--------|
| 15 | Dashboard "Posso gastar hoje?" | `SpendingPowerBadge` + `useSpendingPower` | `2aed47e` |
| 16 | Voice Capture | `useSpeechRecognition` + botão Mic no AIChat | `5a184bd` |
| 17 | Briefing Diário | `DailyBriefingCard` (top 3 insights via insightsEngine) | `8e54b2a` |
| 18 | Próximos 7 Dias | `UpcomingEventsStrip` (recorrentes + faturas) | `8c128fd` |
| 19 | Score Hero 2.0 | `ScoreHeroCard` (ring SVG + trend + hint) | `e7e2f36` |
| 20 | Patrimônio Hero | `PatrimonioHeroCard` (líquido + ativos/passivos/reserva) | `e7e2f36` |
| — | CrisisModeCard + CTAs Briefing + taxa diária | `CrisisModeCard`, `SpendingPowerBadge` daily rate | `04aed3a` |
| — | Header "Hoje" | `Header.tsx` PAGE_TITLES dashboard | `04aed3a` |

---

## 3. Contratos Técnicos Inegociáveis

### 3.1 Regra dos Centavos

- `value_cents` é a **única** fonte canônica de dinheiro.
- Funções aprovadas (todas em `src/shared/types/money.ts`):
  `toCentavos`, `fromCentavos`, `addCentavos`, `subtractCentavos`, `absCentavos`, `divideCentavos`, `multiplyCentavos`, `formatBRL`
- **PROIBIDO:** `Math.round(value * 100)`, `parseFloat`, `Number(x)` para dinheiro.
- Aritmética sempre via **Decimal.js**.

### 3.2 Modelo A — UPDATE atômico

Todo `UPDATE` de `transactions/{txId}` exige no **mesmo `writeBatch`**:
- Campo `_lastOpId` no payload
- Documento `history/{_lastOpId}` criado neste mesmo batch
- Firestore Rules validam com `existsAfter(history/{_lastOpId})`

**Matriz action/origin permitida:**

| action | origin |
|--------|--------|
| `UPDATE` | `manual` / `ai` / `reconcile` |
| `SOFT_DELETE` | `manual` |
| `BULK_UPDATE` | `bulk` |
| `UNDO_BULK_UPDATE` | `bulk` |

**Campos proibidos em deltas de history:** `importHash`, `value` legado, `uid`, `id`, `createdAt`.

### 3.3 Divisão de Parcelas (modulo-safe)

```ts
// PROIBIDO: Math.floor(total / n)
// OBRIGATÓRIO:
const remainder = total % n;
const perInstallment = (total - remainder) / n;
const last = perInstallment + remainder;
```

### 3.4 Competência de Cartão

Dois sistemas coexistem — não confundir:
- `computeCompetencia` (`src/shared/lib/competencia.ts`): rotula pelo mês de **fechamento/cobrança**.
- `invoiceCompetenciaForDate` (`cardProjection.ts`) e `paidInvoiceMonth`: rotulam pelo mês de **início** da janela — diferem em **1 mês**.

`effectiveAvailableCents = max(0, limite − (fatura atual + parcelas futuras))`

### 3.5 Correlation ID

Formato: `/^[A-Za-z0-9_-]{16,80}$/`; prefixos `op_`, `bulk_`, `undo_`.
**Persistência:** somente no root do `history/{historyId}`.
**Proibido:** em `history.before`, `history.after`, `audit_logs`, root da transaction, UI.
Geração: `crypto.randomUUID()` ou fallback `crypto.getRandomValues`.

### 3.6 Schemas Zod

Payloads financeiros: `src/shared/schemas/financialSchemas.ts` — todos `.strict()`.
Ações do Agente: `src/shared/schemas/agentSchemas.ts` — `ActionProposal` Zod `.strict()`.
Clientes não controlam `id`, `uid`, `createdAt`, `updatedAt`.

---

## 4. Agente de IA — Contratos de Mutação

### 4.1 Princípio central

> **O LLM nunca grava.** Toda mutação: `ActionProposal` (pending) → confirmação humana → callable `executeAgentAction`.

### 4.2 Fluxo end-to-end

```
Usuário (comando imperativo)
   ↓
[1] intent router / guarda determinística  → ActionProposal (status: 'pending')
[2] ActionConfirmationSheet abre — NADA gravado ainda
[3] Usuário confirma → useAgentAction.runAction() → sela status='confirmed' + idempotencyKey
[4] callable executeAgentAction (App Check ON em prod, OFF só no emulator)
    → revalida status==='confirmed' → grava tx + history (origin: 'ai') + /decisions
[5] onSnapshot → UI reflete
[6] SOMENTE ENTÃO o chat confirma sucesso
```

**Pontos invioláveis:**
- Cancelar é **terminal** (sem escrita).
- Texto de sucesso apenas após callable retornar.
- `installments > 1` recusado com `reason: 'use_installment_form'` (redireciona ao formulário).

### 4.3 Ações suportadas

`register_purchase` (à vista), `register_income`, `contribute_to_goal`, `register_debt_payment`, `create_budget`, `register_transfer`.

### 4.4 Intent router

`geminiIntentClassifier` → `routeIntent` → `ActionConfirmationSheet` → `useAgentAction`.
Atrás de `VITE_ENABLE_AGENT_ROUTER` (ON em produção desde PR #325).
Falha no classificador → chat normal (zero regressão).
LLM atua nas **pontas** (classificar + narrar); o miolo (motor → render) é determinístico.

### 4.5 Guardrails

- LLM **nunca** produz número financeiro final — emite placeholders `{{chave|pipe}}` resolvidos por `agentResponseRenderer`.
- Pipes: `|brl` (centavos → BRL), `|pct`, `|date`, `|mes`.
- Número literal vindo do LLM → resposta bloqueada.
- PII mascarada antes de envio ao LLM (`piiMasker.ts`).
- Chave Gemini **somente no backend** (Secret Manager).

### 4.6 Diário de Decisões (`/decisions`)

Coleção `users/{uid}/decisions/{decisionId}`:
- Campos: `userId`, `createdAt`, `intent`, `question` (mascarada), `snapshotRef`, `toolsUsed`, `simulationResult` (centavos), `proposedAction`, `userDecision`, `outcomeStatus`.
- Create: somente owner. Update: apenas `outcomeStatus`/`userDecision`. Delete: bloqueado (apenas hard-delete LGPD).
- Inclusa em `exportAllUserData` e `deleteUserAccount`.

### 4.7 Query enrichment (PR #326)

Quando router retorna `type: 'answer'`, `buildQueryContext` injeta bloco estruturado (saldo, resumo mensal, cashflow ou cartão) antes do prompt Gemini.

---

## 5. Arquitetura de Camadas

```
┌─ UI (React) ─────────────────────────────────────────────┐
│  components/ · features/**/*.tsx                          │
│  ZERO cálculo financeiro. Renderiza e captura intenção.  │
├─ Aplicação ───────────────────────────────────────────────┤
│  hooks/ · shared/services/ · shared/schemas/ (Zod)        │
│  Orquestra: lê/escreve via infra, valida payloads,        │
│  chama os motores puros. Conhece React e Firebase.        │
├─ Domínio (motores puros) ─────────────────────────────────┤
│  src/lib/*.ts · src/utils/*.ts                            │
│  Funções puras, centavos inteiros. ZERO React/Firebase/I/O│
├─ Infraestrutura ──────────────────────────────────────────┤
│  shared/api/firebase · repos · functions/                 │
│  Persistência, Rules, callables, App Check.               │
└───────────────────────────────────────────────────────────┘
```

**Regra de dependência:** UI → Aplicação → Domínio. `functions/` **não importa** `src/`.

### Motores puros existentes

| Motor | Responsabilidade |
|-------|-----------------|
| `lib/purchaseSimulator.ts` | Decisão de compra (veredito + limite efetivo) |
| `lib/cardProjection.ts` | Fatura/limite efetivo por competência |
| `lib/debtStrategy.ts` | Estratégia de quitação (avalanche/snowball) |
| `lib/cashflowTimeline.ts` | Projeção de fluxo de caixa |
| `lib/insightsEngine.ts` | Insights agregados (computeAnomalies, computeForecast, computeKPIs, computeHealthScore) |
| `lib/recurrenceDetector.ts` | Detecção de recorrências/assinaturas |
| `lib/agentResponseRenderer.ts` | Render de placeholders da resposta do agente |
| `lib/irEngine.ts` · `antiTarifaEngine.ts` · `sharedSplitEngine.ts` | IR · anti-tarifa · split |

---

## 6. Pipeline de Importação — Conceitos Críticos

### Máquina de estados

`idle → parsing → ai_processing → reconciliation → importing → success`
(qualquer etapa pode ir para `error` com retry)

### Idempotência (LedgerService)

Hash SHA-256 determinístico baseado em: `uid`, `date`, `description` (normalizada), `value_cents`, `type`, `source`, `fitId`, `accountId`.
Documento final: `users/{uid}/transactions/{hash}`. **Nunca `addDoc`** (quebraria idempotência).

### Categorização em duas camadas

1. Dicionário local (28 keywords, O(n), zero custo de API)
2. `categorizeTransactionsBatch` callable (Gemini, **1 request por arquivo**)

### Year-crossing em PDFs

```ts
// Transação de dezembro mas fatura de janeiro → ano anterior
if (dParts[1] === '12' && faturaMonth <= 3) ano = faturaYear - 1;
// Transação de janeiro mas fatura de novembro → ano seguinte
if (dParts[1] === '01' && faturaMonth >= 11) ano = faturaYear + 1;
```

`date` sempre reflete a data da compra; `billingPeriod` é artefato interno — nunca persiste.

### Deduplicação em preview

`previewKey = \`${date}-${value_cents}-${desc.slice(0,12)}\`` (apenas para UI; garantia real = hash do LedgerService).

---

## 7. LGPD e Privacidade

**Base legal:** Consentimento (art. 7º, I) + legítimo interesse para segurança.
**Controlador:** titular operador do Quantum Finance (uso pessoal).
**DPO:** a designar antes de operação multiusuário.

### Direitos do titular implementados

| Direito | Implementação |
|---------|--------------|
| Portabilidade | `DataPrivacyService.exportAllUserData()` — 20 subcoleções |
| Eliminação | `deleteUserData` callable → `adminDb.recursiveDelete(users/{uid})` + `auth().deleteUser(uid)` |
| Revogação de consentimento | `consents/` + `DataPrivacyPanel` |

### Dados sensíveis (P0)

Extratos, faturas, PDFs, CSVs, OFX, QR Code, prompts/respostas de IA.
**Nunca logar:** CPF, conta, cartão, e-mail, token, `uid`, `importHash`, `before`/`after` completo, valores/descrições financeiras.

### Política de retenção

- Transações: soft-delete para usuário; hard-delete apenas via `deleteUserData` (Admin SDK).
- `history`, `audit_logs`, `system_logs`: append-only, cliente não deleta.
- `usage/ai_calls`: TTL ou reset futuro.
- Total account deletion: deve usar Admin SDK + dry-run + backup + export LGPD + subcoleções explícitas.

### Subcoleções incluídas no export/delete

`transactions` + `history`, `accounts` + `history`, `recurringTasks` + `history`, `audit_logs`, `system_logs`, `usage/ai_calls`, `budgets`, `categoryRules`, `categories`, `creditCards`, `simulations`, `debts`, `goals`, `scoreHistory`, `challenges`, `idempotency`, `consents`, `dataProcessingLog`, `shoppingLists`, `priceObservations`, `fcmTokens`, `decisions`; coleção global `groups/{groupId}` (participação/ownership).

---

## 8. Segurança

### Hardening ativo

- `assertAiConsent` fail-closed nas 3 callables de IA.
- Step-up `auth_time ≤ 5min` no `deleteUserData`.
- Rate limit por uid nas callables de escrita.
- MFA TOTP ativo em produção.
- `maxInstances: 20` em todas as callables.
- App Check enforce/consume em produção; OFF só no Functions Emulator para E2E.
- Actions pinadas por SHA + `firebase-tools@15.23.0`.
- CSP de nível bancário: `script-src` sem `unsafe-inline`, `frame-ancestors 'none'`, `upgrade-insecure-requests`.

### Segredos

**Proibido no frontend:** chave Gemini, chave Admin, `VITE_*` de IA.
**Correto:** `firebase functions:secrets:set GEMINI_API_KEY`.
`security.yml` CI bloqueia: `VITE_*` de IA em arquivos versionáveis + `.env` real + padrões de segredo.

### NFC-e / SSRF

Gate SSRF (`nfceUrlGate.ts`, 48 testes) pronto mas **fetch automático ADIADO** por decisão do owner (2026-07-04).
Fluxo entregue: parse XML/HTML local + revisão humana + callable `recordPriceObservation` rate-limited.
**Proibido:** fetch/scraping SEFAZ sem nova decisão explícita do owner.

### Política de logs (`src/`)

- `console.*` cru **PROIBIDO** (bloqueado por `consoleLoggingPolicy.test.ts`).
- Usar `logSanitizedFirebaseError` / `sanitizeErrorForLog`.
- `console.warn`/`console.info` somente com `import.meta.env.DEV` ou exceção documentada.

---

## 9. Resposta a Incidentes

| Sev | Definição | Prazo |
|-----|-----------|-------|
| SEV-1 | Exposição/perda de dados pessoais; acesso cruzado | Imediato (≤ 1h) |
| SEV-2 | Risco de integridade financeira sem vazamento | ≤ 4h |
| SEV-3 | Degradação sem dado em risco | ≤ 24h |

**Ciclo IDCR-A:** Identificar → Conter (revogar credencial / regra restritiva / desabilitar callable) → Comunicar (ANPD + titulares se SEV-1) → Remediar (PR pequeno + teste de regressão) → Aprender (post-mortem em `DECISOES-ARQUITETURA.md`).

**Playbooks rápidos:**
- **Acesso cruzado:** regra restritiva imediata + teste negativo no emulator.
- **PII em logs:** identificar origem → corrigir → reforçar `consoleLoggingPolicy.test.ts`.
- **Chave de IA exposta:** rotacionar `GEMINI_API_KEY` no Secret Manager + redeploy.
- **Erro monetário:** congelar fluxo → corrigir no motor puro → nunca migrar float automaticamente.

---

## 10. Riscos Arquiteturais Ativos

| ID | Risco | Prioridade | Gatilho para ação |
|----|-------|-----------|-------------------|
| AR-01 | Mutações parciais client-side (reconciliação/updates) | P1 | Iniciar integração externa ou automação financeira |
| AR-02 | Agregações O(N) no dashboard (> 5000 transações) | P1 | Dashboard > 2s em conexão média ou volume > 2000 tx/usuário |
| AR-04 | Tracing parcial (somente history-only, sem APM) | P2 | Aumento de erros reportados difíceis de correlacionar |
| AR-05 | Ledger simples (sem double-entry) | P2 | Necessidade de balancetes contábeis reais |
| AR-08 | Reconciliação ainda client-orchestrated | P1 | Múltiplos dispositivos ou parceiro externo |

**NÃO fazer:** reescrever o sistema; Double-Entry sem ADR; Open Finance sem requisito real; relaxar Firestore Rules.

---

## 11. Produto e Visão

### Missão

Copiloto financeiro pessoal definitivo: motor de líder mundial + IA que propõe, pede permissão e presta contas — auditável, proativa, subordinada à decisão humana.

### Princípios inegociáveis

Firebase Auth · Firestore `users/{uid}` · Cloud Functions TS · App Check · `value_cents` · Decimal.js · Zod `.strict()` · history append-only · logs sanitizados · idempotência · confirmação humana.

### Fable 5 — avaliação 2026-07-16

**Veredito:** Motor 9/10, produto 6/10, experiência 5/10.
- Média das dimensões: **6.0/10** (UX 4.5 / Interface 5.0 / Inteligência Financeira 6.5 / IA Agente 6.0 / Clareza Estratégica 5.5 / Inovação 7.0 / Potencial de Mercado 7.0 / Diferenciação 6.5).
- Problema central: 13+ blocos no dashboard; 4 sistemas de alerta paralelos; estética cyber/glow bloqueia percepção premium.
- Quick wins (código, não autorizados ainda): Impact preview na `ActionConfirmationSheet`, matar glow/scanline, fundir alert panels, Dashboard como Feed de Decisões (≤ 4 elementos acima da dobra).

### Copiloto IA — regras de ouro

1. IA **nunca** grava sem confirmação humana.
2. IA **não** produz número financeiro final (placeholders → motores).
3. Toda ação sensível: proposta → preview → aceite → callable.
4. Fallback de baixa confiança (limiar 0.6) → chat normal.
5. Logging: zero prompt bruto, zero resposta bruta, zero PII.

---

## 12. Checklist de PR (obrigatório antes do merge)

- [ ] `npm run typecheck` ✅ (esbuild não type-checa — typecheck obrigatório antes de push)
- [ ] `npm run lint` ✅
- [ ] `npm run test -- --run` ✅
- [ ] `npm run build` ✅
- [ ] `npm run test:rules` ✅ **se** tocou `firestore.rules`
- [ ] `npm --prefix functions test` ✅ **se** tocou `functions/`
- [ ] Zonas proibidas não alteradas sem fase própria
- [ ] Cálculo financeiro só em centavos inteiros; sem float ops proibidas
- [ ] Payloads Zod `.strict()`; logs sanitizados
- [ ] Modelo A preservado em qualquer UPDATE de transação
- [ ] Feature com IA declara: dados usados · ação sugerida · confirmação exigida · auditoria registrada
- [ ] PR pequeno (≤ 5 arquivos)

### Checklist de Deploy

- [ ] Todos os CI checks verdes (typecheck/lint/test/rules/functions/build + E2E)
- [ ] Secrets confirmados (Secret Manager; `VITE_*` só públicas no client)
- [ ] Firestore Rules via service account correto
- [ ] Preview channels TTL ≤ 3d (evita 429 RESOURCE_EXHAUSTED)
- [ ] Smoke test pós-deploy (login → criar transação → dashboard)

---

## 13. Cloud Functions — Referência Rápida

`ENFORCE_APP_CHECK = process.env.FUNCTIONS_EMULATOR !== 'true'` — ON em prod, OFF só no emulator.

| Callable | Escopo |
|----------|--------|
| `createTransaction` | Criação server-trusted |
| `executeAgentAction` | Mutação confirmada do Agente (App Check + idempotência) |
| `createTransfer` | Transferência atômica 2 contas (idempotente, TTL 24h) |
| `deleteUserData` | Hard delete LGPD + step-up `auth_time ≤ 5min` |
| `categorizeTransactionsBatch` | Categorização em lote via Gemini |
| `chatWithQuantumAI` | Chat conversacional |
| `generateAuditReport` | Relatório de auditoria |
| `logAuditEvent` | `audit_logs` de BULK_UPDATE/UNDO_BULK_UPDATE server-trusted |
| `recordPriceObservation` | `priceObservations` create server-only |
| `acceptGroupInvite` | Convite atômico single-use com expiração |
| `createGroupExpense` | Despesa compartilhada (soma shares==total) |
| `settleGroupExpenseShare` | Quitação da própria cota |

Scheduled: `executeScheduledRecurrents` (04:00 UTC) · `sendPushReminders` (11:00 UTC, sem PII).

---

## 14. Bloqueados por Decisão (não iniciar sem nova decisão explícita)

| Item | Status |
|------|--------|
| `fetchNfce` (fetch automático SEFAZ) | ADIADO 2026-07-04 — gate SSRF pronto mas decisão de produto/segurança |
| Open Finance / BACEN | Bloqueado por mTLS/orçamento |
| Migração automática float→`value_cents` | Bloqueada; diagnóstico encontrou **zero documentos legados** em produção |

---

## 15. Referência de Documentos Restantes

| Documento | Quando consultar |
|-----------|-----------------|
| [`PENDENCIAS.md`](./PENDENCIAS.md) | Backlog único — fonte de verdade das pendências abertas |
| [`DECISOES-ARQUITETURA.md`](./DECISOES-ARQUITETURA.md) | Histórico de decisões técnicas com contexto completo (por quê, não apenas o quê) |
| [`audit/AUDITORIA_BIG_FOUR_2026-07-09.md`](./audit/AUDITORIA_BIG_FOUR_2026-07-09.md) | Laudo completo Big Four — nota 8.7/10 — scorecard por domínio |
| [`audit/AUDITORIA_EXTERNA_2026-07-11.md`](./audit/AUDITORIA_EXTERNA_2026-07-11.md) | Estado dos 15 findings da auditoria externa — dossiê de re-auditoria |
| [`audit/M03_CHECKLIST_VERIFICACOES_REAIS.md`](./audit/M03_CHECKLIST_VERIFICACOES_REAIS.md) | Roteiro passo a passo para o owner executar MFA TOTP + FCM + NFC-e em dispositivo real |
