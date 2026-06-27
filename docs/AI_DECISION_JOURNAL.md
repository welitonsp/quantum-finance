# AI Decision Journal — Diário de Decisões do Agente (FASE H-0)

> Define a coleção de auditoria `/decisions`, que registra cada decisão financeira
> mediada pelo agente: o snapshot, a simulação, a proposta, a decisão do usuário e o
> resultado. Normativo para a FASE H.
>
> Pré-requisitos: [`AI_AGENT_GUARDRAILS.md`](./AI_AGENT_GUARDRAILS.md) ·
> [`AI_TOOL_ROUTER.md`](./AI_TOOL_ROUTER.md) ·
> [`AI_RESPONSE_CONTRACT.md`](./AI_RESPONSE_CONTRACT.md).

---

## 1. Finalidade

- **Auditoria**: rastrear que dados o agente usou, o que simulou, o que propôs e o que o
  usuário decidiu — permitindo explicar qualquer ação a posteriori.
- **Confiança**: o usuário pode revisar o histórico de decisões mediadas por IA.
- **Conformidade**: trilha alinhada à Política Copilot IA e à LGPD.

---

## 2. Localização e modelo

- Coleção: **`users/{uid}/decisions/{decisionId}`** — sempre sob o `uid`, nunca global.
- **Append-mostly**: criação permitida ao owner; `outcomeStatus` pode ser atualizado pelo
  caminho server-trusted quando o resultado futuro se materializa. Sem delete client-side.

### Campos mínimos

| Campo | Tipo | Descrição |
|---|---|---|
| `userId` | string | dono da decisão (== `uid` do path) |
| `createdAt` | timestamp | `request.time` na criação |
| `intent` | string | intenção do enum fechado (ver tool router) |
| `question` | string | **pergunta sanitizada** (PII mascarada) |
| `snapshotRef` | string | referência ao snapshot financeiro usado (não o dado bruto) |
| `toolsUsed` | string[] | motores/tools acionados |
| `simulationResult` | map | resultado da simulação em **centavos inteiros** |
| `proposedAction` | map\|null | `ActionProposal` apresentada (ou null se só consulta) |
| `userDecision` | string | `confirmed` \| `rejected` \| `expired` \| `none` |
| `outcomeStatus` | string | `pending` \| `applied` \| `reverted` \| `n/a` |

---

## 3. Regras de privacidade (LGPD)

- **Proibido** persistir conteúdo bruto sensível (extrato/fatura/PDF/CSV/OFX) ou PII
  (CPF, conta, cartão, e-mail, token). `question` entra **mascarada** (`maskPII`).
- `snapshotRef` é uma **referência** (ex.: hash/ID de um snapshot efêmero), não o dado
  financeiro completo.
- Valores monetários sempre em **centavos inteiros**; nunca float.
- Incluída no escopo de **exportação** (`exportAllUserData`) e **exclusão**
  (`deleteUserAccount`) do `DataPrivacyService`.
- Retenção segue `docs/ADR_005_RETENTION_POLICY.md`.

---

## 4. Firestore Rules (implementado na FASE H)

`users/{uid}/decisions/{decisionId}` está coberto em `firestore.rules` e em
`src/__tests__/firestoreRules.audit.test.ts` (bloco "N. decisions collection").
`firestore.rules` continua sendo zona sensível: qualquer alteração futura exige fase
explicitamente autorizada pelo owner e `npm run test:rules`.

Contrato implementado para `users/{uid}/decisions/{decisionId}`:

- `create`: somente owner; `userId == uid`; `createdAt == request.time`;
  `intent` no enum; sem campos fora da whitelist; sem PII/valores brutos proibidos;
  valores monetários inteiros seguros.
- `update`: restrito à transição de `outcomeStatus`/`userDecision` (idealmente
  server-trusted); imutabilidade de `createdAt`, `intent`, `snapshotRef`.
- `delete`: bloqueado para clients (apenas hard-delete LGPD via Admin SDK).

---

## 5. Critérios de aceite

- [ ] Coleção sob `users/{uid}/decisions`, jamais global.
- [ ] `question` mascarada; nenhum conteúdo bruto/PII persistido.
- [ ] `simulationResult` em centavos inteiros.
- [ ] Incluída em export e delete LGPD.
- [x] Rules cobertas por `test:rules` (bloco N da auditoria de rules).
- [ ] Ciclo registrado: snapshot → simulação → proposta → decisão → resultado.
