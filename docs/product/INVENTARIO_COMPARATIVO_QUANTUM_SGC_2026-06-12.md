# Inventário Comparativo Quantum + Sistema Gestão de Compras

Data: 2026-06-12  
Repositório alvo: `C:\quantum-finance`  
Repositório analisado como referência conceitual: `C:\sistema-gestao-compras`

Este documento registra uma análise read-only do Quantum Finance e do Sistema Gestão de Compras, com foco em preparar a evolução futura do módulo **Compras Inteligentes** dentro do Quantum Finance 2.0.

O inventário não propõe implementação imediata, não copia código entre projetos e não libera uso real de NFC-e. A NFC-e real continua bloqueada até haver threat model completo de SSRF, validação de host/domínio, logs sanitizados e revisão humana obrigatória.

## 1. Sumário executivo

### Observado no repositório

O Sistema Gestão de Compras é um conjunto de scripts Python, fluxos CLI, dashboard Streamlit, importadores fiscais locais e serviços de IA voltados a histórico de preços de compras de supermercado. O sistema possui parsers para PDF e XML local, importação manual, classificação de produtos com regras e IA, relatórios por categoria, consultas naturais via Gemini e persistência em Neon/PostgreSQL e SQLite.

O Quantum Finance já possui uma visão estratégica oficial para o Quantum Finance 2.0 e um inventário de UI/produto. A visão oficial define o Quantum como uma plataforma de inteligência financeira pessoal com IA integrada, explicável, proativa, auditável e sempre com confirmação humana em ações sensíveis.

Também já existe no Quantum um núcleo conceitual relacionado a compras: `src/lib/purchaseSimulator.ts` e `src/features/simulation/PurchaseSimulator.tsx`, voltados à simulação de impacto financeiro antes da compra. Esse núcleo é distinto do SGC: ele não importa notas fiscais nem administra histórico de produtos de supermercado.

### Inferência

O SGC não deve ser tratado como produto a ser migrado. Ele funciona melhor como referência de domínio: catálogo de produtos, lojas/mercados, histórico de preços, comparação de preços, importação assistida e revisão de classificações.

O valor estratégico para o Quantum está em transformar essas ideias em um módulo nativo de Compras Inteligentes, integrado a movimentações, planejamento, timeline, Copilot IA e governança, sem herdar infraestrutura, schema, código, segredos, modelos de segurança ou acoplamentos do SGC.

### Recomendação

Usar o SGC apenas como insumo conceitual para desenhar um domínio novo no Quantum Finance 2.0, com:

- Firebase Auth como fronteira de identidade.
- Firestore sempre sob `users/{uid}`.
- Cloud Functions TypeScript para qualquer processamento sensível.
- App Check em fluxos server-side.
- dinheiro sempre em centavos inteiros.
- `Decimal.js` para cálculos monetários.
- Zod `.strict()` para payloads.
- history append-only e logs sanitizados.
- idempotência server-side.
- revisão humana antes de qualquer ação financeira ou fiscal sensível.

### Proibido agora

Não migrar código do SGC, não implementar NFC-e, não chamar SEFAZ, não fazer scraping fiscal, não alterar motor financeiro do Quantum, não alterar rules/functions/schemas críticos e não copiar segredos ou arquivos locais do SGC.

## 2. Decisão de processo

### Observado no repositório

O `CLAUDE.md` do Quantum registra que o Sistema Gestão de Compras não é mais um produto ativo e serve apenas como referência conceitual para a futura criação do módulo interno **Compras Inteligentes**.

A visão estratégica `docs/product/QUANTUM_FINANCE_VISAO_ESTRATEGICA_2_0.md` estabelece que Compras Inteligentes deve fazer parte do Quantum Finance 2.0 como uma área integrada à inteligência financeira pessoal, não como ferramenta fiscal isolada.

### Recomendação

Formalizar a decisão de processo:

- SGC descontinuado como linha de produto independente para fins do Quantum.
- SGC mantido apenas como benchmark conceitual.
- Quantum Compras Inteligentes deve nascer nativo em Firebase/Firestore/Cloud Functions.
- Nenhum código Python, schema SQL ou fluxo Streamlit/CLI deve ser copiado diretamente.

### Proibido agora

Não executar scripts do SGC, não importar dados reais, não recuperar banco local, não abrir `.env`, não ler arquivos de chave e não transformar o inventário em implementação.

## 3. Escopo da análise

### Observado no repositório

Foram lidos arquivos de documentação, frontend, domínio, serviços, parsers e utilitários de ambos os repositórios. Foram excluídos deliberadamente:

- `.env` e equivalentes.
- arquivo com nome indicando chave de API no SGC.
- bancos locais como `compras.db`.
- PDFs fiscais reais ou potenciais.
- logs.
- diretórios de cache.
- outputs binários.

O repositório `C:\sistema-gestao-compras` não foi identificado como repositório Git no inventário local.

### Inferência

A ausência de Git no SGC reduz rastreabilidade de autoria, histórico e revisão. Para o Quantum, isso reforça a decisão de não migrar código diretamente e tratar o material como insumo de produto/domínio.

### Recomendação

Usar este documento como fronteira entre análise e execução. Próximas fases devem partir de especificações próprias do Quantum, não de adaptação incremental dos scripts do SGC.

## 4. Mapa geral do Sistema Gestão de Compras

### Observado no repositório

O SGC contém uma coleção de scripts Python com responsabilidades sobrepostas:

- CLI principal para menu e importação.
- importação de PDF fiscal local.
- importação de XML NFC-e local.
- importação manual por texto.
- processamento em lote de notas.
- classificação de produtos por regras.
- classificação de produtos por IA.
- relatórios CLI.
- dashboard Streamlit.
- serviços Gemini para insights, auditoria e consulta natural.
- persistência em Neon/PostgreSQL e SQLite.
- arquivos SQL auxiliares.
- utilitários de logging e configuração.

### Inferência

O projeto parece ter evoluído de forma exploratória, com múltiplas versões de schema, múltiplos pontos de configuração e duplicidade entre regras, IA, relatórios e persistência.

### Recomendação

Extrair apenas conceitos de produto:

- catálogo de produtos.
- loja/mercado.
- item comprado.
- histórico de preço.
- preço por unidade.
- revisão humana de classificação.
- comparação temporal.
- insights de economia.

## 5. Módulos do Sistema Gestão de Compras identificados

### Observado no repositório

Módulos identificados:

- **Menu/CLI:** `main.py`.
- **Processador XML local:** `sistema_completo.py`.
- **Importador PDF:** `importar_pdf.py`.
- **Importador manual:** `importar_manual.py`.
- **Processamento em lote:** `processar_notas.py`.
- **Persistência SQLite:** `database.py`, `banco_dados.py`.
- **Persistência/IA Neon + Groq:** `ia_groq_utils.py`.
- **Classificação por regras:** `classificador_produtos.py`, `classificador_regras.py`, `simplificador_produtos.py`.
- **Classificação IA em lote:** `classificar_produtos_ia.py`.
- **Dashboard:** `dashboard_precos.py`.
- **Relatórios:** `ver_relatorio.py`, `ver_relatorio_categorias.py`, `ver_relatorio_nuvem.py`, `consultas_precos.sql`.
- **Insights Gemini:** `services/gemini_insights.py`.
- **Consulta natural para SQL:** `services/gemini_consulta_natural.py`.
- **Auditoria Gemini:** `services/gemini_auditor.py`.
- **Configuração/logging:** `config.py`, `core/config.py`, `core/database.py`, `core/logger.py`, `logger_config.py`.
- **População de dados de treino:** `popular_banco_treinamento.py`, identificado por busca; leitura integral não confirmada no inventário.

### Inferência

Há pelo menos três famílias funcionais: ingestão de dados, normalização/classificação e análise/visualização. Essas famílias podem inspirar áreas de produto no Quantum, mas precisam ser redesenhadas como fluxos auditáveis, multiusuário e protegidos por Auth/App Check.

## 6. Fluxo atual de NFC-e/importação fiscal no Sistema Gestão de Compras

### Observado no repositório

Foram identificados três fluxos principais:

1. **PDF local**
   - Usuário seleciona um PDF local.
   - `pdfplumber` extrai texto.
   - texto bruto é enviado a um modelo Groq para estruturar JSON.
   - produtos são classificados por regras e/ou IA.
   - itens são gravados em produtos e histórico de preços.

2. **XML local**
   - `sistema_completo.py` lê arquivos XML locais.
   - remove namespaces XML.
   - extrai data de emissão, nome do emitente e itens.
   - lê campos como `cEAN`, `xProd`, `qCom`, `vUnCom`.
   - gera identificador alternativo para produtos sem GTIN.
   - enriquece produto com Gemini.
   - salva produto e histórico de preço.

3. **Importação manual**
   - usuário informa data e mercado.
   - linhas de texto são interpretadas como itens.
   - preço unitário é calculado a partir de total e quantidade.
   - produtos são classificados e salvos.

Também há fluxo em lote:

- `processar_notas.py` lê PDFs em `NOVAS_NOTAS`.
- chama importador PDF.
- move arquivos processados para `PROCESSADAS`.

### Inferência

Não foi confirmado fetch real de NFC-e, SEFAZ, scraping ou consulta por QR Code durante o inventário. O fluxo fiscal observado opera sobre arquivos locais.

### Recomendação

Para o Quantum, separar claramente:

- importação manual segura, permitida em fase inicial.
- upload fiscal local com revisão humana, somente após desenho de segurança e privacidade.
- fetch de NFC-e por URL/QR, bloqueado até threat model completo.

### Proibido agora

Não ativar fetch fiscal, não aceitar URL NFC-e, não consultar SEFAZ, não processar documentos fiscais reais no contexto deste inventário.

## 7. Modelos de domínio identificados no Sistema Gestão de Compras

### Observado no repositório

Modelos recorrentes:

- **Produto**
  - variações de campos: `ean`, `id_produto`, `nome_original`, `descricao`, `nome_limpo`, `produto_limpo`, `marca`, `categoria`, `unidade`, `tamanho_padrao`, `nome_canonico`.

- **Histórico de preço**
  - variações de campos: `id`, `ean`, `id_produto`, `data_compra`, `data_nota`, `mercado`, `preco_pago`, `preco_unitario`, `preco_total`, `quantidade`, `created_at`.

- **Mercado/loja**
  - geralmente representado como string (`mercado`, `nome_mercado`), sem entidade normalizada confirmada.

- **Item fiscal/importado**
  - dicionários transitórios com `ean`, `nome_original`, `quantidade`, `preco_unitario`.

- **Classificação IA**
  - JSON ou colunas auxiliares com categoria, unidade, marca e metadados de classificação.

### Inferência

Não foi confirmado um modelo consistente de compra/cupom como cabeçalho transacional. O SGC tende a persistir itens de compra diretamente como histórico de preços, o que limita auditoria, idempotência, rastreabilidade da fonte e revisão granular.

### Recomendação

No Quantum, separar explicitamente:

- documento de importação.
- rascunho de compra.
- item de compra.
- produto catalogado.
- loja.
- observação de preço.
- vínculo opcional com movimentação financeira.
- evento de auditoria.

## 8. Telas/UX relevantes do Sistema Gestão de Compras

### Observado no repositório

UX identificada:

- menu CLI no `main.py`.
- seleção textual de PDFs processados.
- prompts de importação manual.
- relatórios CLI de compras recentes e categorias.
- dashboard Streamlit em `dashboard_precos.py`.
- conversa Gemini em `services/gemini_insights.py`.
- consulta natural para SQL em `services/gemini_consulta_natural.py`.

### Inferência

O SGC tem UX operacional para usuário técnico ou uso pessoal, não UX de produto final. A experiência não resolve com clareza estados de loading, erro, revisão, confirmação sensível, mobile, acessibilidade ou governança.

### Recomendação

No Quantum, reaproveitar apenas fluxos mentais:

- importar ou registrar compra.
- revisar itens reconhecidos.
- confirmar preço e categoria.
- comparar histórico.
- transformar compra em aprendizado financeiro.

Não reaproveitar CLI, Streamlit ou prompts como interface final.

## 9. Serviços/parsers relevantes

### Observado no repositório

Serviços e parsers relevantes:

- `pdfplumber` para extração textual de PDF.
- `xml.etree.ElementTree` para XML local.
- Groq para estruturação/classificação.
- Gemini para enriquecimento, insights e auditoria.
- regras locais para categorias e unidades.
- `psycopg2` para Neon/PostgreSQL.
- SQLite para armazenamento local legado.
- Streamlit, pandas e plotly para dashboard.

### Inferência

O uso de IA aparece em vários pontos, com diferentes prompts e sem uma camada centralizada de governança, minimização, consentimento, retenção ou auditoria.

### Recomendação

No Quantum, qualquer parser ou classificador deve ficar atrás de contrato server-side:

- entrada validada com Zod `.strict()`.
- saída tipada.
- confidence score.
- fontes internas citáveis.
- logs sem PII.
- idempotência.
- revisão humana antes da gravação definitiva.

## 10. Testes relevantes existentes

### Observado no repositório

No SGC, não foram confirmados arquivos de teste por busca com padrão `*test*`. Há indícios de cache de pytest, mas testes versionados não foram confirmados no inventário.

No Quantum, há testes relevantes para os guardrails que o futuro módulo deve respeitar, incluindo:

- `src/lib/purchaseSimulator.test.ts`.
- `src/features/transactions/__tests__/ImportButton.test.tsx`.
- `src/shared/types/money.test.ts`.
- `src/shared/schemas/financialSchemas.test.ts`.
- `src/shared/lib/piiMasker.test.ts`.
- `functions/test/appCheckGuardrail.test.js`.
- testes relacionados a importação, reconciliação, centavos e logging identificados no inventário de UI/produto.

### Inferência

O Quantum possui base de testes mais compatível com evolução segura. O SGC não deve ser usado como referência de qualidade de testes.

### Recomendação

Antes de implementar Compras Inteligentes, definir uma matriz mínima de testes:

- money em centavos e `Decimal.js`.
- schemas Zod strict.
- idempotência de importação.
- isolamento `users/{uid}`.
- App Check nas funções.
- sanitização de logs.
- revisão humana obrigatória.
- bloqueio explícito de NFC-e real até threat model.

## 11. O que pode ser aproveitado conceitualmente no Quantum

### Observado no repositório

O SGC demonstra necessidades reais de produto:

- lembrar preços pagos por produto.
- comparar preço por mercado.
- normalizar nomes de produtos.
- agrupar itens por categoria.
- classificar itens com apoio de IA e regras.
- auditar classificações.
- analisar gasto por categoria.
- consultar histórico por linguagem natural.
- importar compra a partir de documento.

### Recomendação

Aproveitar conceitualmente:

- histórico de preço por produto/loja/data.
- preço por unidade de medida.
- catálogo pessoal de produtos.
- revisão de sugestões de IA.
- relatórios de economia potencial.
- lista planejada versus compra realizada.
- alertas de preço atípico.
- explicações do Copilot com origem interna.

## 12. O que não deve ser migrado para o Quantum

### Observado no repositório

Não devem ser migrados:

- código Python do SGC.
- conexões diretas Neon/PostgreSQL.
- persistência SQLite.
- Streamlit.
- CLI.
- scripts de reset ou população.
- schema SQL inconsistente.
- arquivos `.env`.
- arquivo com nome indicando chave de API.
- bancos locais.
- logs.
- PDFs/arquivos fiscais.
- prompts que enviam nota fiscal bruta a IA externa sem governança.
- execução direta de SQL gerado por LLM.
- uso de `float` ou `REAL` para dinheiro.
- geração de identificadores com `hash()` Python para entidades persistentes.

### Inferência

Também não deve ser migrado o modelo operacional de confiança implícita: usuário local, segredo local, banco compartilhado e scripts diretos. O Quantum exige isolamento por usuário e contratos auditáveis.

### Proibido agora

Não copiar código do SGC, nem mesmo trechos isolados de parser, prompt, SQL, schema ou dashboard.

## 13. O que precisa ser redesenhado para Firebase/Firestore

### Observado no repositório

O SGC usa SQL/SQLite e não possui Firebase Auth, Firestore sob `users/{uid}`, App Check, rules ou Cloud Functions TypeScript.

### Recomendação

Redesenhar para:

- Cloud Functions TypeScript para processamento sensível.
- Firestore sob `users/{uid}` para todos os dados do usuário.
- Storage apenas se houver upload, com paths também vinculados ao usuário e regras estritas.
- callable functions com App Check.
- schemas Zod `.strict()`.
- dinheiro em centavos inteiros.
- `Decimal.js` para cálculos.
- jobs idempotentes.
- eventos append-only.
- logs sanitizados.
- consentimento e revisão humana.

### Proibido agora

Não adaptar diretamente tabelas SQL para coleções Firestore sem revisar limites, cardinalidade, índices, privacidade, lifecycle e modelo de autorização.

## 14. Proposta de domínio nativo para Compras Inteligentes no Quantum

### Recomendação

Domínio nativo sugerido, ainda conceitual:

- **ShoppingList**
  - lista planejada de compra.
  - orçamento esperado.
  - período/objetivo associado.

- **ShoppingListItem**
  - produto desejado.
  - quantidade planejada.
  - preço esperado.
  - prioridade.

- **PurchaseDraft**
  - rascunho gerado por importação manual, upload ou entrada assistida.
  - estado de revisão.
  - origem da informação.

- **PurchaseItem**
  - item dentro de uma compra revisada.
  - produto, quantidade, preço unitário, total e categoria.

- **ProductCatalogItem**
  - catálogo pessoal do usuário.
  - nome canônico, aliases, categoria e unidade.

- **Store**
  - loja/mercado normalizado no escopo do usuário.

- **PriceObservation**
  - observação histórica de preço, derivada de compra confirmada.

- **ImportJob**
  - job idempotente de parsing/importação.

- **ReviewQueueItem**
  - item pendente de confirmação humana.

- **AISuggestion**
  - sugestão explicável de categoria, normalização, alerta ou economia.

- **AuditEvent**
  - evento append-only de revisão, aceite, rejeição ou correção.

### Inferência

Esse domínio permite integrar compras ao Quantum sem transformar o app em sistema fiscal. A compra vira uma fonte de inteligência financeira pessoal, não um módulo de automação fiscal.

## 15. Coleções Firestore sugeridas, sempre sob `users/{uid}`

### Recomendação

Coleções sugeridas, sujeitas a refinamento de arquitetura:

```text
users/{uid}/shoppingLists/{listId}
users/{uid}/shoppingLists/{listId}/items/{itemId}
users/{uid}/purchaseDrafts/{draftId}
users/{uid}/purchaseDrafts/{draftId}/items/{itemId}
users/{uid}/products/{productId}
users/{uid}/stores/{storeId}
users/{uid}/priceObservations/{observationId}
users/{uid}/purchaseImportJobs/{jobId}
users/{uid}/purchaseReviewQueue/{reviewId}
users/{uid}/aiSuggestions/{suggestionId}
users/{uid}/auditLogs/{eventId}
```

Campos monetários sugeridos:

- `unitPriceCents`.
- `totalCents`.
- `expectedTotalCents`.
- `budgetImpactCents`.
- `savingsEstimateCents`.

Campos de quantidade sugeridos:

- `quantityValue` como string decimal validada quando necessário.
- ou escala inteira explícita, como `quantityMillis`, acompanhada de `unit`.

### Inferência

Quantidade de supermercado não é sempre inteira. O domínio precisa evitar `float`, mas também precisa representar quilogramas, litros, unidades, pacotes e frações. A decisão entre string decimal validada e escala inteira deve ser tomada antes da implementação.

### Proibido agora

Não criar coleções, migrations, rules ou índices nesta fase.

## 16. Fluxo futuro de revisão humana

### Recomendação

Fluxo conceitual:

1. usuário cria rascunho manual ou inicia importação permitida.
2. sistema gera `PurchaseDraft`.
3. parser/classificador sugere itens, produtos, categorias e preços.
4. usuário revisa cada item crítico.
5. usuário corrige produto, categoria, unidade, loja e preço.
6. sistema mostra impacto financeiro antes de gravar.
7. usuário confirma.
8. sistema grava itens, observações de preço e eventos de auditoria.
9. vínculo com movimentação financeira só ocorre após confirmação explícita.

### Observado no repositório

O SGC possui classificação e auditoria, mas não foi confirmado um fluxo robusto de revisão humana antes da gravação definitiva.

### Proibido agora

IA não deve criar movimentação, alterar planejamento, aceitar item fiscal ou inferir decisão financeira sem confirmação humana.

## 17. Fluxo futuro de importação manual

### Recomendação

Primeira versão recomendada para Quantum:

- entrada manual de compra ou lista.
- cadastro/seleção de loja.
- itens com quantidade, unidade, preço unitário e categoria.
- validação local e server-side.
- prévia de impacto financeiro.
- confirmação humana.
- gravação de histórico de preço.

### Inferência

Esse fluxo entrega valor sem risco fiscal elevado. Também permite construir design system, estados vazios, revisão, histórico e integração com planejamento antes de tocar em NFC-e.

### Proibido agora

Não chamar importadores fiscais reais nesta fase.

## 18. Fluxo futuro de NFC-e, ainda bloqueado

### Observado no repositório

No SGC, o processamento fiscal confirmado é local: PDF/XML já existentes no disco. Não foi confirmado fetch remoto de NFC-e.

### Recomendação

Fluxo futuro, bloqueado até segurança:

1. usuário informa QR/URL ou upload permitido.
2. sistema valida sintaxe sem fetch.
3. função server-side aplica allowlist, DNS validation, bloqueio de IPs privados e limites.
4. conteúdo é baixado com timeout, limite de tamanho, content-type esperado e sem seguir redirecionamentos perigosos.
5. parser seguro extrai dados mínimos.
6. itens vão para revisão humana.
7. somente após confirmação, observações e vínculos são criados.

### Proibido agora

NFC-e real permanece bloqueada. Não buscar URL, não consultar SEFAZ e não processar QR Code fiscal real.

## 19. Threat model preliminar de SSRF

### Observado no repositório

O Quantum já registra a exigência de threat model de SSRF antes de liberar NFC-e real.

### Inferência

Em um fluxo de NFC-e por QR/URL, o atacante controla a URL ou parte dela. Isso pode tentar forçar Cloud Functions a acessar:

- metadata server.
- `localhost`.
- redes privadas.
- endpoints internos.
- IPs link-local.
- hosts com DNS rebinding.
- URLs com redirecionamento.
- arquivos gigantes.
- payloads XML maliciosos.

### Recomendação

Threat model mínimo deve cobrir:

- ativos: credenciais server-side, metadados de cloud, dados financeiros, logs, chaves, Firestore, Storage e privacidade fiscal.
- atores: usuário malicioso, terceiro que fornece QR adulterado, serviço fiscal comprometido, LLM induzido por prompt injection em conteúdo fiscal.
- vetores: SSRF, DNS rebinding, redirects, IP literal, host Unicode/punycode, parser XML inseguro, payload grande, decompression bomb, XXE, timeout exhaustion, log injection.
- controles: allowlist, resolução DNS controlada, rejeição de IP privado, timeouts, limite de tamanho, parser XML seguro, sanitização, idempotência, auditoria e revisão humana.

## 20. Regras mínimas antes de qualquer fetch fiscal

### Recomendação

Antes de qualquer fetch fiscal real:

- Auth obrigatório.
- App Check obrigatório.
- Cloud Function dedicada.
- nenhuma chamada fiscal direta do cliente.
- allowlist estrita de domínios oficiais.
- HTTPS obrigatório.
- rejeição de IP literal.
- rejeição de `localhost`, loopback, link-local, RFC1918 e metadata IP.
- validação de DNS antes e durante a conexão.
- redirecionamentos desabilitados ou rigidamente controlados.
- timeout curto.
- limite de tamanho de resposta.
- content-type esperado.
- parser XML sem entidades externas.
- logs sanitizados.
- idempotency key por tentativa.
- rate limiting por usuário.
- revisão humana obrigatória.
- nenhum dado fiscal bruto enviado a IA externa sem consentimento, minimização e base legal.

### Proibido agora

Sem essas regras documentadas, testadas e revisadas, NFC-e real não deve avançar.

## 21. Como integrar Compras Inteligentes com movimentações financeiras

### Observado no repositório

O Quantum já possui importação, reconciliação e transações financeiras. O SGC possui itens de compra e histórico de preço, mas não foi confirmado vínculo com uma transação financeira pessoal.

### Recomendação

Integração sugerida:

- compra confirmada pode se vincular a uma `transaction`.
- itens de compra não substituem a movimentação financeira.
- movimentação representa o lançamento financeiro agregado.
- itens explicam a composição da compra.
- divergência entre soma dos itens e transação deve gerar revisão.
- IA pode sugerir vínculo, mas usuário confirma.

### Inferência

Essa separação evita poluir o extrato com uma transação por item e preserva o motor financeiro do Quantum.

## 22. Como integrar Compras Inteligentes com Copilot IA

### Recomendação

O Copilot IA deve usar Compras Inteligentes para responder com base em fontes internas:

- "Por que meu mercado subiu este mês?"
- "Quais itens tiveram maior aumento?"
- "Onde costumo pagar menos por arroz?"
- "Minha lista cabe no orçamento da semana?"
- "Quais itens posso adiar sem afetar metas?"

Respostas devem citar origem interna:

- produto.
- loja.
- data.
- preço observado.
- categoria.
- lista ou compra vinculada.

### Proibido agora

Copilot não deve executar compra, criar transação, alterar planejamento ou aceitar importação sem confirmação humana.

## 23. Como integrar Compras Inteligentes com Timeline Financeira

### Recomendação

Eventos possíveis na Timeline:

- lista de compra planejada.
- previsão de gasto.
- compra realizada.
- revisão pendente de importação.
- variação relevante de preço.
- economia obtida frente ao preço esperado.
- compra vinculada a movimentação.

### Inferência

A Timeline deve contar a história financeira, não apenas listar itens. Compras Inteligentes deve produzir eventos úteis e auditáveis para essa narrativa.

## 24. Como integrar Compras Inteligentes com Planejamento

### Recomendação

Integrações com Planejamento:

- orçamento por categoria de compra.
- previsão de gasto da próxima ida ao mercado.
- comparação planejado versus realizado.
- alertas de estouro de orçamento.
- sugestão de troca ou adiamento com confirmação humana.
- impacto de compra grande no saldo futuro.

### Observado no repositório

O Quantum já possui simulação de compra e foco em impacto financeiro. O SGC possui histórico de preços e categorias. A combinação conceitual dos dois cria a base de planejamento de compras.

## 25. Riscos técnicos

### Observado no repositório

Riscos técnicos no SGC:

- múltiplos schemas incompatíveis.
- uso de floats/REAL para dinheiro em partes do sistema.
- persistência misturada entre SQLite e Neon.
- segredos via `.env` local.
- presença de credencial hardcoded observada em arquivo de verificação; valor não reproduzido neste documento.
- prompts de IA espalhados.
- execução de SQL gerado por IA em serviço de consulta natural.
- identificadores com `hash()` Python para entidades persistentes.
- ausência de Auth multiusuário.
- ausência de App Check.
- logs locais potencialmente sensíveis.
- ausência de testes confirmados.

### Recomendação

No Quantum, tratar esses riscos como anti-requisitos:

- nada de float para dinheiro.
- nada de SQL gerado por IA executado diretamente.
- nada de segredo client-side ou hardcoded.
- nada de schema não versionado.
- nada de parser fiscal sem isolamento.
- nada de log bruto.
- nada de identidade fora de `users/{uid}`.

## 26. Riscos de privacidade/LGPD

### Inferência

Notas fiscais e compras de supermercado podem revelar:

- hábitos alimentares.
- saúde e higiene.
- rotina familiar.
- localização aproximada.
- frequência de compra.
- poder aquisitivo.
- CPF ou identificadores fiscais, quando presentes.
- dados de estabelecimento.

### Observado no repositório

O SGC envia texto extraído de PDF fiscal para IA externa em fluxo de parsing e envia dados de compras para Gemini em fluxos de insights/auditoria. Não foi confirmada camada de consentimento, minimização, retenção, anonimização ou exclusão por usuário.

### Recomendação

Para Quantum:

- consentimento explícito antes de processar documento fiscal.
- minimização antes de IA.
- mascaramento de PII.
- retenção configurável.
- exclusão compatível com LGPD.
- logs sanitizados.
- origem e finalidade visíveis ao usuário.
- revisão humana antes de persistir dados sensíveis.

## 27. Riscos de overengineering

### Inferência

Compras Inteligentes pode crescer rápido demais se tentar resolver NFC-e, catálogo universal, scraping de preços, marketplace, recomendações automáticas e planejamento avançado no primeiro ciclo.

### Recomendação

Evitar na primeira fase:

- catálogo global de produtos.
- motor fiscal completo.
- QR Code NFC-e real.
- comparação automática entre mercados externos.
- crawling/scraping de preços.
- ontologia complexa de produtos.
- normalização universal de GTIN.
- IA autônoma.

Começar com domínio pessoal, manual, revisável e integrado ao orçamento.

## 28. Recomendação de fases futuras

### Recomendação

Fases sugeridas:

1. **Fase 2B - AppShell e navegação**
   - estabilizar arquitetura visual do Quantum 2.0.

2. **Fase 2C - Domínio conceitual de Compras Inteligentes**
   - especificar entidades, estados, permissões e eventos.

3. **Fase 2D - UX de compra manual**
   - desenhar lista, rascunho, revisão e histórico sem fiscal real.

4. **Fase 2E - Integração com Planejamento e Timeline**
   - conectar impacto, orçamento e eventos.

5. **Fase 2F - Copilot contextual**
   - respostas explicáveis usando dados internos revisados.

6. **Fase 2G - Threat model fiscal**
   - SSRF, LGPD, logs, IA, Storage, App Check, rate limit e revisão humana.

7. **Fase futura - NFC-e**
   - somente após critérios de segurança aprovados.

## 29. Critérios de aceite para avançar para design visual

### Recomendação

Antes de avançar para design visual de Compras Inteligentes:

- decisão documentada de que SGC é apenas referência conceitual.
- escopo MVP definido sem NFC-e real.
- entidades conceituais aprovadas.
- fronteiras com movimentações, timeline, planejamento e Copilot definidas.
- confirmação de Firestore sob `users/{uid}`.
- campos monetários definidos em centavos inteiros.
- estratégia para quantidade sem float definida.
- revisão humana descrita.
- estados de loading, vazio, erro, revisão e confirmação mapeados.
- riscos LGPD documentados.
- NFC-e explicitamente bloqueada.
- nenhum código do SGC copiado.
- nenhum segredo lido, copiado ou reproduzido.

### Proibido agora

Não avançar para UI de importação fiscal real enquanto SSRF e LGPD não estiverem formalmente endereçados.

## 30. Lista de arquivos mais relevantes lidos nos dois repositórios

### Quantum Finance

Arquivos relevantes lidos ou consultados:

- `docs/product/QUANTUM_FINANCE_VISAO_ESTRATEGICA_2_0.md`.
- `docs/product/INVENTARIO_UI_PRODUTO_QUANTUM_2026-06-12.md`.
- `CLAUDE.md`.
- `src/lib/purchaseSimulator.ts`.
- `src/features/simulation/PurchaseSimulator.tsx`.
- `src/features/transactions/ImportButton.tsx`.
- `src/features/transactions/import/processResolvedImportBatch.ts`.
- listagem de testes relevantes em `src/` e `functions/`.

### Sistema Gestão de Compras

Arquivos relevantes lidos ou consultados:

- `main.py`.
- `sistema_completo.py`.
- `importar_pdf.py`.
- `importar_manual.py`.
- `processar_notas.py`.
- `database.py`.
- `banco_dados.py`.
- `config.py`.
- `requirements.txt`.
- `classificador_produtos.py`.
- `classificador_regras.py`.
- `classificar_produtos_ia.py`.
- `ia_groq_utils.py`.
- `simplificador_produtos.py`.
- `dashboard_precos.py`.
- `inteligencia.py`.
- `consultas_precos.sql`.
- `core/config.py`.
- `core/database.py`.
- `core/logger.py`.
- `logger_config.py`.
- `services/gemini_insights.py`.
- `services/gemini_consulta_natural.py`.
- `services/gemini_auditor.py`.
- `ver_relatorio.py`.
- `ver_relatorio_categorias.py`.
- `ver_relatorio_nuvem.py`.
- `verificar_modelos.py`, somente para identificar risco de credencial hardcoded; valor não reproduzido.

Arquivos ou grupos observados por listagem/busca, mas não lidos por conterem ou poderem conter dados sensíveis ou binários:

- `.env`.
- arquivo com nome indicando chave de API Groq.
- `compras.db`.
- PDFs em diretórios de notas.
- logs.
- caches.

### Não confirmado no inventário

- fetch real de NFC-e/SEFAZ no SGC.
- testes versionados no SGC.
- modelo normalizado de loja no SGC.
- entidade robusta de compra/cupom como cabeçalho no SGC.
- consentimento LGPD no SGC.
- sanitização sistemática de logs no SGC.
- isolamento multiusuário no SGC.

