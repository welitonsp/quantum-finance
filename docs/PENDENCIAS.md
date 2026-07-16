# Quantum Finance — Backlog Único de Pendências

> **Fonte de verdade do que está ABERTO.** Consolidado em 2026-07-14 a partir de: Auditoria Big Four (`docs/audit/AUDITORIA_BIG_FOUR_2026-07-09.md`), Auditoria Externa Independente (`docs/audit/AUDITORIA_EXTERNA_2026-07-11.md`) e Tese Extraordinária (`docs/product/QUANTUM_FINANCE_TESE_EXTRAORDINARIA_2026-07-09.md`).
> Tudo que foi **concluído** sai deste arquivo (histórico no `git log`). Atualizar a cada PR que fechar um item.
>
> Status: ⬜ pendente · 🔄 em andamento · 🚧 bloqueado por decisão

---

## 1. Executável por agente (código, ordem sugerida)

| # | Item | Origem | Escopo | Status |
|---|------|--------|--------|--------|
| 1 | **F-12** — **FECHADO** (PRs #434–#442): 23 warnings a11y → 0, ESLint gate ativo, sidebar 7 destinos, TopTabs ARIA, focus programático. | Ext. F-12 | `src/` UI | ✅ |
| 2 | **F-13 — FECHADO (risk-based)** — pure-logic (#443) + hooks Firebase (#444) + import modules (#445) + RTL money-forms (#448) = 116 testes. RTL de componentes secundários (GoalsPanel, RecurringManager, CreditCardManager) fica como reforço opcional pós-re-auditoria. **Dossiê de re-auditoria pronto** em `docs/audit/AUDITORIA_EXTERNA_2026-07-11.md`. | Ext. F-13 | testes | ✅ |
| 3 | **F-01 follow-up — UI mirror do consent IA — FECHADO** — `useAiConsent` (realtime) + `AiConsentGate` nas 3 abas de IA e no chat flutuante, CTA para Governança/Privacidade. Follow-up menor: gate na categorização em lote do import (avaliar no L-03). | Ext. F-01 | UI | ✅ |
| 4 | **L-04 — ErrorBoundaries por feature — FECHADO** — `ErrorBoundary` extraído para componente com `label` (fallback nomeado por grupo da sidebar) e `resetKey={currentPage}` (crash numa página não trava mais a navegação; navegar recupera). Boundaries do chat/palette/settings com labels próprios. | Big Four L-04 | UI | ✅ |
| 5 | **L-03 — higiene de tipos — FECHADO** — 21 `any` → **0** (meta era <10); `@ts-ignore` já estava zerado. Tooltip do TimelineWidget tipado; casts de fixture de teste convertidos para `as unknown as T`; todos os `eslint-disable` de `no-explicit-any` removidos. Pendente de decisão de produto (fora deste item): `cardId` inerte no `TransactionForm` — ganhar UI de seleção de cartão ou remover os ramos. | Big Four L-03 | `src/` | ✅ |
| 6 | **M-01 reforço de cobertura — FECHADO** — 21 testes adicionados (`c8485d7`): `useSpendingPower` (9), `useCategoryRules` (6), `useImportActions` (6). Workers/parsers excluídos por design (jsdom incompatível). | Big Four M-01 | testes | ✅ |

## 2. Owner / infra (fora do alcance de CI)

| # | Item | Origem | O que falta | Status |
|---|------|--------|-------------|--------|
| 7 | **M-03 — verificações reais em dispositivo** — MFA TOTP ponta a ponta, FCM push em background, NFC-e real por QR/colagem. Roteiro passo a passo: `docs/audit/M03_CHECKLIST_VERIFICACOES_REAIS.md`. Código/unit já verdes; falta só a prova em ambiente real. | Big Four M-03 | owner + dispositivo | ⬜ |
| 8 | **F-09 restante — proteção de custo/DoS global** — `maxInstances: 20` já aplicado (#409); faltam billing alerts, quotas de projeto e paginação de scans (console GCP/Firebase). | Ext. F-09 | owner/infra | ⬜ |
| 9 | **F-15 — observabilidade** — métricas estruturadas, SLOs e alertas de falha/custo para scheduled functions e callables (hoje jobs só logam contadores). | Ext. F-15 | infra | ⬜ |
| 10 | **L-05 — APM/tracing distribuído** — gap vs. Big Tech, explicitamente aceitável no estágio atual. Evolução: Web-Vitals RUM + budgets por rota (follow-up do F-14). | Big Four L-05 | infra | ⬜ |

## 3. Produto — Tese Extraordinária (COMPLETA) + Nova Onda

**Tese 5/5 entregue.** Nova onda de produto (Big Tech premium):

| # | Feature | Ideia central | Status |
|---|---------|---------------|--------|
| 11 | **Ação de 1 Toque** | `OneTouchActionsCard` — recorrentes a vencer → confirmação 1 toque. | ✅ (`83deafc`) |
| 12 | **Gêmeo Financeiro** | `useGemeloData` + `GemeloFinanceiro` — Monte Carlo com DNA real. | ✅ (`c5176d7`) |
| 13 | **Selo de Integridade** | `useDecisions` + GovernancePage — 4 pilares + Diário de Decisões IA. | ✅ (`acbdc54`) |
| 14 | **Copiloto que Cumpre** | `AIJournalDrawer` — drawer com stats, filtros e track record do agente. | ✅ (`b6bee7b`) |
| 15 | **Dashboard "Posso gastar hoje?"** | `useSpendingPower` (saldo − fixos pendentes − fatura) + `SpendingPowerBadge` com zona safe/caution/danger. Inserido no DashboardContent após DashboardHero. | ✅ (`2aed47e`) |
| 16 | **Voice Capture** | `useSpeechRecognition` (pt-BR, SSR-safe, cleanup) + botão Mic/MicOff no AIAssistantChat. Oculto quando não suportado. | ✅ (`5a184bd`) |
| 17 | **Briefing Diário** | `DailyBriefingCard` — top 3 insights determinísticos (anomalia, taxa de poupança, projeção) via `insightsEngine`. Acima da dobra, zero API. | ✅ (`8e54b2a`) |
| 18 | **Próximos 7 Dias** | `UpcomingEventsStrip` — strip horizontal de recorrentes a vencer + fechamento/vencimento de fatura de cartão nos próximos 7 dias. | ✅ (`8c128fd`) |
| 19 | **Score Hero 2.0** | `ScoreHeroCard` — ring SVG compacto com score 0-100, trend vs mês anterior e hint do próximo nível (pilar mais fraco). Acima da dobra após IntelStrip. | ✅ (`e7e2f36`) |
| 20 | **Patrimônio Hero** | `PatrimonioHeroCard` — patrimônio líquido com breakdown ativos/passivos/reserva em meses. Acima da dobra após SpendingPowerBadge. | ✅ (`e7e2f36`) |

## 4. Bloqueados por decisão (NÃO iniciar sem nova decisão explícita do owner)

- 🚧 **`fetchNfce` (fetch automático SEFAZ)** — ADIADO por decisão de produto/segurança (2026-07-04). Gate SSRF pronto e testado (#355). A auditoria externa **recomendou manter** o fluxo manual/consentido.
- 🚧 **Open Finance / BACEN** — bloqueado por mTLS/orçamento.
- 🚧 **Migração automática float→`value_cents`** — segue bloqueada; diagnóstico de 2026-07-04 encontrou **zero documentos legados** em produção (pendência esvaziada na prática).

---

## Ordem de execução recomendada

1. **Itens 7–10** — owner/infra: agendar com o owner (M-03 é pré-requisito para re-auditoria Big Four). Item 6 fechado (`c8485d7`).
