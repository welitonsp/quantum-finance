# Quantum Finance — Ponto de Retomada (histórico: 2026-06-23)

> ⚠️ **SUPERADO.** Mantido como histórico da trilha do agente em 2026-06-23.
> O estado canônico atual está no bloco de topo do `CLAUDE.md` e em
> `docs/PROJECT_KNOWLEDGE_SYNC_2026-06-27.md`. Desde então, #288-#302 foram mergeados,
> incluindo wiring no chat, fluxo confirmado, E2E e receita confirmada.

---

## 0. TL;DR — retomar por aqui

- **`main` HEAD: `ea77b2b`** (PR #288). Working tree limpo. Sem PR de feature aberto (só Dependabot #271).
- **Trilha do Agente Financeiro (camada de ação + intent router + wiring no chat): COMPLETA em código.**
- **Wiring entregue (PR #288, 2026-06-24):** `AIAssistantChat` liga `geminiIntentClassifier → routeIntent →
  ActionConfirmationSheet → useAgentAction` atrás da flag `VITE_ENABLE_AGENT_ROUTER` (**default OFF**). Ver §3.2 (✅).
- **Falta SÓ 1 coisa — passo do OWNER**, que **exige rodar o emulator localmente** (não dá para validar em CI
  nem fazer às cegas): **validar a qualidade da classificação Gemini** (§3.1) e então **ligar a flag**.
- **Comece pela Seção 3.1.**

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

### 3.2 Wiring no `AIAssistantChat` (atrás de flag OFF) — ✅ ENTREGUE (PR #288, 2026-06-24)
Em `submitMessage` (`src/features/ai-chat/AIAssistantChat.tsx`), após persistir o turno do usuário e
**antes** do `getFinancialAdvice`, sob `if (import.meta.env.VITE_ENABLE_AGENT_ROUTER === 'true')`:
1. `const route = routeIntent(await geminiIntentClassifier({ message: userText }));`
2. Despacha:
   - `answer` / `low_confidence` / `unknown_intent` → segue no chat normal (comportamento atual).
   - `need_more_info` → `pushAiMessage(formatMissingInfoMessage(route.missing))` (só o rótulo do slot).
   - `proposal` → abre `ActionConfirmationSheet` com `route.proposal`/`route.question`; no confirmar,
     `useAgentAction.runAction(route.proposal, { intent, question, toolsUsed: tools })`.
   - Falha de classificação → `catch` → degrada para o chat normal.
- **Flag `VITE_ENABLE_AGENT_ROUTER`** (documentada no `.env.example`), **default OFF**. Flag off = chat idêntico.
- Helper PURO `src/features/ai-agent/proposalPresentation.ts` (`presentProposal` → título/rows/labels da sheet;
  `formatMissingInfoMessage` → pergunta pt-BR pelos slots faltantes).
- Rota `use_installment_form` no sheet → mensagem orientando ao formulário de transações.

### 3.3 Critérios de aceite do wiring — ✅ todos cobertos por teste (PR #288)
- [x] Flag OFF → chat idêntico ao de hoje (zero regressão). *(teste: não classifica, chama advice)*
- [x] Flag ON + intenção de ação com slots → abre o sheet; confirmar grava via `executeAgentAction`. *(teste: proposal + confirm→runAction)*
- [x] Baixa confiança / fora do enum → chat normal (sem proposta). *(teste: low confidence → advice)*
- [x] Parcelado → rota ao formulário (já tratado no sheet via `reason`).
- [x] Log de intenção sanitizado (só o rótulo; nunca conteúdo financeiro) — nenhum log cru adicionado.
- [x] typecheck + lint + `vitest run` (**1324**) + build + E2E verdes.

> **Pendente (passo do owner):** ligar a flag em produção (`VITE_ENABLE_AGENT_ROUTER=true`) só **após** validar a
> classificação Gemini com o emulator (§3.1). O wiring está testado e seguro com a flag OFF.

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
