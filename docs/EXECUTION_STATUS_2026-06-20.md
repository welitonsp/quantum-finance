# Quantum Finance — Status de Execução (2026-06-20)

> Documento de **continuidade**: o que foi executado e o que falta, para retomar nos
> próximos dias sem perda de contexto. Snapshot vivo — atualizar a cada PR mergeado.
> Referência de plano UI: [`UI_UX_ARCHITECTURE.md`](./UI_UX_ARCHITECTURE.md).

---

## 0. TL;DR — retomar por aqui

- **Trilha financeira (D-2A/E/H/I-J-K + agente server-trusted): COMPLETA e em produção.**
- **Deploy automático de Cloud Functions: ATIVO** (IAM corrigido e verificado).
- **Trilha UI/UX Premium (8 PRs): em andamento.** PR 1–3 mergeados; **PR 4 em merge**; PR 5–8 pendentes.
- **Próximo passo:** mergear PR 4 (#269, gate verde) → iniciar **PR 5 `feat/analytics-page`**.
- **Backlog do agente** (intent router + 3 kinds de ação + parcelas) e **bloqueios** (NFC-e, Open Finance, FCM) seguem pendentes.

---

## 1. Estado Git / produção

- `main` HEAD (antes do PR 4): `538ab56`.
- Produção `quantum-finance-39235`: rules + hosting + **6 Cloud Functions** live.
- **CI/CD:** todo push na `main` redeploya **rules + hosting + functions** automaticamente
  (workflow `Deploy to Firebase Hosting on merge`, jobs `deploy_rules`/`deploy_functions`/`build_and_deploy`).

---

## 2. Trilha financeira — CONCLUÍDA (sessão 2026-06-19)

Mergeada e em produção (ver `CLAUDE.md` e `roadmap_checklist`):

| Fase | PR | Entrega |
|---|---|---|
| D-2A | #257 | Simulador de compra usa limite efetivo real do cartão |
| E | #259 | `src/lib/debtStrategy.ts` (avalanche/bola-de-neve) + UI no DebtModule |
| H-0 | #258 | 4 docs de governança do agente |
| H (fundação) | #260 | regras `/decisions` + `ActionProposal` (Zod) + `agentResponseRenderer` |
| H (ação) | #264 | callable `executeAgentAction` server-trusted (5→6 functions) |
| I/J/K | #261 | RIPD, Incident Response, Architecture Layers, Checklists |
| sync | #262 | CLAUDE.md reconciliado |
| CI | #265 | deploy automático de functions no merge |

---

## 3. Gate DevOps — IAM do deploy de functions ✅ RESOLVIDO

O job `deploy_functions` (#265) falhava por IAM. SA do CI:
`github-action-1146913783@quantum-finance-39235.iam.gserviceaccount.com`.
3 blockers corrigidos pelo 403 exato (least-privilege), via `gcloud` (owner):

1. `secretmanager.secrets.get` denied → `roles/secretmanager.admin` **escopado ao secret
   `GEMINI_API_KEY`** + gen-2 padrão (`run.admin`, `artifactregistry.writer`,
   `cloudbuild.builds.editor`, `firebaseextensions.viewer`).
2. Cloud Billing API desabilitada → `gcloud services enable cloudbilling.googleapis.com`.
3. `cloudscheduler.jobs.update` denied → `roles/cloudscheduler.admin`.

Resultado: run inteiro verde. **Deploy automático de functions ativo.**

---

## 4. Trilha UI/UX Premium — 8 PRs (plano em `UI_UX_ARCHITECTURE.md`)

| PR | Branch | Escopo | Status |
|---|---|---|---|
| 1 | `docs/ui-ux-architecture` (#266) | Doc canônico da arquitetura | ✅ MERGEADO |
| — | (gate IAM) | deploy functions | ✅ RESOLVIDO |
| 2 | `feat/ui-layout-primitives` (#267) | 8 primitivos em `src/shared/components/ui/` | ✅ MERGEADO |
| 3 | `feat/app-shell-navigation` (#268) | `AppShell` envolvendo o switch `currentPage` | ✅ MERGEADO |
| 4 | `feat/dashboard-command-center` (#269) | Enxugar dashboard (≤5 blocos + 2 seções recolhíveis) | 🔵 **EM MERGE** (gate verde, E2E rodando) |
| 5 | `feat/analytics-page` | `ChartSelector`+gráfico herói em `ReportsContent`; mover analíticos do dashboard | 🔲 PRÓXIMO |
| 6 | `feat/mobile-bottom-nav` | `MobileBottomNav` (slot `bottomNav` do AppShell) + BottomSheet + FAB | 🔲 |
| 7 | `feat/contextual-ai` | `ContextualAIButton` + Command Palette → `ActionProposal` | 🔲 |
| 8 | `perf/dashboard-lazy` | Lazy/memo dos widgets analíticos | 🔲 |

### Componentes já criados (PR 2, em `src/shared/components/ui/`)
`PageHeader`, `DashboardSection`, `MetricCard`, `FinancialCard`, `ChartCard`,
`ChartSelector`, `TopTabs`, `BottomSheet` (+ os anteriores: Card, Button, Badge,
EmptyState, LoadingPage, MoneyDisplay, Skeleton, Spinner, CopilotInsightCard).
Shell em `src/shared/components/layout/AppShell.tsx` (slot `bottomNav` reservado p/ PR 6).

### Dashboard pós-PR 4 (quando mergeado)
- **Acima da dobra:** CentroComando, Hero (saldo/semáforo/CTA), IntelStrip, KPICards, BudgetAlertsPanel.
- **Recolhido:** "Saúde Financeira & Insights" e "Análises & Projeções" (nada removido; PR 5 moverá analíticos para a página de Análises).

---

## 5. Decisões fixadas (não reabrir)

- **Sem `react-router`** — navegação por `currentPage`/`NavigationContext` + switch em `App.tsx`.
- **Não migrar biblioteca de gráficos** — Chart.js **e** Recharts coexistem; padronizar via `ChartCard`.
- **Reusar telas existentes** — `ReportsContent` (Análises), `PlanningPage` (Budget/Goals),
  `TimelinePage`, `CommandPalette`, `CopilotPage`.
- **Nenhuma regra financeira na UI** — componentes só apresentam valores já calculados.

---

## 6. Processo por PR (obrigatório)

1. Branch própria off `main` (NUNCA commitar direto na main).
2. `npm run typecheck` + `npm run lint` + `npm run build` + **`npx vitest run` (suíte completa)**.
   > Lição PR 4: `build` não roda testes; testes de componente (`DashboardContent.test.tsx`)
   > só aparecem no `vitest run`. Rodar a suíte completa antes do push.
3. Push → abrir PR → aguardar **gate (Typecheck/Lint/Test/Build) + E2E (Playwright)** verdes.
4. `gh pr merge <n> --squash --delete-branch` → `git checkout main && git pull --ff-only`.
   > Lição: NÃO usar `--delete-branch` se a branch for base de outro PR aberto (fecha o filho).

---

## 7. Pendências fora da trilha UI (backlog)

### Agente financeiro (continuação da FASE H)
- [ ] **Intent router no LLM** dentro do `chatWithQuantumAI` (classificação de intenção).
- [ ] Execução dos outros 3 kinds em `executeAgentAction`: `register_debt_payment`,
      `create_budget`, `contribute_to_goal` (hoje só `register_purchase` à vista; demais → `unimplemented`).
- [ ] Split de parcelas no `register_purchase` (`installments>1` → `unimplemented`).

### Arquitetura / qualidade
- [ ] Refino de `TransactionsManager`/`useTransactions` (extração adicional).
- [ ] Enforcement de checklists por tooling.

### Bloqueios estruturais (não iniciar sem decisão)
- [ ] **NFC-e** — bloqueado até gate SSRF completo.
- [ ] **Open Finance / BACEN** — bloqueado por mTLS/orçamento.
- [ ] **FCM background push** — requer migrar `vite.config.ts` para `injectManifest`.

---

## 8. Ordem de retomada

1. Confirmar PR 4 (#269) mergeado (gate+E2E verdes).
2. PR 5 `feat/analytics-page` → PR 6 `feat/mobile-bottom-nav` → PR 7 `feat/contextual-ai` → PR 8 `perf/dashboard-lazy`.
3. Retomar backlog do agente (intent router → 3 kinds → parcelas).
4. Reavaliar bloqueios estruturais conforme decisão do owner.
