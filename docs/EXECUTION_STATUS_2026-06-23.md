# Quantum Finance — Ponto de Retomada (2026-06-23 → continuar 2026-06-24)

> Snapshot de **continuidade**: onde paramos hoje e exatamente para onde ir amanhã.
> Supera o `EXECUTION_STATUS_2026-06-20.md`. Referências: `CLAUDE.md` (bloco de topo),
> `docs/AI_TOOL_ROUTER.md` §7, memória `roadmap_checklist`.

---

## 0. TL;DR — retomar por aqui

- **`main` HEAD: `4bdf513`** (PR #286). Working tree limpo. Sem PR de feature aberto (só Dependabot #271).
- **Trilha do Agente Financeiro (camada de ação + intent router): núcleo COMPLETO e em produção.**
- **Falta SÓ 1 coisa**, e ela **exige rodar o emulator localmente** (não dá para validar em CI nem fazer às cegas):
  **ligar o classificador Gemini no chat** + validar a qualidade do prompt.
- **Comece amanhã pela Seção 3** (passo a passo com comandos).

---

## 1. O que foi entregue hoje (7 PRs, todos mergeados e verdes)

| PR | Entrega | Risco |
|---|---|---|
| #281 | Sync de docs (trilha UI/UX + 3 kinds de ação) | doc |
| #282 | Agente registra **só à vista**; parcelado → erro estruturado `reason: 'use_installment_form'` | functions |
| #283 | **Fundação:** `useAgentAction` (hook callable) + `ActionConfirmationSheet` (confirmação humana) | UI, sem consumidor |
| #284 | **Ciclo simular→confirmar→agir** no `PurchaseSimulator` (à vista; parcelado → formulário) | UI |
| #285 | **Intent router — núcleo determinístico** (registry + builders + routing) | puro |
| #286 | **Adaptador Gemini** do classificador (money-safe, fail-safe) | client, sem wiring |

Validação ao fim do dia: typecheck ✅ · lint ✅ · **vitest 1311** ✅ · build ✅ · gate+E2E verdes em todos os PRs.

---

## 2. Estado da arquitetura do Agente (mapa mental)

```
chat (mensagem do usuário)
   → geminiIntentClassifier  ........ ENTREGUE (#286)  [LLM nas pontas]
       (reusa chatWithQuantumAI; LLM informa REAIS; toCentavos converte; fail-safe)
   → routeIntent ..................... ENTREGUE (#285)  [determinístico]
       → answer | proposal | need_more_info | low_confidence | unknown_intent
   → ActionConfirmationSheet ......... ENTREGUE (#283)  [confirmação humana]
   → useAgentAction → executeAgentAction  ENTREGUE (#283/#264)  [server-trusted]
       → tx + history(ai) + /decisions (idempotente, App Check)
```

- **Já funciona ponta a ponta** com slots vindos da UI — ex.: `PurchaseSimulator` (#284).
- **Os 4 kinds executam** server-trusted: `register_purchase` (à vista), `contribute_to_goal`,
  `register_debt_payment`, `create_budget`.
- **O elo que falta:** plugar `geminiIntentClassifier` → `routeIntent` dentro do `AIAssistantChat`.

Arquivos-chave (`src/features/ai-agent/`): `intentRegistry.ts`, `proposalBuilders.ts`,
`intentRouter.ts`, `geminiIntentClassifier.ts` (+ testes). Hook: `src/hooks/useAgentAction.ts`.
Sheet: `src/features/ai-agent/ActionConfirmationSheet.tsx`. Chat: `src/features/ai-chat/AIAssistantChat.tsx`.

---

## 3. Próximo passo (amanhã) — wiring + validação assistida

> **Por que não foi feito hoje:** depende de **observar o LLM funcionando** (qualidade do
> prompt) com o emulator. Shipar wiring de integração nunca executado é má prática. A
> cadeia de governança garante que, mesmo com prompt imperfeito, **nada é escrito sem
> confirmação humana** — então o risco do passo é de UX (proposta ruim), não financeiro.

### 3.1 Validar a classificação Gemini (precisa do emulator)
```bash
firebase emulators:start --only auth,firestore,functions   # requer Java/JDK
# em outro terminal:
npm run dev    # VITE_USE_EMULATOR=true
```
- Abrir o chat (Quantum AI) e mandar mensagens reais: "posso comprar um notebook de 4 mil?",
  "qual meu saldo?", "criar orçamento de 800 para lazer".
- Conferir, em dev, a saída de `geminiIntentClassifier` (intent + slots + confidence).
- Se a classificação/extração estiver fraca, ajustar `buildClassificationPrompt`
  em `src/features/ai-agent/geminiIntentClassifier.ts` (os testes não mudam — o contrato é estável).

### 3.2 Wiring no `AIAssistantChat` (atrás de flag OFF por padrão)
Em `submitMessage` (`src/features/ai-chat/AIAssistantChat.tsx`), antes do `getFinancialAdvice`:
1. `const c = await geminiIntentClassifier({ message: userText });`
2. `const r = routeIntent(c);`
3. Despachar:
   - `answer` / `low_confidence` / `unknown_intent` → seguir no chat normal (comportamento atual).
   - `need_more_info` → responder pedindo o slot que falta (`r.missing`).
   - `proposal` → abrir `ActionConfirmationSheet` (passar `r.proposal`, `r.question`) → no confirmar,
     `useAgentAction.runAction(r.proposal, { intent: r.intent, question: r.question, toolsUsed: r.tools })`.
- **Flag:** `VITE_ENABLE_AGENT_ROUTER` (ou toggle na GovernancePage), **default OFF**. Ligar só após 3.1.
- Montar o `ActionConfirmationSheet` no componente do chat e passar `creditCards`/contexto necessário.

### 3.3 Critérios de aceite do wiring
- [ ] Flag OFF → chat idêntico ao de hoje (zero regressão).
- [ ] Flag ON + intenção de ação com slots → abre o sheet; confirmar grava via `executeAgentAction`.
- [ ] Baixa confiança / fora do enum → chat normal (sem proposta).
- [ ] Parcelado → rota ao formulário (já tratado no sheet via `reason`).
- [ ] Log de intenção sanitizado (só o rótulo; nunca conteúdo financeiro).
- [ ] typecheck + lint + `npx vitest run` + build verdes antes do push.

---

## 4. Depois do Agente (backlog não-bloqueado, opcional)
- Estender o ciclo de confirmação a metas/dívidas/orçamentos diretamente nos módulos
  (`GoalsPanel`/`DebtModule`/`BudgetWidget`) — trivial com a fundação pronta; ganho = trilha
  de auditoria + server-trusted. (Hoje esses módulos escrevem direto no cliente.)

## 5. Bloqueios estruturais (não iniciar sem decisão do owner)
- **NFC-e** — gate SSRF. **Open Finance/BACEN** — mTLS/orçamento. **FCM background push** — `injectManifest`.

---

## 6. Processo (lembretes)
- Branch própria off `main`; **nunca** commitar direto na main.
- Antes do push: `npm run typecheck` + `npm run lint` + **`npx vitest run` (suíte completa)** + `npm run build`.
  - Em testes de componente que dependem de transição `AnimatePresence mode="wait"`, **mockar `framer-motion`** (passthrough) — não completa `exit` em jsdom.
- PR pequeno → gate (Typecheck/Lint/Test/Build) + E2E verdes → `gh pr merge --squash --delete-branch` → `git pull --ff-only`.
- Deploy automático na `main` (rules + hosting + functions) — toda mudança em `functions/` redeploya sozinha.
