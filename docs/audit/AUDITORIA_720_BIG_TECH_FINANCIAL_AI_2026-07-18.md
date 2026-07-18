# Auditoria 720° — Segurança, Integridade Financeira, Produto Premium e Agente de IA

**Sistema:** Quantum Finance

**Data da revisão:** 18/07/2026

**Snapshot auditado:** `main` em `f90659d`

**Classificação:** interna e confidencial

**Auditoria-base preservada:** `docs/audit/AUDITORIA_360_SECURITY_SYSTEMS_2026-07-18.md`

**Execução planejada:** `docs/CHECKLISTS.md` e `docs/PENDENCIAS.md`

> Este documento amplia a Auditoria 360. Nada do produto existente deve ser removido por causa desta visão. A estratégia recomendada é preservar os módulos, corrigir a verdade financeira e conectá-los por uma camada agentiva única, segura e auditável.

---

## 1. Sumário executivo

### 1.1 Veredito

O Quantum Finance tem uma base funcional incomum para seu estágio: movimentações, contas, cartões, recorrências, planejamento, metas, dívidas, patrimônio, IR, compras/NFC-e, finanças compartilhadas, Anti-Tarifa, Gêmeo Financeiro, Monte Carlo, Copilot, Quantum AI, ações confirmadas e Diário de Decisões.

Essa amplitude é um ativo real. Entretanto, o sistema ainda não pode ser classificado tecnicamente como uma plataforma financeira premium de padrão Big Tech/Big Four. Há inconsistências determinísticas capazes de apresentar saldos, despesas, faturas, patrimônio e recomendações de IA incorretos. Também existem afirmações de governança na interface que excedem as garantias efetivamente implementadas.

**Risco global atual: ALTO.**

O risco deve ser tratado como **CRÍTICO** antes de integrar pagamentos externos, Open Finance, iniciação de transações, aconselhamento automatizado de alto impacto ou autonomia sobre dinheiro real.

### 1.2 Avaliação por dimensão

| Dimensão | Avaliação | Fundamentação |
|---|---|---|
| Engenharia e testes | Forte | TypeScript, lint, 2.038 testes de aplicação e 304 testes de Functions aprovados |
| Amplitude funcional | Forte | Mais de 20 destinos funcionais e motores financeiros próprios |
| Integridade contábil | Insuficiente | Transferências, faturas, metas, dívidas e patrimônio não compartilham uma verdade única |
| Segurança de mutações | Parcial | App Check, Rules e transações existem, mas idempotência e confirmação ainda podem ser contornadas |
| Privacidade/LGPD | Insuficiente | Consentimento, trilha de processamento, exportação e exclusão não fecham o ciclo |
| IA confiável | Insuficiente | Contrato determinístico existe no código, mas o chat operacional ainda exibe resposta financeira livre |
| Experiência premium | Moderada | Módulos poderosos, porém fragmentados, inconsistentes e com falhas funcionais de integração |
| Potencial de inovação | Muito alto | Gêmeo, NFC-e, Anti-Tarifa, decisões auditáveis e motores puros podem formar um moat defensável |

### 1.3 Tese estratégica

O produto não deve evoluir para “mais um chatbot de finanças”. Deve tornar-se um:

> **Sistema Operacional Financeiro Pessoal Auditável:** a IA observa, explica, simula e prepara; motores determinísticos calculam; o usuário confirma; o sistema acompanha o resultado e prova se a recomendação funcionou.

O diferencial não será uma resposta eloquente. Será a capacidade de demonstrar:

1. o que foi observado;
2. quais dados e premissas foram usados;
3. o que o sistema recomendou;
4. o que o usuário decidiu;
5. o que foi executado;
6. o que realmente aconteceu;
7. quanto valor foi gerado ou preservado.

Chamamos esse ciclo de **Promise & Proof — Promessa e Prova**.

### 1.4 Decisão de gestão

Não se recomenda ampliar a autonomia do agente antes do fechamento dos itens P0. O caminho correto não é remover funcionalidades, nem reescrever o sistema do zero. É:

1. corrigir a verdade financeira;
2. transformar controles declarativos em controles comprováveis;
3. criar um gateway de ferramentas seguro;
4. unificar os módulos em jornadas orientadas a decisões;
5. adicionar autonomia progressiva, sempre limitada por consentimento, risco e confirmação.

---

## 2. Escopo, método e limitações

### 2.1 Escopo revisado

- frontend React/TypeScript;
- Cloud Functions e validações server-side;
- Firestore Rules, índices e fluxos de persistência;
- autenticação, App Check, consentimento, MFA e LGPD;
- idempotência, concorrência, precisão e integridade financeira;
- agentes, roteamento de intenções, memória e respostas do Gemini;
- arquitetura de informação, UI, acessibilidade e responsividade;
- todos os módulos funcionais atualmente presentes;
- documentação de arquitetura, produto, IA, riscos e checklists;
- workflows de CI/CD e configuração de produção.

### 2.2 Método

- revisão estática orientada a risco;
- rastreamento de fluxos ponta a ponta entre UI, hooks, services, Functions e Rules;
- comparação entre promessas da interface, documentos normativos e comportamento implementado;
- análise adversarial de concorrência, replay, adulteração de cliente e falhas parciais;
- inventário de módulos e avaliação de evolução premium;
- validação automatizada local.

### 2.3 Validações executadas nesta revisão

| Validação | Resultado |
|---|---|
| `npm run typecheck` | aprovado |
| `npm run lint` | aprovado |
| `npm run test:run -- --reporter=dot` | 132 arquivos aprovados, 1 ignorado; 2.038 testes aprovados, 227 ignorados |
| `npm --prefix functions test` | build aprovado; 304 testes aprovados |

Os avisos `act(...)` emitidos por alguns testes React não causaram falha, mas devem ser eliminados porque podem ocultar comportamento assíncrono não observado.

### 2.4 Limitações

- não houve acesso a dados reais de produção, telemetria, custos, incidentes, backups ou configuração do console Firebase;
- não foram realizados pentest externo, DAST autenticado, teste de carga, caos, restauração de backup ou análise jurídica;
- o navegador integrado não estava conectado nesta sessão; a avaliação visual foi feita por código e inventário de componentes, devendo ser complementada por QA manual em desktop e dispositivos reais;
- aprovação dos testes não significa ausência de defeitos: vários achados estão nas interfaces entre módulos e não possuem hoje testes contratuais ou E2E correspondentes.

---

## 3. Ativos que devem ser preservados e potencializados

O projeto não está “perdido” e não deve sofrer redução funcional. Há fundações valiosas:

- operações financeiras server-side com App Check;
- transferências com atualização atômica das duas contas;
- valores predominantemente representados em centavos inteiros e uso de `Decimal.js`;
- isolamento por UID nas Firestore Rules;
- seis ações agentivas confirmáveis: compra, receita, transferência interna, orçamento, aporte em meta e pagamento de dívida;
- Gêmeo Financeiro com renda, recorrências, dívidas, cartões e Monte Carlo;
- estratégias de dívida avalanche e snowball;
- inteligência de preço por produto/loja, comparação de cesta e NFC-e;
- Anti-Tarifa com razões explicáveis e projeção anual;
- Copilot local com fontes;
- Spending Power, modo crise, briefing, previsão e One Touch;
- histórico financeiro e Diário de Decisões;
- pipeline de qualidade abrangente e Actions pinadas por SHA.

O problema central não é falta de recursos. É ausência de uma camada única de verdade, confiança e execução que conecte esses recursos.

---

## 4. Vulnerabilidades e falhas críticas/altas

### QF-720-01 — Bundle de produção pode ser publicado sem Firebase e App Check

**Severidade:** CRÍTICA operacional

**Mapeamento:** CWE-16 — Configuration

**Evidências:**

- `.github/workflows/firebase-hosting-merge.yml:122-128`;
- `.github/workflows/firebase-hosting-pull-request.yml:34-40`;
- `src/shared/api/firebase/index.ts:10-19`;
- `src/shared/api/firebase/index.ts:42-68`;
- `src/shared/hooks/usePushNotifications.ts:20-27`.

Os workflows de Hosting fornecem ao build apenas `VITE_ENABLE_AGENT_ROUTER`. As seis variáveis Firebase e `VITE_RECAPTCHA_SITE_KEY` não são validadas. O Firebase é inicializado mesmo com valores ausentes e o App Check simplesmente não é iniciado sem a chave. `VITE_FCM_VAPID_KEY` também não aparece em `.env.example`.

**Impacto:** autenticação quebrada, Functions protegidas inacessíveis, divergência entre estação e Hosting, push desativado e publicação de bundle operacionalmente inválido.

**Remediação obrigatória:**

1. fornecer variáveis públicas por GitHub Environments/Variables;
2. criar `validate-production-env` fail-closed antes do Vite;
3. validar Firebase, App Check, VAPID e feature flags;
4. executar smoke test autenticado no artefato publicado;
5. bloquear promoção quando o smoke test falhar.

---

### QF-720-02 — Transferência interna contamina despesas, saldo, burn rate e IA

**Severidade:** ALTA

**Mapeamento:** CWE-682 — Incorrect Calculation

**Evidências:**

- `src/hooks/useFinancialData.ts:86-98,234-263`;
- `src/hooks/useFinancialKPIs.ts:22-35`;
- `src/utils/transactionUtils.ts:4-11`;
- `functions/src/index.ts:642-693`.

Agregadores tratam toda movimentação que não seja receita/pagamento de fatura como despesa. A própria implementação canônica reconhece transferência como neutra.

**Impacto:** cada transferência pode reduzir artificialmente o saldo consolidado, inflar despesas, degradar projeções e contaminar o contexto financeiro entregue à IA.

**Remediação obrigatória:** criar uma taxonomia canônica e compartilhada:

- `income`;
- `consumption`;
- `internal_transfer`;
- `liability_settlement`;
- `asset_allocation`;
- `adjustment`.

Adicionar propriedade de conservação: **transferência interna não altera resultado nem patrimônio consolidado**.

---

### QF-720-03 — Pagamento de fatura reduz o passivo sem baixar corretamente o caixa

**Severidade:** ALTA

**Mapeamento:** CWE-682 / CWE-362

**Evidências:**

- `src/hooks/useCreditCards.ts:48-58,184-218`;
- `src/hooks/useFinancialData.ts:88-98,234-243`.

O pagamento registra uma transação, reduz a fatura pela leitura desse registro, mas a movimentação é excluída dos agregadores de caixa. Não há operação server-side única para debitar a conta, liquidar a fatura, impedir sobrepagamento e gravar a trilha.

**Impacto:** o patrimônio líquido pode aumentar exatamente pelo valor pago; retentativas e concorrência podem duplicar liquidações.

**Remediação obrigatória:** callable transacional idempotente com:

- conta de origem;
- fatura/competência;
- saldo em aberto;
- política de pagamento parcial/sobrepagamento;
- débito de caixa e baixa do passivo na mesma transação;
- postings balanceados;
- histórico e recibo imutável.

---

### QF-720-04 — Não existe uma única verdade contábil

**Severidade:** ALTA

**Mapeamento:** CWE-682 / risco de integridade financeira

**Evidências:**

- `functions/src/index.ts:414-480,642-693,755-875`;
- `src/hooks/useFinancialData.ts:103-127`;
- `src/hooks/useGoals.ts:113-119`;
- `src/hooks/useDebts.ts:120-125`;
- `src/features/debts/DebtModule.tsx:468-481`;
- `src/features/patrimonio/PatrimonioPage.tsx:28-47`.

Transações comuns não atualizam saldos armazenados; transferências atualizam. Aportes podem aumentar metas sem reduzir caixa. Pagamentos podem reduzir dívidas sem origem do recurso. O patrimônio soma contas e volta a subtrair passivos, com risco de classificação ou dupla contagem.

**Impacto:** dashboard, patrimônio, relatórios, Gêmeo e agente podem apresentar verdades diferentes para o mesmo usuário.

**Remediação arquitetural:** ledger imutável de lançamentos balanceados. Saldos passam a ser projeções materializadas reconciliáveis, nunca uma fonte paralela.

---

### QF-720-05 — Outbox e idempotência permitem replay, colisão e duplicação

**Severidade:** ALTA

**Mapeamento:** CWE-362 — Race Condition / CWE-367 — TOCTOU

**Evidências:**

- `src/hooks/useTransactions.ts:468-478,636-708,786-852`;
- `src/shared/lib/offlineOutbox.ts:90-111`;
- `functions/src/index.ts:374-477,543-639,733-1242`;
- `firestore.indexes.json:52-58`.

`outboxPut` e `outboxDelete` não são aguardados. O `put` pode terminar depois do `delete` e recriar uma intenção já confirmada. Lotes não persistem todas as intenções. A chave é opcional no backend, usa namespace global por usuário, não está vinculada ao tipo de operação nem ao hash do payload e expira em 24 horas.

**Impacto:** duplicação após crash/reload, replay tardio, retorno de resultado antigo para payload diferente e falsa garantia de “zero duplicidade”.

**Remediação obrigatória:**

- idempotência obrigatória em toda mutação financeira;
- namespace `{uid}/{operation}/{key}`;
- hash canônico do payload;
- conflito explícito quando a chave reaparecer com outro hash;
- estados `pending/sent/acknowledged/failed`;
- persistência antes do envio e remoção aguardada após confirmação;
- retenção do servidor compatível com a maior janela de replay do cliente;
- testes de concorrência e retry ambíguo.

---

### QF-720-06 — Consentimento e trilha LGPD estão quebrados por incompatibilidade de contrato

**Severidade:** ALTA

**Mapeamento:** CWE-20 — Improper Input Validation / CWE-778 — Insufficient Logging

**Evidências:**

- `src/shared/services/UserConsentsService.ts:52-62`;
- `src/hooks/useAiConsent.ts`;
- `functions/src/index.ts:157-171`;
- `firestore.rules:1198-1219`;
- `src/shared/services/DataProcessingLog.ts:36-49`.

O cliente grava `{analytics, ai, updatedAt}`; as Rules permitem somente `{type, granted, updatedAt}`; o backend lê `current.ai`. O log de processamento escreve pelo cliente em um caminho cuja escrita é proibida e engole a falha.

**Impacto:** consentimento pode não ser salvo, IA fecha por ausência de consentimento e a interface pode comunicar sucesso sem evidência regulatória.

**Remediação obrigatória:** schema único e versionado, callable server-trusted, log append-only e teste ponta a ponta: conceder → usar → revogar → bloquear → provar.

---

### QF-720-07 — Exportação e exclusão LGPD não são completas

**Severidade:** ALTA

**Mapeamento:** CWE-459 — Incomplete Cleanup

**Evidências:**

- `src/shared/services/DataPrivacyService.ts:17-80,122-146`;
- `src/features/settings/DataPrivacyPanel.tsx:80-87`;
- `functions/src/index.ts:1301-1322`;
- `docs/RIPD.md:35-36,69-70`.

A exportação usa lista estática, primeiro nível e converte falhas em coleções vazias. Grupos, convites, despesas, históricos aninhados e documento raiz não são integralmente incluídos. Na exclusão, vínculos financeiros podem permanecer em grupos; falha de limpeza é ignorada e a resposta ainda pode indicar sucesso.

**Impacto:** resposta inexata ao titular, PII residual, impossibilidade de provar escopo e retenção.

**Remediação obrigatória:** saga idempotente com manifesto, contagens e hashes:

`desabilitar → inventariar → exportar/pseudonimizar → verificar → excluir dados → excluir Auth → emitir recibo`.

---

### QF-720-08 — A IA operacional ignora o contrato determinístico de números

**Severidade:** ALTA

**Mapeamento:** CWE-345 — Insufficient Verification of Data Authenticity; OWASP LLM01/LLM09

**Evidências:**

- `src/lib/agentResponseRenderer.ts:118`;
- `src/features/ai-chat/AIAssistantChat.tsx:467-510`;
- `functions/src/index.ts:311-346,1408-1485`;
- `src/components/QuantumAIPage.tsx:248-254`.

Existe um renderizador que rejeita números financeiros livres. Porém, o chat e o relatório enviam saldos, despesas, percentuais e transações formatados ao Gemini e exibem a resposta textual diretamente.

**Impacto:** números inventados, cálculo inconsistente, falsa precisão, recomendações baseadas em contexto incompleto e violação da regra normativa “LLM narra; motores calculam”.

**Remediação obrigatória:** envelope estruturado:

```text
snapshotId + claims + citations + assumptions + confidence
+ template com placeholders + tools/model/engine versions
```

Todo claim monetário deve vir de uma ferramenta determinística. Resposta inválida deve falhar fechada para uma explicação segura sem número novo.

---

### QF-720-09 — Contexto financeiro fornecido pelo cliente é tratado como verdade

**Severidade:** ALTA

**Mapeamento:** CWE-602 — Client-Side Enforcement of Server-Side Security

**Evidências:**

- `functions/src/index.ts:265-346,1424-1479`.

O servidor sanitiza o objeto recebido pela SPA, mas não calcula um snapshot canônico. Sanitização reduz PII, mas não prova completude, atualidade ou autenticidade financeira.

**Impacto:** cliente adulterado, dados desatualizados e os erros de agregação desta auditoria podem direcionar respostas de alta confiança.

**Remediação obrigatória:** `FinancialSnapshot` server-trusted, versionado, com hash, data de corte, cobertura, fontes, estado de reconciliação e qualidade.

---

### QF-720-10 — Confirmação humana do agente pode ser forjada pelo cliente

**Severidade:** ALTA

**Mapeamento:** CWE-602 / CWE-345

**Evidências:**

- `src/hooks/useAgentAction.ts:83-104`;
- `functions/src/agentActionValidation.ts:220-244`.

O cliente altera localmente o status para `confirmed`; o servidor valida a string, mas não possui proposta server-side, nonce, hash, expiração ou transição de estado.

**Impacto:** qualquer cliente autenticado pode fabricar um envelope “confirmado”, e o Diário registrará uma confirmação que não foi provada.

**Remediação obrigatória:** protocolo em duas fases:

1. servidor cria proposta imutável com `proposalId`, hash, escopo, impacto e expiração;
2. usuário confirma o `proposalId`;
3. servidor faz transição atômica `pending → executing → executed`;
4. step-up/MFA conforme valor e risco.

---

### QF-720-11 — Estado de cotas compartilhadas é controlável pelo criador da despesa

**Severidade:** ALTA

**Mapeamento:** CWE-602 / CWE-284 — Improper Access Control

**Evidências:**

- `functions/src/sharedFinanceValidation.ts:91-107`;
- `functions/src/index.ts:1690-1707,1752-1771`.

O servidor aceita `paid`/`paidAt` do payload e persiste as cotas. Um membro pode criar a despesa marcando a obrigação de outro membro como paga, evitando o fluxo de settlement.

**Impacto:** adulteração de obrigações e falsa evidência de quitação.

**Remediação obrigatória:** servidor reconstrói todas as cotas como não pagas; somente a operação específica de quitação pode alterar o estado, com trilha imutável.

---

### QF-720-12 — Recorrência One Touch não é atômica e o scheduler usa snapshot obsoleto

**Severidade:** ALTA

**Mapeamento:** CWE-362 / CWE-367

**Evidências:**

- `src/components/OneTouchActionsCard.tsx:144-203`;
- `functions/src/index.ts:1865-1932`.

O One Touch cria a transação e depois atualiza tarefa e histórico em passos separados. O scheduler relê a tarefa, mas materializa campos do snapshot externo. O contador operacional aumenta mesmo quando não há escrita.

**Impacto:** duplicação por corrida, execução com valor/categoria antigos, histórico incompleto e métricas falsas.

**Remediação obrigatória:** comando `{recurringTaskId, competência}` com ID determinístico, dados exclusivamente do `freshTask` e commit atômico de transação, histórico e marcação.

---

### QF-720-13 — Functions e Rules aceitam schemas incompatíveis

**Severidade:** ALTA

**Mapeamento:** CWE-20

**Evidências:**

- `functions/src/createTransactionValidation.ts:148-168`;
- `firestore.rules:171-189`.

A Function aceita descrição/categoria maiores que as Rules. Como Admin SDK ignora Rules, um documento pode ser criado e depois se tornar impossível de editar ou excluir pelo cliente.

**Remediação obrigatória:** schema canônico compartilhado/gerado e testes contratuais cobrindo cliente, Function e Rules.

---

### QF-720-14 — A interface de governança comunica garantias não comprovadas

**Severidade:** ALTA de confiança/compliance

**Evidências:**

- `src/features/governance/GovernancePage.tsx:50-58,103-150`;
- achados `QF-360-*` e `QF-720-*`.

A UI afirma “4 pilares ativos”, “100% append-only”, “hard-delete completo”, “zero operações duplicadas”, ausência de histórico de conversa e ausência de envio financeiro a terceiros. O sistema mantém até 10 turnos em `sessionStorage` por 24 horas e envia contexto mascarado ao Gemini mediante consentimento.

**Impacto:** segurança teatral, informação inexata ao titular e erosão de confiança.

**Remediação obrigatória:** substituir slogans por atestações calculadas:

- `Verificado`, `Parcial`, `Falhou` ou `Não avaliado`;
- data, ambiente e versão da última verificação;
- cobertura de trilha;
- delta de reconciliação;
- mutações sem idempotência;
- processadores e finalidades;
- consentimentos e retenções;
- link para evidência e achado aberto.

---

### QF-720-15 — Simulações podem apresentar defaults como se fossem fatos

**Severidade:** ALTA de confiança

**Mapeamento:** CWE-682

**Evidências:**

- `src/features/simulation/SimulationCenter.tsx:79-80,185-209`;
- `src/features/simulation/SimulationCenter.tsx:190`;
- `src/features/simulation/GemeloFinanceiro.tsx:101-106,236-263`.

Sem transações, os simuladores usam números padrão realistas. Em dados reais, aplicam pisos artificiais de receita/despesa. O `SimulationCenter` monta a competência com `getMonth()` sem `+1`, divergindo do Gêmeo.

**Impacto:** cenários visualmente convincentes podem ser entendidos como personalizados; agregação mensal incorreta e previsões contaminadas.

**Remediação obrigatória:** separar explicitamente `demo`, `estimado` e `baseado em dados`; exibir premissas, cobertura e qualidade; corrigir competência e adicionar testes de calendário.

---

### QF-720-16 — Falhas funcionais entre módulos comprometem confiança

**Severidade:** ALTA de produto

**Evidências principais:**

- convite exige e-mail, mas o App não o fornece: `SharedFinancePage.tsx:17,55,75,214` e `App.tsx:507-509`;
- split proporcional não captura pesos e cai em peso `1`: `SharedFinancePage.tsx:607-686` e `sharedSplitEngine.ts:65-85`;
- Quantum AI chama despesas totais de fixas: `QuantumAIPage.tsx:187-225,394`;
- Relatórios recebe transações do mês, mas promete 30/90/180 dias e histórico: `useFinancialData.ts:61-73`, `App.tsx:433-434`, `ReportsContent.tsx:29,59-82`;
- Patrimônio possui taxonomia divergente: `PatrimonioPage.tsx:28-47`;
- “Nova Transação” na Command Palette apenas navega ao dashboard: `CommandPalette.tsx:75`;
- modo Privacidade depende de aplicação manual e não cobre todo o produto: `PrivacyContext.tsx:3-25`, `MoneyDisplay.tsx:25-34`.

**Impacto:** funções visíveis não cumprem o contrato apresentado; métricas e ações variam conforme o módulo.

**Remediação:** testes E2E de jornadas completas, contratos únicos de dados e um protocolo comum de ação financeira.

---

## 5. Problemas arquiteturais e de resiliência

### 5.1 Monólito operacional

`functions/src/index.ts` concentra grande parte das callables, IA, LGPD, compartilhamento, schedulers e notificações. Isso eleva o raio de impacto, dificulta ownership, revisão e deploy independente.

**Direção:** separar por domínios (`ledger`, `agent`, `privacy`, `shared`, `schedulers`, `notifications`) sem mudar os contratos externos de uma vez.

### 5.2 Gemini como ponto único de falha

Há modelo único e chamada direta sem circuit breaker ou fallback operacional robusto.

**Direção:** adapter de provedor/modelo, timeout, retry limitado com jitter, circuit breaker, fallback determinístico, orçamento por usuário e health metrics.

### 5.3 Schedulers por varredura

Recorrências e notificações usam scans e loops sequenciais sem paginação, checkpoint ou DLQ.

**Direção:** partições, filas, idempotência, checkpoint, retry e dead-letter queue.

### 5.4 Precisão e overflow

Centavos inteiros predominam, mas algumas telas convertem para `number` em reais e Functions não revalidam todo resultado derivado após operações Admin SDK.

**Direção:** manter centavos/BigInt/Decimal durante todo cálculo, usar `assertSafeCentavos` após cada soma e converter apenas na apresentação.

### 5.5 Observabilidade ainda não prova integridade

Logs existem, mas não há evidência de:

- SLOs de domínio;
- reconciliação contínua;
- tracing por comando financeiro;
- métricas de duplicidade;
- taxa de operações sem histórico;
- restore test;
- runbooks e alertas de integridade.

**Direção:** cada comando recebe `correlationId`, `idempotencyKey`, `snapshotId`, `actor`, `source`, `policyDecision` e resultado, sem PII ou valores em logs operacionais.

### 5.6 Dados locais após logout/exclusão

Firestore usa cache persistente; outbox e memória permanecem no dispositivo e a exclusão de conta não prova limpeza local completa.

**Direção:** purge por UID para outbox/memória/cache e teste em dispositivo compartilhado.

---

## 6. Arquitetura-alvo: Quantum Financial Operating System

```text
Fontes e eventos financeiros
        ↓
Ledger canônico + Financial Snapshot versionado
        ↓
Motores determinísticos + sensores de risco/oportunidade
        ↓
Tool Gateway tipado e server-trusted
        ↓
Policy Engine
consentimento + RBAC/ABAC + risco + MFA + orçamento + kill switch
        ↓
Orquestrador agentivo
intenção + plano + escolha de ferramentas + narrativa estruturada
        ↓
Validador de claims + Proof Drawer
        ↓
Consulta | Simulação | Proposta
                           ↓
                 Diff antes/depois
                           ↓
                 Confirmação humana
                           ↓
       Command Bus idempotente e transacional
                           ↓
      Decision Journal + Outcome Evaluator
```

### 6.1 Princípios não negociáveis

1. **Motores calculam; o modelo compõe e explica.**
2. **Contexto financeiro é server-trusted.**
3. **Nenhum número financeiro final nasce do LLM.**
4. **Toda escrita possui proposta, confirmação, chave idempotente e recibo.**
5. **Toda recomendação informa dados, frescor, premissas e incerteza.**
6. **Toda promessa é posteriormente comparada ao resultado.**
7. **Memória de preferências é separada do histórico de conversa.**
8. **Conteúdo externo de NFC-e/PDF/importação é isolado contra prompt injection.**
9. **Cada ferramenta possui owner, schema, risco, escopo, reversibilidade e kill switch.**
10. **Autonomia financeira cresce somente por gates mensuráveis.**

### 6.2 Níveis de autonomia

| Nível | Capacidade | Regra |
|---|---|---|
| L0 | observar e detectar | local/server-trusted, sem mutação |
| L1 | explicar e simular | premissas explícitas, sem efeito financeiro |
| L2 | preparar proposta | diff, impacto, validade e alternativas |
| L3 | executar após confirmação | idempotência, policy engine, recibo e MFA conforme risco |
| L4 | executar dentro de mandato pré-aprovado | futuro; limites estreitos, revogação e monitoramento |
| L5 | pagamento/transferência externa irrestrita | proibido no estágio atual |

### 6.3 Tool Gateway real

O registry atual é nominal: relaciona intenções a nomes, mas consultas ainda constroem texto para o LLM. Cada ferramenta futura deve declarar:

- schema Zod de entrada e saída;
- classe `query | simulation | mutation`;
- fonte, versão e frescor;
- finalidade de consentimento;
- risco e exigência de MFA;
- reversibilidade;
- timeout, retry e circuit breaker;
- motor determinístico;
- métricas e conjunto de avaliação;
- resposta mínima necessária ao modelo.

### 6.4 Modelo de memória

- **memória de sessão:** curta, explícita e descartável;
- **preferências:** estruturadas, editáveis e revogáveis;
- **fatos financeiros:** nunca memorizados como texto; sempre lidos do snapshot;
- **decisões:** journal imutável com base legal e retenção;
- **aprendizado pessoal:** somente opt-in, com explicação do efeito;
- **nenhum prompt/resposta bruta em logs**.

### 6.5 Classes de verdade

Toda UI e resposta deve distinguir:

- **Fato:** observado em fonte reconciliada;
- **Hipótese:** premissa de cenário;
- **Previsão:** resultado probabilístico calibrado;
- **Recomendação:** proposta sem efeito;
- **Comando:** ação confirmada;
- **Resultado:** consequência posteriormente observada.

---

## 7. Portfólio de inovação premium

| Capacidade | Fundação já existente | Evolução premium | Métrica de valor |
|---|---|---|---|
| **Promise & Proof** | Diário de Decisões e ações confirmadas | Acompanhar previsão, decisão, execução e resultado real | erro previsto × realizado; valor comprovado |
| **Today OS / Guardião de Caixa** | Dashboard, Timeline, calendário, recorrências | Fila diária das três decisões mais importantes e colisões futuras | crises evitadas; falso alerta |
| **Compositor do Gêmeo** | Gêmeo + Monte Carlo | Linguagem natural transforma eventos de vida em premissas explícitas | cenários salvos e revisitados |
| **Compilador de Planos** | orçamento, metas, dívidas | Objetivo vira plano sequenciado, editável e confirmável | conclusão e impacto observado |
| **Máquina do Tempo de Decisões** | journal + simuladores | Comparar comprar/agora, adiar, quitar e resultado contrafactual | cobertura de outcomes |
| **Índice de Inflação Pessoal** | NFC-e e histórico de preços | Inflação da cesta individual, shrinkflation, substitutos e loja ótima | economia comprovada |
| **Agente de Recuperação de Tarifas** | Anti-Tarifa | Dossiê, roteiro, protocolo, prazo e resultado | valor recuperado |
| **Debt Rescue** | avalanche/snowball | Plano adaptativo e comparação de renegociação | juros e meses evitados |
| **IR Readiness Agent** | módulo IR | Evidências, pendências e pacote revisável pelo contador | pendências antes do prazo |
| **Constituição Financeira Familiar** | grupos/split | papéis, privacidade, regras consensuais e metas compartilhadas | disputas e metas concluídas |
| **Buy/Wait Optimizer** | simulador + Shopping | preço provável, custo de oportunidade e impacto em metas | decisões melhores e economia |
| **Financial Incident Response** | modo crise | plano de 24h/7d/30d, prioridades e acompanhamento | runway preservado |

Essas hipóteses são diferenciadoras, mas a afirmação de liderança de mercado exige pesquisa competitiva e validação com usuários. O documento não afirma que nenhuma solução concorrente possua recursos semelhantes.

---

## 8. Evolução UI/UX por módulo

| Módulo | Gap atual | Evolução premium preservando o módulo | Gate/métrica |
|---|---|---|---|
| Hoje | excesso de sinais concorrentes | uma decisão principal, três prioridades e `Action Stack` com adiar/descartar/acompanhar | tempo até primeira ação útil |
| Movimentações | reconciliação fragmentada | inbox de reconciliação, duplicatas, busca semântica e lote confirmável | delta reconciliado = zero |
| Contas | saldo sem proveniência clara | cockpit por conta, origem, última conciliação, divergência e runway | cobertura de reconciliação |
| Cartões | pagamento e fatura pouco explicados | timeline da fatura, parcial/integral, rotativo e melhor cartão por compra | zero settlement inconsistente |
| Recorrências | pouco ciclo de vida | trials, reajustes, renovação, duplicatas e agente de cancelamento | economia e churn evitado |
| Copilot | página isolada | camada contextual em todos os módulos e fila priorizada | ação útil por insight |
| Chat IA | texto livre e tools nominais | Agent OS com planos, checkpoints, recibos e Proof Drawer | grounding e segurança |
| Quantum AI | métrica incorreta e relatório livre | laboratório de hipóteses, evidências e propostas seguras | 100% claims rastreáveis |
| Anti-Tarifa | alerta sem workflow | contestação, protocolo, prazo, reembolso e comparação | valor recuperado |
| Relatórios | período pode ser incompleto | BI causal, drill-down, consulta, agendamento e escopo explícito | escopo correto em E2E |
| Timeline | não mostra incerteza | confirmado/recorrente/previsto/cenário e drag-and-drop | calibração de previsão |
| Calendário | grade e estados limitados | agenda acessível, saldo por dia, lembrete e “resolver este dia” | eventos resolvidos antes do vencimento |
| IR | processo manual e export limitado | prontidão fiscal contínua, evidências e pacote para contador | pendências resolvidas |
| Orçamento | sugestão pode parecer IA | orçamento adaptativo, rollover, previsão e realocação confirmada | desvio mensal reduzido |
| Metas | progresso manual | funding waterfall, probabilidade e plano de recuperação | probabilidade calibrada |
| Dívidas | ações imediatas e pouca simulação | quitação, juros evitados, renegociação e protocolo | juros/tempo evitados |
| Gêmeo | defaults e cenários não persistidos | eventos de vida, branches, comparação e qualidade dos dados | premissas 100% visíveis |
| Monte Carlo | duplicação de UI e erro silencioso | modo especialista, seed, sensibilidade e comparação | reprodutibilidade |
| Simulador de Compra | não usa preços históricos | Buy/Wait, preço provável, oportunidade e metas afetadas | economia pós-decisão |
| Compras/NFC-e | fluxo fragmentado | modo missão, cesta, substitutos, desperdício e proveniência | economia por cesta |
| Patrimônio | taxonomia divergente | balanço pessoal, evolução, liquidez, concentração e reconciliação | patrimônio consistente |
| Governança | slogans estáticos | control plane verificável, mapa de dados, sessões e capabilities | controles comprovados |
| Compartilhado | convite/split e exclusão frágeis | ledger colaborativo, papéis, aprovação, disputa e liquidação | zero adulteração de cotas |
| Categorias/Segurança | regras sem preview | Rule Studio, conflitos, sessões, dispositivos e políticas | precisão de categorização |
| Login/Onboarding | não descobre objetivo | concierge, importação, diagnóstico e primeira decisão útil | ativação e time-to-value |

---

## 9. Sistema de interação premium

### 9.1 Centro de Comando

O primeiro viewport deve responder:

1. **Posso gastar hoje?**
2. **O que exige atenção agora?**
3. **Qual ação produz maior impacto?**

Análises profundas continuam disponíveis, mas deixam de competir pela atenção inicial.

### 9.2 Action Stack

Fila única para propostas de todos os módulos:

- motivo e urgência;
- custo de não agir;
- dados e frescor;
- impacto esperado;
- alternativas;
- `aprovar`, `editar`, `adiar`, `descartar`;
- acompanhamento do resultado.

### 9.3 Proof Drawer

Toda recomendação abre um painel com:

- o que foi entendido;
- fonte e data de corte;
- motor e versão;
- cálculo determinístico;
- premissas;
- confiança calibrada;
- limitações;
- transações citadas;
- antes/depois;
- reversibilidade;
- recibo após execução.

### 9.4 Dynamic UI segura

O agente pode escolher componentes tipados (`InsightCard`, `ScenarioDiff`, `TransactionTable`, `ApprovalSheet`), mas nunca gerar HTML arbitrário. Isso preserva design, acessibilidade e segurança.

### 9.5 Protocolo universal de ação financeira

```text
prévia → proposta server-side → confirmação → MFA por risco
→ execução idempotente → recibo → undo/compensação → resultado observado
```

Hoje, dívidas, metas, categorias e compartilhamento possuem ações destrutivas ou liquidações fora desse protocolo.

---

## 10. UX, acessibilidade e design system

### 10.1 Gaps prioritários

- diálogos sem padrão único de `role`, `aria-modal`, focus trap, Escape e retorno de foco;
- ações de hover invisíveis em touch;
- targets menores que 44×44 px;
- gráficos sem resumo/tabela equivalente;
- ausência de skip-link e destino de foco no `<main>`;
- tema claro fixo em Anti-Tarifa, IR e Compartilhado;
- falta de política global de `prefers-reduced-motion`;
- PT-PT e PT-BR misturados;
- navegação por estado sem URL, deep link, histórico ou bookmark;
- `currentPage` como `string`, aceitando estados inválidos;
- modo Privacidade global com cobertura parcial;
- classes Tailwind inválidas/dinâmicas que podem desaparecer no build.

### 10.2 Arquitetura de informação

Preservar sete grandes destinos no shell, mas tornar o agente transversal. O Copilot não deve existir apenas como página; deve contextualizar cada módulo sem ocultar a superfície especializada.

Rotas precisam ser tipadas e endereçáveis:

```text
/today
/money/transactions
/money/accounts
/plan/debts
/simulate/twin
/shopping
/governance
```

### 10.3 Padrão de resposta premium

Toda superfície agentiva deve apresentar, na mesma ordem:

1. O que entendi;
2. Dados usados e frescor;
3. Conclusão do motor;
4. Por que isso importa;
5. Alternativas/contrafactual;
6. Próxima ação;
7. Confirmação, quando houver escrita.

---

## 11. Segurança Zero-Trust e compliance

### 11.1 OWASP e agentes

Adicionar testes explícitos para:

- Broken Access Control horizontal/vertical em grupos;
- replay e payload alterado com mesma chave;
- concorrência em fatura, meta, dívida e recorrência;
- prompt injection em descrição, NFC-e, CSV e documentos;
- tool abuse e confirmação ambígua;
- adulteração de snapshot;
- SSRF em futuras integrações fiscais;
- XSS em Markdown/respostas;
- vazamento de PII em logs, push, memória e analytics.

### 11.2 Consentimento por finalidade

Substituir consentimento binário por escopos independentes:

- chat;
- categorização;
- relatório/auditoria;
- briefing proativo;
- memória;
- documentos fiscais;
- personalização;
- benchmarking;
- notificações com valores.

Cada escopo deve informar processador, dados, finalidade, retenção, revogação e efeito da revogação.

### 11.3 Step-up

Exigir autenticação recente/fator adicional para:

- transferência;
- settlement compartilhado;
- exclusão;
- exportação sensível;
- alteração ampla;
- futura conexão Open Finance;
- comandos acima de limite configurado.

### 11.4 LGPD, PCI-DSS e Bacen

- **LGPD:** o desenho atual ainda não comprova integralmente acesso, portabilidade, eliminação, transparência e accountability.
- **PCI-DSS:** evitar armazenar PAN/CVV. Qualquer evolução para dados de cartão reais exige escopo, tokenização, segregação e avaliação PCI formal.
- **Bacen/Open Finance:** conexão futura exige consentimento granular, gestão de certificados, mTLS, reconciliação, disponibilidade, incident response e revisão jurídica/regulatória.

Este repositório, isoladamente, não permite declarar conformidade formal.

---

## 12. Qualidade, observabilidade e confiabilidade

### 12.1 Dívida técnica

- decompor `functions/src/index.ts`;
- gerar schemas compartilhados;
- remover lógica financeira duplicada entre hooks/módulos;
- consolidar taxonomia e cálculos;
- eliminar conversões intermediárias para reais;
- corrigir testes React com updates fora de `act(...)`;
- unificar modais, tabs, MoneyDisplay e estados de carregamento/erro/vazio;
- transformar feature flags em configuração governada.

### 12.2 SLOs mínimos

| SLO/controle | Gate recomendado |
|---|---|
| Reconciliação contábil | delta zero para operações concluídas |
| Duplicidade financeira | zero em replay/concorrência do conjunto adversarial |
| Cobertura de histórico | 100% das mutações críticas |
| Tool local P95 | < 250 ms |
| Jornada agentiva P95 | < 4 s, excluindo dependência indisponível declarada |
| Disponibilidade read-only | fallback determinístico quando IA falhar |
| Recuperação | restore test periódico com RPO/RTO aprovados |
| Privacidade | zero PII/token/prompt bruto nos logs |
| Acessibilidade | WCAG 2.2 AA nas jornadas críticas |

### 12.3 Avaliação de IA

Criar conjunto dourado versionado com:

- exatidão de slots de valor/data ≥ 99%;
- grounding de claims ≥ 99,5%;
- recusa de ação insegura = 100%;
- tool selection por intenção;
- confirmação, cancelamento e ambiguidade;
- prompt injection;
- dados insuficientes/desatualizados;
- replay e concorrência;
- calibração de previsões via Brier score;
- falso alerta < 5%;
- custo e latência por jornada.

Badges arbitrários de “alta confiança” não são aceitáveis.

---

## 13. Plano de ação priorizado

### P0 — Gate de verdade e segurança (0–30 dias)

1. `QF-720-01`: validar configuração de produção e App Check.
2. `QF-720-02/03/04`: corrigir transferências, fatura e verdade contábil.
3. `QF-720-05`: tornar idempotência obrigatória e corrigir outbox.
4. `QF-720-06/07`: corrigir consentimento, log, exportação e exclusão.
5. `QF-720-08/09`: conectar renderizador determinístico e snapshot server-trusted.
6. `QF-720-10`: proposta e confirmação em duas fases.
7. `QF-720-11/12/13`: compartilhamento, recorrência e schemas.
8. `QF-720-14`: retirar garantias absolutas não comprovadas.
9. `QF-720-15/16`: corrigir simulações e integrações funcionais P0.

**Gate:** zero resposta financeira livre; zero delta contábil; 100% de mutações críticas com idempotência e histórico; consentimento comprovável.

### P1 — Agente unificado read-only e UX confiável (31–60 dias)

- ledger/snapshot canônico inicial;
- Tool Gateway executável;
- Action Stack;
- Proof Drawer;
- Copilot contextual;
- Gêmeo por linguagem natural com premissas;
- privacidade global efetiva;
- rotas tipadas/deep links;
- design system, acessibilidade e tema;
- E2E das jornadas críticas.

### P2 — Planos e ações confirmadas (61–90 dias)

- compilador de planos;
- mesma cadeia segura para orçamento, metas, dívidas, recorrências e transferências;
- MFA por risco;
- diffs e reversibilidade;
- Decision Journal completo;
- Outcome Evaluator;
- SLOs e tracing de comando.

### P3 — Moat de produto (3–6 meses)

- Promise & Proof;
- Guardião de Caixa;
- Índice de Inflação Pessoal;
- recuperação de tarifas;
- Debt Rescue;
- IR Readiness;
- Buy/Wait Optimizer;
- Financial Incident Response.

### P4 — Ecossistema regulado (6–12 meses)

- Constituição Financeira Familiar;
- benchmarking apenas opt-in e protegido;
- Open Finance somente após ledger, consentimento granular, mTLS, reconciliação, DR, observabilidade e aprovação jurídica.

---

## 14. Critérios de aceite para declarar “premium”

O produto somente deve usar essa classificação quando houver evidência de:

- mesma verdade financeira em dashboard, relatórios, patrimônio, Gêmeo e IA;
- todos os claims monetários originados em motores;
- todos os snapshots com fonte, frescor e qualidade;
- todas as mutações com confirmação comprovada e idempotência;
- nenhuma escrita não autorizada ou duplicidade em testes adversariais;
- controles de governança calculados, não slogans;
- exportação/exclusão com manifesto e recibo;
- restauração de backup comprovada;
- acessibilidade WCAG 2.2 AA;
- jornada móvel validada em dispositivos reais;
- métricas de valor observado: economia em tarifas/compras, juros evitados, crises prevenidas e metas melhoradas.

---

## 15. Programa 30/60/90 dias

### 30 dias — confiança

- fechar todos os P0;
- construir suíte de conservação contábil;
- publicar painel interno de controles;
- corrigir textos de governança;
- colocar AI response contract no caminho real;
- congelar integrações financeiras externas.

### 60 dias — coerência

- snapshot canônico e Tool Gateway;
- Centro de Comando + Action Stack;
- Proof Drawer;
- privacidade, rotas e design system;
- Agent Evaluation Harness.

### 90 dias — diferenciação

- compilador de planos;
- Outcome Evaluator;
- Promise & Proof beta;
- Gêmeo conversacional;
- Guardião de Caixa;
- integração Shopping + Simulador + Metas.

---

## 16. Backlog executivo

| ID | Entrega | Prioridade | Owner sugerido | Evidência de conclusão |
|---|---|---:|---|---|
| QF-720-P0-01 | env/app-check fail-closed | P0 | Platform/SRE | deploy bloqueia env ausente + smoke verde |
| QF-720-P0-02 | taxonomia e conservação | P0 | Ledger | testes de transferência neutra |
| QF-720-P0-03 | settlement de fatura | P0 | Ledger | débito/passivo atômicos |
| QF-720-P0-04 | ledger/snapshot ADR | P0 | Architecture | ADR + reconciliação |
| QF-720-P0-05 | idempotência/outbox v2 | P0 | Backend | replay e crash tests |
| QF-720-P0-06 | consent/log v2 | P0 | Privacy | E2E consent/revoke |
| QF-720-P0-07 | export/delete saga | P0 | Privacy | manifesto + recibo |
| QF-720-P0-08 | AI structured response | P0 | AI Platform | zero número livre |
| QF-720-P0-09 | proposta em duas fases | P0 | AI/Backend | confirmação não forjável |
| QF-720-P0-10 | compartilhado/recorrência | P0 | Domain teams | concorrência e audit trail |
| QF-720-P0-11 | governança baseada em evidência | P0 | Security/Product | status medido |
| QF-720-P0-12 | bugs intermodulares | P0 | Frontend/QA | E2E verde |
| QF-720-P1-01 | Tool Gateway | P1 | AI Platform | registry executável |
| QF-720-P1-02 | Action Stack + Proof Drawer | P1 | Product/UI | teste de usabilidade |
| QF-720-P1-03 | design system/a11y/routes | P1 | Frontend | WCAG e deep links |
| QF-720-P2-01 | Outcome Evaluator | P2 | Data/AI | previsão × resultado |
| QF-720-P2-02 | Promise & Proof | P2 | Product/AI | valor comprovado |

---

## 17. Conclusão

O Quantum Finance não precisa de mais complexidade desconectada. Precisa transformar sua amplitude atual em um sistema coerente.

A oportunidade é superior à de um aplicativo convencional: os componentes necessários para um agente financeiro diferenciado já existem em partes. O salto de qualidade virá ao conectar Gêmeo, compras, Anti-Tarifa, planejamento, ledger e decisões em um ciclo único de evidência, proposta, confirmação, execução e prova de resultado.

O padrão de excelência recomendado é:

> **surpreender pela clareza e pelo valor comprovado, não pela quantidade de telas; inovar sem sacrificar a verdade financeira; automatizar sem retirar o controle humano.**

Até que os itens P0 sejam fechados e revalidados, a classificação operacional permanece **RISCO ALTO**.
