# AI Agent Guardrails — Governança do Agente Financeiro (FASE H-0)

> Contrato de segurança e comportamento do **Agente Financeiro Pessoal** do Quantum
> Finance. Este documento é **normativo**: todo PR que toque o agente (FASE H) deve
> declarar conformidade com estas regras. Complementa
> `docs/product/POLITICA_COPILOT_IA_QUANTUM_2026-06-12.md` e o `CLAUDE.md`.
>
> Documentos irmãos: [`AI_TOOL_ROUTER.md`](./AI_TOOL_ROUTER.md) ·
> [`AI_RESPONSE_CONTRACT.md`](./AI_RESPONSE_CONTRACT.md) ·
> [`AI_DECISION_JOURNAL.md`](./AI_DECISION_JOURNAL.md).

---

## 1. Regra-mãe: `LLM narra; motores puros calculam`

> **Nenhum valor financeiro final pode ser produzido por um LLM.**

- O LLM (Gemini, via callable `chatWithQuantumAI`) é responsável **apenas** por:
  interpretar a pergunta, escolher a intenção, e **narrar** o resultado já calculado.
- Todo número financeiro final **deve** vir de um motor puro, hook ou serviço validado:
  - `src/lib/purchaseSimulator.ts` — decisão de compra
  - `src/lib/cardProjection.ts` — fatura/limite efetivo
  - `src/lib/cashflowTimeline.ts` — projeção de fluxo
  - `src/lib/insightsEngine.ts` — insights agregados
  - `src/lib/irEngine.ts`, `antiTarifaEngine.ts`, `sharedSplitEngine.ts`
  - `src/hooks/useDebts.ts` (`calcMonthlyPaymentCents`) e o futuro `debtStrategy.ts`
  - `useCreditCards`, `useFinancialKPIs`, `useFinancialMetrics`, `useForecast`
- É **proibido** o LLM calcular diretamente: saldo, limite, juros, parcelas, fatura,
  orçamento, patrimônio líquido, comprometimento de renda ou economia de juros.

### Como isto é imposto
- O agente nunca emite números literais finais; emite **placeholders** resolvidos por
  um renderizador (ver [`AI_RESPONSE_CONTRACT.md`](./AI_RESPONSE_CONTRACT.md)).
- O renderizador **rejeita** qualquer número monetário/percentual literal vindo do LLM
  que não esteja amarrado a um placeholder de motor.

---

## 2. Consulta × Simulação × Ação

| Tipo | Efeito | Confirmação humana | Exemplos de intenção |
|---|---|---|---|
| **Consulta** | Read-only | Não | `get_balances`, `get_invoice`, `explain_month`, `cashflow_briefing` |
| **Simulação** | Read-only, hipotética | Não | `simulate_purchase`, `plan_debt_payment` |
| **Ação** | **Escreve** no Firestore | **Sim, sempre** | `register_purchase`, `register_debt_payment`, `create_budget`, `contribute_to_goal` |

- Ferramentas da **primeira versão são read-only** (consulta e simulação).
- **Nenhuma ação financeira** é executada sem confirmação humana explícita via
  `ActionProposal` (ver §4 e [`AI_TOOL_ROUTER.md`](./AI_TOOL_ROUTER.md)).

---

## 3. Comportamento sob dados insuficientes

- Se faltar dado para responder com precisão, o agente **deve declarar a limitação** e
  **não estimar** valor financeiro final.
- Resposta padrão: indicar o que falta (ex.: "não há renda mensal cadastrada") e propor
  a consulta/ação que supriria o dado — **sem inventar números**.
- É proibido "preencher lacunas" com médias arbitrárias sem rotulá-las como estimativa
  explícita e não-financeira-final.

---

## 4. Confirmação humana e `ActionProposal`

- Toda ação é representada por uma **`ActionProposal`** — proposta **pendente** validada
  por Zod `.strict()` antes de qualquer escrita.
- A execução só ocorre **após confirmação explícita** do usuário (clique/confirmação),
  nunca pela simples conversa.
- Propostas têm ciclo de vida: `pending` → `confirmed` | `rejected` | `expired`.
- Ações permitidas na v1: `register_purchase`, `register_debt_payment`, `create_budget`,
  `contribute_to_goal`.
- A escrita resultante de uma ação confirmada segue o **Modelo A** (UPDATE com
  `_lastOpId` + `history` no mesmo `writeBatch`) e, no caminho Blaze, a callable
  server-trusted `createTransaction` com App Check.

---

## 5. Arquivos e dados sensíveis (classificação P0)

Classificados como **P0 sensível**: extratos, faturas, comprovantes, PDFs, CSVs, OFX,
QR Code Pix e qualquer conteúdo bruto financeiro.

- **Proibido logar conteúdo bruto** desses artefatos (alinhado a FASE 9F/9G e
  `consoleLoggingPolicy.test.ts`).
- **Proibido expor/loga**r: CPF, número de conta, número de cartão, e-mail, token,
  chave de API ou qualquer identificador sensível. Usar `maskPII`/`buildSafePromptRows`
  (`src/shared/lib/piiMasker.ts`) antes de qualquer envio ao LLM.
- **Processamento local** sempre que possível; persistir **apenas** dados normalizados e
  estritamente necessários.
- Dados financeiros persistidos vivem **exclusivamente** em `users/{uid}/...`.
- Chave Gemini **somente no backend** (Firebase Secret Manager) — nunca no client.

---

## 6. Checklist de conformidade (todo PR da FASE H)

- [ ] Nenhum número financeiro final é gerado pelo LLM (apenas placeholders).
- [ ] Toda saída numérica vem de motor/serviço/hook validado em centavos inteiros.
- [ ] Ferramentas novas declaram se são read-only ou ação.
- [ ] Ações exigem `ActionProposal` + confirmação humana + Zod `.strict()`.
- [ ] PII mascarada antes do envio ao LLM; nenhum conteúdo bruto logado.
- [ ] Escritas seguem Modelo A + App Check.
- [ ] Decisão registrada em `/decisions` (ver [`AI_DECISION_JOURNAL.md`](./AI_DECISION_JOURNAL.md)).
- [ ] Logs sanitizados (sem PII, sem valores, sem prompts/respostas brutas).
