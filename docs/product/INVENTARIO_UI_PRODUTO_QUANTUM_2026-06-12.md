# Inventario UI/Produto Quantum Finance

Data: 2026-06-12  
Fase: 2 - Inventario read-only de UI/Produto  
Referencia principal: `docs/product/QUANTUM_FINANCE_VISAO_ESTRATEGICA_2_0.md`

## 1. Sumario executivo

### Observado no codigo

O Quantum Finance atual e uma SPA React/Vite com navegacao interna baseada em estado (`NavigationContext`), sem roteamento por URL. A experiencia principal esta organizada em um `AppShell` composto por `Sidebar`, `Header`, area principal, modais globais, chat IA flutuante e paleta de comandos.

O produto ja contem muitos blocos que antecipam a visao Quantum Finance 2.0: dashboard com inteligencia proativa, timeline 90 dias, movimentacoes com auditoria e importacao, orcamentos, metas, simulacao Monte Carlo, simulador de compra, modulo de dividas, cartoes, contas, recorrencias, chat IA com citacoes e painel LGPD. A base funcional e ampla e madura em alguns fluxos, especialmente movimentacoes/importacao/auditoria.

O principal problema de produto percebido e que a informacao esta distribuida em muitos cards e modulos com nomenclaturas ainda misturadas entre livro-caixa, BI, simulacao e linguagem "quantica". O Dashboard concentra muitas responsabilidades e aumenta a carga cognitiva. A UI tem um estilo visual forte, escuro, glass/neon, com muitos efeitos, cards arredondados e sinais de status simultaneos. Ha boas sementes de design system (`btn-quantum-*`, `input-quantum`, tokens CSS), mas ainda ha varios padroes locais duplicados para modais, cards, confirmacoes, loading e formularios.

### Recomendacao

Preparar o Quantum Finance 2.0 como uma reorganizacao de experiencia e arquitetura de UI, preservando integralmente o motor financeiro, schemas, rules, functions, historico append-only, centavos inteiros, `Decimal.js`, Zod strict, App Check e logs sanitizados. A proxima fase deve focar AppShell/navegacao, taxonomia de modulos e padroes visuais reutilizaveis, sem alterar dominio financeiro.

## 2. Estado atual percebido da UI

### Observado no codigo

- Visual dominante: tema escuro futurista, cards glass, acentos cyan/verde/violeta/vermelho/amarelo, sombras e blur.
- Layout principal: sidebar fixa/colapsavel em desktop, menu mobile, header fixo, conteudo com scroll proprio.
- Linguagem de produto: mistura portugues do Brasil e portugues de Portugal em textos como "A carregar", "registada", "detetada", "As Minhas Contas", "patrimonio/patrimonio", "Livro Razao".
- Dashboard atual: funciona como cockpit unico para saldo, saude financeira, KPIs, insights, score, fluxo semanal, metas, desafios, alertas, briefing IA, graficos, heatmap, orcamentos, previsao e timeline.
- Movimentacoes: area mais operacional, com filtros, busca, agrupamento, selecao, acoes em lote, importacao, auditoria e historico.
- IA: aparece como pagina dedicada (`QuantumAIPage`), chat flutuante (`AIAssistantChat`), cards proativos (`QuantumCopilotCards`) e briefing IA (`ProactiveBriefing`).

### Recomendacao

Reduzir a quantidade de conceitos simultaneos por tela. A UI 2.0 deve priorizar decisao, proxima acao e explicabilidade. A linguagem deve ser padronizada em portugues do Brasil antes de expandir design visual.

## 3. Mapa de rotas e paginas

### Observado no codigo

Nao ha rotas URL confirmadas. As "rotas" sao paginas internas controladas por `currentPage` em `src/contexts/NavigationContext.tsx` e renderizadas condicionalmente em `src/App.tsx`.

| ID interno | Label atual na Sidebar/Header | Componente renderizado | Observacao |
|---|---|---|---|
| `dashboard` | Dashboard / Painel Central | `DashboardContent` | Entrada padrao do app autenticado. |
| `reports` | BI & Relatorios / Relatorios Analiticos | `ReportsContent` | Pareto 80/20 e tendencias. |
| `quantum` | Quantum AI | `QuantumAIPage` | Auditoria, anomalias, burn metrics, relatorio Gemini. |
| `simulation` | Monte Carlo | `SimulationCenter` | Simulacao estocastica com sliders macro. |
| `purchase-simulator` | Simulador de Compra | `PurchaseSimulator` | Decisao "posso comprar isso agora?". |
| `accounts` | Minhas Contas / As Minhas Contas | `AccountsManager` | Contas, ativos, passivos, patrimonio. |
| `cards` | Cartoes de Credito | `CreditCardManager` | Limites, faturas, pagamento via transferencia. |
| `history` | Movimentacoes / Livro Razao | `HistoryPage` + `TransactionsManager` | Lista e operacao de transacoes. |
| `wallet` | Carteira | `HistoryPage` | Existe em `Header`/`CommandPalette`, mas nao aparece na `Sidebar`; renderiza a mesma tela de `history`. |
| `recurring` | Despesas Fixas / Despesas Recorrentes | `RecurringManager` | Contratos, assinaturas, recorrencias. |
| `debts` | Dividas | `DebtModule` | Cadastro e acompanhamento de dividas. |

Paginas/modais globais:

- `LoginScreen`: login Google e estado de autenticacao.
- `TransactionForm`: modal/bottom sheet de nova transacao/edicao.
- `TransferForm`: modal de transferencia.
- `CategorySettings`: modal de configuracoes, regras de categorizacao e LGPD.
- `AIAssistantChat`: chat flutuante.
- `CommandPalette`: paleta de comandos e modo comandante.
- `ConfirmDeleteModal`: confirmacao global de exclusao de transacao.

### Recomendacao

Na proxima fase, definir uma taxonomia de navegacao alinhada aos oito modulos oficiais:

1. Centro de Comando;
2. Timeline Financeira;
3. Movimentacoes;
4. Planejamento;
5. Patrimonio & Objetivos;
6. Compras Inteligentes;
7. Copilot IA;
8. Cofre / Governanca.

A decisao sobre URL routing ainda nao esta confirmada no inventario; se o produto exigir deep links, historico do navegador ou bookmarks, avaliar introducao posterior de roteamento sem tocar no motor financeiro.

## 4. Mapa de componentes principais

### Observado no codigo

Shell e navegacao:

- `App.tsx`: orquestracao de auth, hooks financeiros, pagina ativa, modais globais e lazy loading.
- `NavigationContext.tsx`: estado de pagina, mes/ano e modulo ativo.
- `Sidebar.tsx`: grupos de navegacao atuais.
- `Header.tsx`: titulo, seletor de mes, KPIs compactos, privacidade, tema, importacao, transferencia e nova transacao.
- `CommandPalette.tsx`: comandos de navegacao, privacidade e modo comandante.
- `QuantumBackground.tsx`: canvas decorativo de fundo.

Dashboard/inteligencia:

- `DashboardContent.tsx`: cockpit principal.
- `KPICards.tsx`, `IntelStrip.tsx`, `HealthGauge.tsx`, `SparkLine.tsx`.
- `QuantumInsights.tsx`, `QuantumCopilotCards.tsx`, `ProactiveBriefing.tsx`.
- `FinancialHealthScore.tsx`, `WealthKPIs.tsx`, `WeeklyCashflowWidget.tsx`.
- `GoalsPanel.tsx`, `EconomyChallengeWidget.tsx`, `AnomalyAlerts.tsx`.
- `BudgetWidget.tsx`, `ForecastWidget.tsx`, `TimelineWidget.tsx`, `SurvivalHeatmap.tsx`.

Movimentacoes:

- `HistoryPage.tsx`: wrapper da pagina.
- `TransactionsManager.tsx`: orquestrador de lista, filtros, selecao, auditoria e drawers.
- `TransactionToolbar.tsx`, `TransactionSummaryBar.tsx`, `TransactionBulkActions.tsx`, `TransactionList.tsx`, `TransactionRow.tsx`, `GroupHeader.tsx`, `FilterChip.tsx`.
- `TransactionHistoryDrawer.tsx`, `AuditTimeline.tsx`, `InstallmentGroupDrawer.tsx`.
- `TransactionForm.tsx`, `TransferForm.tsx`.
- `ImportButton.tsx` e subcomponentes em `src/features/transactions/import`.
- `ReconciliationEngine.tsx`.

Planejamento/patrimonio/compras/IA/governanca:

- `BudgetWidget.tsx`, `GoalsPanel.tsx`, `EmergencyFundCalculator.tsx`.
- `AccountsManager.tsx`, `CreditCardManager.tsx`, `DebtModule.tsx`, `RecurringManager.tsx`.
- `SimulationCenter.tsx`, `PurchaseSimulator.tsx`.
- `QuantumAIPage.tsx`, `AIAssistantChat.tsx`, `GeminiService.ts`, `ConversationMemory.ts`.
- `CategorySettings.tsx`, `DataPrivacyPanel.tsx`.

### Recomendacao

Promover para design system os componentes de botao, input, card, badge, modal/drawer, toolbar, empty state, skeleton, toast/action feedback e seletor segmentado. O objetivo e reduzir estilos inline e variacoes locais antes de redesenhar telas complexas.

## 5. Mapa de fluxos de usuario

### Observado no codigo

Autenticacao:

- Usuario nao autenticado ve `LoginScreen`.
- Login via Google popup.
- Em modo emulador, ha login anonimo automatico.
- Logout via sidebar.

Navegacao:

- Sidebar altera `currentPage`.
- Header muda mes/ano global.
- Paleta de comandos navega por `setCurrentPage`.
- `wallet` e acessivel pela paleta, mas nao pela sidebar, e reutiliza `HistoryPage`.

Movimentacao manual:

- Header/Dashboard/FAB abrem `TransactionForm`.
- Usuario define tipo, descricao, valor, data, categoria e opcionalmente parcelamento.
- Edicao reaproveita o mesmo formulario.
- Exclusao usa `ConfirmDeleteModal`.

Transferencia:

- Header abre `TransferForm`.
- Cartao com fatura pode iniciar transferencia pre-preenchida para pagamento de fatura.
- Formulario valida origem/destino diferentes e valor positivo.

Importacao:

- `ImportButton` abre modal.
- Estados declarados: `idle -> parsing -> col_mapping -> password_required -> ai_processing -> reconciliation -> preview -> importing -> success | error`.
- Inclui parsing CSV/OFX/PDF, senha PDF, mapeamento de colunas, categorizacao local/IA, deduplicacao, busca cross-page e reconciliacao manual.

Movimentacoes em lote:

- `TransactionsManager` permite filtros, selecao, recategorizacao, exclusao em lote e undo temporario via toast.

Contas/cartoes/dividas/recorrencias:

- CRUD parcial por modais e formularios inline.
- Cartoes exibem limite/fatura/alerta e permitem acao "Pagar fatura".
- Recorrencias podem ser pausadas/reativadas e autoexecutadas no Dashboard.
- Dividas permitem adicionar, excluir e marcar parcela paga.

Planejamento/metas:

- Orcamentos podem ser criados manualmente ou por sugestoes de IA com confirmacao humana.
- Metas podem ser criadas, editadas em progresso e removidas.
- Reserva de emergencia aparece dentro de `GoalsPanel`.

IA:

- Chat flutuante aceita perguntas, mostra sugestoes contextuais e citacoes de transacoes.
- `QuantumAIPage` gera auditoria via Gemini mediante clique humano.
- `ProactiveBriefing` gera briefing automatico com anti-spam.
- `BudgetWidget` gera sugestoes de orcamento para aprovacao humana.

Governanca/LGPD:

- `DataPrivacyPanel` permite consentimentos, exportacao de dados e exclusao de conta com confirmacao textual `EXCLUIR`.
- Historico de processamento exibe eventos recentes.

### Recomendacao

Documentar todos os fluxos sensiveis com padrao visual de "IA sugere, humano confirma", especialmente sugestoes de orcamento, auditoria IA, importacao/reconciliacao, exclusao de conta, exclusao em lote e pagamento de fatura.

## 6. Modulos atuais identificados

### Observado no codigo

- Dashboard / Painel Central.
- BI & Relatorios.
- Quantum AI.
- Monte Carlo.
- Simulador de Compra.
- Minhas Contas.
- Cartoes de Credito.
- Movimentacoes / Livro Razao.
- Despesas Fixas / Recorrencias.
- Dividas.
- Configuracoes / Motor de Categorizacao.
- Privacidade e Dados / LGPD.
- Importacao e Reconciliacao.

### Recomendacao

Mapear estes modulos para a arquitetura 2.0:

- Dashboard atual -> Centro de Comando, com reducao de densidade.
- `TimelineWidget` + fluxo semanal + recorrencias -> Timeline Financeira.
- `HistoryPage`/`TransactionsManager` -> Movimentacoes.
- `BudgetWidget` + alertas de orcamento -> Planejamento.
- `AccountsManager` + `GoalsPanel` + `DebtModule` + `CreditCardManager` -> Patrimonio & Objetivos, com subareas.
- `PurchaseSimulator` -> Compras Inteligentes visual, mantendo NFC-e real bloqueada.
- `QuantumAIPage` + `AIAssistantChat` + cards -> Copilot IA contextual.
- `CategorySettings` + `DataPrivacyPanel` + auditoria -> Cofre / Governanca.

## 7. Componentes que podem virar design system

### Observado no codigo

Ja existem tokens e classes globais em `src/index.css`:

- `--q-*` para cores, superficies, bordas e inputs.
- `.glass-card-quantum`, `.glass-card-elite`.
- `.btn-quantum-primary`, `.btn-quantum-secondary`, `.btn-quantum-danger`.
- `.badge-quantum-green`, `.badge-quantum-red`, `.badge-quantum-gold`.
- `.input-quantum`.
- `.progress-quantum`.

Padroes recorrentes:

- Cards de KPI/metricas.
- Modal central.
- Drawer lateral.
- Empty state com icone + titulo + texto.
- Skeleton/loading com `Loader2` ou `animate-pulse`.
- Badges de status.
- Barras de progresso.
- Seletor segmentado.
- Toolbars com busca/filtro/exportacao.
- Formularios financeiros com valor/data/categoria.
- Confirmacao destrutiva.

### Recomendacao

Criar uma camada de UI compartilhada antes de redesenhar telas: `Button`, `IconButton`, `Card`, `MetricCard`, `Modal`, `Drawer`, `Badge`, `EmptyState`, `Skeleton`, `MoneyInput`, `DateInput`, `Select`, `SegmentedControl`, `Toolbar`, `ConfirmationDialog` e `StatusBanner`. Nesta fase, isso e recomendacao; nenhuma implementacao foi proposta neste inventario.

## 8. Duplicacoes e inconsistencias

### Observado no codigo

- Nomenclatura inconsistente: Dashboard/Painel Central, Movimentacoes/Livro Razao, Minhas Contas/As Minhas Contas, Quantum AI/Central Quantum AI.
- `wallet` existe em `Header`/`CommandPalette`, mas nao na `Sidebar`, e renderiza `HistoryPage`.
- Varios modais implementados localmente com estruturas semelhantes: transacao, transferencia, conta, recorrencia, divida, importacao, orcamento sugerido, configuracoes, confirmacao de delete.
- Varias formas de loading: `QuantumLoader`, `Loader2`, `animate-pulse`, skeletons locais, textos "A carregar" e "Carregando".
- Varias formas de erro/confirmacao: toast, banner inline, texto em formulario, modal de confirmacao, botoes inline "Confirmar".
- Cards arredondados/glass aparecem com variacoes locais e classes inline.
- Formatacao monetaria aparece por diferentes caminhos: `formatCurrency`, `formatBRL`, `fromCentavos`, `toCentavos`, `Intl.NumberFormat`, `CountUp` com valores em reais.
- IA aparece em multiplas superficies sem um contrato visual unico de origem, confianca, citacoes e confirmacao.
- `ReportsContent` possui Pareto no tab principal e tambem grafico Pareto dentro de tendencias, com possivel sobreposicao conceitual.

### Recomendacao

Antes do redesign visual, consolidar nomenclatura e componentes compartilhados. A padronizacao de dinheiro deve ser tratada com cuidado: a UI pode formatar valores para exibicao, mas a persistencia e as operacoes sensiveis devem continuar em centavos inteiros e com `Decimal.js` onde aplicavel.

## 9. Pontos de alta carga cognitiva

### Observado no codigo

- Dashboard: numero alto de secoes em uma unica pagina, incluindo score, KPIs, patrimonio, fluxo semanal, metas, desafio, copilot, anomalias, orcamento, briefing IA, periodo, graficos, heatmap, forecast e timeline.
- Header: seletor de mes, KPIs compactos, command palette, privacidade, tema, importacao, transferencia e nova transacao competem por atencao.
- Movimentacoes: toolbar com busca local/server-side, tipo, reconciliacao, filtros avancados, categoria, origem, risco, ordenacao, agrupamento, datas, valores, auditoria, exportacao e relatorio.
- Importacao: fluxo poderoso e extenso, com parsing, senha, mapeamento, IA, reconciliacao, preview e dedupe.
- Configuracoes: categorizacao automatica e LGPD dividem o mesmo modal.
- Quantum AI: anomalias, top categorias, risco fixo e auditoria automatica em uma pagina, com pouca hierarquia de acao.

### Recomendacao

Definir uma hierarquia de "decidir agora", "acompanhar", "explorar" e "configurar". O Centro de Comando deve reduzir cards simultaneos e destacar eventos acionaveis, vencimentos e alertas explicaveis.

## 10. Lacunas de acessibilidade

### Observado no codigo

Pontos positivos:

- Varios modais usam `role="dialog"` e `aria-modal`.
- Importacao e reconciliacao possuem foco, labels e atalhos mais estruturados.
- `TransactionRow`, toolbar e importacao tem varios `aria-label`.
- Existem regioes `role="status"`, `role="alert"` e `aria-live` em alguns pontos.

Lacunas:

- Nem todos os modais locais exibem `role="dialog"`/`aria-labelledby` de forma consistente.
- Alguns botoes icon-only dependem de `title` sem `aria-label` confirmado.
- Muitos estados dependem de cor (verde/amarelo/vermelho) com pouco texto de suporte em alguns cards compactos.
- Excesso de animacoes/glow/blur pode prejudicar usuarios sensiveis a movimento; suporte a `prefers-reduced-motion` nao foi confirmado no inventario.
- Contraste real em tema claro/escuro nao foi medido; nao confirmado no inventario.
- Foco visivel consistente em todos os controles nao foi confirmado no inventario.
- Uso de emojis como informacao visual em metas/chat pode precisar de texto alternativo ou contexto textual.

### Recomendacao

Criar checklist WCAG para AppShell e componentes base. Padronizar `aria-label`, `aria-labelledby`, foco inicial, foco preso em modal, Escape, estados `aria-live`, contraste e preferencia por reducao de movimento.

## 11. Lacunas de responsividade/mobile

### Observado no codigo

Pontos positivos:

- Sidebar tem modo mobile com overlay.
- `TransactionForm` vira bottom sheet em telas pequenas.
- Muitos grids usam `grid-cols-1`, `sm`, `md`, `lg`, `xl`.
- Chat usa `w-[90vw]` em mobile.
- Header esconde alguns textos e a importacao em alguns breakpoints.

Lacunas:

- Dashboard pode ficar longo demais no mobile, com muitos blocos sequenciais antes da acao principal.
- Header central/direita pode competir por espaco em telas pequenas, especialmente seletor de mes e botoes globais.
- Tabelas/previews de importacao e graficos podem exigir QA visual por breakpoint; nao confirmado no inventario.
- Chat fixo com altura `560px` pode ocupar area excessiva em dispositivos baixos.
- `TransactionsManager` e toolbar avancada tem alta densidade para mobile.
- Cards de conta/cartao/divida e formularios longos precisam de validacao visual real; nao confirmado no inventario.

### Recomendacao

Na proxima fase, validar os breakpoints principais com screenshots e definir comportamento mobile do AppShell: navegacao inferior ou menu lateral, header reduzido, acao principal persistente e filtros em drawer.

## 12. Lacunas de estados vazios/loading/erro

### Observado no codigo

Estados bem cobertos:

- Login/auth inicial.
- Lazy loading de modulos (`QuantumLoader`).
- Movimentacoes loading com skeleton.
- Lista de transacoes vazia.
- Importacao: idle, loading, senha, mapeamento, preview, sucesso, erro.
- Reconciliacao com progresso.
- Contas/cartoes/dividas/recorrencias/metas/orcamentos com vazios/loading em varios pontos.
- Auditoria/historico com loading, erro e vazio.
- `ErrorBoundary` global por modulo.

Lacunas:

- Estados de erro de IA nem sempre aparecem de modo explicavel; `ProactiveBriefing` falha silenciosamente.
- Padrao de empty state nao e unificado.
- Loading skeletons variam em tamanho, texto e densidade.
- Confirmacoes destrutivas sao inconsistentes entre modais e botoes inline.
- Estados de sucesso as vezes usam toast, as vezes texto no botao, as vezes fechamento automatico.

### Recomendacao

Definir padrao unico para estados: vazio acionavel, vazio informativo, loading estrutural, loading inline, erro recuperavel, erro bloqueante, confirmacao sensivel, sucesso persistente e sucesso transitorio.

## 13. Oportunidades para Centro de Comando

### Observado no codigo

O Dashboard ja possui materia-prima para Centro de Comando:

- Saldo em caixa e status operacional.
- Burn rate e dias para zero no header.
- `IntelStrip`, KPIs, score, saude financeira.
- `ProactiveBriefing`, `QuantumCopilotCards`, `AnomalyAlerts`.
- Alertas de orcamento, metas, desafios, fluxo semanal.
- Timeline 90 dias e forecast.

### Recomendacao

Transformar o Dashboard em Centro de Comando com foco em:

- "O que exige minha atencao hoje?"
- Alertas priorizados por severidade e prazo.
- Vencimentos e eventos proximos.
- Sugestoes IA com explicacao e fonte.
- Acoes humanas claras: revisar, aprovar, adiar, dispensar.

Reduzir componentes de analise profunda no primeiro viewport e mover exploracoes para Timeline, Planejamento e Patrimonio.

## 14. Oportunidades para Timeline Financeira

### Observado no codigo

Ja existe `TimelineWidget` com 90 dias, cenarios pessimista/base/otimista, saldo projetado, eventos e alerta de saldo negativo. Tambem ha `WeeklyCashflowWidget`, recorrencias e forecast.

### Recomendacao

Evoluir para uma Timeline Financeira dedicada que una:

- Passado registrado.
- Presente/hoje.
- Futuro projetado.
- Recorrencias, parcelas, faturas e metas.
- Eventos explicaveis que impactam saldo.
- Filtros por conta, categoria, severidade e certeza.

Nao alterar calculos nesta fase; a recomendacao e reorganizacao visual e informacional.

## 15. Oportunidades para Planejamento

### Observado no codigo

Planejamento existe de forma distribuida:

- `BudgetWidget` para limites por categoria.
- `BudgetAlertsPanel` dentro do Dashboard.
- Sugestoes de orcamento por IA com aprovacao humana.
- Alertas por 80% e 100% via toast.
- Forecast e Monte Carlo como apoio de cenario.

### Recomendacao

Consolidar Planejamento como modulo proprio:

- Orcamentos atuais.
- Ritmo de gasto vs limite.
- Projecao de fim do mes.
- Sugestoes IA sempre ajustaveis antes de confirmar.
- Historico de alteracoes de orcamento.
- Estados claros para sem orcamento, sem dados suficientes e limite excedido.

## 16. Oportunidades para Patrimonio & Objetivos

### Observado no codigo

Base existente:

- `AccountsManager`: ativos, passivos e patrimonio liquido.
- `GoalsPanel`: metas, progresso, prazo e aporte mensal necessario.
- `EmergencyFundCalculator`: reserva de emergencia.
- `DebtModule`: dividas, parcelas, juros, vencimento.
- `CreditCardManager`: limites, faturas e disponibilidade.
- `WealthKPIs` e metricas financeiras no Dashboard.

### Recomendacao

Unificar patrimonio, dividas, cartoes e metas sob uma experiencia de longo prazo:

- Visao consolidada de patrimonio liquido.
- Objetivos e reserva.
- Exposicao a dividas.
- Cartoes como passivo/risco operacional.
- Simulacoes de trajetoria para objetivos.

## 17. Oportunidades para Compras Inteligentes visual

### Observado no codigo

Existe `PurchaseSimulator` com:

- Valor, parcelas, data, fechamento, renda, comprometimento, CDI e limite.
- Resultado por veredito verde/amarelo/vermelho.
- Impacto em faturas.
- Acao "Registrar esta compra" que abre fluxo de transacao.

Nao foi encontrado fluxo de NFC-e real no inventario de UI lido. Qualquer NFC-e real permanece fora de escopo e bloqueada conforme visao estrategica.

### Recomendacao

Evoluir visualmente para Compras Inteligentes sem NFC-e real:

- Simulacao de compra antes de registrar.
- Comparacao "comprar agora vs esperar".
- Impacto em orcamento, fatura, saldo futuro e objetivos.
- Confirmacao humana para registrar.
- Area futura de listas/estimativas de mercado apenas apos definicao segura.

NFC-e real continua bloqueada ate threat model SSRF, validacao estrita de host/dominio, logs sanitizados e revisao humana.

## 18. Oportunidades para Copilot IA contextual

### Observado no codigo

Superficies atuais:

- Chat flutuante com sugestoes contextuais, memoria local por usuario, rate limit local e citacoes de transacoes.
- `QuantumAIPage` com auditoria automatica mediante clique.
- `ProactiveBriefing` no Dashboard.
- `QuantumCopilotCards` no Dashboard.
- Sugestoes IA em orcamentos.
- Categorizacao IA na importacao.

### Recomendacao

Definir contrato de Copilot IA:

- Sempre indicar fonte/dados usados.
- Separar insight, recomendacao e acao.
- Acoes sensiveis sempre exigem confirmacao humana.
- Exibir confianca/limites quando aplicavel.
- Manter logs sanitizados e minimizacao de dados.
- Nao permitir fetch arbitrario de URL.

## 19. Oportunidades para Cofre/Governanca

### Observado no codigo

Base existente:

- `CategorySettings`: regras automaticas por palavra-chave.
- `DataPrivacyPanel`: consentimentos, historico de processamento, exportacao e exclusao.
- `AuditTimeline`: historico de acoes.
- `TransactionHistoryDrawer`: historico por movimentacao.
- Modo privacidade global.

### Recomendacao

Transformar Cofre/Governanca em modulo explicito:

- Privacidade e consentimentos.
- Exportacao e exclusao LGPD.
- Auditoria de acoes.
- Historico append-only visivel ao usuario.
- Permissoes/limites da IA.
- Regras de categorizacao.
- Explicacao de retencao e dados sensiveis.

## 20. Riscos de mexer em UI sem quebrar dominio financeiro

### Observado no codigo

Varios componentes de UI chamam diretamente hooks e servicos criticos:

- `App.tsx` orquestra `useTransactions`, `useFinancialData`, `useAccounts`, `useCreditCards`, `useRecurring`, `useCategoryRules`, `useCategories`.
- `TransactionForm` e `TransferForm` chamam `FirestoreService`.
- `TransactionsManager` controla acoes em lote, undo e auditoria.
- `ImportButton` chama parsing, dedupe, IA, reconciliacao e importacao.
- `BudgetWidget`, `GoalsPanel`, `DebtModule`, `CreditCardManager`, `AccountsManager` fazem writes.

Riscos:

- Alterar formato de valores monetarios na UI e quebrar centavos inteiros.
- Converter valores com `number`/float de forma descuidada em fluxos financeiros.
- Remover confirmacoes humanas em acoes sensiveis.
- Quebrar historico append-only, auditoria ou undo.
- Alterar ordem/props de hooks que alimentam calculos.
- Enfraquecer isolamento `users/{uid}`.
- Remover validacoes ou estados intermediarios da importacao/reconciliacao.
- Confundir simulacao com execucao financeira real.
- Expor dados sensiveis em logs/toasts/erros.

### Recomendacao

Na fase visual, tratar componentes financeiros como casca de apresentacao sobre contratos existentes. Qualquer mudanca em schemas, services, functions, rules, App Check, package-lock ou persistencia deve ficar fora do redesign.

## 21. Arquivos que devem ser preservados

### Observado no codigo

Preservar sem alteracao durante o redesign visual inicial:

- `firestore.rules`
- `functions/`
- `package.json`
- `package-lock.json`
- `.env`
- `src/shared/schemas/financialSchemas.ts`
- `src/shared/schemas/categorySchemas.ts`
- `src/shared/types/money.ts`
- `src/shared/types/transaction.ts`
- `src/shared/services/FirestoreService.ts`
- `src/shared/services/LedgerService.ts`
- `src/shared/services/AuditService.ts`
- `src/shared/services/transactionRepo.ts`
- `src/shared/services/recurringRepo.ts`
- `src/shared/services/installmentRepo.ts`
- `src/hooks/useTransactions.ts`
- `src/hooks/useTransactionActions.ts`
- `src/hooks/useTransactionHistory.ts`
- `src/hooks/useRunningBalance.ts`
- `src/hooks/useImportActions.ts`
- `src/features/transactions/import/processResolvedImportBatch.ts`
- `src/features/transactions/ReconciliationEngine.tsx` enquanto o novo padrao de confirmacao nao estiver especificado.
- Testes existentes em `src/**/__tests__`, `src/**/*.test.*`, `functions/test/` e `e2e/`.

### Recomendacao

Para a fase AppShell/navegacao, restringir alteracoes a componentes de estrutura e documentacao de produto. Qualquer arquivo que manipule dinheiro, ledger, rules, functions, importacao real ou historico deve ser considerado zona protegida.

## 22. Recomendacao de fases seguintes

### Observado no codigo

A base atual permite redesenho incremental sem reconstruir tudo. O maior acoplamento esta em `App.tsx` e no Dashboard, que misturam orquestracao de dados, modais globais e renderizacao condicional.

### Recomendacao

Fase 3 - Navegacao/AppShell:

- Definir taxonomia oficial dos oito modulos.
- Atualizar mapa de labels e agrupamentos de navegacao.
- Especificar comportamento desktop/mobile.
- Criar criterio de pagina ativa, breadcrumbs/titulo e acoes globais.
- Nao alterar motor financeiro.

Fase 4 - Design system minimo:

- Consolidar botoes, inputs, cards, modais, drawers, badges, empty/loading/error.
- Padronizar linguagem PT-BR.
- Especificar acessibilidade basica.

Fase 5 - Centro de Comando:

- Reduzir Dashboard a alertas, decisoes e proximas acoes.
- Mover analises profundas para modulos especificos.

Fase 6 - Timeline + Movimentacoes:

- Dedicar Timeline Financeira.
- Preservar `TransactionsManager` como core operacional.

Fase 7 - Planejamento, Patrimonio & Objetivos, Compras Inteligentes visual, Copilot IA e Cofre/Governanca:

- Evoluir cada modulo com contratos de UI claros.
- Manter NFC-e real bloqueada ate threat model.

## 23. Criterios de aceite para a proxima fase de navegacao/AppShell

### Observado no codigo

A navegacao atual depende de `currentPage` e labels distribuidos entre `Sidebar`, `Header`, `CommandPalette` e renderizacao condicional em `App.tsx`.

### Recomendacao

A proxima fase deve ser aceita somente se:

- A navegacao refletir os oito modulos oficiais da visao 2.0.
- `wallet` for removido, renomeado ou explicitamente definido; nao deve permanecer ambiguo.
- Labels ficarem padronizados em portugues do Brasil.
- Desktop e mobile tiverem comportamento definido.
- AppShell nao alterar `functions/`, `firestore.rules`, schemas criticos, services financeiros, testes, `.env`, `package.json` ou `package-lock.json`.
- Nenhum fluxo sensivel perder confirmacao humana.
- Modo privacidade continuar acessivel.
- Chat/Copilot continuar transversal, mas sem obscurecer a acao principal.
- Estados de loading/erro/vazio do shell forem especificados.
- Acessibilidade minima do shell for validada: landmarks/labels, foco, teclado e contraste.
- O redesign visual preservar centavos inteiros, `Decimal.js`, Zod strict, `users/{uid}`, history append-only, logs sanitizados, idempotencia e App Check.

## Apendice A - Arquivos lidos mais relevantes

- `docs/product/QUANTUM_FINANCE_VISAO_ESTRATEGICA_2_0.md`
- `package.json`
- `src/main.tsx`
- `src/App.tsx`
- `src/index.css`
- `src/contexts/NavigationContext.tsx`
- `src/contexts/PrivacyContext.tsx` e `src/contexts/ThemeContext.tsx` foram identificados por uso; leitura completa nao confirmada no inventario.
- `src/components/Sidebar.tsx`
- `src/components/Header.tsx`
- `src/components/LoginScreen.tsx`
- `src/components/DashboardContent.tsx`
- `src/components/HistoryPage.tsx`
- `src/components/QuantumAIPage.tsx`
- `src/components/CommandPalette.tsx`
- `src/components/CategorySettings.tsx`
- `src/components/GoalsPanel.tsx`
- `src/components/BudgetWidget.tsx`
- `src/components/TimelineWidget.tsx`
- `src/components/ProactiveBriefing.tsx`
- `src/features/reports/ReportsContent.tsx`
- `src/features/simulation/SimulationCenter.tsx`
- `src/features/simulation/PurchaseSimulator.tsx`
- `src/features/transactions/TransactionsManager.tsx`
- `src/features/transactions/TransactionForm.tsx`
- `src/features/transactions/TransferForm.tsx`
- `src/features/transactions/AccountsManager.tsx`
- `src/features/transactions/CreditCardManager.tsx`
- `src/features/transactions/ImportButton.tsx`
- `src/features/ai-chat/AIAssistantChat.tsx`
- `src/features/settings/DataPrivacyPanel.tsx`
- `src/features/debts/DebtModule.tsx`

## Apendice B - Comandos de validacao recomendados

Estes comandos sao recomendados para a proxima fase; nao foram executados como parte deste inventario read-only:

```bash
npm run lint
npm run typecheck
npm run test:run
npm run build
npm run test:e2e
```

Para validar que apenas este documento foi alterado:

```bash
git status --short
```
