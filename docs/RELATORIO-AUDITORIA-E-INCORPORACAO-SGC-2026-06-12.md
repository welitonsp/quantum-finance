# Relatório de Auditoria e Incorporação: Sistema Gestão de Compras (SGC)
**Data:** 12 de Junho de 2026

## 1. Contexto e Decisão Estratégica
Como parte da visão **Quantum Finance 2.0**, o projeto autônomo "Sistema Gestão de Compras" foi descontinuado como produto independente. O SGC servirá unicamente como base conceitual para o futuro módulo **Compras Inteligentes**, que será integrado de forma nativa ao Quantum Finance.

## 2. Incorporação
- Nenhuma base de código do SGC antigo será migrada ou aproveitada em seu estado atual.
- Modelos lógicos, fluxos de uso (planejamento de listas, carrinho real, categorias de supermercado) atuarão como documentação e especificação para a reconstrução dentro da arquitetura oficial do Quantum.

## 3. Riscos de Segurança (NFC-e)
- O fluxo de captura e importação fiscal via **NFC-e real está temporariamente bloqueado**.
- A retomada ou desenvolvimento deste recurso está estritamente condicionada à formulação de um **Threat Model robusto contra SSRF** (Server-Side Request Forgery).
- Qualquer futura implementação de NFC-e exigirá:
  - Validação estrita de host e domínio permitidos (allowlist);
  - Garantia de logs rigorosamente sanitizados (sem vazamento de URLs ou dados pessoais);
  - Etapa obrigatória de revisão humana para aceitação dos dados processados.

## 4. Conformidade e Limites Invioláveis
Na elaboração do novo módulo "Compras Inteligentes", as seguintes **zonas proibidas** devem ser respeitadas sob qualquer circunstância:
- **Camada Financeira:** Valores financeiros processados exclusivamente com `Decimal.js` e salvos em centavos inteiros (`value_cents`). Uso de Float nativo ou `Number` é banido.
- **Payloads:** Todo payload de transação utilizará as regras de schema validadas via `Zod .strict()`.
- **Integridade Atômica:** Qualquer gravação decorrente de lista de compras ou NFC-e usará o **Modelo A Obrigatório**, gerando writes atômicos pareados com sua respectiva trilha de histórico (`history append-only`).
- **Idempotência:** Todo endpoint ou lógica de inserção deve ser idempotente, blindado por server-side check.
- **Firestore Rules e App Check:** A proteção perimetral via App Check e a governança nas Firestore Rules (sempre sob `users/{uid}`) não poderão ser contornadas.
- **Cloud Functions / package-lock:** Nenhuma alteração nestes âmbitos sem o processo regular de uma nova fase específica (ou QA explícito).

## 5. Próximos Passos
- Esta documentação substitui esforços de migração direta e decreta o início da fase focada no **inventário read-only de UI/produto**.
