# RIPD — Relatório de Impacto à Proteção de Dados Pessoais (FASE I)

> Relatório de Impacto à Proteção de Dados (LGPD art. 38) do Quantum Finance.
> Consolida o tratamento de dados pessoais e financeiros, riscos e salvaguardas.
> Complementa: [`DATA_INVENTORY.md`](./DATA_INVENTORY.md),
> [`ACCESS_MATRIX.md`](./ACCESS_MATRIX.md),
> [`ADR_005_RETENTION_POLICY.md`](./ADR_005_RETENTION_POLICY.md),
> [`SECURITY.md`](./SECURITY.md) e [`INCIDENT_RESPONSE.md`](./INCIDENT_RESPONSE.md).
>
> Versão: 2026-06-19. Revisar a cada marco que altere coleta, finalidade ou retenção.

---

## 1. Identificação

| Item | Descrição |
|---|---|
| Controlador | Titular operador do Quantum Finance (uso pessoal/individual) |
| Aplicação | Quantum Finance — gestão financeira pessoal |
| Base legal predominante | Consentimento do titular (art. 7º, I) e legítimo interesse para segurança |
| Encarregado (DPO) | A designar pelo controlador antes de operação multiusuário |

---

## 2. Dados pessoais tratados

| Categoria | Exemplos | Sensibilidade |
|---|---|---|
| Identificação | e-mail (auth), UID Firebase | Média |
| Financeiros | transações, saldos, faturas, dívidas, metas, orçamentos (`value_cents`) | **Alta (P0)** |
| Documentos importados | extratos CSV/OFX/PDF, comprovantes | **Alta (P0)** |
| Comportamentais | categorização, recorrências, decisões do agente (`/decisions`) | Média |
| Técnicos | tokens FCM, logs sanitizados, App Check | Baixa |

Inventário completo e localização: [`DATA_INVENTORY.md`](./DATA_INVENTORY.md). Todos os
dados pessoais residem sob `users/{uid}/...` no Firestore.

---

## 3. Finalidades e minimização

- **Finalidade única:** prover ao próprio titular controle financeiro, análises e
  recomendações. Não há compartilhamento com terceiros nem publicidade.
- **Minimização:** persiste-se apenas o dado normalizado necessário. Conteúdo bruto de
  documentos é processado preferencialmente em memória; não se loga conteúdo bruto.
- **IA:** PII é mascarada (`maskPII`) antes de qualquer envio ao modelo; a chave Gemini
  reside apenas no backend (Secret Manager). Ver [`AI_AGENT_GUARDRAILS.md`](./AI_AGENT_GUARDRAILS.md).

---

## 4. Fluxo e salvaguardas técnicas

| Salvaguarda | Estado |
|---|---|
| Isolamento por usuário (`users/{uid}`) | ✅ Firestore Rules |
| Validação de schema na borda | ✅ Rules versionadas + Zod `.strict()` |
| Trilha de auditoria imutável (Modelo A) | ✅ `history` append-only pareado por batch |
| Logs sanitizados (sem PII/valores/segredos) | ✅ `consoleLoggingPolicy.test.ts` |
| App Check + replay protection | ✅ 5 callables (`enforceAppCheck` + `consumeAppCheckToken`) |
| Criptografia em trânsito/repouso | ✅ Firebase (TLS + criptografia gerenciada) |
| Diário de decisões de IA auditável | ✅ contrato `/decisions` (FASE H) |

---

## 5. Direitos do titular (LGPD art. 18)

| Direito | Implementação |
|---|---|
| Acesso / portabilidade | `DataPrivacyService.exportAllUserData()` (export completo) |
| Eliminação | `deleteUserAccount()` → `recursiveDelete(users/{uid})` + `auth().deleteUser` (Admin SDK) |
| Revogação de consentimento | coleção `consents/` + `DataPrivacyPanel` |
| Informação sobre tratamento | este RIPD + [`DATA_INVENTORY.md`](./DATA_INVENTORY.md) |

Retenção e descarte: [`ADR_005_RETENTION_POLICY.md`](./ADR_005_RETENTION_POLICY.md).

---

## 6. Matriz de risco residual

| Risco | Probab. | Impacto | Mitigação | Residual |
|---|---|---|---|---|
| Vazamento de PII em logs | Baixa | Alto | Política de logs + teste estático | **Baixo** |
| Acesso cruzado entre usuários | Muito baixa | Alto | Rules `isOwner` + testes emulator | **Baixo** |
| Exposição da chave de IA | Muito baixa | Alto | Secret Manager (server-only) | **Baixo** |
| LLM expõe/alucina dado financeiro | Baixa | Médio | `maskPII` + contrato de resposta (sem número literal) | **Baixo** |
| NFC-e / SSRF (não implementado) | — | Alto | **Bloqueado** até gate SSRF completo | N/A |
| Migração float→cents legada | Baixa | Médio | Migração automática **bloqueada**; diagnóstico read-only | **Baixo** |

---

## 7. Pendências e recomendações

- [ ] Designar formalmente o Encarregado (DPO) antes de qualquer operação multiusuário.
- [ ] Publicar política de privacidade e termos de uso voltados ao titular final.
- [ ] Revisar este RIPD ao habilitar o Agente Financeiro com ações de escrita (FASE H plena).
- [ ] Manter NFC-e bloqueada até threat model SSRF completo com validação estrita de host.
