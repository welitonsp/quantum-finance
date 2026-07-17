# AI Tool Router — Roteador de Ferramentas do Agente (FASE H-0)

> Define o fluxo determinístico que transforma uma pergunta em linguagem natural numa
> resposta financeira **auditável e segura**. Normativo para a FASE H.
>
> Pré-requisito: [`AI_AGENT_GUARDRAILS.md`](./AI_AGENT_GUARDRAILS.md).

---

## 1. Fluxo canônico

```
pergunta do usuário
   → classificação de INTENÇÃO (LLM, restrito a um enum fechado)
   → seleção da FERRAMENTA (tool registry, lookup determinístico)
   → execução do MOTOR puro / hook / serviço (cálculo em centavos)
   → RENDERIZADOR (placeholders → valores formatados)
   → RESPOSTA narrada (LLM, sem números literais)
   → registro em /decisions (auditoria)
```

Regra: o LLM atua nas **pontas** (classificar intenção, narrar). O **miolo**
(ferramenta → motor → render) é código determinístico e testável.

---

## 2. Intenções permitidas (v1 — enum fechado)

| Intenção | Tipo | Motor/fonte | Status |
|---|---|---|---|
| `get_balances` | Consulta | `useFinancialKPIs` / `useFinancialData` | read-only |
| `get_invoice` | Consulta | `cardProjection.ts` / `useCreditCards` | read-only |
| `explain_month` | Consulta | `insightsEngine.ts` | read-only |
| `cashflow_briefing` | Consulta | `cashflowTimeline.ts` + `recurrenceDetector.ts` | read-only |
| `simulate_purchase` | Simulação | `purchaseSimulator.ts` | read-only |
| `plan_debt_payment` | Simulação | `debtStrategy.ts` (FASE E) + `useDebts` | read-only |
| `create_budget_proposal` | Ação (proposta) | `useBudgets` | requer confirmação |
| `contribute_to_goal_proposal` | Ação (proposta) | `useGoals` | requer confirmação |
| `register_income_proposal` | Ação (proposta) | guarda determinística / `executeAgentAction` | requer confirmação |

- Pergunta fora do enum → **fallback**: o agente responde que não cobre o tema e não
  inventa cálculo (ver §5).
- A classificação de intenção é logada de forma **sanitizada** (só o rótulo da intenção,
  nunca o conteúdo financeiro bruto).

---

## 3. Tool Registry

- Registry central tipado mapeando `intent → tool`. Cada tool declara:
  - `kind: 'query' | 'simulation' | 'action'`
  - `inputSchema` (Zod `.strict()`)
  - `outputSchema` (Zod `.strict()`)
  - `engine` (referência ao motor puro/hook)
- **v1: apenas tools `query` e `simulation` são executáveis diretamente.**
- Tools `action` **não executam** — produzem uma `ActionProposal` (ver §4).
- Toda tool é **pura quanto a leitura**: não escreve no Firestore na fase de resposta.

---

## 4. Simulação × Ação

- **Simulação** roda o motor e devolve resultado hipotético — zero escrita.
- **Ação** nunca executa direto. O fluxo é:
  1. tool `action` monta uma `ActionProposal` (Zod `.strict()`, status `pending`);
  2. UI apresenta a proposta com os valores já renderizados;
  3. usuário confirma → a escrita ocorre via caminho server-trusted (Modelo A + App Check);
  4. resultado e decisão são gravados em `/decisions`.
- Sem confirmação, a proposta expira (`expired`) sem efeito colateral.

---

## 5. Fallback e dados insuficientes

- **Fallback local** para perguntas simples/fora de escopo: resposta curta, honesta,
  sem cálculo financeiro inventado.
- **Dados insuficientes**: o roteador identifica o dado faltante (ex.: cartão não
  selecionado, sem renda cadastrada) e o agente declara a limitação + sugere a consulta
  ou ação que supre o dado.

---

## 6. Critérios de aceite do roteador

- [ ] Intenção sempre resolvida a partir de um **enum fechado** (sem rota livre).
- [ ] Toda execução numérica passa por um motor registrado no tool registry.
- [ ] Tools `action` jamais escrevem na fase de resposta — só geram `ActionProposal`.
- [ ] Inputs/outputs validados por Zod `.strict()`.
- [ ] Log de intenção sanitizado; nenhum conteúdo financeiro bruto.
- [ ] Pergunta fora do enum cai em fallback seguro.

---

## 7. Implementação — estado real (2026-06-27)

### 7.1 Núcleo determinístico ENTREGUE (`src/features/ai-agent/`)
O "miolo" do §1 (tool registry → builder de proposta → orquestração) está implementado,
puro e testável, **sem dependência do LLM**:

| Módulo | Responsabilidade |
|---|---|
| `intentRegistry.ts` | `INTENT_REGISTRY`: catálogo das intenções (enum fechado) → ferramentas read-only (`AGENT_TOOLS`) + `kind` de ação quando aplicável + `requiredSlots`. `isActionIntent()`. |
| `proposalBuilders.ts` | Construtores puros slots → `ActionProposal` (status `pending`), validados por `safeParseActionProposal` (Zod `.strict()`). Reporta `issues` quando faltam slots. Defaults: `date`=hoje, `competencia`=mês atual. |
| `intentRouter.ts` | `routeIntent(classification)` puro → `answer` \| `proposal` (+pergunta de confirmação) \| `need_more_info` \| `low_confidence` (< `0.6`) \| `unknown_intent`. `buildActionQuestion()` por kind. |
| `agentSchemas.ts` | `AGENT_INTENTS`/`AgentIntent` (espelha o enum server). |

Cobertura: `proposalBuilders.test.ts` + `intentRouter.test.ts` (16 testes).

Critérios de aceite atendidos pelo núcleo: enum fechado ✅ · `action` nunca escreve (só
`ActionProposal`) ✅ · Zod `.strict()` ✅ · fora do enum → `unknown_intent` ✅ · baixa
confiança → `low_confidence` ✅.

### 7.2 Adaptador de classificação — IMPLEMENTADO (`geminiIntentClassifier.ts`)
A classificação `mensagem → {intent, slots, confidence}` é um `IntentClassifier`
(interface em `intentRouter.ts`). Implementações:
- `heuristicIntentClassifier` — determinístico (palavras-chave), fallback/teste; não extrai slots.
- **`geminiIntentClassifier`** — produção: reusa o callable **`chatWithQuantumAI`** como transporte
  (chave no servidor, App Check, PII mascarada). `createGeminiIntentClassifier(transport)` é
  injetável/testável. Garantias:
  - **O LLM nunca calcula centavos.** Informa o valor em **reais** (`amount`/`limit`); a conversão
    para centavos inteiros é feita aqui por `toCentavos` (Decimal.js). Centavos canônicos.
  - Saída estritamente validada (intenção ∈ enum, confiança 0..1, slots coeridos); qualquer falha
    (sem JSON / intenção inválida / transporte caído) → confiança 0 → `low_confidence` → chat normal.
  - 11 testes (`geminiIntentClassifier.test.ts`), incluindo conversão monetária e integração com `routeIntent`.

**Estado do wiring no chat:** entregue no PR #288. `AIAssistantChat.submitMessage` liga
`geminiIntentClassifier -> routeIntent -> ActionConfirmationSheet -> useAgentAction`
atrás da flag `VITE_ENABLE_AGENT_ROUTER` (default OFF). A guarda determinística
`interpretMutationCommand` intercepta comandos imperativos de despesa e receita e gera
proposta `pending` sem LLM real.

**Passo restante de operação (exige owner + emulator):** validar a qualidade da
classificação Gemini em mensagens reais antes de considerar ligar `VITE_ENABLE_AGENT_ROUTER`
fora do E2E. Ajustar `buildClassificationPrompt` se necessário.

Segurança do gate: mesmo com prompt imperfeito, uma classificação errada **não escreve nada**
sem confirmação humana. A cadeia (limiar de confiança -> proposta `pending` -> confirmação
humana -> revalidação server + App Check) protege; o pior caso é uma proposta recusável no sheet.
