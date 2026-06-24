# Pedido de Auditoria — IA do Chat falha no ambiente local (emulator) + achados correlatos

> Data: 2026-06-24 · Branch base: `main` · Contexto: validação local do Intent Router do Agente
> Financeiro antes de habilitar a flag `VITE_ENABLE_AGENT_ROUTER` em produção.

## 1. Objetivo da sessão
Validar, com o Firebase Emulator, a classificação de intenções do Agente (Gemini) antes de
ligar a flag `VITE_ENABLE_AGENT_ROUTER` (hoje **OFF** por padrão). Para isso, o chat
(`chatWithQuantumAI`) precisa responder no ambiente local. **Não conseguimos completar essa
validação** porque o chat falha localmente (ver §3).

## 2. Correções já aplicadas e CONFIRMADAS nesta sessão
1. **Modelo Gemini descontinuado (corrigido).** `functions/src/index.ts` chamava
   `gemini-1.5-flash`, que foi **retirado** da Generative Language API (ausente no `ListModels`;
   `generateContent` → 404). Isso derrubava **todas** as callables de IA (chat, categorização,
   briefing, auditoria) em produção e no emulator. **Fix:** constante `GEMINI_MODEL = 'gemini-2.5-flash'`
   (PR #292, mergeado; job "Deploy Cloud Functions" do workflow **sucedeu** → produção atualizada).
   - Verificação direta da chave do owner: `ListModels` → HTTP 200; `generateContent` em
     `gemini-2.5-flash` e `gemini-flash-latest` → **HTTP 200**; `gemini-2.0-flash` → 429 (quota).
2. **Chave do Gemini válida.** A `GEMINI_API_KEY` do owner foi testada direto contra a API e
   funciona (200). No emulator ela é fornecida via `functions/.secret.local` (agora protegido no
   `.gitignore`, PR #291).
3. **App local não apontava para o emulator.** O `.env` da raiz **não tinha** `VITE_USE_EMULATOR=true`,
   então `npm run dev` batia em **produção** — onde o **App Check** (`enforceAppCheck: true`)
   rejeita chamadas do `localhost` sem token. Adicionado `VITE_USE_EMULATOR=true` ao `.env` local.

## 3. PROBLEMA PRINCIPAL EM ABERTO — `chatWithQuantumAI` retorna HTTP 401 no emulator
Mesmo após (a) corrigir o modelo, (b) confirmar a chave e (c) apontar o app para o emulator, o
chat continua exibindo a mensagem genérica *"Não foi possível concluir a operação…"*.

### 3.1 Evidências coletadas
- **Navegador (DevTools):**
  `127.0.0.1:5001/.../chatWithQuantumAI:1 Failed to load resource: the server responded with a status of 401 (Unauthorized)`.
  O `GeminiService.getFinancialAdvice` captura o erro e devolve a mensagem amigável de código
  "unknown" — daí a mensagem genérica no chat.
- **Terminal do emulator (functions):** para as chamadas que executam, o log mostra
  `{"verifications":{"app":"MISSING","auth":"VALID"}, ... "message":"Callable request verification passed"}`
  e a execução **termina em ~5–38ms, SEM `[FunctionError]`**. Ou seja, quando o handler roda, ele
  **NÃO chega a chamar o Gemini** (uma chamada real levaria centenas de ms) — sai por um `throw`
  antecipado, **ou** há um segundo conjunto de chamadas rejeitadas antes do handler (o 401).
- **Network:** ao filtrar `chatWithQuantumAI` e reenviar, **nenhuma requisição nova aparece** em
  certos momentos — compatível com o **rate limit client-side** do chat (ver §4.2) bloqueando o
  envio antes de qualquer rede.

### 3.2 Contradição central a investigar
Há um conflito entre: (i) o log do emulator dizendo *"verification passed" / `auth: VALID`* para
as chamadas que executam, e (ii) o navegador recebendo **401 Unauthorized**. Hipóteses:
- **H1 — App Check / `consumeAppCheckToken`.** `chatWithQuantumAI` usa `enforceAppCheck: true` +
  `consumeAppCheckToken: true`. O cliente, em modo emulator (`src/shared/api/firebase/index.ts`,
  linha ~35), **não inicializa App Check** (não envia token). Se o emulator de functions estiver
  enforçando App Check (ou exigindo consumir um token inexistente), retorna 401. *Dúvida:* então
  por que o log diz "verification passed" com `app: MISSING`?
- **H2 — Token de autenticação não anexado.** A 1ª checagem do handler é
  `if (!request.auth) throw new HttpsError('unauthenticated', …)` → 401. Em modo emulator o
  `App.tsx` faz `signInAnonymously` (linha ~508). O 401 pode vir de chamadas disparadas **antes**
  do sign-in anônimo concluir (ex.: briefing no load), enquanto as chamadas pós-login passam.
- **H3 — Dois conjuntos de chamadas.** As que aparecem com "verification passed" (handler roda,
  finish rápido) vs. as 401 (rejeitadas antes do handler) podem ser eventos distintos; falta
  capturar **o corpo da Response (JSON) da requisição 401 específica** para fechar o diagnóstico.

### 3.3 O que falta para diagnóstico definitivo
- Capturar o **corpo JSON** da resposta 401 (`{"error":{"status":"…","message":"…"}}`) da
  requisição `chatWithQuantumAI` específica — distingue `UNAUTHENTICATED` (auth) de erro de
  App Check.
- Confirmar se o **functions emulator enforça App Check** nesta versão de `firebase-tools`
  (15.22.1) quando `enforceAppCheck/consumeAppCheckToken` estão `true`.
- Se for App Check no emulator, avaliar gate por ambiente:
  `enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== 'true'` (sem enfraquecer produção) **ou**
  inicializar App Check com debug token mesmo em modo emulator.

## 4. Achados secundários (abertos)
### 4.1 Deploy de Firestore Rules falhando no CI
O workflow "Deploy to Firebase Hosting on merge" aparece como **failure** porque o job
**"Deploy Firestore Rules"** falha com:
`Error: Failed to authenticate, have you run firebase login?`
- Os jobs **"Deploy Cloud Functions"** e **"Deploy to Firebase Hosting"** SUCEDEM.
- As rules não mudaram nos PRs recentes, então produção mantém as rules da última publicação boa,
  mas **qualquer mudança futura de rules não será publicada** até corrigir a autenticação desse job
  (provável regressão de credencial/secret do service account específico do job de rules).

### 4.2 Rate limits podem mascarar o teste
- **Client-side:** `AIAssistantChat.tsx` bloqueia após **20 mensagens/hora** (localStorage
  `qf_rate_${uid}`); quando atingido, `submitMessage` retorna sem chamar a função (nada na Network).
- **Server-side:** `checkAndIncrementRateLimit` aplica **`DAILY_AI_LIMIT = 50`/dia por uid**
  (`resource-exhausted`, que o cliente mapeia para a mesma mensagem genérica). O contador do
  emulator zera ao reiniciar; o de produção não.
- Durante a depuração foram feitos muitos envios — os limites podem ter contaminado observações.

## 5. Como reproduzir (ambiente local)
```bash
# .env (raiz) precisa de: VITE_USE_EMULATOR=true
# functions/.secret.local precisa de: GEMINI_API_KEY=<chave AIza... válida>
firebase emulators:start --only auth,firestore,functions   # firebase-tools 15.22.1
npm run dev                                                 # abre localhost:5173
# Login (modo emulator faz signInAnonymously) → abrir chat → "qual meu saldo?"
# Resultado atual: chat exibe erro genérico; Network mostra chatWithQuantumAI → 401.
```

## 6. Perguntas objetivas para a auditoria
1. **Qual a causa real do 401** em `chatWithQuantumAI` no emulator: App Check
   (`enforceAppCheck`/`consumeAppCheckToken`) ou autenticação (`request.auth` ausente)? Pedir o
   **corpo JSON da Response 401**.
2. O **functions emulator** desta versão enforça App Check? Qual o padrão recomendado para testes
   locais sem enfraquecer produção (gate por `FUNCTIONS_EMULATOR` vs. debug token de App Check)?
3. **Mapa de erros do cliente:** `getUserFriendlyErrorMessage` colapsa `unauthenticated`,
   `resource-exhausted` e `internal` na **mesma** mensagem genérica, dificultando o diagnóstico.
   Vale diferenciar essas mensagens (sem vazar detalhe sensível)?
4. **CI:** por que o job "Deploy Firestore Rules" perdeu autenticação (`firebase login`)? Há
   regressão de credencial/secret só nesse job?
5. O fluxo de **App Check em DEV/localhost** (sem emulator) é suportado? Hoje, fora do emulator, o
   `localhost` é barrado por App Check — isso é intencional?

## 7. Áreas/arquivos relevantes
- `functions/src/index.ts` — callables IA; `callGemini` (modelo), `chatWithQuantumAI`
  (`enforceAppCheck`/`consumeAppCheckToken`, `checkAndIncrementRateLimit`, `MAX_PROMPT_LEN=4000`).
- `src/shared/api/firebase/index.ts` — init Firebase + App Check + conexão ao emulator.
- `src/features/ai-chat/GeminiService.ts` — transporte; mapeia erro → mensagem amigável.
- `src/features/ai-chat/AIAssistantChat.tsx` — chat + wiring do router (flag OFF) + rate limit client.
- `src/shared/lib/firebaseErrorHandling.ts` — `getUserFriendlyErrorMessage` (mapa de códigos).
- `.github/workflows/*` — job "Deploy Firestore Rules" (falha de autenticação).
- `.env` (raiz, local) e `functions/.secret.local` (local; não versionado).

## 8. Estado do código do Agente (para contexto)
A cadeia do Agente está **completa e testada** (classificar → rotear → confirmação humana →
`executeAgentAction` server-trusted), atrás da flag `VITE_ENABLE_AGENT_ROUTER` (**OFF**). O
problema desta auditoria é **operacional/ambiente** (IA do chat não responde localmente), não a
lógica do Agente. Com a flag OFF, não há risco em produção; nenhuma escrita ocorre sem confirmação
humana.
