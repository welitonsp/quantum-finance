# Radar de Repositorios GitHub para RAG - Quantum Finance

Pesquisa e curadoria inicial de repositorios que podem alimentar ou orientar um RAG do Quantum Finance, com foco em valor para o mercado brasileiro, Open Finance, Pix, parsers financeiros, governanca de IA e demonstracao para investidores.

Data da curadoria: 2026-07-02.

## 1. Principio de Uso

Nem todo repositorio deve ser copiado ou ingerido diretamente.

Classificacao correta:

1. **Corpus RAG**: documentacao, especificacoes, OpenAPI, guias, exemplos e textos que podem ser indexados para responder perguntas com fonte.
2. **Referencia tecnica**: codigo para estudar arquitetura, adapters, mocks e validadores. Nao copiar sem verificar licenca.
3. **Benchmark/Evals**: projetos que ajudam a medir qualidade do RAG, groundedness, citacao e seguranca.
4. **Mock/Provider**: repos que ajudam a criar simuladores sem usar APIs pagas.

Regra:

> Usar repositorios como fonte de conhecimento e inspiracao arquitetural. Copiar codigo somente quando a licenca permitir e com atribuicao adequada.

## 2. Repositorios Prioritarios

### 2.1 bacen/pix-api

- URL: https://github.com/bacen/pix-api
- Categoria: Corpus RAG + especificacao oficial.
- Uso recomendado: indexar especificacoes OpenAPI, termos de dominio, fluxos e objetos da API Pix.
- Valor para o Quantum: deixar o produto "Pix-ready" sem operar Pix real.
- Observacao: nao implementar iniciacao de pagamento real sem provider regulado, seguranca, contrato e autorizacao.
- Prioridade: Alta.

### 2.2 OpenBanking-Brasil/mock-api

- URL: https://github.com/OpenBanking-Brasil/mock-api
- Categoria: Mock/Provider + corpus de schemas.
- Uso recomendado: estudar como gerar API mock a partir de Swagger/OpenAPI do Open Banking Brasil.
- Valor para o Quantum: criar `MockOpenFinanceProvider` e demo sem custo.
- Prioridade: Alta.

### 2.3 OpenBanking-Brasil/specs-seguranca

- URL: https://github.com/OpenBanking-Brasil/specs-seguranca
- Categoria: Corpus RAG de seguranca.
- Uso recomendado: indexar conceitos de seguranca, DCR, FAPI, assinatura, certificados e requisitos historicos.
- Valor para o Quantum: enriquecer o RAG de governanca e threat model.
- Cuidado: o proprio repo indica contexto draft/historico; validar contra especificacoes atuais antes de implementar.
- Prioridade: Alta para conhecimento, media para implementacao.

### 2.4 apiplaybook/open-banking-brasil

- URL: https://github.com/apiplaybook/open-banking-brasil
- Categoria: Referencia tecnica + UX/API exploration.
- Licenca: MIT na busca inicial.
- Uso recomendado: estudar chamadas a APIs abertas, matriz de comparacao e UI de exploracao.
- Valor para o Quantum: inspirar tela "Open Finance readiness" e simulador de comparacao.
- Prioridade: Media/Alta.

### 2.5 pluggyai/meu-pluggy

- URL: https://github.com/pluggyai/meu-pluggy
- Categoria: Referencia de produto/conexao de contas.
- Uso recomendado: estudar UX de conectar conta, sincronizar e mostrar dados.
- Valor para o Quantum: aprender fluxo de agregacao financeira sem contratar API agora.
- Cuidado: verificar licenca antes de reutilizar qualquer codigo.
- Prioridade: Media.

### 2.6 Paulo-Marcos-Lucio/pix-automatico-reference

- URL: https://github.com/Paulo-Marcos-Lucio/pix-automatico-reference
- Categoria: Referencia arquitetural.
- Licenca: MIT na busca inicial.
- Uso recomendado: estudar Pix Automatico, consent flow, saga, outbox, idempotencia e observabilidade.
- Valor para o Quantum: orientar o futuro de recorrencias/pagamentos governados.
- Prioridade: Alta como referencia, nao como dependencia.

### 2.7 Paulo-Marcos-Lucio/open-finance-payments-reference

- URL: https://github.com/Paulo-Marcos-Lucio/open-finance-payments-reference
- Categoria: Referencia arquitetural.
- Licenca: MIT na busca inicial.
- Uso recomendado: estudar PISP, fluxo de pagamento, DPoP, state machine e simulador.
- Valor para o Quantum: orientar arquitetura de `AI Proposal Authority` e pagamentos futuros.
- Prioridade: Alta como referencia.

### 2.8 ofb-hub/diretorio-monitor

- URL: https://github.com/ofb-hub/diretorio-monitor
- Categoria: Monitoramento Open Finance.
- Uso recomendado: estudar monitoramento do diretorio de participantes.
- Valor para o Quantum: preparar uma visao futura de "providers disponiveis".
- Cuidado: sem licenca identificada na busca inicial; usar apenas como referencia ate validar.
- Prioridade: Media.

## 3. Parsers e Utilitarios Brasileiros

### 3.1 hublawbr/ofx-parser

- URL: https://github.com/hublawbr/ofx-parser
- Categoria: Parser OFX TypeScript.
- Licenca: MIT na busca inicial.
- Uso recomendado: comparar com parser interno e testar casos brasileiros.
- Valor para o Quantum: melhorar importacao OFX sem API paga.
- Prioridade: Alta.

### 3.2 ebanx/ofx-parser

- URL: https://github.com/ebanx/ofx-parser
- Categoria: Parser OFX Java.
- Licenca: Apache-2.0 na busca inicial.
- Uso recomendado: referencia de modelagem/parsing.
- Valor para o Quantum: corpus tecnico para edge cases OFX.
- Prioridade: Media.

### 3.3 scardine/cnab

- URL: https://github.com/scardine/cnab
- Categoria: CNAB parser/generator/validator.
- Licenca: MIT conforme resultado de busca.
- Uso recomendado: estudar CNAB como dominio brasileiro e eventual importacao B2B.
- Valor para o Quantum: preparar modulo futuro para PJ/fintech/backoffice.
- Prioridade: Media.

### 3.4 zertico/cnab

- URL: https://github.com/zertico/cnab
- Categoria: Parser CNAB Ruby.
- Uso recomendado: referencia de segmentos CNAB T/U.
- Valor para o Quantum: conhecimento de formato bancario brasileiro.
- Prioridade: Media/Baixa para codigo, media para RAG.

### 3.5 fonini/go-boleto-utils

- URL: https://github.com/fonini/go-boleto-utils
- Categoria: Parser/validador de boleto.
- Uso recomendado: estudar linha digitavel, barcode, banco, valor e vencimento.
- Valor para o Quantum: futuro parser de boletos em extratos ou documentos.
- Cuidado: validar licenca antes de reutilizar codigo.
- Prioridade: Alta como dominio brasileiro.

### 3.6 fonini/go-pix

- URL: https://github.com/fonini/go-pix
- Categoria: Pix copia-e-cola/QR.
- Uso recomendado: estudar formato Pix, nao iniciar pagamentos reais.
- Valor para o Quantum: explicar Pix e preparar fixtures/validadores.
- Cuidado: validar licenca e escopo regulatorio.
- Prioridade: Media.

### 3.7 flavioheleno/bank-utils

- URL: https://github.com/flavioheleno/bank-utils
- Categoria: utilitarios de bancos brasileiros.
- Uso recomendado: banco por codigo, validacao e nomes.
- Valor para o Quantum: enriquecer transacoes importadas e boletos.
- Prioridade: Media.

### 3.8 fernandosavio/boleto-utils-js

- URL: https://github.com/fernandosavio/boleto-utils-js
- Categoria: Boleto utils em TypeScript.
- Uso recomendado: estudar parsing/validacao de linha digitavel.
- Valor para o Quantum: melhor encaixe por stack TypeScript.
- Cuidado: validar licenca antes de usar.
- Prioridade: Alta se licenca permitir.

## 4. Dados Publicos e Macroeconomia Brasil

### 4.1 wilsonfreitas/python-bcb

- URL: https://github.com/wilsonfreitas/python-bcb
- Categoria: Cliente para dados abertos do Banco Central.
- Uso recomendado: estudar acesso a SGS, moedas, juros, inflacao e series.
- Valor para o Quantum: RAG/tooling de contexto macroeconomico brasileiro.
- Prioridade: Alta para ideias; implementacao no Quantum pode ser TypeScript propria.

### 4.2 TeodoroRodrigo/bcbpy

- URL: https://github.com/TeodoroRodrigo/bcbpy
- Categoria: Cliente SGS/BCB.
- Uso recomendado: referencia simples de series e codigos curados.
- Valor para o Quantum: criar modulo "contexto macro" sem custo pago.
- Prioridade: Media.

### 4.3 SidneyBissoli/bcb-br-mcp

- URL: https://github.com/SidneyBissoli/bcb-br-mcp
- Categoria: MCP para Banco Central do Brasil.
- Uso recomendado: estudar arquitetura de ferramenta com respostas ao vivo e proveniencia.
- Valor para o Quantum: inspirar "BCB tool" para IA com fonte, sem depender de API paga.
- Prioridade: Alta para arquitetura de IA/RAG.

### 4.4 Tpessia/dados-financeiros

- URL: https://github.com/Tpessia/dados-financeiros
- Categoria: curadoria de fontes financeiras.
- Uso recomendado: usar como mapa de fontes, nao como dependencia.
- Valor para o Quantum: aumentar repertorio de dados publicos gratuitos.
- Prioridade: Media.

## 5. RAG Financeiro, Evals e Arquitetura de IA

### 5.1 cv-lee/FinanceRAG

- URL: https://github.com/cv-lee/FinanceRAG
- Categoria: RAG financeiro.
- Licenca: MIT na busca inicial.
- Uso recomendado: estudar pipeline de recuperacao financeira e benchmark.
- Valor para o Quantum: base para avaliar RAG financeiro com evidencias.
- Prioridade: Alta.

### 5.2 linq-rag/FinanceRAG

- URL: https://github.com/linq-rag/FinanceRAG
- Categoria: RAG financeiro.
- Licenca: MIT na busca inicial.
- Uso recomendado: comparar pipelines e abordagem de dataset/eval.
- Valor para o Quantum: inspirar harness de avaliacao.
- Prioridade: Media/Alta.

### 5.3 Rishabhmannu/financebench-rag-agent

- URL: https://github.com/Rishabhmannu/financebench-rag-agent
- Categoria: RAG agentico com avaliacoes.
- Licenca: MIT na busca inicial.
- Uso recomendado: estudar RBAC no vetor, HITL em respostas sensiveis e avaliacao calibrada.
- Valor para o Quantum: padrao para respostas financeiras de alto risco.
- Prioridade: Alta como referencia de governanca.

### 5.4 Treasury-Technologies-Inc/treasurybench

- URL: https://github.com/Treasury-Technologies-Inc/treasurybench
- Categoria: benchmark de assistente de financas pessoais.
- Licenca: MIT na busca inicial.
- Uso recomendado: estudar personas sinteticas e criterios de avaliacao.
- Valor para o Quantum: criar `QuantumBench` para medir qualidade da IA.
- Prioridade: Alta.

### 5.5 joaopaulotr/financebench-rag-eval

- URL: https://github.com/joaopaulotr/financebench-rag-eval
- Categoria: avaliacao RAG.
- Uso recomendado: estudar observabilidade, judge calibration e FinanceBench.
- Cuidado: licenca nao identificada na busca inicial.
- Prioridade: Media se licenca permitir.

## 6. Assistentes Financeiros e Produto

### 6.1 calderbuild/WeFinance

- URL: https://github.com/calderbuild/WeFinance
- Categoria: assistente financeiro com visao/LLM.
- Uso recomendado: estudar experiencia de recibos/imagens e insights.
- Cuidado: licenca nao identificada.
- Valor para o Quantum: inspirar modulo de documentos/recibos, nao copiar codigo.
- Prioridade: Media.

### 6.2 04112004/Finmate-Personal-Finance-Assistant

- URL: https://github.com/04112004/Finmate-Personal-Finance-Assistant
- Categoria: app de financas pessoais com IA.
- Uso recomendado: benchmarking visual/funcional.
- Cuidado: licenca nao identificada.
- Prioridade: Baixa/Media.

### 6.3 nirajdsouza/personal-finance-assistant-ai-agent

- URL: https://github.com/nirajdsouza/personal-finance-assistant-ai-agent
- Categoria: assistente financeiro IA.
- Licenca: MIT na busca inicial.
- Uso recomendado: estudar categorization, forecasting e recomendacoes.
- Prioridade: Media.

### 6.4 recepzgrmh/moneo-finance-dashboard

- URL: https://github.com/recepzgrmh/moneo-finance-dashboard
- Categoria: dashboard finance local-first/privacy-first.
- Uso recomendado: benchmarking de privacidade e posicionamento.
- Cuidado: licenca nao identificada.
- Prioridade: Media.

## 7. Como Isso Deve Virar RAG no Quantum

### 7.1 Corpora recomendados

Criar quatro corpora separados:

1. `rag-br-regulatory`
   - Pix API.
   - Open Finance specs.
   - seguranca Open Banking/Open Finance.
   - conceitos Bacen.

2. `rag-br-formats`
   - OFX.
   - CNAB.
   - boleto.
   - codigos bancarios.

3. `rag-ai-governance`
   - RAG evals.
   - AI proposal flow.
   - HITL.
   - RBAC/vector-layer.
   - guardrails.

4. `rag-product-benchmarks`
   - assistentes financeiros open source.
   - UX de conexao de contas.
   - exemplos de dashboards.
   - benchmarks de personas.

### 7.2 Formato de ingestao

Cada documento indexado deve ter metadados:

```ts
type RagSourceMetadata = {
  sourceId: string;
  repository: string;
  url: string;
  license: string | null;
  category: 'regulatory' | 'format' | 'ai-governance' | 'product' | 'parser';
  retrievedAt: string;
  trustLevel: 'official' | 'well-known-open-source' | 'community' | 'unknown';
  usage: 'corpus' | 'reference-only' | 'benchmark';
};
```

### 7.3 Regras de seguranca

- Nao ingerir secrets, exemplos com tokens ou credenciais.
- Nao copiar codigo de repo sem licenca permissiva.
- Nao misturar corpus regulatorio oficial com repos comunitarios sem `trustLevel`.
- Respostas da IA devem citar fonte e categoria.
- Para tema regulatorio, preferir fonte oficial.
- Para acao financeira, RAG informa; backend decide.

## 8. Quick Wins Sem Custo

1. Criar pasta `docs/rag-sources/` com manifest dos repos aprovados.
2. Criar `scripts/rag/ingest-github-docs.ts` para baixar apenas README/docs/OpenAPI permitidos.
3. Criar corpus inicial com:
   - `bacen/pix-api`
   - `OpenBanking-Brasil/mock-api`
   - `OpenBanking-Brasil/specs-seguranca`
   - `hublawbr/ofx-parser`
   - `fonini/go-boleto-utils`
   - `cv-lee/FinanceRAG`
   - `Treasury-Technologies-Inc/treasurybench`
4. Criar tela/admin "Knowledge Sources" mostrando fontes, licenca e data de ingestao.
5. Criar avaliacao: perguntas sobre Pix/Open Finance/OFX/boletos com resposta citada.

## 9. Ranking Inicial

| Ranking | Repositorio | Uso principal | Prioridade |
| --- | --- | --- | --- |
| 1 | `bacen/pix-api` | Pix-ready oficial | Alta |
| 2 | `OpenBanking-Brasil/mock-api` | Mock Open Finance | Alta |
| 3 | `OpenBanking-Brasil/specs-seguranca` | Seguranca/Open Finance | Alta |
| 4 | `Paulo-Marcos-Lucio/pix-automatico-reference` | arquitetura Pix Automatico | Alta |
| 5 | `Paulo-Marcos-Lucio/open-finance-payments-reference` | PISP e state machines | Alta |
| 6 | `hublawbr/ofx-parser` | OFX TypeScript | Alta |
| 7 | `fonini/go-boleto-utils` | Boleto brasileiro | Alta |
| 8 | `SidneyBissoli/bcb-br-mcp` | BCB com proveniencia | Alta |
| 9 | `cv-lee/FinanceRAG` | RAG financeiro/evals | Alta |
| 10 | `Treasury-Technologies-Inc/treasurybench` | benchmark financas pessoais | Alta |

## 10. Proximo Passo Recomendado

Criar um PR pequeno chamado:

`feat(rag): add source manifest and GitHub knowledge radar`

Conteudo:

- manifest JSON/YAML de fontes aprovadas;
- schema de metadados;
- script read-only de ingestao de README/docs;
- testes para garantir que repos sem licenca ficam `reference-only`;
- documento de governanca do RAG.

