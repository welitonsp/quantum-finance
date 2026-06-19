# Camadas Arquiteturais (FASE J)

> Formaliza a separação de responsabilidades já praticada no Quantum Finance em
> camadas explícitas: **domínio (motores puros)**, **aplicação (hooks/serviços)** e
> **infraestrutura (Firebase)**. Objetivo: reduzir acoplamento e dar regra clara de
> "onde cada coisa mora". Complementa o Feature-Sliced Design descrito no `README.md`.

---

## 1. As três camadas

```
┌─ UI (React) ──────────────────────────────────────────────┐
│  components/ · features/*/(.tsx)                           │
│  Só renderiza e captura intenção. ZERO cálculo financeiro. │
├─ Aplicação ───────────────────────────────────────────────┤
│  hooks/ · shared/services/ · shared/schemas/ (Zod)         │
│  Orquestra: lê/escreve via infra, valida payloads,         │
│  chama os motores puros. Conhece React e Firebase.         │
├─ Domínio (motores puros) ─────────────────────────────────┤
│  src/lib/*.ts · src/utils/*.ts (cálculo)                   │
│  Funções puras, em centavos inteiros. ZERO React,          │
│  ZERO Firebase, ZERO I/O. 100% testáveis isoladamente.     │
├─ Infraestrutura ──────────────────────────────────────────┤
│  shared/api/firebase · FirestoreService/repos · functions/ │
│  Persistência, Rules, callables, App Check.                │
└────────────────────────────────────────────────────────────┘
```

---

## 2. Regra de dependência

> As dependências apontam **para dentro**: UI → Aplicação → Domínio. A
> Infraestrutura é injetada/consumida pela Aplicação. O **Domínio não importa**
> React, Firebase nem hooks.

| Camada | Pode importar | Não pode importar |
|---|---|---|
| Domínio (`src/lib`, `src/utils` puros) | tipos (`shared/types`), Decimal.js | React, Firebase, hooks |
| Aplicação (`hooks`, `services`, `schemas`) | domínio, infra, tipos | componentes `.tsx` |
| UI (`components`, `features/*.tsx`) | aplicação, tipos | Firebase direto, cálculo monetário inline |
| Infra (`api/firebase`, repos, `functions/`) | tipos, schemas | UI |

---

## 3. Catálogo do domínio (motores puros existentes)

| Motor | Responsabilidade |
|---|---|
| `lib/purchaseSimulator.ts` | Decisão de compra (veredito + limite efetivo) |
| `lib/cardProjection.ts` | Fatura/limite efetivo por competência |
| `lib/debtStrategy.ts` | Estratégia de quitação (avalanche/snowball) |
| `lib/cashflowTimeline.ts` | Projeção de fluxo de caixa |
| `lib/insightsEngine.ts` | Insights agregados |
| `lib/recurrenceDetector.ts` | Detecção de recorrências/assinaturas |
| `lib/irEngine.ts` · `antiTarifaEngine.ts` · `sharedSplitEngine.ts` | IR · anti-tarifa · split |
| `lib/agentResponseRenderer.ts` | Render de resposta do agente (placeholders/pipes) |
| `utils/transactionUtils.ts` · `forecastEngine.ts` · `reportEngine.ts` | Helpers de cálculo |

**Princípio reforçado (FASE H-0):** valores financeiros finais nascem SEMPRE no
domínio. UI e LLM apenas exibem/narram. Ver [`AI_AGENT_GUARDRAILS.md`](./AI_AGENT_GUARDRAILS.md).

---

## 4. Invariantes inegociáveis (independentes de camada)

- `value_cents` é a fonte canônica; cálculo sempre em centavos inteiros (Decimal.js).
- Schemas Zod `.strict()` validam payloads na fronteira da Aplicação.
- Modelo A: todo UPDATE de transação exige `_lastOpId` + `history` no mesmo batch.
- Dados pessoais só sob `users/{uid}/...`; logs sanitizados.
- Zonas que exigem fase autorizada: `firestore.rules`, `functions/`, `package-lock.json`.

---

## 5. Dívida arquitetural conhecida (backlog J)

- `TransactionsManager.tsx` e `useTransactions.ts` ainda concentram muita lógica
  (parcialmente dividida nas FASES 2.1/2.2) — candidatos a extração adicional.
- Alguns cálculos de exibição ainda vivem perto da UI; meta é migrá-los a motores puros.
- Padronizar nomes de "engine" (ex.: `budgetEngine`/`goalEngine` hoje vivem em hooks).
