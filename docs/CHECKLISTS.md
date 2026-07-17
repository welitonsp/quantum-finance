# Checklists de Qualidade e Release (FASE K)

> Checklists versionados de PR, deploy, rollback e incidente do Quantum Finance.
> Tornam repetível a disciplina já praticada (ver `CLAUDE.md` §10 e §9).
> Complementa [`CI_SETUP.md`](./CI_SETUP.md) e [`INCIDENT_RESPONSE.md`](./INCIDENT_RESPONSE.md).

---

## 1. Checklist de PR (obrigatório antes do merge)

- [ ] Branch própria por fase; PR pequeno e focado.
- [ ] `npm run typecheck` ✅
- [ ] `npm run lint` ✅
- [ ] `npm run test -- --run` ✅
- [ ] `npm run build` ✅
- [ ] `npm run test:rules` ✅ **se** tocou `firestore.rules` (requer emulator/Java).
- [ ] `npm --prefix functions test` ✅ **se** tocou `functions/`.
- [ ] Nenhuma zona proibida alterada sem autorização (`firestore.rules`, `functions/`, `package-lock.json`).
- [ ] Cálculo financeiro só em centavos inteiros; sem `parseFloat`/`Number(x)*100`/`Math.round(x*100)`.
- [ ] Payloads validados com Zod `.strict()`.
- [ ] Logs sanitizados; sem PII/valores/segredos.
- [ ] Modelo A preservado em qualquer UPDATE de transação.
- [ ] Feature com IA declara: dados usados, ação sugerida, confirmação exigida, evento de auditoria.
- [ ] `CLAUDE.md` atualizado se for marco relevante (em PR de docs próprio, padrão #256).

### Matriz de testes por tipo de alteração

| Alteração | Testes obrigatórios |
|---|---|
| Motor puro (`src/lib`) | unit do motor + invariantes monetárias |
| Hook/serviço | unit + (se persiste) Modelo A |
| `firestore.rules` | `test:rules` com casos positivos **e** negativos |
| `functions/` | `npm --prefix functions test` |
| UI | typecheck/lint/build; E2E se fluxo crítico |

---

## 2. Checklist de Deploy

- [ ] Todos os checks de CI verdes (typecheck/lint/test/rules/functions/build).
- [ ] E2E Playwright verde (gate de deploy alinhado ao check `E2E Tests (Playwright)`).
- [ ] `main` atualizada e working tree limpo.
- [ ] Secrets/variáveis confirmados no ambiente (Secret Manager; `VITE_*` só públicas no client).
- [ ] Firestore Rules implantadas via service account (IAM correto).
- [ ] Preview channels com TTL ≤ 3d (evita 429 RESOURCE_EXHAUSTED).
- [ ] Smoke test pós-deploy (login, criar transação, dashboard).

---

## 3. Checklist de Rollback

- [ ] Identificar o último deploy estável (commit/tag).
- [ ] App: `firebase hosting:rollback` ou redeploy do artefato anterior.
- [ ] Rules: redeploy da versão anterior de `firestore.rules` (manter cobertura `test:rules`).
- [ ] Functions: redeploy da revisão anterior; reconfirmar `enforceAppCheck`.
- [ ] Validar que dado gravado no intervalo permanece íntegro (Modelo A não quebrado).
- [ ] Registrar a causa do rollback no risk register.

---

## 4. Checklist de Incidente

> Detalhe completo em [`INCIDENT_RESPONSE.md`](./INCIDENT_RESPONSE.md).

- [ ] Classificar severidade (SEV-1/2/3).
- [ ] Conter (revogar credencial / regra restritiva / desabilitar callable).
- [ ] Comunicar controlador; ANPD + titulares se SEV-1 com dado pessoal.
- [ ] Remediar com PR pequeno **+ teste de regressão**.
- [ ] Post-mortem no [`ARCHITECTURE_RISK_REGISTER.md`](./ARCHITECTURE_RISK_REGISTER.md).

---

## 5. Processo operacional permanente (resumo)

Read-only antes de implementar → plano curto → PR pequeno → auditoria independente →
merge squash → atualizar `main` local → working tree limpo → atualizar `CLAUDE.md` no marco.
