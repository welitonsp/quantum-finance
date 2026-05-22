# Architecture Risk Register — Quantum Finance

## 1. Resumo Executivo

O Quantum Finance é atualmente um **Personal Finance Manager (PFM)** monousuário focado em integridade de dados e inteligência de dashboard. O sistema não deve ser classificado ou comparado a sistemas de core banking, adquirência ou carteiras digitais transacionais reguladas no seu estágio atual.

Este documento estabelece um registro de riscos arquiteturais focado em maturidade financeira, separando a **maturidade atual** (PFM robusto) da **ambição futura** (Fintech Scale-up). O objetivo é orientar a evolução incremental do sistema sem exigir reescritas amplas ou paralisia operacional.

## 2. Escopo Atual

- **Tech Stack:** React (TypeScript) + Firebase (Firestore/Functions/Hosting).
- **Segurança:** Firestore Security Rules rigorosas com validação de schema e tipos.
- **Integridade:**
    - **Modelo A:** Updates e Deletes exigem documento de histórico pareado no mesmo commit atômico.
    - **Aritmética:** `value_cents` como fonte canônica (inteiros) para evitar erros de ponto flutuante.
    - **Idempotência:** `importHash` (SHA-256) como chave técnica para deduplicação em importações.
- **Auditabilidade:** Trilhas de histórico (`history`) geradas para transações manuais e importadas.
- **Operação:**
    - Criação de transações manuais via Cloud Functions (Server-trusted).
    - Atualizações, exclusões e conciliações parcialmente orquestradas pelo cliente (Client-orchestrated), mas validadas por Rules.
    - Dashboards e relatórios calculados em tempo real no cliente (Client-side aggregation).

## 3. Riscos Arquiteturais Priorizados

| ID | Risco | Severidade | Estado Atual | Impacto | Mitigação Existente | Próxima Ação Recomendada | Fase Sugerida |
|:---|:---|:---:|:---|:---|:---|:---|:---:|
| **AR-01** | Mutações parciais no Client-side | **P1** | Reconciliação e Updates via SDK | Risco de desvio de regra de negócio se o cliente falhar ou for manipulado. | Firestore Rules validam `_lastOpId` e `history`. | Migrar `update/delete` para Callables server-trusted. | 10F-3 |
| **AR-02** | Agregações Client-side (Gargalo) | **P1** | O(N) no carregamento | Lentidão UI com crescimento do volume de transações (> 5000 itens). | Paginação no `useTransactions`. | Implementar Materialized Summaries (Snapshots). | 10F-4 |
| **AR-03** | JavaScript Legado em Functions | **P2** | `functions/index.js` em CJS | Dificuldade de manutenção e ausência de tipagem em lógica crítica. | Algumas novas funções em TS. | Migrar fatias do index.js para TS. | 10F-5 |
| **AR-04** | Ausência de Tracing Ponta-a-Ponta | **P2** | Logs isolados | Dificuldade em correlacionar erro no Dashboard com falha no Firestore. | Sanitized logging. | Implementar `correlationId` / `traceId` leve. | 10F-1 |
| **AR-05** | Ausência de Double-Entry Ledger | **P2** | Ledger simples | Dificuldade em garantir consistência entre contas (transferências) e auditoria contábil. | Integridade em centavos e idempotência. | Desenhar modelo de Journal Entries. | Futuro |
| **AR-06** | Multi-moeda Ausente | **P3** | Apenas BRL | Impossibilidade de gerir ativos globais sem refactor amplo. | N/A | Adicionar campo `currency` ao schema. | Futuro |
| **AR-07** | Dependência de Legado no Cliente | **P3** | Normalização em runtime | Complexidade extra no hook para tratar dados sem `value_cents`. | Conversão em memória no `useAccounts`. | Script de migração de dados (Backfill). | 10F-2 |
| **AR-08** | Conciliação ainda client-orchestrated | **P1** | Matching e merge ainda dependem de decisão/orquestração no cliente | Risco de corrida, divergência semântica ou resolução inconsistente em múltiplas sessões/dispositivos | Modelo A, history pareado e explicabilidade visual | Inventariar fluxo e migrar reconcile para callable server-trusted com idempotência | 10F-3 |

## 4. Classificação de Prioridade (Realista)

- **P0:** Defeitos que quebram a produção ou a integridade de dados imediatamente (Ex: erro de cálculo em centavos).
- **P1:** Riscos arquiteturais críticos para a escalabilidade e segurança de uma fintech.
- **P2:** Dívida técnica estratégica que atrasa o desenvolvimento ou o troubleshooting.
- **P3:** Expansão de funcionalidades e suporte a novos domínios financeiros.

## 5. Roadmap Sugerido (Evolução Incremental)

### Curto Prazo (Operacional)
- **10F-1:** Implementação de `correlationId` em operações críticas para auditoria cruzada.
- **10F-2:** Inventário completo de caminhos de escrita (Write Paths) financeiros para preparar migração.

### Médio Prazo (Segurança e Performance)
- **10F-3:** Migração incremental de `update`, `delete` e `reconcile` para Cloud Functions Callables (Server-trusted).
- **10F-4:** Implementação de `MonthlySummary` e `AccountSnapshot` para evitar agregações pesadas no cliente.
- **10F-5:** Refactor de `functions/index.js` para TypeScript por fatias funcionais.

### Longo Prazo (Escala e Compliance)
- **Futuro:** Implementação de Double-Entry Ledger (Partidas Dobradas).
- **Futuro:** Suporte a Multi-moeda.
- **Futuro:** Integração Open Finance / PCI-DSS / AML (Apenas se houver requisito regulatório ou de produto).

## 6. O que NÃO fazer agora

- **NÃO** reescrever o sistema do zero.
- **NÃO** implementar Double-Entry Ledger imediatamente (exige mudança profunda no UX e persistência).
- **NÃO** implementar AML (Anti-Money Laundering) ou PCI/PAN enquanto o sistema for PFM.
- **NÃO** implementar Open Finance enquanto não houver requisito real de produto/regulatório.
- **NÃO** criar novas Cloud Functions amplas sem inventário prévio de write paths.
- **NÃO** substituir o modelo de dados atual por ledger contábil sem ADR específica.
- **NÃO** relaxar as Firestore Security Rules para facilitar o desenvolvimento.
- **NÃO** quebrar a compatibilidade com documentos legados sem um plano de backfill.

## 7. Critérios de Entrada para Fases Futuras

- **Fase 10F-1 (CorrelationId):** Gatilho se houver aumento de erros reportados por usuários, dificuldade de depuração entre UI/Firestore/Functions ou início de observabilidade operacional.
- **Fase 10F-2 (Write Paths):** Gatilho imediato antes de qualquer nova migração server-trusted ou nova Cloud Function financeira.
- **Fase 10F-3 (Server-trusted):** Gatilho ao iniciar qualquer integração de escrita externa ou automação financeira que não passe pela UI.
- **Fase 10F-4 (Snapshots):** Gatilho se a carga inicial do Dashboard exceder 2 segundos em conexões médias ou se o volume médio de transações por usuário passar de 2.000 registros.
- **Fase 10F-5 (Functions TypeScript):** Gatilho ao tocar em qualquer callable crítica existente ou ao criar nova lógica financeira no backend.
- **Double-Entry:** Gatilho se houver necessidade de emitir balancetes contábeis reais ou se a complexidade de transferências entre múltiplas contas/moedas se tornar incontrolável no modelo simples.
- **Multi-moeda:** Gatilho somente se houver requisito real de ativos globais, câmbio, cripto ou investimentos internacionais.
- **Open Finance/PCI/AML:** Gatilho somente com integração regulada, dados bancários reais, cartão real, parceiro externo ou obrigação regulatória.

## 8. Veredito Arquitetural

O estado atual do Quantum Finance é **adequado e seguro para um Personal Finance Manager controlado**. As regras de integridade em centavos e o sistema de histórico (Modelo A) fornecem garantias superiores à média de projetos PFM. 

O caminho recomendado é a **evolução incremental** focada em mover a inteligência de orquestração para o servidor e materializar visões de dados para performance, preservando a agilidade da arquitetura atual baseada em Firebase.
