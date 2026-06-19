# Fluxo de Resposta a Incidentes (FASE I)

> Procedimento de resposta a incidentes de segurança/privacidade do Quantum Finance.
> Alinhado à LGPD (art. 48 — comunicação de incidente) e ao [`RIPD.md`](./RIPD.md).
> Complementa [`SECURITY.md`](./SECURITY.md) e [`ARCHITECTURE_RISK_REGISTER.md`](./ARCHITECTURE_RISK_REGISTER.md).

---

## 1. Classificação de severidade

| Sev | Definição | Exemplos | Prazo de resposta |
|---|---|---|---|
| **SEV-1** | Exposição/perda de dados pessoais; acesso cruzado entre usuários | Bypass de Rules, vazamento de PII, chave de IA exposta | Imediato (≤ 1h) |
| **SEV-2** | Risco de integridade financeira sem vazamento | Cálculo monetário incorreto em produção, perda de atomicidade | ≤ 4h |
| **SEV-3** | Degradação sem dado em risco | Indisponibilidade, falha de deploy, quota | ≤ 24h |

---

## 2. Ciclo de resposta (IDCR-A)

1. **Identificar** — confirmar o incidente; registrar horário, alcance e severidade.
2. **Conter** — interromper a exposição:
   - revogar credenciais/chaves comprometidas (rotacionar `GEMINI_API_KEY` via Secret Manager);
   - se for falha de Rules, fazer deploy de regra restritiva (`allow … if false`) na coleção afetada;
   - desabilitar a callable afetada se aplicável.
3. **Comunicar** — notificar o controlador; para SEV-1 com dado pessoal, preparar
   comunicação à ANPD e aos titulares (LGPD art. 48) dentro do prazo razoável.
4. **Remediar** — corrigir a causa-raiz com PR pequeno + teste de regressão
   (ex.: novo caso em `firestoreRules.audit.test.ts` para falha de Rules).
5. **Aprender (post-mortem)** — registrar no [`ARCHITECTURE_RISK_REGISTER.md`](./ARCHITECTURE_RISK_REGISTER.md):
   linha do tempo, causa-raiz, ação corretiva e ação preventiva.

---

## 3. Playbooks rápidos

### 3.1 Suspeita de acesso cruzado entre usuários (SEV-1)
- Deploy imediato de regra restritiva na coleção afetada.
- Auditar `firestore.rules` + cobrir o caso com teste negativo no emulator.
- Verificar `audit_logs`/`history` para alcance.

### 3.2 PII em logs (SEV-1/2)
- Identificar a origem (deve usar `logSanitizedFirebaseError`).
- Corrigir e reforçar `consoleLoggingPolicy.test.ts`.
- Purga de logs afetados conforme retenção.

### 3.3 Chave de IA exposta (SEV-1)
- Rotacionar `GEMINI_API_KEY` (Secret Manager) e redeploy de functions.
- Confirmar que nenhuma chave vazou para o bundle client (`VITE_*`).

### 3.4 Erro de integridade monetária (SEV-2)
- Congelar o fluxo afetado; validar `value_cents` canônico.
- Corrigir com motor puro + teste; nunca migrar float automaticamente.

---

## 4. Contatos e responsabilidades

| Papel | Responsabilidade |
|---|---|
| Controlador / owner | Decisão de comunicação à ANPD e titulares |
| Encarregado (DPO) | A designar — coordena resposta LGPD |
| Operador técnico | Contenção e remediação |

> Manter este fluxo testável: toda correção de SEV-1/2 deve incluir um teste de
> regressão automatizado antes do merge.
