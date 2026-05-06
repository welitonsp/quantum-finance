# Quantum Finance — Base de Conhecimento do Projeto

> Este arquivo é o ponto de entrada de contexto para qualquer agente de IA (Claude, Codex, etc.) que trabalhe no projeto. Mantenha-o atualizado a cada marco relevante. Não use este arquivo para guardar credenciais ou dados sensíveis.

## Estado Consolidado — FASE 5A Auditoria Forte

### Estado Atual

- Branch principal: `main`.
- Topo da main: `76065bb test(audit): cover firestore rules for audit logs (#64)`.
- Working tree confirmado limpo.
- Nenhum PR aberto no checkpoint de consolidação da FASE 5A.
- FASE 5A parcialmente consolidada com PRs #62, #63 e #64.

### Contexto da FASE 5

- A FASE 5 iniciou após o encerramento da FASE 4 — Conciliação Avançada.
- Investigação inicial encontrou P0 de auditoria:
  - auditoria era client-side e semanticamente forjável;
  - criação manual não gerava histórico por transação;
  - rules de audit/history eram permissivas demais em create client-side;
  - não havia teste automatizado de Firestore Rules.
- Estratégia adotada:
  - modelo híbrido incremental;
  - não bloquear create client-side ainda;
  - primeiro corrigir cobertura mínima;
  - depois endurecer rules;
  - depois criar harness de rules com emulator;
  - Cloud Functions/server-trusted fica para fase posterior.

### PR #62 — Criação manual registra histórico

- Commit: `4cbf6b8 fix(audit): record history for manual transaction creation (#62)`.
- Arquivos principais:
  - `src/hooks/useTransactions.ts`.
  - `src/hooks/useTransactions.test.ts`.

Entrega:

- Criação manual chama `FirestoreService.addTransaction`.
- Após obter o ID real, registra `AuditService.logTransactionHistory`.
- History usa `action='CREATE'`.
- History usa `origin='manual'`.
- `after` usa payload canônico sanitizado.
- `changedFields` contém campos criados relevantes.
- `amount_cents` vem de `value_cents`.
- `id`, `uid`, `importHash` e `value` legado não entram no delta.
- Falha no log não impede criação, mantendo padrão fail-silent do `AuditService`.

Validação:

- Teste em `src/hooks/useTransactions.test.ts`.
- Suíte passou com 23 arquivos / 200 testes após a fase.

### PR #63 — Hardening client-compatible das Firestore Rules

- Commit: `101affe security(audit): harden audit log rules (#63)`.
- Arquivo principal:
  - `firestore.rules`.

Entrega em `transactions/{txId}/history`:

- Create client-side do owner preservado.
- Update/delete bloqueados.
- `data.txId == txId` do path.
- Action whitelist:
  - `CREATE`.
  - `UPDATE`.
  - `SOFT_DELETE`.
  - `RESTORE`.
  - `BULK_UPDATE`.
  - `UNDO_BULK_UPDATE`.
  - `IMPORT`.
- Origin whitelist:
  - `manual`.
  - `import`.
  - `reconcile`.
  - `bulk`.
  - `system`.
  - `recurring`.
  - `ai`.
- `changedFields` limitado e com campos conhecidos.
- `before`/`after` rejeitam:
  - `id`.
  - `uid`.
  - `value`.
  - `importHash`.
- `createdAt == request.time`.
- `schemaVersion == 1`.
- `amount_cents` inteiro seguro.

Entrega em `audit_logs`:

- Create client-side do owner preservado.
- Update/delete bloqueados.
- Actions aceitas:
  - `IMPORT_TRANSACTION`.
  - `BULK_UPDATE`.
  - `UNDO_BULK_UPDATE`.
- Validações conservadoras de `txId`, `importHash`, `amount_cents`, `details`, `metadata` e `amount_display`.
- Compatibilidade preservada com `LedgerService`, inclusive `amount_display` numérico.

Observação:

- Rules foram endurecidas, mas auditoria ainda não é server-trusted.

### PR #64 — Harness/testes de Firestore Rules

- Commit: `76065bb test(audit): cover firestore rules for audit logs (#64)`.
- Arquivos principais:
  - `src/__tests__/firestoreRules.audit.test.ts`.
  - `firebase.json`.
  - `package.json`.
  - `package-lock.json`.

Entrega:

- Adicionou `@firebase/rules-unit-testing`.
- Adicionou script `npm run test:rules`.
- Adicionou configuração de emulator no `firebase.json`.
- Criou cobertura automatizada para rules de:
  - `users/{uid}/transactions/{txId}/history`;
  - `users/{uid}/audit_logs`;
  - proteção de `importHash` em transactions.

Cobertura confirmada:

- History CREATE válido pelo owner.
- History com `txId` divergente rejeitado.
- Action inválida rejeitada.
- Origin inválida rejeitada.
- Before/after com `id`, `uid`, `value`, `importHash` rejeitados.
- Update/delete em history bloqueados.
- Usuário A bloqueado no path do usuário B.
- Audit_log `IMPORT_TRANSACTION` válido.
- Audit_log `BULK_UPDATE` válido.
- Audit_log com action inválida rejeitado.
- Update/delete em audit_logs bloqueados.
- Usuário A bloqueado no path do usuário B.
- Update tentando alterar `importHash` rejeitado.

Observação importante:

- `npm run test -- --run` deixa os testes de rules como skipped.
- Os testes de rules rodam separadamente por `npm run test:rules`.

### Validação Final Conhecida

- `npm run typecheck`: OK.
- `npm run lint`: OK.
- `npm run test -- --run`: OK.
  - 23 arquivos passaram.
  - 200 testes passaram.
  - 18 testes de rules aparecem como skipped na suíte padrão.
- `npm run build`: OK.
- `npm run test:rules`: OK.
  - Firestore Emulator iniciado com Java/JDK Temurin 21.
  - 1 arquivo de rules testado.
  - 18 testes passaram.
  - 0 falhas.
  - Script saiu com code 0.
- `git status`: clean.
- `gh pr status`: nenhum PR aberto.

### Requisito de Ambiente

- `npm run test:rules` exige Java/JDK instalado e disponível no PATH.
- Ambiente validado com OpenJDK Temurin 21.0.11 LTS.
- Se falhar com `Could not spawn java -version`, instalar JDK:

```bash
winget install EclipseAdoptium.Temurin.21.JDK
```

- Após instalar, fechar e reabrir PowerShell/VS Code antes de rodar:

```bash
java -version
npm run test:rules
```

### Riscos Residuais

- Auditoria ainda é client-side.
- Usuário autenticado ainda pode criar logs semanticamente válidos no próprio path.
- Rules reduzem superfície de fraude/erro, mas não substituem autoridade server-side.
- Auditoria server-trusted real ainda depende de fase futura com Cloud Functions/Admin SDK ou arquitetura equivalente.
- `npm run test:rules` ainda precisa estar integrado ao CI para impedir regressões automáticas em PRs futuros.

### Próxima Etapa Recomendada

**FASE 5A-2C — integrar `npm run test:rules` ao CI/GitHub Actions**.

Depois:

- Avaliar server-trusted audit via Cloud Functions/Admin SDK.
- Ou continuar cobertura de auditoria para recorrentes, IA/autocategoria, exclusão/restauração e bulk/undo.

> As seções históricas abaixo foram preservadas para manter contexto. Em caso de divergência, o estado consolidado da FASE 5A no topo deste arquivo é a referência mais recente.

## Estado Consolidado — FASE 4 Conciliação Avançada — encerramento

### Estado Atual

- Branch principal: `main`.
- Topo da main: `febd3e4 feat(reconciliation): add status filter to transactions (#60)`.
- Working tree confirmado limpo no QA final da FASE 4.
- Nenhum PR aberto no QA final da FASE 4.
- Testes atuais: 22 arquivos / 199 testes.

### PR #58 — Contrato persistente de conciliação

- Commit: `c485b95 feat(reconciliation): add persistent status contract (#58)`.
- Arquivos principais:
  - `src/shared/types/transaction.ts`.
  - `src/shared/schemas/financialSchemas.ts`.
  - `src/shared/services/FirestoreService.ts`.
  - `firestore.rules`.

Campos opcionais adicionados:

- `reconciliationStatus?: 'reconciled'`.
- `reconciliationSource?: 'import'`.
- `reconciledAt?`.
- `reconciledBy?`.

Regras:

- Ausência de `reconciliationStatus` significa não conciliada.
- Schemas aceitam somente `reconciled` e `import`.
- `confidenceScore` e `matchedTransactionId` seguem rejeitados.
- Documentos antigos seguem compatíveis.
- Status não é obrigatório.

### PR #59 — Escrita do status na conciliação

- Commit: `adeb539 feat(reconciliation): persist status on reconcile (#59)`.
- Arquivos principais:
  - `src/features/transactions/ImportButton.tsx`.
  - `src/features/transactions/__tests__/reconciliationRouting.test.ts`.

Entrega:

- Transações reconciliadas recebem:
  - `reconciliationStatus: 'reconciled'`.
  - `reconciliationSource: 'import'`.
  - `reconciledAt: serverTimestamp()`.
  - `reconciledBy: uid`.
- Novas importadas não recebem campos de conciliação.
- Reconciliadas continuam via `FirestoreService.updateTransaction`.
- Novas continuam via `onImportTransactions`.
- Histórico mantém `action=UPDATE + origin=reconcile`.
- Delta audita campos persistentes e exclui `id`, `uid`, `importHash`, `value`.

### PR #60 — Filtro operacional

- Commit: `febd3e4 feat(reconciliation): add status filter to transactions (#60)`.
- Arquivo principal:
  - `src/features/transactions/TransactionsManager.tsx`.

Entrega:

- Filtro `Conciliação` no painel avançado.
- Opções:
  - Todas.
  - Conciliadas.
  - Não conciliadas.
- Regra:
  - `reconciliationStatus === 'reconciled'` significa conciliada.
  - Ausência ou valor diferente de `reconciled` significa não conciliada.
- Chip ativo:
  - `Conciliação: Conciliadas`.
  - `Conciliação: Não conciliadas`.
- `clearAllFilters` reseta o filtro.
- Botão de filtros avançados considera o novo filtro.
- Filtro é client-side sobre transações carregadas.

### QA Final da FASE 4

- Veredito: **APROVADO**.

Validações:

- `npm run typecheck`: OK.
- `npm run lint`: OK.
- `npm run test -- --run`: OK, 22 arquivos / 199 testes.
- `npm run build`: OK.

Achados:

- P0: nenhum.
- P1: nenhum.
- P2: nenhum.
- P3: nenhum defeito funcional identificado.

Integridade financeira:

- `value_cents` continua canônico.
- Nenhum cálculo financeiro novo com float.
- `LedgerService` intacto.
- `importHash` intacto.
- Parser intacto.

### Riscos Residuais

- Filtro de conciliação é client-side e atua apenas sobre movimentações carregadas.
- Documentos antigos sem `reconciliationStatus` aparecem como não conciliados.
- Ainda não há filtro server-side/indexado.
- Ainda não há teste visual/E2E dedicado para o select de conciliação.
- Histórico continua sendo trilha auditável separada; se o log falhar após update bem-sucedido, pode haver divergência parcial entre documento e histórico.

### Estado Final da FASE 4

- **FASE 4 — Conciliação Avançada: concluída.**
- Próxima fase recomendada: **FASE 5 — Auditoria Forte**.

> As seções históricas abaixo foram preservadas para manter contexto. Em caso de divergência, o estado consolidado de encerramento da FASE 4 é a referência mais recente.

## Estado Consolidado — FASE 4 Conciliação Avançada — após PRs #55 e #56

### Estado Atual

- Branch principal: `main`.
- Topo da main: `88ba74d fix(reconciliation): audit all changed fields on reconcile (#56)`.
- Working tree confirmado limpo no QA checkpoint da FASE 4A-4D.
- Nenhum PR aberto no QA checkpoint da FASE 4A-4D.
- Testes atuais: 22 arquivos / 196 testes.

### FASE 4C — Label específico de conciliação no histórico — PR #55

- Commit: `128421e feat(reconciliation): label reconciled history entries (#55)`.
- Arquivo alterado:
  - `src/components/TransactionHistoryDrawer.tsx`.

Entrega:

- `UPDATE + origin=reconcile` agora aparece visualmente como `Conciliada`.
- Origem visual `reconcile` aparece como `Conciliação`.
- `UPDATE` comum segue como `Atualizada`.
- Action persistida continua `UPDATE`.
- Histórico antigo com `origin=reconcile` passa a ser reinterpretado visualmente como `Conciliada`.

Escopo preservado:

- Não alterou `ImportButton`.
- Não alterou `AuditService`.
- Não alterou `ReconciliationEngine`.
- Não alterou schemas.
- Não alterou Firestore rules.
- Não alterou `LedgerService`.
- Não alterou `importHash`.
- Não alterou parser/persistência/package files.

Validações:

- `npm run typecheck`: passou.
- `npm run lint`: passou.
- `npm run test -- --run`: passou com 22 arquivos / 195 testes.
- `npm run build`: passou.

### FASE 4D — Auditoria completa dos campos alterados na conciliação — PR #56

- Commit: `88ba74d fix(reconciliation): audit all changed fields on reconcile (#56)`.
- Arquivos alterados:
  - `src/features/transactions/ImportButton.tsx`.
  - `src/features/transactions/__tests__/reconciliationRouting.test.ts`.

Entrega:

- Adicionado helper local `buildReconciliationHistoryDelta`.
- `processResolvedImportBatch` passou a receber/usar `existingTransactions` para comparar "before" em memória com o payload final conciliado.
- `changedFields` é calculado com `Object.is`.
- Campos auditados:
  - `category`.
  - `description`.
  - `date`.
  - `type`.
  - `source`.
  - `value_cents`.
  - `fitId`.
- `before`/`after` parciais contêm apenas campos realmente alterados.
- Exclui `id`, `uid`, `importHash`, `value` legado.
- Preserva `action: 'UPDATE'`.
- Preserva `origin: 'reconcile'`.
- Reconciliadas continuam por `FirestoreService.updateTransaction`.
- Novas continuam por `onImportTransactions`.

Teste:

- `reconciliationRouting.test.ts` agora cobre auditoria de conciliação com campos alterados, before/after esperados, `origin=reconcile` e ausência de campos proibidos.

Escopo preservado:

- Não alterou `ReconciliationEngine`.
- Não alterou `TransactionHistoryDrawer`.
- Não alterou `AuditService`.
- Não alterou `FirestoreService`.
- Não alterou `LedgerService`.
- Não alterou schemas.
- Não alterou Firestore rules.
- Não alterou `importHash`.
- Não alterou parser/package files.

Validações:

- `npm run typecheck`: passou.
- `npm run lint`: passou.
- `npm run test -- --run`: passou com 22 arquivos / 196 testes.
- `npm run build`: passou.

### QA Checkpoint da FASE 4A-4D

- Veredito: **APROVADO**.
- Branch: `main`.
- Working tree: clean.
- Topo: `88ba74d fix(reconciliation): audit all changed fields on reconcile (#56)`.

Validações:

- `npm run typecheck`: OK.
- `npm run lint`: OK.
- `npm run test -- --run`: OK, 22 arquivos / 196 testes.
- `npm run build`: OK.

Checklist:

- 4A OK: candidato visível antes do clique; mesmo `mergeCandidate` usado no `handleMerge`; critérios data até 3 dias e valor até 1% preservados.
- 4B OK: `findMergeCandidate` testado com cobertura de null/data/valor/match/primeiro válido/labels/reasons/value_cents.
- 4C OK: `UPDATE + origin=reconcile` aparece como `Conciliada`; origem visual como `Conciliação`; `UPDATE` comum segue `Atualizada`; action persistida segue `UPDATE`.
- 4D OK: reconciliadas continuam por `updateTransaction`; novas por `onImportTransactions`; histórico preserva `action=UPDATE` e `origin=reconcile`; delta cobre campos relevantes e exclui `id`, `uid`, `importHash`, `value`.
- Integridade financeira OK: `value_cents` canônico, sem nova soma float, `LedgerService`, `importHash`, parser, rules e schemas intactos.

Achados:

- P0: nenhum.
- P1: nenhum.
- P2: nenhum.
- P3: nenhum defeito funcional identificado.

### Riscos e Lacunas Ainda Abertas

- Delta detalhado depende de `existingTransactions` conter a transação conciliada no momento do commit do import.
- Sem "before" confiável, histórico registra conciliação mas pode ficar sem delta detalhado.
- Semântica persistida continua sendo `action=UPDATE + origin=reconcile`.
- Ainda não há status persistente de conciliação no Firestore.
- Match ainda seleciona o primeiro candidato válido, não o melhor global.
- Descrição ainda não participa do critério de match.
- Sem filtros de conciliadas/não conciliadas no `TransactionsManager`.
- Sem teste `.test.tsx`/E2E do fluxo visual completo de conciliação.

### Próxima Fase Recomendada

**FASE 4E — status persistente de conciliação**.

- Deve começar com investigação read-only.
- Pode envolver `transaction.ts`, schemas e `firestore.rules`.
- Não alterar `LedgerService`.
- Não alterar `importHash`.
- Não alterar parser.
- Não alterar rota de persistência sem análise.
- Avaliar se o status persistente deve incluir:
  - `reconciliationStatus`.
  - `reconciledAt`.
  - `reconciledBy`.
  - `matchedTransactionId`.
  - `reconciliationSource`.
  - `confidenceScore`.
- Não implementar tudo de uma vez sem plano.

> As seções históricas abaixo foram preservadas para manter contexto. Em caso de divergência, o estado consolidado de encerramento da FASE 4 no topo deste arquivo é a referência mais recente.

## Estado Consolidado — FASE 4 Conciliação Avançada — após PRs #52 e #53

### Estado Atual

- Branch principal: `main`.
- Topo da main: `2172796 test(reconciliation): cover merge candidate matching logic (#53)`.
- Working tree confirmado limpo.
- Nenhum PR aberto no encerramento das FASES 4A e 4B.

### FASE 4A — Explicabilidade visual da conciliação — PR #52

- Commit: `34d378d feat(reconciliation): explain merge candidate matches (#52)`.
- Arquivo alterado: `src/features/transactions/ReconciliationEngine.tsx`.

Entrega:

- `findMergeCandidate` passou a retornar informações explicáveis do candidato.
- O card de conciliação agora mostra a transação existente candidata antes do clique em "Conciliar".
- Exibe descrição, data, valor, confiança e razões do match.
- Confiança visual: `Exato`, `Alto`, `Médio`.
- Razões: valor exato/compatível e data igual/próxima.
- O candidato exibido é o mesmo usado no clique de conciliação.

Escopo preservado:

- Não alterou `ImportButton`.
- Não alterou persistência.
- Não alterou `LedgerService`.
- Não alterou `importHash`.
- Não alterou schemas.
- Não alterou Firestore rules.
- Não alterou parser/useParserWorker.
- Não alterou package files.

Risco residual:

- A lógica ainda escolhe o primeiro candidato válido, não necessariamente o melhor candidato global.
- A confiança visual deverá ser revista se thresholds mudarem.

### FASE 4B — Testes unitários da lógica de match — PR #53

- Commit: `2172796 test(reconciliation): cover merge candidate matching logic (#53)`.
- Arquivos:
  - `src/features/transactions/ReconciliationEngine.tsx`.
  - `src/features/transactions/__tests__/reconciliationMatch.test.ts`.

Entrega:

- Exporta `findMergeCandidate`.
- Exporta `MergeCandidateInfo`.
- Adiciona teste unitário da função pura de match.
- Testes cobrem:
  - retorno `null` sem existentes;
  - data acima de 3 dias;
  - valor acima de 1%;
  - match dentro de 3 dias/1%;
  - primeiro candidato válido na ordem do array;
  - `confidenceLabel` `Exato`, `Alto`, `Médio`;
  - reasons de valor exato/compatível;
  - reasons de data igual/próxima;
  - uso canônico de `value_cents`;
  - independência de descrição no critério atual.

Validação:

- `npm run typecheck`: passou.
- `npm run lint`: passou.
- `npm run test -- --run`: passou com 22 arquivos / 195 testes.
- `npm run build`: passou.

Observação:

- PR #53 teve falha de Firebase Hosting Preview por cota de canais (`channel quota reached`), mas CI principal de Typecheck/Lint/Test/Build passou. O merge foi autorizado por falha de infraestrutura, não de código.

### Estado Atual dos Testes

- Antes da FASE 4B: 21 arquivos / 183 testes.
- Depois da FASE 4B: 22 arquivos / 195 testes.

### Próxima Fase Recomendada

**FASE 4C — label específico de conciliação no histórico**.

- Deve começar com investigação read-only.
- Não alterar schema/rules inicialmente.
- Não alterar `LedgerService`.
- Não alterar `importHash`.
- Preferir solução incremental e auditável.

### Riscos e Lacunas Ainda Abertas

- Match ainda seleciona o primeiro candidato válido, não o melhor global.
- Descrição ainda não participa do critério de match.
- Não há status persistente de conciliação no Firestore.
- Histórico ainda pode exibir reconciliação como `UPDATE`/"Atualizada", sem label semântico específico.
- Sem filtros de conciliadas/não conciliadas no `TransactionsManager`.
- Sem teste `.test.tsx`/E2E do fluxo visual completo de conciliação.

> Registro histórico de 4A/4B preservado para contexto. Em caso de divergência, o estado consolidado de encerramento da FASE 4 no topo deste arquivo é a referência mais recente.

## Estado Consolidado — Pós FASE 3 Importação Avançada — 2026-05-04

- Branch principal: `main`.
- Topo da main: `aad22df feat(import): add Brazilian bank mapping templates (#50)`.
- Working tree esperado: limpo; QA final confirmou working tree pós-build limpo.
- Nenhum PR aberto no encerramento da Fase 3.
- **FASE 3 — Importação Avançada**: concluída.
- **QA Final da Fase 3**: aprovado.

### PRs Consolidados da Fase 3

- **#43 — feat(import): add detailed import report**: expandiu `ImportButton.tsx` com relatório final de importação, incluindo arquivo/origem, período, lidas, novas, ignoradas, importáveis, reconciliadas, inválidas, entradas, saídas e saldo. Os totais operam sobre `value_cents`.
- **#44 — feat(import): improve local deduplication fingerprint**: fortaleceu a fingerprint local usada na deduplicação da importação, reduzindo falsos negativos entre registros do arquivo e transações já carregadas sem alterar `importHash`.
- **#45 — feat(import): add cross-page candidate search helper**: criou `src/features/transactions/importCandidateSearch.ts` com busca read-only em `users/{uid}/transactions`, filtrada por período, ordenada por data, limitada por teto seguro e com fallback para `[]` em entradas inválidas ou erro.
- **#47 — feat(import): integrate cross-page candidate search**: integrou o helper ao fluxo do `ImportButton.tsx` em background, com timeout/fallback, status discreto no preview e marcação de duplicatas prováveis no histórico sem bloquear a importação.
- **#48 — feat(import): add accessible PDF password flow**: substituiu o fluxo baseado em prompt por estado `password_required` e painel acessível para senha de PDF, com label, foco, erro de senha, cancelamento e submissão explícita.
- **#49 — feat(import): show custom categories in preview**: conectou categorias do usuário ao preview da importação e passou a exibir opções padrão e personalizadas no seletor de categoria antes de confirmar a importação.
- **#50 — feat(import): add Brazilian bank mapping templates**: adicionou templates e aliases para bancos/formatos brasileiros no mapeamento CSV (`Nubank`, `Inter`, `Itaú`, `Bradesco`, `Banco do Brasil`, `Caixa`, `Santander`, `C6`, `Mercado Pago`, `PicPay` e `Genérico CSV BR`), além de sugestão automática consolidada.

### Validações Finais da Fase 3

- `npm run typecheck`: passou.
- `npm run lint`: passou.
- `npm run test -- --run`: passou, 21 arquivos / 183 testes.
- `npm run build`: passou.
- Working tree pós-build: limpo.
- Achados bloqueantes: P0 nenhum, P1 nenhum, P2 nenhum, P3 bloqueante nenhum.

### Integridade Financeira Preservada

- `value_cents` continua sendo a fonte canônica.
- Somas da importação e do preview operam em centavos inteiros.
- `LedgerService` preservado.
- `importHash` preservado.
- Transações reconciliadas continuam indo por `updateTransaction`, não por importação duplicada.

### Riscos Residuais Pós-Fase 3

- Templates CSV dependem dos headers exportados pelos bancos.
- CSVs com débito/crédito separados ainda exigem revisão manual.
- QA manual visual em navegador não foi executado.
- Ainda não há cobertura `.test.tsx`/E2E para UI de importação.

### Próxima Fase Recomendada

**FASE 4 — Conciliação Avançada**.

Regra obrigatória: antes da Fase 4, iniciar com investigação read-only, plano técnico curto e aprovação explícita antes de qualquer implementação.

> As seções históricas abaixo foram preservadas para manter contexto. Em caso de divergência, o estado consolidado de 2026-05-04 acima é a referência mais recente.

## Estado Consolidado — 2026-05-03

- Branch principal: main
- Último commit consolidado conhecido: `d215c1d feat(import): add cross-page candidate search helper (#45)` — confirmado via `git log --oneline -1 main`.
- Working tree esperado: limpo.
- Repositório: welitonsp/quantum-finance
- Caminho local: `C:\quantum-finance`
- Stack principal: React 19, TypeScript, Vite, Tailwind, Firebase/Firestore, Framer Motion, Chart.js, pdfjs-dist.

## PRs Recentes Consolidados

- **#41** — fix(a11y): resolve residual P3 accessibility issues (múltiplos arquivos do módulo Movimentações).
- **#42** — feat(ux): optimize transaction groups and persistent summary (`TransactionsManager.tsx`).
- **#43** — feat(import): add detailed import report (`ImportButton.tsx`).
- **#44** — feat(import): improve local deduplication fingerprint (`ImportButton.tsx`).
- **#45** — feat(import): add cross-page candidate search helper (`importCandidateSearch.ts`).
- **#47** — feat(import): integrate cross-page candidate search (`ImportButton.tsx`).
- **#48** — feat(import): add accessible PDF password flow (`ImportButton.tsx`).
- **#49** — feat(import): show custom categories in preview (`ImportButton.tsx`).
- **#50** — feat(import): add Brazilian bank mapping templates (`ImportButton.tsx`).

Histórico mais antigo (#17–#40) cobriu: hotfixes P0/P1 financeiros, rodada completa de acessibilidade WCAG 2.1 AA (UX-1A a UX-1G), e série de filtros UX-2A a UX-2H.

## Estado do Módulo Movimentações

- Série UX-2 concluída até UX-2H.
- Resíduos P3 de acessibilidade resolvidos no PR #41.
- Quatro modais principais auditados e acessíveis:
  - `TransactionHistoryDrawer`
  - `AuditTimeline`
  - Modal de importação (`ImportButton`)
  - `ReconciliationEngine`
- Todos com `role="dialog"`, `aria-modal="true"`, `aria-label`/`aria-labelledby`, focus trap manual, fechamento por Escape e retorno de foco ao trigger.
- Sem QA-FINAL formal executado até a data deste registro. Validação até o momento é contínua via PRs com typecheck/lint/test/build verdes em CI.

## Otimizações de Performance Já Aplicadas

- PR #42 entregou otimização de grupos e summary persistente em `TransactionsManager.tsx`.
- Virtualização real da lista (react-virtual / @tanstack/react-virtual) ainda **NÃO** implementada.
- Running balance (saldo acumulado por linha) ainda **NÃO** implementado.

## FASE 3 — Importação Avançada

> Registro histórico do checkpoint intermediário de 2026-05-03. A Fase 3 foi concluída e aprovada em QA final em 2026-05-04; ver seção consolidada no topo deste arquivo.

### Itens entregues

- **PR #43**: relatório detalhado de importação em `ImportButton.tsx`.
- **PR #44**: fingerprint local robusta de deduplicação em `ImportButton.tsx`.
- **PR #45**: helper read-only criado em `src/features/transactions/importCandidateSearch.ts`.

### Assinatura real do helper (confirmada no código)

```ts
export type FindImportCandidateTransactionsParams = {
  uid: string;
  periodStart: string;
  periodEnd: string;
  maxCandidates?: number;
};

export async function findImportCandidateTransactions({
  uid,
  periodStart,
  periodEnd,
  maxCandidates,
}: FindImportCandidateTransactionsParams): Promise<Transaction[]>
```

### Características do helper

- Consulta apenas `users/{uid}/transactions`.
- Não usa `collectionGroup`.
- Não usa coleção global.
- Valida `uid.trim()`, formato ISO de datas e `periodStart <= periodEnd` antes de consultar — retorna `[]` em entrada inválida.
- Filtra por `date >= periodStart` e `date <= periodEnd`.
- Usa `orderBy('date', 'asc')`.
- Usa `limit(maxCandidates)`.
- `maxCandidates` padrão 300, teto 500.
- Em erro, retorna `[]` com `console.warn`.
- Filtra documentos com `isDeleted === true` ou `deletedAt` presente.
- Ainda **NÃO** está integrado no `ImportButton`.

### Itens pendentes da Fase 3 (não iniciados)

- Modal de senha PDF substituindo `window.prompt()` (P2-2).
- Categorias personalizadas na PreviewPanel da importação.
- Suporte a múltiplos arquivos em um único fluxo.
- Parser de QR Code Pix / nota fiscal eletrônica.
- Templates de mapeamento por banco (Nubank, Bradesco, Itaú).

> Atualização 2026-05-04: integração cross-page (#47), senha PDF acessível (#48), categorias personalizadas no preview (#49) e templates brasileiros (#50) foram concluídos e aprovados. Suporte a múltiplos arquivos e parser de QR Code Pix/nota fiscal eletrônica não fazem parte do estado aprovado da Fase 3; reavaliar somente se forem repriorizados.

## Próxima Microfase Planejada

**FASE 4 — Conciliação Avançada**.

Regra de entrada: iniciar com investigação read-only, sem alterações em código funcional, para mapear o estado atual de `Transaction`, `ReconciliationEngine`, `ImportButton`, `useTransactions`, `LedgerService` e regras Firestore antes de propor implementação.

Escopo recomendado para investigação inicial:

- contrato de status de conciliação em `Transaction`;
- motor automático de conciliação;
- ciclo mensal de conciliação;
- bloqueio/lock de transações reconciliadas;
- impactos em auditoria, importação e atualização via `updateTransaction`.

Histórico: a antiga microfase **FASE 3C-1B** foi concluída pelo PR #47.

## Fases Futuras Não Iniciadas

- **Fase 4 — Conciliação Avançada** — campo `status` no Transaction, motor automático, ciclo mensal, lock de conciliados.
- **Fase 5** — Auditoria Forte (paginação do `AuditTimeline`, exportação de relatório, alertas de anomalia).
- **Fase 6** — IA e Automações (regras persistidas, detecção de recorrência, alertas proativos, RAG financeiro).
- **Fase 7** — Prontidão para Produção (Firebase App Check, índices Firestore documentados, Sentry, E2E Playwright, mover chave Gemini para backend).

## Regras Técnicas Permanentes

Estas regras são invioláveis. Qualquer agente que trabalhe no projeto deve respeitá-las:

- `value_cents` é a fonte canônica de valor. `value` é legado/display.
- Cálculos financeiros **NUNCA** podem usar float; sempre operar em centavos inteiros.
- Dados sensíveis ficam exclusivamente sob `users/{uid}/...` no Firestore.
- `importHash` não deve ser alterado sem decisão explícita do owner do projeto.
- `LedgerService` não deve ser alterado sem justificativa técnica forte.
- Transações reconciliadas usam `updateTransaction` (caminho Firestore original), nunca `importTransactions` (que cria documento novo).
- Não instalar dependências sem autorização.
- Não alterar `package.json` ou `package-lock.json` sem autorização.
- Toda fase usa branch própria.
- Antes de implementação crítica: investigação read-only, plano técnico curto e aprovação explícita.

## Pendências Conhecidas

- `src/components/DashboardContent.tsx:106` contém comentário `// FIX P0.2: usar valores reais de moduleBalances (PR 1 conectou via useFinancialData)`. Pendência fora do Módulo Movimentações; deve ser investigada em fase própria.
- Prop `hasUndoSnapshot` recebida pelo `TransactionsManager` mas não consumida internamente. Risco baixo, documentado.
- Projeto possui 21 arquivos `.test.ts` e 0 `.test.tsx`. Lacuna futura em testes de componente React/UI.

## Comandos de Validação Padrão

```bash
npm run typecheck
npm run lint
npm run test -- --run
npm run build
```

Estes quatro comandos devem passar antes de qualquer commit/PR.

## Convenções de Commit

- `feat(escopo): descrição` — para novas features.
- `fix(escopo): descrição` — para correções.
- `chore(escopo): descrição` — para manutenção/infra.
- Escopos comuns: `ux`, `a11y`, `transactions`, `import`, `audit`, `reconciliation`.

## Referência Rápida de Arquivos Críticos

| Arquivo | Tamanho | Responsabilidade |
|---|---|---|
| `src/features/transactions/TransactionsManager.tsx` | ~1166 linhas | Listagem, filtros, ordenação, agrupamento, ações em lote |
| `src/features/transactions/ImportButton.tsx` | ~1728 linhas | Fluxo de importação CSV/OFX/PDF + reconciliação |
| `src/features/transactions/ReconciliationEngine.tsx` | ~440 linhas | Modal de reconciliação interativa |
| `src/features/transactions/importCandidateSearch.ts` | 68 linhas | Helper de busca cross-page (PR #45, integrado no PR #47) |
| `src/components/TransactionHistoryDrawer.tsx` | ~263 linhas | Drawer de histórico por transação |
| `src/components/AuditTimeline.tsx` | ~186 linhas | Drawer de timeline global de auditoria |
| `src/hooks/useTransactions.ts` | ~910 linhas | Hook central de CRUD/paginação/import |
| `src/hooks/useTransactionHistory.ts` | ~175 linhas | Hook de histórico por transação |
| `src/hooks/useAuditLogs.ts` | ~138 linhas | Hook de logs globais |
| `firestore.rules` | — | Regras de segurança com schema versionado v2 |

## Collections Firestore com Regras Explícitas

Todas sob `/users/{userId}/`:

| Subcoleção | Linha em `firestore.rules` |
|---|---|
| (raiz do usuário) | 319 |
| `transactions/{txId}` | 322 |
| `transactions/{txId}/history/{historyId}` | 328 |
| `accounts/{accountId}` | 335 |
| `audit_logs/{logId}` | 342 |
| `system_logs/{logId}` | 348 |
| `usage/ai_calls` | 354 |
| `budgets/{budgetId}` | 361 |
| `categoryRules/{ruleId}` | 368 |
| `categories/{categoryId}` | 375 |
| `creditCards/{cardId}` | 382 |
| `recurringTasks/{taskId}` | 391 |
| `recurring/{taskId}` | 398 |
| `simulations/{simId}` | 402 |
| `/{document=**}` (deny-all catch) | 410 |
