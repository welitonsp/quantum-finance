# AI Agent — Fluxo Seguro de Mutação Confirmada (FASE H)

> Documento **normativo e arquitetural**. Descreve o único caminho pelo qual o Agente
> Financeiro pode **gravar** dados, e o que protege esse caminho contra regressão.
> Toda mudança no agente (chat, router, proposta, confirmação, callable) deve preservar
> este contrato.
>
> Documentos irmãos: [`AI_AGENT_GUARDRAILS.md`](./AI_AGENT_GUARDRAILS.md) (contrato de
> segurança/§4 confirmação) · [`AI_TOOL_ROUTER.md`](./AI_TOOL_ROUTER.md) (intent router) ·
> [`AI_RESPONSE_CONTRACT.md`](./AI_RESPONSE_CONTRACT.md) ·
> [`AI_DECISION_JOURNAL.md`](./AI_DECISION_JOURNAL.md).
>
> Entregue/validado nas trilhas **#295 → #300** (App Check gated no emulador, fluxo de
> confirmação humana, e cobertura E2E).

---

## 1. Princípio central — o LLM nunca é fonte de verdade para mutação

- **O chat/LLM nunca grava.** Texto gerado pelo modelo (Gemini, via `chatWithQuantumAI`)
  serve para interpretar a intenção e **narrar** — nunca para materializar uma escrita.
- **Nenhuma despesa/transação pode ser gravada apenas por texto do modelo.** Uma
  classificação errada, no pior caso, gera uma **proposta recusável** — jamais uma escrita.
- **Toda mutação atravessa três camadas obrigatórias:**
  1. **Proposta estruturada** (`ActionProposal`, Zod `.strict()`) — nunca prosa livre;
  2. **Confirmação humana explícita** (clique/“confirmar”);
  3. **Callable validada server-trusted** (`executeAgentAction`), que revalida e grava.

Isto é a aplicação operacional da regra-mãe de [`AI_AGENT_GUARDRAILS.md`](./AI_AGENT_GUARDRAILS.md)
(“LLM narra; motores puros calculam”) ao caminho de **escrita**.

---

## 2. Fluxo end-to-end

```
Usuário (comando imperativo)
   │  "registre uma despesa de R$ 42 no mercado hoje"
   ▼
[1] Guarda determinística / intent router            (frontend, puro, sem I/O)
   │   interpretMutationCommand(...)  →  ActionProposal (status: 'pending')
   │   (ou geminiIntentClassifier → routeIntent, atrás de flag — mesma saída estruturada)
   ▼
[2] Frontend cria pending action / proposta
   │   ActionConfirmationSheet abre.  NADA é gravado ainda.
   │   O chat NÃO afirma "registrado".
   ├──────────────► [Cancelar]  → descarta a proposta. TERMINAL. Nenhuma escrita.
   ▼
[3] Usuário confirma (clique "Registrar compra" ou "confirmar")
   │   useAgentAction.runAction(proposal): sela status='confirmed', revalida Zod,
   │   gera idempotencyKey (UUID v4), chama a callable.
   ▼
[4] Backend — callable executeAgentAction          (functions, server-trusted)
   │   • App Check (enforce/consume) — gated: ON em prod, OFF só sob emulador
   │   • request.auth obrigatório
   │   • validateAgentActionRequest: REJEITA se status !== 'confirmed'
   │     (reason estável 'confirmation_required'); valida payload em centavos
   │   • grava ATOMICAMENTE: users/{uid}/transactions/{txId}
   │       + history (origin 'ai', Modelo A) + /decisions (outcomeStatus 'applied')
   │   • idempotente por idempotencyKey
   ▼
[5] UI reflete via onSnapshot
   │   useTransactions (listener realtime) atualiza Movimentações/Dashboard.
   ▼
[6] Só ENTÃO o chat confirma sucesso
       "Compra registrada pelo assistente." (após a callable retornar com sucesso)
```

Pontos invioláveis do fluxo:

- **Nada é gravado em [1]/[2].** A proposta é sempre `pending` no cliente.
- **Cancelar é terminal** (`dismissProposal`/`cancelPendingAction`) e **não dispara escrita**.
- **A confirmação é o único gatilho de escrita** e sela `status: 'confirmed'`.
- **O texto de sucesso só aparece após a callable retornar** (`confirmAgentAction` só chama
  `pushAiMessage(...sucesso)` no `then`; em erro, o sheet mostra o erro e o chat **não**
  afirma “registrada”).

---

## 3. O que o E2E (#300) protege

Spec: [`e2e/tests/06-agent-confirmed-mutation.spec.ts`](../e2e/tests/06-agent-confirmed-mutation.spec.ts).
Verificação de banco via `collectionGroup('transactions')` no Firestore Emulator
(`e2e/helpers/emulator.ts` → `countAgentTransactions`), independente de `uid`/`projectId`.

| Cenário | Garantia (falha o CI se quebrar) |
|---|---|
| **Proposta sem gravação imediata** | comando gera a sheet de confirmação e o banco continua com **0** transações; o texto de sucesso **não** existe antes de confirmar. |
| **Cancelar sem gravar** | após Cancelar, **0** transações no Firestore e nenhuma linha na lista de Movimentações; sem texto de sucesso. |
| **Confirmar grava exatamente uma** | após Confirmar, **exatamente 1** transação em `users/{uid}/transactions`. |
| **UI reflete a transação** | a descrição aparece na **lista** de Movimentações (escopo `<main>`, via `onSnapshot`). |
| **Receita recusada com segurança** | comando de receita devolve recusa segura, **sem proposta e sem escrita** (comportamento atual — ver §5). |

---

## 4. Flags, ambiente e testes

- **`VITE_ENABLE_AGENT_ROUTER`** — flag do roteador/guarda de mutação no chat.
  **Default OFF em produção** (flag OFF ⇒ chat idêntico, zero regressão). Ligada
  **apenas no webServer do E2E** (`playwright.config.ts`).
- **Sem LLM real nos testes:** o E2E exercita a **guarda determinística pura**
  `interpretMutationCommand` (passo 2 de `AIAssistantChat.submitMessage`). O classificador
  Gemini nunca é chamado; a classificação é determinística e offline.
- **Emuladores no E2E:** `firebase emulators:exec --only auth,firestore,functions`
  (a callable `executeAgentAction` exige o emulador de **functions**). Nunca produção.
- **App Check permanece seguro:** `ENFORCE_APP_CHECK = process.env.FUNCTIONS_EMULATOR !== 'true'`
  (`functions/src/index.ts`). Em **produção** o enforce/consume está **ON**; **só sob o
  emulador** fica OFF, permitindo as chamadas locais do E2E sem token real (#295). Isto
  **não** relaxa segurança em produção.

---

## 5. Regras para novas funcionalidades do agente

Qualquer nova ação financeira do agente **deve** seguir o mesmo contrato:

1. **Mesma cadeia de confirmação:** proposta estruturada (`ActionProposal` Zod `.strict()`)
   → confirmação humana → callable validada. Sem atalho “grava direto do chat”.
2. **Nunca afirmar “registrado/salvo/concluído” antes da callable retornar sucesso.** O
   texto de sucesso é consequência do `then` da callable, nunca da emissão da proposta.
3. **Cancelamento é terminal** e **não pode** disparar qualquer escrita.
4. **Receitas, transferências e cartões só podem ser liberados** quando tiverem, juntos:
   (a) **proposta estruturada**, (b) **validação no backend** em `executeAgentAction` /
   `agentActionValidation.ts`, e (c) **E2E equivalente** ao #300. Sem os três, permanecem
   **não suportados**.
5. **Ação não suportada ⇒ recusa segura.** Devolver mensagem clara (sem alucinação, sem
   escrita) — como a recusa atual de **receita** pelo agente (decisão de produto: o agente
   registra apenas **despesas à vista**; parcelado e receita roteiam ao formulário).

---

## 6. Mapa de arquivos relevantes

| Camada | Arquivo | Papel |
|---|---|---|
| Chat / orquestração | `src/features/ai-chat/AIAssistantChat.tsx` | `submitMessage` despacha guarda→proposta→sheet; `confirmAgentAction`/`cancelPendingAction`; sucesso só após callable |
| Guarda determinística | `src/features/ai-agent/mutationCommandGuard.ts` | `interpretMutationCommand` (comando→proposta `pending`); `parseConfirmationReply` (confirmar/cancelar por texto); recusa segura de receita |
| Intent router (flag) | `src/features/ai-agent/intentRouter.ts`, `geminiIntentClassifier.ts` | `routeIntent`; classificação Gemini → mesma saída estruturada (nunca grava) |
| Construção da proposta | `src/features/ai-agent/proposalBuilders.ts`, `proposalPresentation.ts` | slots→`ActionProposal` (Zod strict); resumo legível da sheet |
| Confirmação (UI) | `src/features/ai-agent/ActionConfirmationSheet.tsx` | confirmação humana; estados running/success/error; rota alternativa por `reason` |
| Ponte client→callable | `src/hooks/useAgentAction.ts` | sela `status:'confirmed'`, revalida Zod, `idempotencyKey` UUID v4, chama `executeAgentAction` |
| Schema | `src/shared/schemas/agentSchemas.ts` | `ActionProposal` Zod `.strict()`, enums de intent/kind |
| Callable (backend) | `functions/src/index.ts` → `executeAgentAction` | App Check gated, auth, escrita atômica tx+history+`/decisions`, idempotência |
| Validação (backend) | `functions/src/agentActionValidation.ts` | `validateAgentActionRequest`: exige `status==='confirmed'`, centavos, recusa `installments>1` (`reason: use_installment_form`) |
| Espelho realtime | `src/hooks/useTransactions.ts` | `onSnapshot` → Movimentações/Dashboard refletem a escrita |
| Cobertura E2E | `e2e/tests/06-agent-confirmed-mutation.spec.ts`, `e2e/helpers/emulator.ts` | protege o fluxo (§3) |
| Flag E2E | `playwright.config.ts` | `VITE_ENABLE_AGENT_ROUTER=true` só no webServer do E2E |
