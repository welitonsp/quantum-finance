# Quantum Finance 2.0 — Tese de Produto Extraordinário

> **Autor:** Claude (Opus 4.8), sob as premissas do Claude Fable 5 · **Data:** 2026-07-09
> **Status:** Visão estratégica — insumo para priorização de fases. Não altera zonas proibidas.
> **Documento mestre relacionado:** `docs/product/QUANTUM_FINANCE_VISAO_ESTRATEGICA_2_0.md`

## Tese central

Engenharia excelente é fundação, não diferencial. O que coloca o Quantum Finance à frente de Nubank, Mobills, Organizze, YNAB e Copilot Money é conectar **três ativos que nenhum concorrente tem juntos** numa narrativa que não pode ser copiada sem reconstruir o backend.

## Os 3 ativos que já são o fosso (moat)

| Ativo já construído | Por que é raro | Custo de cópia p/ concorrente |
|---|---|---|
| **Contrato de mutação confirmada do Agente** (LLM nunca grava → Zod strict → humano → callable revalidada) | Concorrentes colam chatbots que alucinam saldo. Aqui a IA age com garantia matemática e auditoria | Reescrever todo o backend financeiro |
| **`priceIntelligence` + NFC-e real** (preços de notas fiscais reais, cesta por loja, basis points inteiros) | Ninguém no varejo pessoal tem preços verificados por documento fiscal | Rede de captura NFC-e + motor puro |
| **Modelo A + Diário de Decisões (`/decisions`)** | Cada decisão (humana e da IA) é append-only e auditável | Arquitetura de ledger que não têm |

Nenhum concorrente tem os três. **A tese é conectá-los.**

## As 5 premissas Fable 5 aplicadas ao produto

1. **Aja com garantia, não com probabilidade → Copiloto que Promete e Cumpre.** O agente faz compromissos verificáveis ("em 90 dias seu score sobe de 62 para 74") e o Diário de Decisões audita a promessa contra o resultado real.
2. **Contexto profundo → Gêmeo Financeiro (Digital Twin).** Unificar `cardProjection` + `insightsEngine` + `forecast` + recorrentes num simulador de vida ("E se eu trocar de emprego / financiar em 48x / a Selic subir 2pp?") em centavos inteiros, 24 meses.
3. **Verificação como parte do trabalho → Selo de Integridade Auditável.** Transformar a força técnica em feature de usuário: painel "sua integridade financeira é verificável" (rastreabilidade centavo-a-centavo, IA revalidada, LGPD hard-delete).
4. **Antecipe a necessidade → Radar Proativo com Ação de 1 Toque.** O briefing (`sendPushReminders` + `ProactiveBriefing`) não só avisa — propõe a ação já pronta, confirmável em 1 toque, com o contrato de mutação.
5. **Densidade sem ruído → UI que Some.** Tela inicial que responde "posso gastar hoje?" com um número e uma cor; todo o resto a um gesto de distância.

## O Moonshot — à frente de TODOS

> **"Compras Inteligentes com prova fiscal"** — o único app onde a IA diz *"não compre aqui, custa R$ 4,20 a mais que no mercado da esquina"* — e prova com nota fiscal real.

~90% construído (#352–#358). Diferencial **estrutural** (motor NFC-e que Nubank não tem) e **geográfico** (NFC-e que YNAB/Copilot americanos não têm) ao mesmo tempo.

## Primeiro movimento (maior ROI com o que já existe)

**Conectar `priceIntelligence` ao briefing proativo e/ou aos insights** → "Radar de Compras" como feature-âncora. Custo baixo (motores já existem), impacto alto (narrativa "economizo dinheiro no supermercado com prova fiscal").

Restrições: respeitar contrato de mutação do Agente, zonas proibidas (`functions/`, `firestore.rules`, schemas, centavos/Decimal.js) e política de logging. O primeiro movimento é **camada de apresentação/insight pura**, sem I/O novo nem escrita.

## Sequência recomendada de fases

1. **Fase Radar de Compras** (primeiro movimento) — insight puro derivado de `priceIntelligence`, exibido no briefing.
2. **Fase Ação de 1 Toque** — briefing propõe ação confirmável (reutiliza `ActionConfirmationSheet` + `executeAgentAction`).
3. **Fase Gêmeo Financeiro** — simulador de cenários unificado.
4. **Fase Selo de Integridade** — painel de verificabilidade para o usuário.
5. **Fase Copiloto que Cumpre** — compromissos auditados no Diário de Decisões.
