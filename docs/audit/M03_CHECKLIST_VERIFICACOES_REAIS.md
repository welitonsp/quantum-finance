# M-03 — Checklist de Verificações Reais (owner-pending)

> Finding **M-03** da Auditoria Big Four (`docs/audit/AUDITORIA_BIG_FOUR_2026-07-09.md`).
> Estas verificações **não podem ser automatizadas** — exigem um dispositivo físico / console real.
> Este documento é o roteiro passo a passo para o **owner** executar e registrar o resultado.
>
> Ao concluir cada item, marque `[x]`, anote data + dispositivo, e (se aplicável) anexe evidência
> (print/console). Depois atualize o status do M-03 no `CLAUDE.md`.

Legenda de status: ⬜ pendente · ✅ verificado OK · ❌ falhou (abrir issue)

---

## 1. MFA TOTP — fluxo ponta a ponta

Código já entregue e habilitado em produção: PRs #349/#351/#353; TOTP ativo no projeto
(`docs/security/ENABLE_TOTP_MFA_2026-07-04.md`). Falta a **prova de ponta a ponta em dispositivo real**.

Pré-requisitos: um app autenticador (Google Authenticator, Authy, 1Password, etc.) e uma conta de teste.

- [ ] **Inscrição (enroll)** — ⬜
  1. Login na conta de teste → **Configurações → Segurança/MFA** (`MfaPanel`).
  2. Iniciar inscrição TOTP → escanear o QR code (ou digitar a chave Base32) no app autenticador.
  3. Digitar o código de 6 dígitos → confirmar.
  4. **Esperado:** fator aparece como inscrito; nenhum erro `auth/operation-not-allowed`.
- [ ] **Sign-in com desafio MFA** — ⬜
  1. Fazer logout.
  2. Login com email+senha → deve **interromper** pedindo o código TOTP (`LoginScreen` prompt).
  3. Digitar o código atual do autenticador → concluir login.
  4. **Esperado:** login conclui; sem loop; sem lockout.
- [ ] **Código inválido é rejeitado** — ⬜ (digitar 6 dígitos errados → mensagem de erro clara, sem travar).
- [ ] **Remoção do fator (unenroll)** — ⬜ (exige login recente; testar remover e re-inscrever).
- [ ] **Registro:** data ___ · dispositivo ___ · resultado ___

## 2. FCM Background Push — briefing diário

Código já entregue: PR #359 (`src/sw.ts` com `onBackgroundMessage`; scheduled `sendPushReminders`
11:00 UTC = 08:00 BRT; payload sem PII). Falta **confirmar recebimento em dispositivo real**.

Pré-requisitos: dispositivo com o PWA instalado (Android/desktop Chrome), permissão de notificação.

- [ ] **Ativar push** — ⬜
  1. Abrir o PWA → **Governança/Configurações** → ativar notificações.
  2. Conceder permissão no navegador/SO.
  3. **Esperado:** token FCM salvo em `users/{uid}/fcmTokens` (verificável no console Firestore).
- [ ] **Mensagem de teste (rápida)** — ⬜
  1. Firebase Console → **Cloud Messaging → Enviar mensagem de teste** → colar o token do passo anterior.
  2. **Esperado:** notificação chega com o app em **background** (aba fechada/minimizada).
- [ ] **Briefing agendado (fim a fim)** — ⬜
  1. Garantir que a conta tenha recorrentes vencendo hoje e/ou fatura fechando hoje.
  2. Aguardar o disparo diário (08:00 BRT) **ou** invocar a function manualmente em ambiente de teste.
  3. **Esperado:** notificação com contagens + total BRL; **sem PII** (sem descrições/valores individuais).
- [ ] **Sanidade de privacidade** — ⬜ (inspecionar o payload recebido: só contagens e total agregado).
- [ ] **Registro:** data ___ · dispositivo ___ · resultado ___

## 3. NFC-e real — importação por QR/colagem

Código já entregue: PRs #352/#354/#355/#356 (parser XML/HTML local, gate SSRF, UI de importação).
**Fetch automático na SEFAZ permanece ADIADO por decisão do owner** — não testar/implementar isso.
Aqui só se valida o **fluxo local** com uma nota fiscal real.

Pré-requisitos: uma NFC-e real (modelo 65) — XML ou HTML do portal, obtido via QR code da nota.

- [ ] **Importar XML** — ⬜
  1. **Compras → Importar NFC-e** → colar o XML da nota.
  2. **Esperado:** itens extraídos (descrição fiscal, qtde, unidade, preço em centavos); chave validada (DV módulo-11).
- [ ] **Importar HTML colado** — ⬜ (repetir com o HTML do portal nacional; roteador `parseNfceDocument`).
- [ ] **Revisão humana obrigatória** — ⬜ (editar preço/qtde/unidade antes de confirmar; confirmar que nada grava sem revisão).
- [ ] **Registro de observação de preço** — ⬜
  1. Confirmar → 1 `priceObservation` por item via callable `recordPriceObservation` (rate-limited).
  2. **Esperado:** observações aparecem no histórico/Radar de Compras; CPF do comprador **nunca** extraído.
- [ ] **Zero rede no fluxo do usuário** — ⬜ (confirmar que a importação não faz requisições à SEFAZ).
- [ ] **Registro:** data ___ · nota (UF/loja) ___ · resultado ___

---

## Encerramento do M-03

- [ ] Todos os itens acima ✅.
- [ ] Atualizar `CLAUDE.md`: mover **M-03** de "ABERTO, owner-pending" para "FECHADO (verificado em dispositivo YYYY-MM-DD)".
- [ ] Se algum item ❌: abrir issue com evidência e manter M-03 aberto apenas para o item pendente.

> Observação: itens 1–3 têm **cobertura de código/unit/integração** já no verde (MFA wrappers, pushReminders puro,
> parsers NFC-e + gate SSRF). O que falta é exclusivamente a **prova em ambiente real**, fora do alcance de CI.
