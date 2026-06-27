# Quantum Finance — Sync de Conhecimento Pós-#302 (2026-06-27)

## 1. Resumo executivo

Auditoria realizada no repositório local `C:\quantum-finance` em 2026-06-27. O contexto
presumido pós-#301 estava desatualizado: a `main` já contém o PR **#302
`feat(agent): support confirmed income registration`**. Portanto, o próximo grande passo
funcional "receita confirmada" não é mais futuro; ele está entregue e deve ser tratado
como baseline.

Principais ajustes recomendados: manter a documentação alinhada ao estado pós-#302,
fechar o PR #287 sem merge por estar superseded, e evitar qualquer PR funcional que
reimplemente receita sem antes auditar o que já foi mergeado.

## 2. Estado Git/GitHub atual

- Confirmado: branch local era `main` antes desta atualização documental.
- Confirmado: `main` e `origin/main` apontavam para `f0a7330`.
- Confirmado: divergência `main...origin/main` era `0 0`.
- Confirmado: working tree estava limpo antes das alterações documentais.
- Confirmado: HEAD atual da `main`: `f0a7330 feat(agent): support confirmed income registration (#302)`.
- Confirmado: PR aberto #287 (`docs/resume-point-2026-06-23`) está obsoleto.
- Confirmado: PR aberto #271 é Dependabot (`@types/node`).
- Confirmado: existem stashes locais. Não foram abertos nem alterados.

## 3. Mapa dos PRs recentes

| PR | Estado | Leitura atual |
|---|---|---|
| #302 | merged | Baseline atual: receita confirmada com E2E. |
| #301 | merged | Documentou fluxo seguro de mutação confirmada. |
| #300 | merged | Adicionou E2E para mutação confirmada. |
| #299 | merged | Sincronizou `CLAUDE.md` até #298. |
| #298 | merged | Reparou Firebase Hosting Preview via CLI + service account temporária. |
| #297 | merged | Exigiu confirmação humana e sincronizou mutações com estado do app. |
| #296 | merged | Distinguiu falhas de rate limit da IA. |
| #295 | merged | Gate de App Check sob Functions Emulator. |
| #287 | open | Superseded por #288-#302; recomendar fechar sem merge. |
| #271 | open | Dependabot; avaliar separado. |

## 4. Estado da arquitetura do agente

Confirmado:

- LLM/chat nunca grava diretamente.
- Toda mutação financeira passa por `ActionProposal`.
- Propostas nascem `pending`.
- `useAgentAction` sela `status: 'confirmed'` somente após confirmação humana.
- `executeAgentAction` revalida `status === 'confirmed'`.
- Escritas de despesa e receita vão para `users/{uid}/transactions`.
- History usa `origin: 'ai'`.
- `/decisions` é registrado com `outcomeStatus: 'applied'`.
- UI reflete por `useTransactions`/`onSnapshot`.
- Cancelamento é terminal.
- Texto de sucesso só aparece após callable bem-sucedida.
- Receita à vista está suportada desde #302 (`register_income`, `type: 'entrada'`).

Ainda limitado por design:

- Compra parcelada não é executada pelo agente; roteia ao formulário.
- `VITE_ENABLE_AGENT_ROUTER` segue default OFF fora do E2E até validação assistida do owner.
- A qualidade real do classificador Gemini precisa ser validada em emulator antes de ampliar uso.

## 5. Estado do CI/CD

Confirmado:

- `ci.yml` executa typecheck/lint/test/build, tests de rules e E2E com emuladores
  auth+firestore+functions.
- `firebase-hosting-pull-request.yml` usa CLI Firebase com `GOOGLE_APPLICATION_CREDENTIALS`,
  canal único por execução e TTL 3d.
- `firebase-hosting-merge.yml` mantém deploy de rules, functions e hosting live após CI.
- O fluxo de preview usa secret existente do GitHub sem expor valor no repo.

Risco operacional:

- Preview Hosting ainda depende de credencial GitHub e comportamento de rede do runner;
  o workflow mitiga "premature close" consultando o canal publicado.

## 6. Estado de segurança/App Check/secrets

Confirmado:

- `functions/src/index.ts` define `ENFORCE_APP_CHECK = process.env.FUNCTIONS_EMULATOR !== 'true'`.
- Todas as callables usam `enforceAppCheck` e `consumeAppCheckToken` condicionados por esse gate.
- Em produção, App Check e replay protection ficam ON.
- Sob Functions Emulator, ficam OFF para permitir E2E/local sem token real.
- Nenhum arquivo de secret foi aberto nesta auditoria.

Arquivos proibidos para PRs documentais:

- `.env`, `.env.local`, `functions/.secret.local`, secrets GitHub, chaves Firebase/Gemini,
  service accounts, `.agents`, `skills-lock.json`, código de produto e rules sem autorização.

## 7. Inconsistências encontradas na documentação

Confirmado:

- `CLAUDE.md` ainda apontava HEAD `59415bd`/#300 como mais recente e duplicava a seção
  "Firebase Hosting Preview reparado".
- `README.md` dizia que `chatWithQuantumAI` e `generateAuditReport` não tinham App Check
  e que `consumeAppCheckToken` não estava habilitado.
- `docs/AI_AGENT_CONFIRMED_MUTATION_FLOW.md` ainda tratava receita como recusada.
- `docs/AI_TOOL_ROUTER.md` ainda descrevia o wiring no `AIAssistantChat` como passo restante.
- `docs/AI_DECISION_JOURNAL.md` ainda descrevia Firestore Rules de `/decisions` como futuro,
  embora `firestore.rules` e testes já cubram essa coleção.

## 8. Riscos técnicos atuais

- Provável: comentários em código ainda podem mencionar "4 kinds" ou receita como unsupported,
  apesar do comportamento real pós-#302.
- Confirmado: PR #287 é uma fonte de contexto antigo e pode confundir futuras sessões.
- Confirmado: stashes locais existem e devem ser tratados como trabalho privado/local antes de
  qualquer limpeza.
- Precisa validação: qualidade do Gemini classifier em uso real com emulator e owner presente.
- Confirmado: parcelado segue fora do agente por decisão de produto; reimplementar no Admin SDK
  é risco de duplicar lógica monetária.

## 9. PRs recomendados em ordem

1. `docs(project): sync knowledge base after confirmed income flow`
   - Atualiza `CLAUDE.md`, README e docs normativos para pós-#302.
2. Fechar PR #287 sem merge
   - Motivo: superseded por #288-#302. Não fechar sem autorização explícita do owner.
3. `docs/code-comments): align agent comments after income registration`
   - Opcional e separado; apenas comentários se estiverem obsoletos.
4. `test(agent): audit confirmed income edge cases`
   - Opcional; focar ambiguidades de linguagem, categoria e idempotência.
5. Próximo funcional a escolher
   - Transferências, UX do agente, ou integração controlada do router fora do E2E.

## 10. Checklist operacional para o owner

- Autorizar fechamento do PR #287 sem merge.
- Revisar stashes locais antes de limpar qualquer coisa.
- Validar Gemini/router com emuladores antes de ligar `VITE_ENABLE_AGENT_ROUTER` fora do E2E.
- Manter `.env`, `.env.local` e `functions/.secret.local` fora de qualquer revisão.
- Exigir `git diff --check` em PRs documentais.
- Exigir `npm run lint` quando Markdown alterado for coberto pelo lint.
- Para PR funcional do agente, exigir E2E equivalente ao fluxo confirmado.

## 11. Prompt sugerido para Claude Code executar o próximo PR documental

```text
Você está no repositório C:\quantum-finance, projeto welitonsp/quantum-finance.
Crie um PR doc-only para sincronizar a base de conhecimento pós-#302.

Escopo permitido: CLAUDE.md, README.md e docs/.
Escopo proibido: código de produto, functions/src, firestore.rules, firebase.json,
.env, .env.local, functions/.secret.local, .agents, skills-lock.json, package-lock.

Confirme:
- main/origin/main em f0a7330 ou posterior;
- PR #302 mergeado;
- PR #287 aberto e superseded;
- App Check enforce/consume gated por FUNCTIONS_EMULATOR;
- receita confirmada suportada por register_income/type entrada.

Atualize documentação sem expor secrets. Rode git diff --check e, se aplicável,
npm run lint. Commit sugerido:
docs(project): sync knowledge base after confirmed income flow
```

## 12. Prompt sugerido para Claude Code executar o futuro PR de receita confirmada

Observação: este prompt não deve ser usado para "implementar do zero", pois #302 já foi
mergeado. Use como auditoria/extensão pós-#302:

```text
Você está no repositório C:\quantum-finance, projeto welitonsp/quantum-finance.
Audite o suporte já mergeado a receita confirmada (#302) antes de qualquer alteração.

Não reimplemente receita. Confirme o contrato real:
- register_income em agentSchemas, proposalBuilders, mutationCommandGuard e intentRegistry;
- AIAssistantChat abre proposta pending e só chama useAgentAction após confirmação;
- useAgentAction sela confirmed e chama executeAgentAction;
- validateAgentActionRequest rejeita status != confirmed;
- executeAgentAction grava users/{uid}/transactions com type entrada, history origin ai e /decisions;
- E2E cobre proposta sem gravação, cancelamento terminal, confirmação, UI via onSnapshot e sucesso pós-callable.

Se encontrar lacuna real, proponha PR pequeno com teste primeiro. Não toque em secrets,
firebase.json, firestore.rules ou deploy sem autorização explícita.
```
