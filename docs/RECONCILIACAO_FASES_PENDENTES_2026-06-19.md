# Reconciliação — Fases Pendentes × Estado Real do Código (2026-06-19)

> Documento de auditoria **read-only**. Cruza o "Relação de Fases Pendentes" (roadmap
> H-0 / A–K do owner) com o estado **verificado no código** em `main @ 111deb5` +
> branch `feature/purchase-simulator-effective-limit`. Nenhum código de produção foi
> alterado para produzir este relatório.
>
> **Achado-chave:** o roadmap pendente foi escrito sob a premissa de que quase nada
> existia. Na prática a maioria já está mergeada. Porém duas afirmações otimistas do
> `CLAUDE.md` **não se confirmam no código** e estão marcadas como ⚠️ abaixo.

---

## Quadro-resumo

| Fase | Escopo | Estado real | Veredito |
|---|---|---|---|
| **0.1** | Quota IA / secrets fora do client | Chave Gemini só no backend (Secret Manager); App Check em 5 functions; `usage/ai_calls` server-side; `.env`/`.env.*` no `.gitignore`; `.env.example` presente | ✅ Feito |
| **0.2** | Transferências / saldo global | `createTransferWithHistory` + Zod (#197), delta neutro, net worth (#193) | ✅ Feito |
| **0.3** | Parcelamento atômico / limite | Divisão modulo-safe (#250), parcelas atômicas (#189), limite efetivo (#253) | ✅ Feito |
| **H-0** | **Governança do Agente Financeiro** | Só existe `POLITICA_COPILOT_IA…md` + máscara PII + App Check. **Faltam** os 4 docs (`AI_AGENT_GUARDRAILS`, `AI_TOOL_ROUTER`, `AI_RESPONSE_CONTRACT`, `AI_DECISION_JOURNAL`), o contrato de placeholders/pipes, `ActionProposal` e coleção `/decisions` | ⚠️ **Pendente (parcial)** |
| **A** | Segurança / docs base | `toCentavos` migrado (#242–#247), rules por `uid`, logs sanitizados (9F/9G), `.env.example`, README sem chave client | ✅ Feito |
| **B** | Transferências completas | `useTransactions` + `createTransferWithHistory` (#191, #197), histórico por conta, atomicidade | ✅ Feito |
| **C** | Cartão / fatura / parcelamento | `cardProjection.ts` (limite efetivo + faturas futuras), `PayInvoiceModal` (#251), competência canônica (#253/#255/#256) | ✅ Feito |
| **D** | Simulador de decisão de compra | Motor `purchaseSimulator.ts` (#202) **+ D-2A**: integração com limite efetivo real do cartão (branch atual) | 🔵 D-2A feito; D-2B pendente |
| **E** | **Plano de quitação de dívidas** | `debts` + `DebtModule` + amortização PV/r/n (`calcMonthlyPaymentCents`) + alerta de vencimento. **NÃO existe** motor de estratégia (avalanche/bola de neve), comparação de estratégias nem economia de juros | ⚠️ **Parcial — lacuna real** |
| **F** | Orçamentos e metas | `useBudgets`+`BudgetWidget`, `useGoals`+`GoalsPanel`, `PlanningPage` (#230). Lógica vive em hooks/widgets (não em `budgetEngine`/`goalEngine` isolados) | ✅ Feito (funcional) |
| **G** | Timeline e recorrências | `cashflowTimeline.ts`, `TimelinePage` (#229), `recurrenceDetector.ts`, recorrências server-side (#196), `RecurringManager` | ✅ Feito |
| **H** | **Agente Conversacional** | Chat existe (`AIAssistantChat`, `GeminiService`→callable `chatWithQuantumAI`, `ProactiveBriefing`). **Faltam** roteador de intenções, tool registry read-only, render por placeholders/pipes, `ActionProposal`/confirmação e `/decisions` | ⚠️ **Parcial — só chat** |
| **I** | LGPD / Segurança premium | `DataPrivacyService` (export/delete), `consents`, `GovernancePage`, `ADR_005_RETENTION`, `DATA_INVENTORY`, `ACCESS_MATRIX`. **Faltam** RIPD e fluxo formal de incidentes | 🟡 Quase completo |
| **J** | Refatoração arquitetural | `FirestoreService`→repos (#198), `TransactionsManager` dividido (#199), engines puras em `src/lib`. **Falta** doc formal de camadas domínio/application/infra | 🟡 Parcial |
| **K** | Observabilidade / QA / release | CI (typecheck+lint+test+functions+rules+build), `consoleLoggingPolicy.test`, 5 suítes E2E, `test:rules`. **Faltam** checklists formais de PR/deploy/rollback/incidente | 🟡 Quase completo |

---

## ⚠️ Discrepâncias entre `CLAUDE.md` e o código real

Estas correções devem ser refletidas no `CLAUDE.md` na próxima sincronização de docs:

1. **`src/lib/debtPlanner.ts` NÃO existe.** O `CLAUDE.md` (tabela FASE 4 e Referência
   Rápida) afirma `debtPlanner.ts` como "motor de plano de quitação". No código há apenas
   `DebtModule.tsx` + `useDebts.ts` com `calcMonthlyPaymentCents` (amortização PV/r/n por
   dívida individual). **Não há** estratégia avalanche/bola de neve, ordenação de
   pagamento, comparação de estratégias nem economia de juros estimada. → FASE E é
   **parcial**, não "✅".

2. **Agente Conversacional (FASE H) não tem a arquitetura governada.** `GeminiService`
   é um proxy `httpsCallable` com máscara PII e chave server-side — sólido em segurança,
   mas **sem** roteador de intenções, tool registry, contrato de resposta por
   placeholders/pipes (`|brl`, `|pct`…), `ActionProposal` com confirmação, nem coleção
   `/decisions`. O `CLAUDE.md` descreve a FASE H como "✅ Já existe / auditável"; é mais
   honesto classificar como **chat funcional sem camada de governança H-0**.

---

## Lacunas reais priorizadas (o que de fato falta)

### P1 — Governança do Agente (FASE H-0) — pré-requisito do agente real
- Criar `docs/AI_AGENT_GUARDRAILS.md`, `docs/AI_TOOL_ROUTER.md`,
  `docs/AI_RESPONSE_CONTRACT.md`, `docs/AI_DECISION_JOURNAL.md`.
- Registrar a regra `LLM narra; motores puros calculam` (já praticada de fato, falta
  formalizar e impor por contrato de resposta).
- Especificar `ActionProposal` (Zod) + confirmação humana antes de qualquer escrita.
- Especificar coleção `/decisions` (auditoria de decisões) + regras Firestore.
- **Doc-only, sem código de produção** — alinhado à "próxima ação recomendada" do owner.

### P1 — Plano de quitação real (FASE E)
- Criar motor puro (ex.: `src/lib/debtStrategy.ts`): avalanche × bola de neve,
  ordenação ótima, prazo estimado e economia de juros, consumindo `useDebts`.
- Saída compatível com o futuro agente (tool read-only).

### P2 — Camada de ação do agente (FASE H)
- Tool registry read-only ligando os motores já existentes (`simulatePurchase`,
  `cashflowTimeline`, `cardProjection`, orçamentos, metas, dívidas).
- Render por placeholders/pipes; rejeitar número literal do LLM.

### P3 — Fechamento LGPD/QA (FASES I/K)
- RIPD + fluxo formal de incidentes (FASE I).
- Checklists versionados de PR/deploy/rollback/incidente (FASE K).
- Doc de camadas arquiteturais (FASE J).

---

## Ordem de execução recomendada (ajustada ao estado real)

1. **FASE H-0** (doc-only) — governança antes do agente. ✅ pode começar já.
2. **FASE E (motor de estratégia)** — única lacuna funcional "pesada" restante.
3. **FASE H (tool registry + ActionProposal + /decisions)** — depende de H-0 e E.
4. **Fechamento I/J/K** — RIPD, doc de arquitetura, checklists.

> As FASES 0, A, B, C, D(base+D-2A), F, G já estão entregues. O esforço restante é
> concentrado: **governança do agente (H-0), estratégia de dívidas (E) e a camada
> de ação/decisão do agente (H)**.
