# Playbook Tecnico para IA - Quantum Finance 10/10

Documento para orientar uma IA de engenharia a executar as melhorias necessarias para elevar o Quantum Finance ao padrao 10/10 de produto financeiro com IA.

Este playbook e operacional. Ele deve ser seguido em PRs pequenos, verificaveis e sem misturar refatoracoes cosmeticas com correcoes de seguranca.

## 0. Regras de Operacao da IA

Antes de qualquer alteracao:

1. Ler o estado real do repositorio:
   - `git status --short --branch`
   - `git log --oneline -n 12`
   - `gh run list --limit 10`
2. Nao sobrescrever mudancas locais de outro autor.
3. Nao ler, imprimir, copiar ou versionar valores de `.env`, `.env.local` ou secrets.
4. Nao fazer deploy, push ou merge sem pedido explicito.
5. Antes de editar Rules, rodar ou atualizar testes de Rules correspondentes.
6. Cada PR deve ter um unico objetivo mensuravel.
7. Nenhum PR pode reduzir cobertura, remover teste sem justificativa ou afrouxar rules.

Definicao de pronto para cada PR:

- TypeScript passa.
- Lint passa.
- Testes unitarios relevantes passam.
- Firestore Rules tests passam quando Rules forem alteradas.
- Functions build/test passam quando Functions forem alteradas.
- O PR inclui testes negativos para o abuso corrigido.
- A descricao do PR explica risco, mitigacao e rollback.

## 1. Objetivo 10/10

O produto so alcanca 10/10 quando satisfaz estes criterios:

1. Deploy nunca ocorre com CI vermelho.
2. A IA nao executa mutacoes confiando em estado vindo do cliente.
3. Shared Finance preserva invariantes financeiras e autorizacao por cota.
4. Logs criticos sao escritos somente por backend confiavel.
5. Dependencias nao possuem CVEs high/moderate sem excecao formal.
6. Memoria da IA tem consentimento, expurgo e politica de retencao.
7. Recorrencias tem uma unica fonte de verdade.
8. Cobertura e testes de abuso protegem o dominio financeiro.
9. Observabilidade e runbooks cobrem falhas de IA, Rules, Functions e deploy.
10. UX, acessibilidade, CSP e performance estao prontas para GA.

## 2. Sequencia Obrigatoria de PRs

### PR-01 - P0 Release Gate: bloquear deploy com CI vermelho

Problema:

O deploy de `main` nao pode prosseguir se qualquer etapa critica do CI falhar. Um produto financeiro nao pode ter CD independente da saude do commit.

Arquivos provaveis:

- `.github/workflows/firebase-hosting-merge.yml`
- `.github/workflows/ci.yml`
- docs de CI, se existirem

Implementacao esperada:

1. Fazer o deploy depender explicitamente do sucesso dos checks de qualidade.
2. Garantir que `Deploy to Firebase Hosting on merge` so rode apos:
   - TypeScript
   - ESLint
   - unit tests
   - Firestore Rules tests
   - coverage
   - build
   - Functions tests/build
   - E2E
3. Se o workflow usa `wait-on-check-action`, validar que ele espera o check correto e que esse check representa a cadeia completa.
4. Documentar branch protection recomendada para `main`.

Testes/verificacoes:

- `gh run list --limit 10`
- Inspecionar se um commit com CI falho nao dispara deploy bem-sucedido.
- Validar YAML com leitura cuidadosa; nao depender apenas de sintaxe.

Criterio de aceite:

- Nao existe caminho em que deploy live passe com CI vermelho.

### PR-02 - P1 Shared Finance Rules: fechar tampering em expenses

Problema:

`groups/{groupId}/expenses` deve impedir adulteracao de total, pagador, membros, cotas e delecao indevida.

Arquivos provaveis:

- `firestore.rules`
- `src/__tests__/firestoreRules.audit.test.ts`
- `src/features/shared-finance/hooks/useGroups.ts`

Implementacao esperada:

1. `create` deve validar:
   - `keys().hasOnly(...)`
   - `payerUid` pertence ao grupo
   - cada `share.uid` pertence ao grupo
   - `totalCents` inteiro positivo
   - soma de `shares.amountCents` igual a `totalCents`
   - limite maximo de shares
   - `createdAt == request.time`
   - `updatedAt == request.time`
2. `update` deve validar:
   - `groupId`, `createdAt`, `payerUid`, `payerDisplayName`, `splitMethod`, `totalCents`, `date`, `category`, `description`, `schemaVersion` imutaveis, exceto quando explicitamente permitido ao payer/owner
   - usuario comum so pode alterar a propria cota de `paid false -> true` e campos derivados seguros, como `paidAt`
   - `updatedAt == request.time`
   - nenhuma cota de outro usuario pode ser modificada por usuario comum
3. `delete` deve ser restrito a `payerUid` ou `ownerUid`.
4. Se a complexidade das Rules ficar alta demais, mover mutacoes sensiveis para Cloud Function com Admin SDK.

Testes obrigatorios:

- membro nao-payer tenta alterar `totalCents` e falha.
- membro nao-payer tenta alterar `payerUid` e falha.
- membro tenta marcar cota de outro membro como paga e falha.
- membro marca a propria cota como paga e passa.
- soma de shares diferente de `totalCents` falha.
- `share.uid` fora do grupo falha.
- delete por nao-payer/nao-owner falha.
- delete por payer ou owner passa.

Criterio de aceite:

- Nao ha update generico por membro.
- Invariantes financeiras sao defendidas em Rules ou Function server-side.

### PR-03 - P1 AI Proposal Authority: proposta server-stored ou assinada

Problema:

`executeAgentAction` aceita `proposal.status === 'confirmed'` vindo do frontend. A autoridade de confirmacao precisa estar no backend.

Arquivos provaveis:

- `functions/src/index.ts`
- `functions/src/agentActionValidation.ts`
- `src/hooks/useAgentAction.ts`
- `src/features/ai-agent/*`
- `src/features/ai-chat/AIAssistantChat.tsx`
- `functions/test/*`

Implementacao esperada:

1. Criar fluxo em duas fases:
   - `createAgentProposal`: backend recebe intencao/payload validado, salva proposta `pending`.
   - `executeAgentAction`: cliente envia apenas `proposalId` e confirmacao humana.
2. Proposta salva deve conter:
   - `uid`
   - `kind`
   - `payload`
   - `status: pending`
   - `createdAt`
   - `expiresAt`
   - `idempotencyKey`
   - hash/correlationId
3. Execucao deve:
   - buscar proposta pelo `uid`
   - validar que esta `pending`
   - validar que nao expirou
   - marcar como `consumed/applied`
   - executar exatamente o payload salvo
   - ser transacional ou idempotente
4. Cliente nao pode alterar payload entre proposta e execucao.

Testes obrigatorios:

- chamada direta a `executeAgentAction` com `status: confirmed` mas sem `proposalId` falha.
- proposta expirada falha.
- proposta de outro `uid` falha.
- replay de proposta consumida falha ou retorna resultado idempotente seguro.
- payload adulterado falha.
- fluxo feliz cria transacao/decisao corretamente.

Criterio de aceite:

- O frontend nunca e fonte de autoridade sobre estado de confirmacao.

### PR-04 - P1 Logs Forenses Server-Only

Problema:

`audit_logs` e `system_logs` criticos nao podem ser criados pelo cliente.

Arquivos provaveis:

- `firestore.rules`
- `src/shared/services/AuditService.ts`
- `src/services/AICategorizationService.ts`
- `functions/src/index.ts`
- testes de Rules e Functions

Implementacao esperada:

1. Identificar logs que sao forenses e logs que sao apenas UX/local analytics.
2. Para logs forenses:
   - `allow create: if false` em Firestore Rules.
   - criar callable ou helper backend com Admin SDK.
   - incluir `actorUid`, `source`, `eventType`, `entityType`, `entityId`, `correlationId`, `createdAt`.
3. Preservar leitura do owner quando apropriado.
4. Garantir append-only.

Testes obrigatorios:

- client create em `audit_logs` falha.
- client create em `system_logs` falha.
- backend/admin consegue criar log.
- update/delete continuam falhando.

Criterio de aceite:

- Logs criticos tem valor forense e nao sao forgeaveis por usuario.

### PR-05 - P1 Dependency Security Gate

Problema:

`functions` possui vulnerabilidades reportadas por `npm audit`, incluindo high.

Arquivos provaveis:

- `functions/package.json`
- `functions/package-lock.json`
- `.github/workflows/ci.yml`
- `.github/workflows/security.yml`

Implementacao esperada:

1. Atualizar dependencias de Functions sem quebrar runtime.
2. Adicionar gate:
   - `npm audit --audit-level=moderate`
   - `npm --prefix functions audit --audit-level=moderate`
3. Se alguma vulnerabilidade moderada nao puder ser removida:
   - documentar excecao com pacote, CVE, impacto, mitigacao e prazo.

Testes/verificacoes:

- `npm audit --audit-level=moderate`
- `npm --prefix functions audit --audit-level=moderate`
- `npm --prefix functions test`
- `npm --prefix functions run build`

Criterio de aceite:

- Zero high.
- Zero moderate sem excecao formal.
- CI bloqueia regressao.

### PR-06 - P2 Privacidade da IA: memoria, consentimento e expurgo

Problema:

`ConversationMemory` persiste conversas no `localStorage`. Em app financeiro, isso exige controle visivel.

Arquivos provaveis:

- `src/features/ai-chat/ConversationMemory.ts`
- `src/features/ai-chat/AIAssistantChat.tsx`
- `src/features/settings/DataPrivacyPanel.tsx`
- testes de privacidade

Implementacao esperada:

1. Criar configuracao de memoria da IA:
   - off por padrao, ou consentimento claro antes de ativar
   - botao de limpar memoria
   - texto de retencao simples
2. Adicionar metodo para listar/remover chaves `qf_conversation_*`.
3. Integrar com painel de privacidade.
4. Garantir que delete/export LGPD considere a memoria local quando possivel.

Testes obrigatorios:

- sem consentimento, conversa nao e persistida.
- com consentimento, limita a `MAX_TURNS`.
- botao de expurgo remove memoria.
- troca de usuario nao mistura memoria.

Criterio de aceite:

- Usuario controla memoria da IA de forma explicita.

### PR-07 - P2 Recorrencias: fonte unica de verdade

Problema:

Ha execucao de recorrencias no backend e tambem no client. Isso aumenta risco de duplicidade e comportamento dependente de sessao.

Arquivos provaveis:

- `functions/src/index.ts`
- `src/hooks/useRecurringAutoExecute.ts`
- `src/components/DashboardContent.tsx`
- testes relacionados

Implementacao esperada:

1. Definir Cloud Scheduler como autoridade unica.
2. Remover chamada mutante client-side ou torna-la somente leitura/nudge.
3. Garantir idempotencia por tarefa e competencia.
4. Adicionar log/metricas para execucao agendada.

Testes obrigatorios:

- scheduler materializa tarefa devida.
- nao duplica no mesmo mes.
- tarefa anual respeita mes.
- client nao cria transacao recorrente automaticamente.

Criterio de aceite:

- Recorrencia nao depende de o usuario abrir o app.

### PR-08 - P2 Coverage Gates e testes skipped

Problema:

Cobertura baixa e testes pulados reduzem confianca.

Arquivos provaveis:

- `vite.config.ts`
- `package.json`
- `.github/workflows/ci.yml`
- testes existentes

Implementacao esperada:

1. Definir thresholds progressivos:
   - fase 1: statements 70%, branches 60%
   - fase 2: statements 80%, branches 70%
   - fase 3: statements 85%, branches 80%
2. Criar lista de testes skipped com justificativa.
3. Converter skipped criticos em testes ativos.

Areas prioritarias:

- Firestore Rules de abuso.
- dinheiro/centavos.
- IA actions.
- Shared Finance.
- importadores.
- recorrencias.
- LGPD/delete/export.

Criterio de aceite:

- CI bloqueia queda de cobertura.
- Nenhum skipped critico sem issue/backlog.

### PR-09 - P2 CSP, XSS e hardening frontend

Problema:

CSP existe, mas permite `unsafe-inline`. Para maturidade alta, reduzir superficie de XSS.

Arquivos provaveis:

- `firebase.json`
- `index.html`
- configuracoes de build

Implementacao esperada:

1. Inventariar scripts/styles que exigem inline.
2. Remover inline quando possivel.
3. Se necessario, usar nonce/hash.
4. Validar Firebase/Auth/AppCheck/Gemini endpoints em `connect-src`.

Testes/verificacoes:

- build de producao.
- teste manual ou automatizado de login/app shell.
- validar console sem violações inesperadas de CSP.

Criterio de aceite:

- CSP reduz XSS sem quebrar Firebase/AppCheck.

### PR-10 - P2 Observabilidade, runbooks e custos

Problema:

Produto financeiro com IA precisa de diagnostico rapido e limites de custo.

Arquivos provaveis:

- `docs/INCIDENT_RESPONSE.md`
- `docs/SECURITY.md`
- Functions logging
- docs de runbook

Implementacao esperada:

1. Definir eventos observaveis:
   - falha de IA
   - rate limit
   - Rules permission-denied spike
   - scheduler recorrente com erros
   - deploy failure
   - audit log write failure
2. Criar runbooks:
   - rollback deploy
   - IA degradada
   - vazamento de PII
   - falha em recorrencias
   - incidente de regra Firestore
3. Documentar budgets:
   - Firestore reads/writes
   - Functions invocations
   - LLM calls

Criterio de aceite:

- Equipe sabe detectar, mitigar e comunicar falhas.

## 3. Matriz de Aceite Final 10/10

| Area | Criterio 10/10 | Evidencia exigida |
| --- | --- | --- |
| Release | Deploy bloqueado por qualquer CI vermelho | GitHub Actions + branch protection |
| IA | Mutacao so com proposta backend | Functions tests + E2E |
| Rules | Abusos principais negados | Firestore Rules tests negativos |
| Logs | Forense server-only | Rules negam client create |
| Dependencias | Zero high/moderate sem excecao | npm audit CI |
| Privacidade | Memoria IA governada | UI + testes |
| Financeiro | Centavos e invariantes | unit/property/rules tests |
| Recorrencias | Scheduler autoritativo | Functions tests |
| Observabilidade | Runbooks e eventos | docs + logs estruturados |
| UX/Perf | A11y e budgets | E2E/axe/build analysis |

## 4. Comandos de Validacao Padrao

Rodar localmente conforme o escopo do PR:

```powershell
npm run typecheck
npm run lint
npm run test -- --run
npm run test:rules
npm run coverage
npm run build
npm audit --audit-level=moderate
npm --prefix functions test
npm --prefix functions run build
npm --prefix functions audit --audit-level=moderate
```

Para PRs de frontend critico, tambem rodar:

```powershell
npm run test:e2e
```

## 5. Politica de Nao-Regressao

Uma IA executora nao deve aceitar estes atalhos:

- Desabilitar teste para passar CI.
- Afrouxar Firestore Rules sem teste negativo.
- Mover validacao financeira apenas para UI.
- Permitir que LLM gere payload executavel sem contrato.
- Criar logs forenses via cliente.
- Manter CVE high como "temporario" sem issue e prazo.
- Fazer deploy manual para contornar CI.
- Misturar refatoracao visual com hardening de seguranca.

## 6. Ordem Recomendada de Execucao

1. PR-01 Release Gate.
2. PR-02 Shared Finance Rules.
3. PR-03 AI Proposal Authority.
4. PR-04 Logs Server-Only.
5. PR-05 Dependency Gate.
6. PR-06 Privacidade da IA.
7. PR-07 Recorrencias.
8. PR-08 Coverage Gates.
9. PR-09 CSP.
10. PR-10 Observabilidade.

Quando estes PRs estiverem completos e verdes, executar nova auditoria completa com foco em:

- abuse testing;
- LGPD;
- integridade financeira;
- prompt injection;
- custo e performance;
- readiness de suporte e operacao.

