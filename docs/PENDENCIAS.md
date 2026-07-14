# Quantum Finance — Backlog Único de Pendências

> **Fonte de verdade do que está ABERTO.** Consolidado em 2026-07-14 a partir de: Auditoria Big Four (`docs/audit/AUDITORIA_BIG_FOUR_2026-07-09.md`), Auditoria Externa Independente (`docs/audit/AUDITORIA_EXTERNA_2026-07-11.md`) e Tese Extraordinária (`docs/product/QUANTUM_FINANCE_TESE_EXTRAORDINARIA_2026-07-09.md`).
> Tudo que foi **concluído** sai deste arquivo (histórico em `docs/HISTORICO-FASES.md` e no git). Atualizar a cada PR que fechar um item.
>
> Status: ⬜ pendente · 🔄 em andamento · 🚧 bloqueado por decisão

---

## 1. Executável por agente (código, ordem sugerida)

| # | Item | Origem | Escopo | Status |
|---|------|--------|--------|--------|
| 1 | **F-12 restante (a11y + UI premium)** — 23 warnings inventariados 1 a 1 + gaps além do lint (Esc/focus trap/skip-link/reduced-motion) + navegação minimalista (sidebar 20 itens → sem scroll; consolidação p/ 7 destinos aguarda decisão do owner). **Plano e checklist: `docs/product/FASE_F12_UI_PREMIUM_A11Y_2026-07-14.md`** (PRs A1–A4, B, C). | Ext. F-12 | `src/` UI | 🔄 em execução |
| 2 | **F-13 — cobertura risk-based** — cobrir `components/**`/`features/**` críticos (hoje fora do gate) antes de expandir o scope de coverage. Regra viva: só ratchetar gate com ≥0,5% de margem real medida no CI. | Ext. F-13 | testes | ⬜ |
| 3 | **F-01 follow-up — UI mirror do consent IA** — refletir no cliente o gate server-side `assertAiConsent` (hoje o usuário sem consentimento só descobre no erro da callable). | Ext. F-01 | UI | ⬜ |
| 4 | **L-04 — ErrorBoundaries por feature** — hoje há 1 único boundary na raiz; falha em subárvore derruba o app. | Big Four L-04 | UI | ⬜ |
| 5 | **L-03 — higiene de tipos** — reduzir 21 usos de `any`/`as any` e 3 `@ts-ignore` em `src/` para <10. | Big Four L-03 | `src/` | ⬜ |
| 6 | **M-01 reforço opcional de cobertura** — utils a 0% (`financialData`, `categoryRules`, `importActions`, `timingEvents`), branches soltos de `insightsEngine`; `useForecast`/workers (`parserWorker`, `pdfParser`) não são exercitáveis em jsdom (documentar exclusão ou testar via node). | Big Four M-01 | testes | ⬜ |

## 2. Owner / infra (fora do alcance de CI)

| # | Item | Origem | O que falta | Status |
|---|------|--------|-------------|--------|
| 7 | **M-03 — verificações reais em dispositivo** — MFA TOTP ponta a ponta, FCM push em background, NFC-e real por QR/colagem. Roteiro passo a passo: `docs/audit/M03_CHECKLIST_VERIFICACOES_REAIS.md`. Código/unit já verdes; falta só a prova em ambiente real. | Big Four M-03 | owner + dispositivo | ⬜ |
| 8 | **F-09 restante — proteção de custo/DoS global** — `maxInstances: 20` já aplicado (#409); faltam billing alerts, quotas de projeto e paginação de scans (console GCP/Firebase). | Ext. F-09 | owner/infra | ⬜ |
| 9 | **F-15 — observabilidade** — métricas estruturadas, SLOs e alertas de falha/custo para scheduled functions e callables (hoje jobs só logam contadores). | Ext. F-15 | infra | ⬜ |
| 10 | **L-05 — APM/tracing distribuído** — gap vs. Big Tech, explicitamente aceitável no estágio atual. Evolução: Web-Vitals RUM + budgets por rota (follow-up do F-14). | Big Four L-05 | infra | ⬜ |

## 3. Produto — sequência da Tese Extraordinária

Fase 1 (Radar de Compras) entregue (#363). Restam, em ordem:

| # | Fase | Ideia central | Status |
|---|------|---------------|--------|
| 11 | **Ação de 1 Toque** | Briefing/radar propõe ação já pronta, confirmável em 1 toque (reutiliza `ActionConfirmationSheet` + `executeAgentAction`; zero backend novo). | ⬜ próxima fase de produto |
| 12 | **Gêmeo Financeiro** | Simulador de cenários unificado (`cardProjection` + `insightsEngine` + `forecast` + recorrentes, centavos inteiros, 24 meses). | ⬜ |
| 13 | **Selo de Integridade** | Painel de verificabilidade para o usuário (rastreabilidade centavo a centavo, IA revalidada, LGPD hard-delete). | ⬜ |
| 14 | **Copiloto que Cumpre** | Compromissos verificáveis auditados no Diário de Decisões (`/decisions`). | ⬜ |

## 4. Bloqueados por decisão (NÃO iniciar sem nova decisão explícita do owner)

- 🚧 **`fetchNfce` (fetch automático SEFAZ)** — ADIADO por decisão de produto/segurança (2026-07-04). Gate SSRF pronto e testado (#355). A auditoria externa **recomendou manter** o fluxo manual/consentido.
- 🚧 **Open Finance / BACEN** — bloqueado por mTLS/orçamento.
- 🚧 **Migração automática float→`value_cents`** — segue bloqueada; diagnóstico de 2026-07-04 encontrou **zero documentos legados** em produção (pendência esvaziada na prática).

---

## Ordem de execução recomendada

1. **Itens 1–2** (F-12 restante + F-13): fecham as duas últimas pendências de código da auditoria externa — pré-requisito para pedir re-auditoria e subir a nota (6,2 → alvo ≥9).
2. **Item 7 (M-03)**: agendar com o owner — destrava o "FECHADO" da Big Four Sprint 1.
3. **Itens 3–5**: hardening incremental de UX/robustez, PRs pequenos.
4. **Item 11 (Ação de 1 Toque)**: primeira fase de produto nova — maior ROI com o que já existe.
5. **Itens 8–10**: trilha infra/observabilidade, conforme disponibilidade do owner no console.
