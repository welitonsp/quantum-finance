# Plano 10/10 — Visão Steve Jobs × Padrão Big Tech

> **Data:** 2026-07-16 · **Autor:** sessão de orquestração (Fable 5) + Weliton
> **Status:** plano aprovado para execução em fases · **Fonte de execução:** checklist único ao final deste documento
> **Frase-produto que governa todas as decisões:**
> **"O app que mostra o seu futuro antes de você dizer sim — e presta contas depois."**
> Nenhuma feature entra se não servir esta frase.

---

## 1. Diagnóstico (auditoria de produto 2026-07-16)

**Nota atual: 7/10.** Engenharia 10/10 (centavos inteiros, mutação confirmada, auditoria server-trusted, Modelo A). O que segura a nota é **foco**: o produto responde todas as perguntas várias vezes, em vez de responder uma pergunta de forma definitiva.

### O que já está certo
- `SpendingPowerBadge` ("Posso gastar hoje?") — um número, uma pergunta humana. O "1.000 songs in your pocket" do projeto.
- Dobra do dashboard com 4 elementos (commit `6a22902`).
- Contrato do Agente: IA propõe → humano confirma → trilha auditável, com impact preview (`c740607`).

### Os 3 problemas que custam a nota
1. **Duplicação massiva:** score renderizado 3× na mesma página (`DashboardHero`, `ScoreHeroCard`, `FinancialHealthScore`); insights em 5+ feeds (`DailyBriefingCard`, `QuantumInsights`, `QuantumCopilotCards`, `AnomalyAlerts`, `ProactiveBriefing`, `CopilotPage`); orçamentos/metas no dashboard E na `PlanningPage`. *Cinco feeds de insight são zero feeds de insight.*
2. **"IA" como destino de navegação:** 4 superfícies de IA (`CopilotPage` → hub → `QuantumAIPage` + anti-tarifa + chat). Copiloto não é lugar — aparece onde a decisão acontece (padrão Microsoft Copilot).
3. **Linguagem de engenheiro na UI:** "Governança", "Projeção Quântica", "Orçamentos Quânticos", "IntelStrip", texto de compliance exibido ao usuário (`CopilotPage`). Seção recolhida por padrão + duplicada = indecisão virando UI.

---

## 2. Inventário de inovação — o que ninguém tem (já existe no código)

| Ativo | Onde está | Quem mais tem? |
|---|---|---|
| Agente que executa de verdade (propõe → confirma → grava, idempotente, trilha imutável) | `executeAgentAction` + `ActionConfirmationSheet` | **Ninguém** |
| Gêmeo Financeiro — Monte Carlo em worker, cone P10/P50/P90 | `GemeloFinanceiro.tsx` + `forecastMonteCarlo.ts` | Ninguém no PFM consumer |
| Simulador de compra com veredito (motor puro, zero float) | `src/lib/purchaseSimulator.ts` | Ninguém |
| Diário de Decisões da IA com outcome `applied`/`reverted` | coleção `decisions` + `GovernancePage` | **Ninguém no mundo** |
| Manifesto de permissões da IA visível ao usuário | `GovernancePage.tsx` | Ninguém expõe como produto |
| Radar de Preços pessoal (histórico por produto/loja, server-trusted) | `priceObservations` | Ninguém tem inflação pessoal por item |
| Anti-Tarifa (caça a cobranças recorrentes ocultas) | `AntiTarifaPage` | Raro (Truebill vendido por US$ 1,3 bi) |

**Diagnóstico Jobs:** 7 inovações reais instaladas como widgets separados que o usuário precisa *visitar*. A inovação do iPhone foi a fusão, não a peça. A cadeia já existe desconectada no código:

`intentRouter` (entende) → `purchaseSimulator` (avalia) → Gêmeo (projeta) → `ActionConfirmationSheet` (executa) → `decisions` (presta contas).

---

## 3. Alinhamento Big Tech — o método, não o volume

| Big Tech | Prática adotada | Tradução para o Quantum |
|---|---|---|
| **Apple** | Privacidade como produto; HIG: 1 ação primária por tela; latência invisível | Selo "Calculado no seu aparelho" nos insights locais; 1 CTA por tela; simulação pré-aquecida |
| **Anthropic** | Agente com contrato (propose → confirm → execute) + constituição explícita | Já implementado — expor o manifesto de permissões como identidade ("constituição" do agente) |
| **OpenAI** | Memória + proatividade do assistente | Propostas prontas por padrão detectado (determinístico, local) — sempre via confirmação, nunca autônomo |
| **Google** | Confiabilidade é feature; dado agregado vira produto | Gates de CI já no padrão; `priceObservations` → inflação pessoal vs IPCA |
| **Microsoft** | Copilot embutido no fluxo, não como destino | Dissolver a página "IA"; copiloto vive na confirmação, no briefing, no ⌘K |

### Fora do escopo — o "não" de Jobs
- Open Finance / integração bancária (já bloqueado — correto).
- Chat como centro do produto (chat é vestíbulo).
- Gamificação além do que existe.
- **Qualquer execução autônoma da IA** — a vantagem competitiva é exatamente o contrário.

---

## 4. CHECKLIST ÚNICO DE EXECUÇÃO

> Regras: PRs ≤5 arquivos · nenhum item toca Rules/Functions/centavos/zonas proibidas · cada fase demonstrável isoladamente · ordem obrigatória 0 → 1 → 2 → 3 → 4 → 5.

### Fase 0 — Subtração (Apple HIG) — pré-requisito de tudo
- [ ] **0.1** Fundir os 3 cards de score em 1 (`ScoreHeroCard` absorve `FinancialHealthScore`; badge do `DashboardHero` referencia o mesmo número).
- [ ] **0.2** Fundir os 5 feeds de insight no `DailyBriefingCard` (deletar `QuantumInsights`, `QuantumCopilotCards`, `ProactiveBriefing` como superfícies; `AnomalyAlerts` vira fonte do briefing).
- [ ] **0.3** Deletar as seções recolhidas do dashboard; mover análises para a página "Análises". Dashboard termina em: 4 elementos da dobra + briefing.
- [ ] **0.4** Remover "IA" da navegação (7 → 5 destinos: Hoje · Movimentações · Planejamento · Compras · Análises); "Governança" migra para Configurações.
- [ ] **0.5** Eliminar duplicação dashboard × `PlanningPage` (orçamentos/metas moram só no Planejamento).

### Fase 1 — Consequência antes do sim (Anthropic + Apple) — killer feature
- [ ] **1.1** Motor: função pura que re-roda `purchaseSimulator` + Monte Carlo com a proposta aplicada (worker existente, sem tocar Functions).
- [ ] **1.2** `ActionConfirmationSheet` exibe impacto futuro: "sobrevivência 12m: 94% → 78%" + mês em que encosta no vermelho.
- [ ] **1.3** Pré-aquecimento da simulação em background (resultado instantâneo na sheet — latência invisível).
- [ ] **1.4** Testes unitários do motor de consequência (determinístico, seed fixa).

### Fase 2 — Constituição visível + placar da IA (Anthropic + Apple privacy)
- [ ] **2.1** Manifesto de permissões da IA vira cartão de primeiro contato, em linguagem humana ("constituição" do agente).
- [ ] **2.2** Placar de prestação de contas: agregado de `decisions` — "N propostas, X aceitas, Y revertidas, impacto R$ Z" no briefing e na Governança.
- [ ] **2.3** Selo "Calculado no seu aparelho" nos insights determinísticos locais.

### Fase 3 — Memória e proatividade do Agente (OpenAI + Google)
- [ ] **3.1** Detector determinístico local de padrões recorrentes (ex.: fatura ~dia 5) — sem LLM na detecção.
- [ ] **3.2** Propostas prontas: no dia do padrão, a `ActionProposal` já aparece montada esperando 1 toque — sempre dentro do contrato de mutação confirmada.
- [ ] **3.3** LLM apenas para redigir a mensagem da proposta (fallback: template local).

### Fase 4 — Inflação pessoal (Google data moat)
- [ ] **4.1** Motor puro: índice de inflação pessoal mensal a partir de `priceObservations` (por item/loja).
- [ ] **4.2** Card âncora no briefing: "Sua inflação: X% · IPCA: Y% · puxada por {categoria}".

### Fase 5 — Acabamento premium (Apple)
- [ ] **5.1** Gêmeo abre com 1 número-herói ("94% de chance de fechar o ano no azul"); cone P10/P50/P90 um toque abaixo.
- [ ] **5.2** Régua de linguagem: zero jargão de sistema visível ("Quantum", "Governança", "Intel" etc. fora da UI).
- [ ] **5.3** `TransactionForm` em 2 campos + defaults inteligentes (parcelamento/detalhes atrás de "mais opções").
- [ ] **5.4** Remover `CountUp` de valores financeiros críticos (número que anima é número em que não se confia).

---

## 5. Processo de execução

- Orquestração: Fable 5 especifica e revisa diff → `builder` (Opus) implementa → Weliton autoriza merge.
- Cada item do checklist referencia esta doc no PR (`docs/product/PLANO_10-10_JOBS_BIGTECH.md`).
- Marcar checkbox **somente após merge** do PR correspondente na `main`.
- Demo de definição do produto: Fase 0 + Fase 1 juntas — dashboard limpo onde "posso comprar X?" mostra o futuro mudando antes do sim.
