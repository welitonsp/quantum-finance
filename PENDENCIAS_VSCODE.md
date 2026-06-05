# Pendências — Execução Local (VS Code)

> Documento gerado em 2026-06-05 para handoff ao Claude Code no VS Code.
> Branch de trabalho: `claude/lucid-edison-49u6i`
> Último commit: `f179f54 test(hooks): add direct coverage for transaction refactors (FASE 10G-1) (#160)`

---

## 1. Validação inicial obrigatória

Execute na raiz do projeto antes de qualquer alteração:

```bash
npm install
npm run typecheck
npm run lint
npm run test -- --run
npm run build
```

**Resultados esperados:**
- `typecheck`: sem erros
- `lint`: sem erros
- `test`: 808+ passando · 2 suites com `auth/invalid-api-key` (erro de ambiente, não de código — ignorar)
- `build`: sem erros

---

## 2. Pendência crítica — LGPD: deleção incompleta de conta

### Contexto

`src/shared/services/DataPrivacyService.ts` implementa `deleteUserAccount(uid)` mas deleta apenas 4 das 10 subcoleções do usuário:

```ts
// Atual — deleta apenas:
const DELETABLE_SUBCOLLECTIONS = [
  'budgets',
  'categoryRules',
  'creditCards',
  'simulations',
];

// NÃO deleta: transactions, accounts, audit_logs, system_logs, recurringTasks, categories
```

### Decisão necessária antes de implementar

As subcoleções `transactions` e `audit_logs` não são deletadas. Isso pode ser:
- **Intencional**: retenção para fins de auditoria/compliance → documentar no CLAUDE.md e no código
- **Lacuna**: precisa ser corrigida para conformidade LGPD

### O que implementar (caso a decisão seja deletar tudo)

Estender `DELETABLE_SUBCOLLECTIONS` em `DataPrivacyService.ts` para incluir as demais subcoleções, **respeitando as Firestore Rules vigentes**. As subcoleções com rules mais restritivas (`transactions`, `audit_logs`) exigem atenção especial — o delete client-side pode ser bloqueado pelas rules se não houver permissão explícita.

Verificar em `firestore.rules` se cada subcoleção tem `delete: if isOwner()` antes de adicionar ao array.

### Arquivos envolvidos

| Arquivo | Linha | O que fazer |
|---|---|---|
| `src/shared/services/DataPrivacyService.ts` | 28–33 | Ampliar `DELETABLE_SUBCOLLECTIONS` conforme decisão |
| `src/features/settings/DataPrivacyPanel.test.ts` | — | Atualizar testes para cobrir subcoleções adicionais |
| `firestore.rules` | — | Verificar se rules permitem delete client-side para cada subcoleção |
| `CLAUDE.md` | Seção "3. Contratos críticos vivos" | Documentar política de retenção LGPD |

---

## 3. Pendência média — SnapshotWindow não documentado no CLAUDE.md

### Contexto

O PR #156 adicionou o tipo `SnapshotWindow` em `useTransactions.ts` (linhas 40–44), que habilita filtro server-side por janela de datas. Esse recurso existe no hook mas **não está documentado no CLAUDE.md** e não está claro se algum componente já o usa.

### O que fazer

1. Verificar se `TransactionsManager.tsx` ou outro componente já passa `snapshotWindow` para `useTransactions`
2. Se não usar ainda: documentar como feature pendente de integração
3. Atualizar CLAUDE.md — seção "Hooks presentes" — mencionando a capacidade de SnapshotWindow

---

## 4. Pendência — CLAUDE.md desatualizado

Os seguintes campos precisam ser atualizados:

| Campo | Valor atual (CLAUDE.md) | Valor real |
|---|---|---|
| Total de testes | 645 passando | 808 passando |
| Arquivos de teste | 41 | ~49 (verificar com `find src -name '*.test.*' | wc -l`) |
| WIP listados | `useAuditLogs.test.ts`, `useCreditCards.test.ts`, etc. | Todos concluídos e mergeados |
| SnapshotWindow | Não mencionado | Implementado no PR #156 |
| LGPD | Não mencionado como implementado | PR #159 entregou `DataPrivacyService` |

### Seções a atualizar

- **Seção 1 (Status atual)**: atualizar topo do branch, remover WIP
- **Seção 6 (Próximas etapas)**: remover item "Commitar WIP restante" (já feito); adicionar LGPD B-2 como em andamento
- **Suíte de testes**: atualizar contagens
- **Hooks presentes**: adicionar `useTransactionsPagination` já listado mas sem menção ao SnapshotWindow

---

## 5. Pendência menor — package-lock.json

O `npm install` no ambiente remoto gerou uma diferença mínima no `package-lock.json` (limpeza de metadados, sem mudança de dependências). Localmente, após `npm install`, verifique se o arquivo fica limpo ou se há diff. Se houver diff, commitar com:

```bash
git add package-lock.json
git commit -m "chore(deps): update package-lock.json after npm install"
```

---

## 6. Checklist de execução

```
[ ] npm install && npm run typecheck && npm run lint && npm run test -- --run && npm run build
[ ] Decidir política de retenção LGPD (deletar tudo vs. manter transactions/audit_logs)
[ ] Implementar decisão LGPD em DataPrivacyService.ts
[ ] Atualizar testes em DataPrivacyPanel.test.ts
[ ] Verificar uso de SnapshotWindow em componentes
[ ] Atualizar CLAUDE.md com contagens reais e estado atual
[ ] Commitar package-lock.json se necessário
```

---

## Referência de arquivos críticos para esta sessão

| Arquivo | Linhas | Responsabilidade |
|---|---|---|
| `src/shared/services/DataPrivacyService.ts` | 156 | Export + delete LGPD |
| `src/features/settings/DataPrivacyPanel.test.ts` | 237 | Testes do fluxo de privacidade |
| `src/hooks/useTransactions.ts` | 972 | SnapshotWindow na linha 40–44 |
| `firestore.rules` | 1019 | Verificar permissões de delete por subcoleção |
| `CLAUDE.md` | 1162 | Base de conhecimento — atualizar contagens |
