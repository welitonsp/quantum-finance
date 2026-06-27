# Quantum Finance Cloud

> Aplicação de gestão financeira pessoal com precisão contábil, auditoria completa e IA assistiva.

## Visão Geral

Quantum Finance é uma aplicação web voltada para pessoas físicas que precisam de controle financeiro rigoroso.
Permite importar extratos bancários de múltiplos formatos e bancos, categorizar transações automaticamente com IA,
conciliar lançamentos contra extratos com explicabilidade visual e acompanhar orçamentos, projeções e indicadores
de saúde financeira em tempo real. O modelo de dados usa centavos inteiros como fonte canônica, eliminando erros
de arredondamento e garantindo precisão bancária em todos os cálculos.

## Stack

React 19 · TypeScript · Vite · Tailwind CSS · Firebase/Firestore · Cloud Functions · Framer Motion · Chart.js · pdfjs-dist · Gemini AI

## Features Principais

- Importação de extratos: CSV, OFX, PDF (com suporte a senha)
- Templates de mapeamento para 10+ bancos brasileiros (Nubank, Inter, Itaú, Bradesco, BB, Caixa, Santander, C6, Mercado Pago, PicPay)
- Deduplicação tricamada: fingerprint local, SHA-256 (importHash) e busca cross-page no Firestore
- Conciliação interativa com explicabilidade (confiança, razões do match) e status persistente
- Filtros avançados: data, valor, origem, tipo, categoria, status de conciliação
- Auditoria por transação com snapshot before/after e timeline global
- Auto-categorização via Gemini AI com regras persistidas
- Orçamentos por categoria com acompanhamento mensal
- Previsão financeira Monte Carlo
- Acessibilidade WCAG 2.1 AA (focus trap, aria-live, retorno de foco, navegação por teclado)
- Segurança: isolamento por usuário (`users/{uid}/...`), Firestore Rules com schema versionado, Cloud Functions server-trusted

## Como Rodar

```bash
git clone https://github.com/welitonsp/quantum-finance.git
cd quantum-finance
npm install
npm run dev
```

Crie um arquivo `.env.local` na raiz com as variáveis do Firebase:

```env
VITE_FIREBASE_API_KEY="sua_api_key"
VITE_FIREBASE_AUTH_DOMAIN="seu_projeto.firebaseapp.com"
VITE_FIREBASE_PROJECT_ID="seu_projeto"
VITE_FIREBASE_STORAGE_BUCKET="seu_projeto.appspot.com"
VITE_FIREBASE_MESSAGING_SENDER_ID="123456789"
VITE_FIREBASE_APP_ID="1:123456789:web:abcdef"
```

Chaves de IA (Gemini) devem ser configuradas exclusivamente no backend via Firebase Secret Manager:

```bash
firebase functions:secrets:set GEMINI_API_KEY
firebase deploy --only functions
```

## Comandos

```bash
npm run dev          # servidor de desenvolvimento
npm run build        # build de produção
npm run typecheck    # verificação de tipos
npm run lint         # linting
npm run test         # testes unitários (watch)
npm run test -- --run  # testes unitários (one-shot)
npm run test:rules   # testes de Firestore Rules (requer Java/JDK e emulator)
```

> `npm run test:rules` requer Java instalado. Em caso de erro `Could not spawn java -version`:
> ```bash
> winget install EclipseAdoptium.Temurin.21.JDK
> ```

## Arquitetura

O projeto segue Feature-Sliced Design (FSD):

```
src/
  components/     # Componentes UI globais e de layout (Dashboard, Header, Sidebar)
  contexts/       # Contextos globais (Theme, Privacy, Navigation)
  features/       # Módulos de negócio isolados
    ai-chat/      # Chat com IA assistiva
    reports/      # Relatórios e análises
    transactions/ # Movimentações, importação, conciliação
  hooks/          # Hooks de acesso ao Firestore (useTransactions, useAccounts, ...)
  shared/         # Schemas Zod, serviços Firebase, parsers de arquivo, tipos centrais
  utils/          # Formatadores e motores matemáticos independentes de UI
```

Toda persistência financeira passa por `LedgerService` ou `FirestoreService`.
Auditoria é registrada em `users/{uid}/transactions/{txId}/history` e `users/{uid}/audit_logs`.
Firestore Rules implementam validação de schema na camada de segurança (schema version 2).

### Política de `importHash`

`importHash` é uma chave técnica de deduplicação e evidência das movimentações importadas. Ele permanece apenas na transaction importada e no id determinístico dessa transaction; não deve ser exibido na UI, logado em console, copiado para `history` nem duplicado em `audit_logs`. Logs de importação usam `txId` para rastreabilidade.

## Observabilidade, privacidade e política de logs

Quantum Finance adota política restritiva de logging para reduzir risco de vazamento de dados financeiros, identificadores, metadados de auditoria e segredos.

- Console cru é proibido em produção para `console.error`, `console.log`, `console.debug` e `console.trace`.
- `console.warn` e `console.info` só são permitidos quando protegidos por `import.meta.env.DEV` ou como exceções arquiteturais explícitas e documentadas.
- Erros técnicos de Firebase/Firestore e fluxos sensíveis devem usar `logSanitizedFirebaseError`; o objeto bruto do erro não deve ser logado.
- Nunca logar: `uid`, paths `users/{uid}`, `importHash`, payload financeiro, snapshots `before`/`after`, prompts ou respostas de IA, tokens ou secrets.
- A política preventiva é protegida por `src/__tests__/consoleLoggingPolicy.test.ts`; novas exceções exigem justificativa explícita.
- `useTransactions.ts` mantém exceção granular apenas para o log técnico conhecido: `[SyncQueue] operação descartada após tentativas`.
- Mudanças em auditoria, Firestore Rules ou transações devem preservar o Modelo A: todo UPDATE de transaction exige `_lastOpId`, `history` deve ser pareado no mesmo batch e nenhuma política de logs pode enfraquecer a integridade financeira ou a trilha de auditoria.

## Governança do Agente Financeiro

O Agente Financeiro Pessoal (FASE H) opera sob um contrato de governança normativo
(FASE H-0). Todo PR que toque o agente deve declarar conformidade com estes documentos:

- [`docs/AI_AGENT_GUARDRAILS.md`](./docs/AI_AGENT_GUARDRAILS.md) — regra-mãe
  **"LLM narra; motores puros calculam"**, classificação consulta/simulação/ação,
  confirmação humana e dados sensíveis P0.
- [`docs/AI_TOOL_ROUTER.md`](./docs/AI_TOOL_ROUTER.md) — fluxo
  intenção → ferramenta → motor → renderizador → resposta; intenções permitidas;
  tool registry read-only.
- [`docs/AI_RESPONSE_CONTRACT.md`](./docs/AI_RESPONSE_CONTRACT.md) — estrutura de resposta
  e placeholders/pipes (`|brl`, `|pct`, `|date`, `|mes`); proíbe número final literal do LLM.
- [`docs/AI_DECISION_JOURNAL.md`](./docs/AI_DECISION_JOURNAL.md) — coleção
  `users/{uid}/decisions` para auditoria de decisões mediadas por IA.

Princípios inegociáveis:

- Nenhum valor financeiro final é calculado pelo LLM — sempre vem de motor puro/hook/serviço.
- Ferramentas da v1 são read-only (consulta e simulação); nenhuma ação executa sem
  `ActionProposal` validada por Zod `.strict()` + confirmação humana explícita.
- PII mascarada (`maskPII`) antes de qualquer envio ao LLM; chave Gemini só no backend.

## Firebase App Check

Quantum Finance usa Firebase App Check com reCAPTCHA v3 para proteger os endpoints do Firebase contra abusos.

Estado atual:
- Todas as Cloud Functions callable usam `enforceAppCheck` e `consumeAppCheckToken` por meio de `ENFORCE_APP_CHECK = process.env.FUNCTIONS_EMULATOR !== 'true'`.
- Em produção, App Check e replay protection ficam habilitados.
- Sob o Functions Emulator, o enforcement fica desabilitado para permitir desenvolvimento local e E2E sem token real.
- Callables de IA como `chatWithQuantumAI`, `generateAuditReport`, `categorizeTransactionsBatch` e `executeAgentAction` seguem protegidas em produção.

| Variável | Visibilidade | Uso |
|---|---|---|
| `VITE_RECAPTCHA_SITE_KEY` | Pública | Necessária para o bundle emitir tokens App Check |
| `VITE_FIREBASE_APPCHECK_DEBUG_TOKEN` | **Sensível** | Apenas DEV/preview controlado; nunca commitar valor real |
| `VITE_USE_EMULATOR` | Pública | Quando `true`, pula App Check e conecta Functions Emulator |

App Check é ignorado quando `VITE_USE_EMULATOR=true`, em testes, ou quando `VITE_RECAPTCHA_SITE_KEY` não está definido. O bundle só emite tokens quando a site key está configurada.

Para ambientes de preview ou DEV fora do emulador, manter estratégia operacional explícita:
- configurar `VITE_RECAPTCHA_SITE_KEY` no ambiente que deve emitir token;
- registrar domínios autorizados de forma controlada no Firebase/App Check;
- usar `VITE_FIREBASE_APPCHECK_DEBUG_TOKEN` apenas em DEV ou preview controlado, sem commitar valor real;
- evitar wildcard amplo ou domínio genérico inseguro para previews efêmeros.

## Licença

MIT
