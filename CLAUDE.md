# Quantum Finance — Base de Conhecimento do Projeto

> Este arquivo é o ponto de entrada de contexto para qualquer agente de IA (Claude, Codex, etc.) que trabalhe no projeto. Mantenha-o atualizado a cada marco relevante. Não use este arquivo para guardar credenciais ou dados sensíveis.

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

## Próxima Microfase Planejada

**FASE 3C-1B** — integrar `findImportCandidateTransactions` no `ImportButton` com:

- fallback obrigatório (se a chamada falhar, fluxo de importação continua normalmente);
- status/UX discreto (sem bloquear o usuário);
- sem alterar `LedgerService`;
- sem alterar `importHash`;
- sem alterar parser;
- sem alterar schemas;
- sem alterar Firestore rules;
- sem alterar persistência.

## Fases Futuras Não Iniciadas

- **Fase 4** — Conciliação (campo `status` no Transaction, motor automático, ciclo mensal, lock de conciliados).
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
| `src/features/transactions/ImportButton.tsx` | ~1045 linhas | Fluxo de importação CSV/OFX/PDF + reconciliação |
| `src/features/transactions/ReconciliationEngine.tsx` | ~440 linhas | Modal de reconciliação interativa |
| `src/features/transactions/importCandidateSearch.ts` | 69 linhas | Helper de busca cross-page (NOVO no PR #45) |
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
