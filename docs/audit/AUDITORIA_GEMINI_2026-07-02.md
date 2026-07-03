# Auditoria Big Tech — Quantum Finance (Relatório GEMINI)

> Recebido em 2026-07-02. Preservado para auditoria cruzada com relatório Codex.

## 1. Resumo executivo

- Nota geral do produto: 7.5 / 10
- Nota de cibersegurança: 8.0 / 10
- Nota de integridade financeira: 8.5 / 10
- Nota de UI/interface: 7.0 / 10
- Nota de UX/usabilidade: 7.5 / 10
- Nota da inteligência artificial: 7.0 / 10
- Nota de arquitetura/refatoração: 8.0 / 10
- Nota de prontidão comercial: 6.5 / 10
- Status final: Precisa evoluir.
- Principal risco: Vulnerabilidade de bypass na confirmação do Agente de IA e falta de execução background para tarefas recorrentes, o que quebra a integridade da automação financeira.
- Principal oportunidade: Transformar o motor do Agente de IA (atualmente vulnerável a spoofing de status) em uma arquitetura de Proposal/Challenge/Response validada via backend, e unificar o design system para entregar uma experiência verdadeiramente premium e confiável.
- Próxima fase recomendada: FASE de Hardening e Confiabilidade (Corrigir bypass de IA, mover recorrentes para o backend, higienizar dados enviados ao LLM).

## 2. Estado Git/GitHub

- Branch atual: `main` e `feat/query-intent-context-enrichment`
- Working tree: Limpo (referência `e4c9407`).
- Últimos commits: PRs #322-#324 mergeados.
- PRs abertos (no momento da auditoria): #325, #326
- Runs recentes: Falhas no CI do PR #326, sucesso no PR #325.
- Observações: pipeline barra deploys quebrados eficazmente, mas E2E via Playwright sem cache agressivo causa timeouts.

## 3. Validações executadas

| Comando | Resultado | Observação |
|---|---|---|
| `git status --short --branch` | Sucesso | Branch main limpa |
| `gh pr list` | Sucesso | 2 PRs abertos |
| `gh run list` | Concluído | Falhas recentes de CI no #326 |
| `npm run typecheck` | Sucesso | Sem erros de tipagem |
| `npm run lint` | Sucesso | Código aderente ao ESLint |
| PowerShell Search (Floats/Math) | Concluído | Regras de transição pendentes |
| `firestore.rules` review | Concluído | Complexidade extrema (1500+ linhas) |

## 4. Achados P0 — bloqueadores

### SEC-001
- Área: Cibersegurança / IA (Cloud Functions)
- Arquivo/linha: `functions/src/agentActionValidation.ts:239`
- Evidência: `if (proposal['status'] !== 'confirmed') { throw new AgentActionValidationError(...) }`
- Impacto: Um atacante pode forjar payload HTTP com `{ proposal: { status: 'confirmed', payload: {...} } }` e enviar diretamente para a callable `executeAgentAction`. O backend confia cegamente que o cliente realizou a confirmação humana.
- Risco: Bypass crítico de autorização e do Human-in-the-Loop.
- Correção recomendada: proposta assinada criptograficamente no backend (JWT ou registro em tabela temporária no Firestore) com status `pending`. Mutação só ocorre se o ID existir no backend com os mesmos valores propostos e não consumido.
- Teste obrigatório: chamar `executeAgentAction` injetando `status: 'confirmed'` sem token de proposta válido. Deve retornar 403/412.
- Prioridade: Altíssima.

### SEC-002
- Área: Privacidade / IA (LGPD)
- Arquivo/linha: Motor de IA / `categorizeTransactionsBatch`
- Evidência: O Agente recebe descrições de transações bancárias cruas para classificar.
- Impacto: Descrições como "PIX MARIA DA SILVA CPF 123.456.789-00" são enviadas para a API do Gemini.
- Risco: Vazamento de PII para terceiros (Google LLM), violando LGPD.
- Correção recomendada: Data Scrubber local (regex) para mascarar CPFs, cartões e e-mails antes de enviar ao LLM.
- Teste obrigatório: passar texto com CPF e garantir que o prompt contém `[CPF MASCARADO]`.
- Prioridade: Altíssima.

## 5. Achados P1 — críticos antes de comercializar

### ARCH-001
- Área: Arquitetura / Integridade Financeira
- Arquivo/linha: `src/hooks/useRecurringAutoExecute.ts` e CLAUDE.md
- Evidência: "Recorrentes permanecem client-side fail-silent... Migração para Cloud Functions adiada".
- Impacto: se o usuário não abrir o app no mês, recorrentes não são lançados. Destrói confiança no dashboard.
- Correção recomendada: Cloud Scheduler + Pub/Sub, rotinas noturnas server-side.
- Prioridade: Alta.

### DATA-001
- Área: Banco de Dados / Integridade Financeira
- Arquivo/linha: CLAUDE.md / `functions/scripts/diagnoseLegacyTransactions.js`
- Evidência: "Migração automática de float -> value_cents continua bloqueada."
- Impacto: convivência de floats legados prejudica cálculos se fallbacks falharem.
- Correção recomendada: executar migração em background via Cloud Task, apagar campo `value` de toda a base.
- Prioridade: Alta.

## 6. Achados P2 — melhorias importantes

### PERF-001
- `firestore.rules` com 1490 linhas — risco de limite de expressões, alta dificuldade de manutenção. Considerar mover mutações sensíveis inteiramente para Callables.

### UX-001
- Agente recusa parcelamentos com erro (`failed-precondition`, `use_installment_form`). IA deveria pré-preencher o formulário de parcelamento em vez de cuspir erro.

## 7. Achados P3 — refinamentos

- Limpeza de resquícios Chart.js.
- Empty states de Recharts mal formatados; skeleton loaders premium.
- CSP headers estritos no `firebase.json`.

## 8-13. (Cibersegurança, integridade, UI, UX, IA, arquitetura)

- Auth: robusto; separação `users/{uid}` perfeita.
- Rules: fortes porém perigosamente complexas.
- Functions: App Check + consumeAppCheckToken excelente contra replay; confiança excessiva no payload do cliente nas ações do agente.
- Centavos: ponto alto; `createTransfer` server-only brilhante.
- Recorrência: maior gargalo de integridade.
- UI: falta refinamento premium (Apple Wallet, Nubank); glassmorphism, tipografia variável, paleta dinâmica.
- UX: falta wizard de onboarding; recusa de parcelas quebra ilusão do assistente.
- IA: intent router excelente; RAG com JSONs de orçamento é o caminho.
- Arquitetura: FSD aparente; Modelo A nível Enterprise; considerar BFF para agregar dados do dashboard e reduzir listeners.

## 14. Auditoria por módulo

| Módulo | Nota | Segurança | Prioridade |
|---|---|---|---|
| Auth & Groups | 9 | Alta | Baixa |
| Transactions | 8 | Alta | Média |
| IA Agent | 6 | Crítica | P0 |
| Recurring | 5 | Média | P1 |
| Cloud Functions | 8 | Alta | Média |
| Relatórios | 7 | Média | Baixa |

## 15-17. Performance, testes, CI/CD

- Listeners múltiplos no first paint; risco de custo/travamento com milhares de transações.
- Habilitar offline persistence com `cacheSizeBytes`.
- Testes críticos faltantes: intrusão em `executeAgentAction` forjando status confirmed; injeção de PII contra o logger da IA.
- CI: separar jobs E2E dos unitários+Rules; typecheck impeditivo absoluto.

## 18. Backlog recomendado em PRs

1. **PR 1 — Segurança P0: Server-Side AI Proposal Validation** (`agentActionValidation.ts`, `executeAgentAction`, `useAgentAction.ts`)
2. **PR 2 — Privacidade P1: PII Scrubber para Gemini** (`categorizeTransactionsBatch`, motor Gemini)
3. **PR 3 — Integridade P1: Motor Backend de Recorrentes** (`functions/src/cron/executeRecurringTasks.ts`)
4. **PR 4 — Dados P1: Force purge de Floats legados** (script admin de migração)
5. **PR 5 — UI/UX Premium (Fase 2)** (tipografia, skeletons, Framer Motion)

## 19. Matriz Big Tech

| Dimensão | Nota | Motivo |
|---|---|---|
| Segurança | 8/10 | Firestore excelente; cai pelo risco de spoofing no Agente |
| Privacidade | 7/10 | LGPD prevista; cai pelo risco de PII ao LLM |
| Integridade | 9/10 | decimal.js exemplar |
| Confiabilidade | 7/10 | recorrentes no cliente e `value` legado |
| Escalabilidade | 8/10 | serverless ok; cuidado com reads |
| UI/UX | 7/10 | consistente mas não premium |
| Inteligência | 7/10 | intent router excelente; falta proatividade |
| Observabilidade | 9/10 | anti-console.log maduro |
| Qualidade Cód. | 9/10 | Zod, tipagem, FSD |

## 20. Veredito final

1. Comercializável hoje? Não em GA — apenas Closed Beta.
2. Impedem: bypass IA (P0), PII ao LLM (P1), recorrentes no cliente (P1).
3. Big Tech reprovaria: client-side trust em estados de segurança do LLM; PII sem sanitização a terceiros.
4. Maior potencial: motor de IA e recorrências.
5. Menor sequência segura: PRs 1, 2 e 3.
6. Próxima fase: Hardening e Confiabilidade.
7. Nota hoje: 7.5/10. Após correções: 9.0/10.
