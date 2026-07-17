# Quantum Finance — Arquitetura UI/UX Premium (PR 1)

> Documento canônico da trilha de simplificação da interface. Consolida três fontes:
> (1) auditoria Gemini Pro (refinamento do dashboard), (2) auditoria Codex (análise
> técnica da UI), (3) auditoria de reconciliação Claude Code contra o **código real**
> em `main @ 26ccb02` (2026-06-20).
>
> **Natureza:** documental. Nenhum código de app é alterado por este PR. Os PRs 2–8
> implementam o que está aqui. **Nada nesta trilha toca regra financeira, Cloud
> Functions, Firestore Rules, schemas ou workflows.**
>
> Documentos relacionados: [`AI_AGENT_GUARDRAILS.md`](./AI_AGENT_GUARDRAILS.md),
> [`AI_RESPONSE_CONTRACT.md`](./AI_RESPONSE_CONTRACT.md),
> [`ARCHITECTURE_LAYERS.md`](./ARCHITECTURE_LAYERS.md), [`CHECKLISTS.md`](./CHECKLISTS.md).

---

## 1. Problema

O dashboard cresceu organicamente e virou "home + BI + planejamento + IA + forecast +
timeline" em uma rolagem única. Evidência no código real:

- `src/components/DashboardContent.tsx` (561 linhas) renderiza **~18 blocos** em coluna
  única `space-y-6`, misturando 5 temporalidades (agora / mês / semanas / 90 dias /
  histórico) e 4 intenções (operar / diagnosticar / planejar / analisar).
- **Duplicação confirmada:** `BudgetWidget` e `GoalsPanel` aparecem no dashboard **e** em
  `src/features/planning/PlanningPage.tsx`; `TimelineWidget` coexiste com `TimelinePage`.
- Lazy loading existe apenas **por página** (`App.tsx`); os widgets pesados do dashboard
  (Chart.js + Recharts) renderizam todos no primeiro paint.

A sobrecarga é de **arquitetura de informação**, não de funcionalidade. Nenhuma função
será removida — apenas redistribuída por visibilidade.

## 2. Correções factuais aos relatórios (baseadas no código)

Ambos os relatórios são válidos no diagnóstico e convergentes na solução, mas dois pontos
precisam de correção para a implementação:

1. **Não existe `react-router`.** A navegação é por **estado `currentPage` em
   `src/contexts/NavigationContext.tsx`** (default `'dashboard'`) + um switch em `App.tsx`.
   → O `AppShell` deve **envelopar o switch existente**; não há "Router.tsx" a criar.
2. **O projeto usa Chart.js E Recharts.** → **Não migrar biblioteca.** Padronizar a
   apresentação via `ChartCard`, mantendo cada lib onde já é usada.

Divergência de taxonomia (Gemini: 5 itens de topo × Codex: 9 domínios): prioriza-se o
**código real** — o `Sidebar` já tem 6 grupos / ~22 itens. Mantém-se a estrutura atual
como base e adicionam-se Top Tabs contextuais; a taxonomia só é reavaliada depois.

## 3. Arquitetura de navegação aprovada

**Desktop:** Navigation Rail (refino do `Sidebar`) + Topbar global (refino do `Header`)
+ Top Tabs contextuais por página.
**Mobile:** Bottom Navigation + tabs horizontais acessíveis + Bottom Sheets + FAB para a
ação principal.
**Roteamento:** preservado via `currentPage`/`NavigationContext` — sem `react-router`.

Princípios visuais: dark premium controlado, glassmorphism moderado, microinterações
úteis (Framer Motion, já dependência), hierarquia clara, cards com respiro, privacidade
visual (modo já existente), mobile-first, acessibilidade desde a base. Sem neon excessivo,
sem animação gratuita, sem regra financeira na UI.

## 4. Dashboard "Command Center" (≤ 4–5 blocos)

> Regra central: o dashboard mostra **o que exige decisão agora**, não tudo.

**Fica (acima da dobra):**
1. `CentroComandoWidget` — top 3 alertas/risco acionáveis.
2. Hero de saldo consolidado + entradas/saídas + **semáforo financeiro** + CTA "Nova Movimentação".
3. **Burn rate** compacto.
4. **Próximos pagamentos / faturas próximas**.

**Sai da primeira dobra → destino (nada removido):**

| Bloco | Destino | Motivo |
|---|---|---|
| `BudgetWidget` | Planejamento (já hospeda) | duplicado; uso semanal |
| `GoalsPanel` | Planejamento / Patrimônio | duplicado; uso semanal/mensal |
| `TimelineWidget` | Timeline (já existe) | duplicado |
| `DashboardCharts`, `WealthKPIs` | Análises / Patrimônio | analítico mensal |
| `SurvivalHeatmap` | Análises / Riscos | avançado |
| `ForecastWidget` | Análises / Timeline | projeção pesada |
| `ProactiveBriefing` (longo) | Copilot | IA não domina a home |
| `EconomyChallengeWidget`, `FinancialHealthScore` (completo) | seção recolhível / Patrimônio | diagnóstico/gamificação |

## 5. Pilares funcionais (organização-alvo, reusando telas existentes)

- **Dashboard:** saldo, semáforo, burn rate, top 3 alertas, próximos compromissos, resumo do mês.
- **Dia a Dia:** transações, contas, cartões, faturas, recorrências, calendário operacional.
- **Planejamento:** orçamentos, metas, dívidas, simulador de compra, plano de quitação.
- **Análises:** categorias, Pareto, tendências, evolução, burn rate detalhado, comparação, projeções, riscos.
- **Patrimônio:** net worth, ativos, passivos, evolução, objetivos.
- **Copilot:** chat, diário de decisões (`/decisions`), command palette, "Explicar com IA", ActionProposals com confirmação humana.

## 6. Sistema de Análises

Evoluir `src/features/reports/ReportsContent.tsx` (já tem tabs `pareto`/`tendencias`) —
**não recriar**. Implementar **primeiro** o `ChartSelector` (um gráfico herói por vez,
trocando dataset com transição), categorias (`Fluxo`, `Categorias`, `Patrimônio`,
`Riscos`, `Projeções`), filtro de período persistente, comparação de períodos (fase 2) e
botão "✨ Explicar com IA". Padronizar via `ChartCard`. Não migrar Chart.js/Recharts.

## 7. IA / Copilot na interface

- **Agora:** aba Copilot (`CopilotPage`) como casa do chat + `/decisions`; reusar `CommandPalette`.
- **Próximo:** `ContextualAIButton` (`✨`) → respostas em `BottomSheet` temporário.
- **Depois:** Command Palette aceitar `ActionProposal` (contrato `executeAgentAction` já
  existe) com confirmação humana.
- **Invariável:** o LLM **não calcula valores finais** — `agentResponseRenderer` + motores
  puros são responsáveis pelos números (ver `AI_AGENT_GUARDRAILS.md`). Evitar chat fixo na home.

## 8. Design System

**Já existem** em `src/shared/components/ui/`: `Card`, `Button`, `Badge`, `EmptyState`,
`LoadingPage`, `MoneyDisplay`, `Skeleton`, `Spinner`, `CopilotInsightCard`. `CommandPalette`
existe em `src/components/`.

**A criar:**

| Prioridade | Componentes |
|---|---|
| Alta | `AppShell`, `PageHeader`, `DashboardSection`, `MetricCard`/`FinancialCard`, `ChartCard`, `ChartSelector`, `TopTabs`, `MobileBottomNav`, `BottomSheet` |
| Média | `NavigationRail` (refino `Sidebar`), `Topbar` (refino `Header`), `InsightCard`, `FinancialAlert`, `ContextualAIButton` |
| Baixa | refinar `CommandPalette`, `EmptyState`, `LoadingState`, `Skeleton`, `Spinner` |

## 9. Performance

Lazy por seção analítica + render condicional por tab; memoização de datasets; dividir
`BudgetWidget` (692 linhas) e containers grandes; adiar Chart.js/Recharts fora da dobra;
build limpo após cada PR de código.

## 10. Acessibilidade

Corrigir tabs sem `role="tablist"/"tab"` (em `ReportsContent`) ao criar `TopTabs`;
alternativa textual/aria para gráficos; foco visível; navegação por teclado; labels em
botões icônicos; touch targets ≥ 44px; contraste; zero `overflow-x` no mobile.

## 11. Plano incremental por PRs

| PR | Branch | Objetivo | Arquivos prováveis | Proibidos | Risco |
|---|---|---|---|---|---|
| 1 | `docs/ui-ux-architecture` | **Este documento** | `docs/**` | `src/**`, `functions/**`, rules, schemas, workflows | Baixo |
| 2 | `feat/ui-layout-primitives` | Primitivos de layout | `src/shared/components/ui/**` | `lib/**`, financeiro | Baixo |
| 3 | `feat/app-shell-navigation` | `AppShell` + rail/topbar | `App.tsx`, `Sidebar.tsx`, `Header.tsx`, layout, `NavigationContext` | `lib/**`, rules | Médio/Alto |
| 4 | `feat/dashboard-command-center` | Dashboard ≤5 blocos | `DashboardContent.tsx` | `lib/**`, schemas | Médio |
| 5 | `feat/analytics-page` | `ChartSelector` + gráfico herói | `features/reports/**` | ledger, `lib/**` | Médio |
| 6 | `feat/mobile-bottom-nav` | Bottom nav + sheets + FAB | `AppShell`, `Header.tsx`, layout | rules/functions | Médio |
| 7 | `feat/contextual-ai` | `ContextualAIButton` + Command Palette → ActionProposal | `CopilotPage`, `CommandPalette.tsx` | **Cloud Functions**, rules | Médio |
| 8 | `perf/dashboard-lazy` | Lazy/memo de widgets | wrappers lazy/memo | cálculos em centavos | Baixo |

## 12. Gate DevOps (separado da UI)

O job `deploy_functions` (PR #265) falha por **IAM** — o service account de
hosting/rules não tem papéis de deploy de Functions (`cloudfunctions.developer`,
`iam.serviceAccountUser`, `firebase.admin`; gen-2 também `run.admin`,
`artifactregistry.writer`, `cloudbuild.builds.editor`). Produção **intacta** (functions
live via deploy manual; rules+hosting via CI). **Regra:** este PR documental prossegue
independentemente; **PRs de UI com código (2+) só após o IAM ser corrigido** e o
`deploy_functions` ficar verde.

## 13. Ordem aprovada

1. **PR 1 — `docs/ui-ux-architecture`** (este).
2. Corrigir IAM do deploy de Functions.
3. PR 2 — `feat/ui-layout-primitives`.
4. PR 3 — `feat/app-shell-navigation`.
5. PR 4 — `feat/dashboard-command-center`.
6. PR 5 — `feat/analytics-page`.
7. PR 6 — `feat/mobile-bottom-nav`.
8. PR 7 — `feat/contextual-ai`.
9. PR 8 — `perf/dashboard-lazy`.
10. Retomar trilha do agente (intent router + demais kinds de ação).

## 14. Veredito

As três auditorias estão validadas e convergentes. A estratégia é segura, incremental e
preserva 100% da lógica financeira. Caminho: **doc → IAM → primitivos → shell → dashboard
→ análises → mobile → IA → performance**, PR por PR, sem tocar o domínio contábil.
