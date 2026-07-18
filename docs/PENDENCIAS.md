# Quantum Finance — Backlog Único de Pendências

> **Fonte de verdade do que está ABERTO.** Consolidado em 2026-07-14 a partir de: Auditoria Big Four (`docs/audit/AUDITORIA_BIG_FOUR_2026-07-09.md`), Auditoria Externa Independente (`docs/audit/AUDITORIA_EXTERNA_2026-07-11.md`) e Tese Extraordinária (`docs/product/QUANTUM_FINANCE_TESE_EXTRAORDINARIA_2026-07-09.md`).
> **Auditoria 360 atual:** o dossiê `docs/audit/AUDITORIA_360_SECURITY_SYSTEMS_2026-07-18.md` consolida os novos achados críticos/altos e deve ser usado como referência principal para PRs de remediação `QF-360-*`.
> **Reauditoria 720 atual:** `docs/audit/AUDITORIA_720_BIG_TECH_FINANCIAL_AI_2026-07-18.md` amplia a baseline com integridade financeira, IA confiável, UI por módulo, inovação e roadmap `QF-720-*`. Os dois documentos são complementares; nenhum módulo existente deve ser removido.
> O programa ativo e seus estados vivem neste arquivo. Itens legados concluídos permanecem apenas enquanto forem necessários para contexto e devem migrar para `docs/HISTORICO-FASES.md` em PR próprio.
>
> Status: ⬜ pronto · 🔄 em execução · 🚧 bloqueado · 👀 em revisão · ✅ mergeado e verificado

---

## 1. Programa QF-720 — fila obrigatória

> Critérios, arquivos prováveis, testes, Definition of Ready/Done e regras de parada: `docs/CHECKLISTS.md`.
>
> A próxima IA escolhe somente o primeiro item `⬜` da tabela cujas dependências estejam `✅`. Um item por branch/PR.

| Ordem | Unidade | Entrega | Dependências | Autoridade especial | Status | PR/evidência |
|---:|---|---|---|---|---|---|
| 0 | `QF720-DOC-01` | Auditoria 720 + checklist mestre + backlog executável | — | revisão/merge | 👀 | branch `agent/auditoria-720-checklist-executavel` |
| 1 | `QF720-GOV-01` | Remover garantias absolutas não comprovadas da Governança | — | — | ⬜ | — |
| 2 | `QF720-ENV-01` | Validação fail-closed das variáveis de produção | — | — | ⬜ | — |
| 3 | `QF720-ADR-01` | ADR da verdade contábil, postings, saldo, shadow ledger e migração | — | aprovação do owner/arquiteto | ⬜ | — |
| 4 | `QF720-ENV-02` | Configurar ambientes e executar smoke autenticado | `ENV-01` | secrets, GitHub/Firebase, deploy | 🚧 | — |
| 5 | `QF720-SCHEMA-01` | Contrato único client × Functions × Rules | `ADR-01` | Rules/Functions | 🚧 | — |
| 6 | `QF720-IDEM-01` | Idempotência obrigatória por operação + hash | `SCHEMA-01` | Functions | 🚧 | — |
| 7 | `QF720-IDEM-02` | Outbox durável e lote recuperável | `IDEM-01` | — | 🚧 | — |
| 8 | `QF720-FIN-01` | Taxonomia financeira canônica + invariantes | `ADR-01`, `SCHEMA-01` | — | 🚧 | — |
| 9 | `QF720-FIN-02` | Transferências neutras em agregadores/KPIs | `FIN-01` | — | 🚧 | — |
| 10 | `QF720-FIN-03` | Settlement atômico de fatura | `FIN-01`, `IDEM-01` | Functions + política de saldo | 🚧 | — |
| 11 | `QF720-FIN-04` | Reconciliador shadow e consistência de patrimônio/metas/dívidas | `FIN-01`, `FIN-03` | migração se necessária | 🚧 | — |
| 12 | `QF720-CONSENT-01` | Consentimento/log server-trusted e por finalidade | `SCHEMA-01` | Rules/Functions + Privacy | 🚧 | — |
| 13 | `QF720-PRIV-01` | Exportação completa com manifesto | `CONSENT-01` | retenção/base legal | 🚧 | — |
| 14 | `QF720-PRIV-02` | Exclusão em saga com pseudonimização/recibo | `PRIV-01`, `IDEM-01` | jurídico/retenção | 🚧 | — |
| 15 | `QF720-AI-01` | Financial Snapshot server-trusted | `FIN-04`, `CONSENT-01` | Functions | 🚧 | — |
| 16 | `QF720-AI-02` | Resposta estruturada e claims determinísticos | `AI-01` | — | 🚧 | — |
| 17 | `QF720-AI-03` | Proposta server-side e confirmação em duas fases | `AI-01`, `AI-02`, `IDEM-01` | política MFA/risco | 🚧 | — |
| 18 | `QF720-SHARED-01` | Cotas server-owned, retenção e trilha compartilhada | `IDEM-01`, `CONSENT-01` | política de retenção | 🚧 | — |
| 19 | `QF720-RECUR-01` | Recorrência atômica por tarefa/competência | `IDEM-01`, `FIN-01` | Functions + timezone | 🚧 | — |
| 20 | `QF720-UI-01` | Corrigir escopo temporal de Relatórios | `FIN-02` | — | 🚧 | — |
| 21 | `QF720-UI-02` | Corrigir identidade no convite compartilhado | `SHARED-01` | — | 🚧 | — |
| 22 | `QF720-UI-03` | Split proporcional com pesos e prévia | `SHARED-01` | regra de produto | 🚧 | — |
| 23 | `QF720-UI-04` | Corrigir métrica de despesas fixas no Quantum AI | `FIN-01` | — | 🚧 | — |
| 24 | `QF720-UI-05` | Modo Privacidade realmente global | `CONSENT-01` | política de push/cache | 🚧 | — |
| 25 | `QF720-SIM-01` | Corrigir calendário, defaults e proveniência das simulações | `FIN-01` | regra de modo demo | 🚧 | — |
| 26 | `QF720-P0-CERT` | Reauditoria independente e certificação do gate P0 | todos os itens 1–25 | owner + QA real | 🚧 | — |

### Limite de P0 e P1

Em P0, o sistema deve possuir ADR aprovado, taxonomia única, operações críticas balanceadas, reconciliador shadow e delta zero nos cenários de aceite. A migração/materialização completa do ledger e eventual backfill ficam para P1 e exigem plano próprio, backup, dry-run e autorização. Essa distinção impede tanto um fechamento apenas documental quanto uma reescrita perigosa em P0.

Nenhuma função premium nova deve avançar antes de `QF720-P0-CERT`.

## 2. Backlog legado executável por agente

| # | Item | Origem | Escopo | Status |
|---|------|--------|--------|--------|
| 1 | **F-12** — **FECHADO** (PRs #434–#442): 23 warnings a11y → 0, ESLint gate ativo, sidebar 7 destinos, TopTabs ARIA, focus programático. | Ext. F-12 | `src/` UI | ✅ |
| 2 | **F-13 — FECHADO (risk-based)** — pure-logic (#443) + hooks Firebase (#444) + import modules (#445) + RTL money-forms (#448) = 116 testes. RTL de componentes secundários (GoalsPanel, RecurringManager, CreditCardManager) fica como reforço opcional pós-re-auditoria. **Dossiê de re-auditoria pronto** em `docs/audit/AUDITORIA_EXTERNA_2026-07-11.md`. | Ext. F-13 | testes | ✅ |
| 3 | **F-01 follow-up — UI mirror do consent IA — FECHADO** — `useAiConsent` (realtime) + `AiConsentGate` nas 3 abas de IA e no chat flutuante, CTA para Governança/Privacidade. Follow-up menor: gate na categorização em lote do import (avaliar no L-03). | Ext. F-01 | UI | ✅ |
| 4 | **L-04 — ErrorBoundaries por feature — FECHADO** — `ErrorBoundary` extraído para componente com `label` (fallback nomeado por grupo da sidebar) e `resetKey={currentPage}` (crash numa página não trava mais a navegação; navegar recupera). Boundaries do chat/palette/settings com labels próprios. | Big Four L-04 | UI | ✅ |
| 5 | **L-03 — higiene de tipos — FECHADO** — 21 `any` → **0** (meta era <10); `@ts-ignore` já estava zerado. Tooltip do TimelineWidget tipado; casts de fixture de teste convertidos para `as unknown as T`; todos os `eslint-disable` de `no-explicit-any` removidos. Pendente de decisão de produto (fora deste item): `cardId` inerte no `TransactionForm` — ganhar UI de seleção de cartão ou remover os ramos. | Big Four L-03 | `src/` | ✅ |
| 6 | **M-01 reforço opcional de cobertura** — utils a 0% (`financialData`, `categoryRules`, `importActions`, `timingEvents`), branches soltos de `insightsEngine`; `useForecast`/workers (`parserWorker`, `pdfParser`) não são exercitáveis em jsdom (documentar exclusão ou testar via node). Executar somente após `QF720-P0-CERT`, salvo quando necessário para um teste de regressão P0. | Big Four M-01 | testes | 🚧 |

## 3. Owner / infra (fora do alcance de CI)

| # | Item | Origem | O que falta | Status |
|---|------|--------|-------------|--------|
| 7 | **M-03 — verificações reais em dispositivo** — MFA TOTP ponta a ponta, FCM push em background, NFC-e real por QR/colagem. Roteiro passo a passo: `docs/audit/M03_CHECKLIST_VERIFICACOES_REAIS.md`. Código/unit já verdes; falta só a prova em ambiente real. | Big Four M-03 | owner + dispositivo | ⬜ |
| 8 | **F-09 restante — proteção de custo/DoS global** — `maxInstances: 20` já aplicado (#409); faltam billing alerts, quotas de projeto e paginação de scans (console GCP/Firebase). | Ext. F-09 | owner/infra | ⬜ |
| 9 | **F-15 — observabilidade** — métricas estruturadas, SLOs e alertas de falha/custo para scheduled functions e callables (hoje jobs só logam contadores). | Ext. F-15 | infra | ⬜ |
| 10 | **L-05 — APM/tracing distribuído** — gap vs. Big Tech, explicitamente aceitável no estágio atual. Evolução: Web-Vitals RUM + budgets por rota (follow-up do F-14). | Big Four L-05 | infra | ⬜ |

## 4. Produto — fundações entregues e evolução após P0

Fase 1 (Radar de Compras) foi entregue. Ação de 1 Toque e Gêmeo também possuem fundações implementadas; os próximos passos foram reclassificados pela Auditoria 720.

| # | Fase | Ideia central | Status |
|---|------|---------------|--------|
| 11 | **Ação de 1 Toque — fundação entregue** | Ações confirmáveis existem; atomicidade, idempotência e confirmação não forjável seguem em `IDEM-*`, `AI-03` e `RECUR-01`. | 🔄 incorporado ao P0 |
| 12 | **Gêmeo Financeiro — fundação entregue** | Simulação e Monte Carlo existem; proveniência/defaults seguem em `SIM-01`; compositor premium fica após P0. | 🔄 incorporado ao P0/P1 |
| 13 | **Selo de Integridade** | A UI atual não pode ser tratada como selo. Correção textual em `GOV-01`; painel baseado em evidência somente após controles reais. | 🔄 incorporado ao P0 |
| 14 | **Copiloto que Cumpre** | Diário e propostas existem; Promise & Proof/Outcome Evaluator ficam bloqueados até `P0-CERT`. | 🚧 bloqueado por P0 |

## 5. Bloqueados por decisão (NÃO iniciar sem nova decisão explícita do owner)

- 🚧 **`fetchNfce` (fetch automático SEFAZ)** — ADIADO por decisão de produto/segurança (2026-07-04). Gate SSRF pronto e testado (#355). A auditoria externa **recomendou manter** o fluxo manual/consentido.
- 🚧 **Open Finance / BACEN** — bloqueado por mTLS/orçamento.
- 🚧 **Migração automática float→`value_cents`** — segue bloqueada; diagnóstico de 2026-07-04 encontrou **zero documentos legados** em produção (pendência esvaziada na prática).

---

## Ordem de execução recomendada

1. Concluir/revisar `QF720-DOC-01`.
2. Executar a fila QF-720 exatamente pela primeira unidade `⬜` com dependências `✅`.
3. Agendar M-03 e itens de infra em paralelo somente com o owner, sem bloquear correções locais independentes.
4. Certificar P0 por revisão independente e QA real.
5. Somente então abrir P1: Tool Gateway, Action Stack, Proof Drawer, ledger materializado/migração e evolução premium.
