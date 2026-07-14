# Auditoria Técnica Independente (Externa) — 2026-07-11

> **Parecer original:** opinião qualificada, **6,2/10** — "base técnica boa, ainda não em patamar Big Tech por lacunas de consentimento IA, LGPD, autorização em finanças compartilhadas, invariantes monetários sistêmicos e supply chain".
> Fonte: laudo entregue pelo owner em `.docx` (não versionado; este arquivo é o registro canônico).
> **Remediação:** PRs #406–#430 (2ª rodada). Estado por finding abaixo. Pendências vivas: `docs/PENDENCIAS.md`.

## Findings × estado da remediação

| ID | Sev. | Achado | Remediação | Estado |
|----|------|--------|------------|--------|
| F-01 | Alta | Consentimento LGPD/IA declarativo — chat prosseguia sem verificação server-side | `assertAiConsent(uid)` fail-closed antes do Gemini nas 3 callables de IA (#408) | ✅ FECHADO (follow-up: UI mirror) |
| F-02 | Alta | Integridade em finanças compartilhadas — membros alteravam shares/status de terceiros | `createGroupExpense`/`settleGroupExpenseShare` server-trusted + `validateExpenseShares`; create/update de despesa server-only nas Rules (#417) | ✅ FECHADO |
| F-03 | Alta | Convite reutilizável — reentrada após remoção | Callable `acceptGroupInvite` atômico, single-use, com expiração; entrada no grupo server-only (#416) | ✅ FECHADO |
| F-04 | Alta | Export/delete LGPD incompletos | `EXPORTABLE_SUBCOLLECTIONS` 10→20 (#412) + limpeza do `groups` global no delete (#419); recursiveDelete já era completo | ✅ FECHADO |
| F-05 | Alta | Dinheiro em reais/floats residuais | Única conversão float ativa removida (`toCentavos` em `queryContextBuilder`) (#407); demais `*100` são percentuais legítimos | ✅ FECHADO |
| F-06 | Alta | Exclusão de conta sem recent auth | `deleteUserData` exige `auth_time` ≤5 min → `failed-precondition`; UX `REQUIRES_RECENT_LOGIN` (#411) | ✅ FECHADO |
| F-07 | Alta | Recorrentes sem catch-up | `isTaskDueToday` com `>=` (catch-up idempotente) + clamp de fim de mês (#410) | ✅ FECHADO |
| F-08 | Alta | Supply chain CI/CD (`firebase-tools` latest, actions sem pin) | `firebase-tools@15.23.0` fixado + todas as Actions pinadas por commit SHA nos 4 workflows (#425) | ✅ FECHADO |
| F-09 | Média | DoS econômico / custo | `setGlobalOptions({ maxInstances: 20 })` (#409). **Restam:** billing alerts, quotas, paginação (infra/owner) | 🟡 PARCIAL |
| F-10 | Média | Memória local da IA sem TTL | `ConversationMemory` efêmera: sessionStorage + TTL 24h + purge no logout (#406) | ✅ FECHADO |
| F-11 | Média | PWA offline parcial | Cache persistente Firestore (IndexedDB) (#429) + outbox durável IndexedDB para criação via callable (#430) | ✅ FECHADO |
| F-12 | Média | Acessibilidade (65 warnings) | Labels: 42→0 e regra elevada a `error` (#420–#423); total 65→23. **Restam:** `no-autofocus` (9) + divs clicáveis (14) — revisão visual | 🟡 PARCIAL |
| F-13 | Média | Cobertura enviesada (exclui `components/`/`features/`) | — | ⬜ ABERTO |
| F-14 | Média | Performance/CWV sem medição | Workflow `lighthouse.yml` report-only, perfil móvel (#427). Evolução: RUM + budgets por rota | ✅ FECHADO |
| F-15 | Média | Observabilidade (sem SLO/alertas) | — (infra/owner) | ⬜ ABERTO |

**Placar: 11 fechados · 2 parciais (F-09, F-12) · 2 abertos (F-13, F-15).**

## Recomendações estratégicas do laudo (acatadas)

- Manter NFC-e **manual/consentida**; não adicionar busca automática na SEFAZ — coincide com a decisão do owner de 2026-07-04 (fetchNfce ADIADO).
- Digital twin financeiro, copiloto multi-etapa com confirmação humana e finanças compartilhadas server-trusted — já contemplados na Tese Extraordinária e na fase server-trust de shared-finance.

## Próximo marco

Fechar F-12 restante + F-13 (código) e F-09/F-15 (infra) → solicitar **re-auditoria** para revisão da nota.
