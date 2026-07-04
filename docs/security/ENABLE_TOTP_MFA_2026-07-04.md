# Habilitação de MFA TOTP no projeto (Identity Platform)

Data: 2026-07-04
Projeto: `quantum-finance-39235` (Identity Platform já ativo)
Script: `functions/scripts/enableTotpMfa.js`
Contexto: PRs #349/#351 entregaram o MFA TOTP no app (resolver de sign-in +
painel de inscrição). O provider TOTP precisa estar ENABLED no nível do
projeto para a inscrição funcionar. O console do Firebase só expõe o toggle
de SMS; TOTP é habilitado via Admin SDK/REST — este procedimento usa o
método oficial `getAuth().projectConfigManager().updateProjectConfig()`.

## Decisões

| Item | Decisão | Motivo |
|---|---|---|
| Provider habilitado | **Somente TOTP** | Requisito do owner; SMS tem custo e superfície de SIM-swap. |
| SMS | **Intocado** (permanece desativado) | O update nunca envia `factorIds` — campo não enviado não é alterado. |
| `adjacentIntervals` | **5** (default da plataforma, faixa 1–10) | Tolerância conservadora a clock-drift do autenticador (~±2,5 min). |
| Providers de login (Google) | **Intocados** | O update envia somente `multiFactorConfig`. |
| Secrets | **Nenhum envolvido** | Config de MFA não contém secret; a saída do script é restrita ao bloco MFA. |

## Procedimento

Credenciais: ADC (`gcloud auth application-default login`) com papel
**Firebase Authentication Admin** (ou owner/editor) no projeto, OU
`GOOGLE_APPLICATION_CREDENTIALS` apontando para service account com esse papel.

```bash
cd functions

# 1. Estado atual (read-only; exit 2 se TOTP não habilitado):
FIREBASE_PROJECT_ID=quantum-finance-39235 node scripts/enableTotpMfa.js --check

# 2. Habilitar TOTP (adjacentIntervals=5 por default):
FIREBASE_PROJECT_ID=quantum-finance-39235 node scripts/enableTotpMfa.js --execute

# 3. Validação obrigatória pós-execução (deve imprimir "✔ TOTP está ENABLED."):
FIREBASE_PROJECT_ID=quantum-finance-39235 node scripts/enableTotpMfa.js --check
```

Validação alternativa via REST (mesma API que o SDK usa por baixo):

```bash
curl -s -H "Authorization: Bearer $(gcloud auth application-default print-access-token)" \
  "https://identitytoolkit.googleapis.com/admin/v2/projects/quantum-finance-39235/config" \
  | grep -A 6 '"mfa"'
```

## Guardrails do script

- `--execute` obrigatório para escrever; sem flag válida o script não roda.
- Recusa project ids de emulador (`demo-quantum-finance`, `fake-project`).
- Pós-update, o script confere que TOTP == ENABLED **e** que SMS não mudou;
  qualquer divergência sai com exit 1 e instrução de reversão.
- Saída sanitizada: apenas o bloco MFA, nunca o config completo do projeto.

## Reversão

Para desabilitar TOTP: mesmo `updateProjectConfig` com
`providerConfigs: [{ state: 'DISABLED', totpProviderConfig: { adjacentIntervals: 5 } }]`
(ou via console → Authentication → Sign-in method → Multi-factor, que passa a
exibir TOTP depois de habilitado via API).

## Registro de execução

| Data | Ação | Resultado |
|---|---|---|
| 2026-07-04 | `--check` inicial | MFA DISABLED · TOTP ABSENT · SMS inativo (estado descrito pelo owner confirmado) |
| 2026-07-04 | `--execute` (autorizado pelo owner, ADC local) | MFA ENABLED · **TOTP ENABLED** · adjacentIntervals=5 · SMS **inativo** (inalterado) |
| 2026-07-04 | `--check` de validação | `✔ TOTP está ENABLED.` — exit 0 |

**Status: CONCLUÍDO.** O painel MFA em Settings (PR #351) está funcional em produção; o
enrollment TOTP pode ser testado de ponta a ponta pelo owner.
