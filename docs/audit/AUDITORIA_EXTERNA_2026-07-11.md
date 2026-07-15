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
| F-12 | Média | Acessibilidade (65 warnings) | 65→0: labels (#420–#423), foco programático + Esc (#434/#437), semântica real em clicáveis (#435), 3 regras jsx-a11y elevadas a `error` no CI (#438); bônus: sidebar 20→7 destinos + TopTabs ARIA + ⌘K (#439–#442) | ✅ FECHADO |
| F-13 | Média | Cobertura enviesada (exclui `components/`/`features/`) | Risk-based em 4 fatias: 27 pure-logic (#443) + 41 hooks Firebase (#444) + 31 módulos de import com schema Zod real (#445) + 17 RTL nas superfícies de entrada de dinheiro TransactionForm/TransferForm (#448). Scope de cobertura expandido a cada fatia; real: stmts 78,6 / branches 69,2 / funcs 80,1 / lines 81,9 | ✅ FECHADO (risk-based) |
| F-14 | Média | Performance/CWV sem medição | Workflow `lighthouse.yml` report-only, perfil móvel (#427). Evolução: RUM + budgets por rota | ✅ FECHADO |
| F-15 | Média | Observabilidade (sem SLO/alertas) | — (infra/owner) | ⬜ ABERTO |

**Placar (2026-07-15): 13 fechados · 1 parcial (F-09, resto é console/owner) · 1 aberto (F-15, infra/owner).** Todas as pendências **de código** da auditoria estão fechadas.

## Dossiê para re-auditoria (2026-07-15)

- **Escopo remediado desde a nota 6,2:** PRs #406–#448. Fechados hoje: F-12 (a11y zerada + gate de regressão + navegação consolidada) e F-13 (116 testes novos risk-based; suíte em 1982 unit + 227 rules + 303 functions + 28 E2E).
- **Hardening adicional descoberto e corrigido durante o F-13:** `npm run typecheck` quebrado na main (branded type `Centavos` escapando do vitest/esbuild — #444) e incidente de CI vermelho #440→#447 (E2E desalinhado da navegação nova + bundle budget estourado no runner; corrigido com specs atualizados + code-split `vendor-react`, index 499→324 KB).
- **Fora do alcance de código (declarar como roadmap na re-auditoria):** F-09 restante (billing alerts/quotas — console GCP) e F-15 (SLOs/alertas — infra), ambos owner-pending em `docs/PENDENCIAS.md` §2.
- **Processo recomendado ao owner antes da re-auditoria:** required checks (`Typecheck, Lint, Test, Build` + `E2E Tests (Playwright)`) no branch protection da `main`.

## Recomendações estratégicas do laudo (acatadas)

- Manter NFC-e **manual/consentida**; não adicionar busca automática na SEFAZ — coincide com a decisão do owner de 2026-07-04 (fetchNfce ADIADO).
- Digital twin financeiro, copiloto multi-etapa com confirmação humana e finanças compartilhadas server-trusted — já contemplados na Tese Extraordinária e na fase server-trust de shared-finance.

## Próximo marco

~~Fechar F-12 restante + F-13 (código)~~ ✅ feito (2026-07-15). **Pronto para solicitar re-auditoria** — F-09/F-15 declarados como roadmap de infra (owner).
