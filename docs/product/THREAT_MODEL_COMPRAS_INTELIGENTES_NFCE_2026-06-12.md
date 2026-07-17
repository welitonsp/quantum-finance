# Threat Model e Jornada Segura - Compras Inteligentes/NFC-e

Data: 2026-06-12  
Projeto: Quantum Finance 2.0  
Fase: 2C - Threat Model, Governança e Jornada Segura

Este documento define o modelo preliminar de ameaças, governança e jornada segura para o futuro módulo **Compras Inteligentes/NFC-e** do Quantum Finance 2.0.

NFC-e real permanece bloqueada. Este documento não autoriza implementação, fetch fiscal, consulta à SEFAZ, scraping, automação fiscal ou gravação financeira sem confirmação humana.

Referências consultadas:

- `docs/product/QUANTUM_FINANCE_VISAO_ESTRATEGICA_2_0.md`
- `docs/product/INVENTARIO_UI_PRODUTO_QUANTUM_2026-06-12.md`
- `docs/product/INVENTARIO_COMPARATIVO_QUANTUM_SGC_2026-06-12.md`
- `CLAUDE.md`

## 1. Sumário executivo

### Risco

O futuro módulo Compras Inteligentes pode introduzir uma nova superfície de ataque ao aceitar dados externos de compras, documentos fiscais, QR Codes, URLs, XML, HTML, nomes de produtos e conteúdo potencialmente malicioso. O maior risco técnico é SSRF em qualquer tentativa de buscar NFC-e a partir de input do usuário. Os maiores riscos de produto e privacidade são vazamento de dados fiscais, envio excessivo de dados para IA e gravação financeira sem confirmação humana.

### Impacto

Uma implementação insegura poderia expor credenciais de cloud, metadados internos, dados financeiros, CPF/CNPJ, chave de acesso fiscal, endereço, hábitos de consumo, histórico de preços e movimentações do usuário. Também poderia contaminar a Timeline, o histórico de preços e as movimentações financeiras com dados incorretos ou maliciosos.

### Defesa

Compras Inteligentes deve nascer como módulo nativo do Quantum, sempre sob `users/{uid}`, com Cloud Functions TypeScript, App Check, Zod `.strict()`, dinheiro em centavos inteiros, `Decimal.js`, idempotência, logs sanitizados, history append-only, revisão humana obrigatória e IA explicável sem autonomia.

NFC-e real continua bloqueada. Qualquer URL fiscal futura deve ser reconstruída de forma canônica a partir de dados validados; o backend nunca deve fazer fetch da URL bruta enviada pelo usuário.

### Critério de aceite

Este threat model é aceito quando deixa explícito:

- NFC-e real segue bloqueada.
- SGC é apenas referência conceitual.
- nenhuma URL arbitrária deve ser buscada.
- IA não decide nem executa sozinha.
- dados fiscais sensíveis não vão para logs.
- qualquer gravação exige confirmação humana.
- futuras implementações dependem de fase técnica específica.

## 2. Decisão de segurança

### Risco

Tratar Compras Inteligentes como simples adaptação do Sistema Gestão de Compras criaria risco de herdar fluxos sem Auth multiusuário, sem App Check, sem isolamento por usuário, com IA recebendo dados fiscais brutos e com parsing fiscal fora dos padrões do Quantum.

### Impacto

Isso poderia quebrar princípios inegociáveis do Quantum Finance 2.0 e criar uma exceção perigosa dentro de um produto financeiro que exige rastreabilidade, privacidade e controle humano.

### Defesa

Decisão de segurança:

- SGC não será migrado como produto.
- SGC não terá código copiado.
- SGC será usado apenas como referência conceitual de domínio.
- Compras Inteligentes deve ser redesenhado como módulo nativo do Quantum.
- NFC-e real permanece bloqueada até aprovação formal de threat model, arquitetura, testes e revisão humana.

### Critério de aceite

Qualquer fase futura deve declarar explicitamente que não copia código do SGC, não executa fluxo fiscal real e não altera o motor financeiro, rules, functions críticas, schemas críticos ou package-lock sem aprovação própria.

## 3. Escopo do threat model

### Risco

O módulo envolve múltiplos tipos de entrada: dados manuais, nomes de produtos, preços, quantidades, documentos fiscais, QR Codes, chaves de acesso, URLs, XML/HTML/texto e sugestões de IA. O escopo precisa ser limitado para evitar que um documento de threat model seja interpretado como autorização de implementação.

### Impacto

Escopo ambíguo pode levar à implementação prematura de NFC-e, fetch fiscal, scraping, parsing inseguro ou envio de dados sensíveis para IA.

### Defesa

Este threat model cobre:

- intenção de compra.
- importação manual.
- futura revisão humana.
- riscos de NFC-e.
- SSRF.
- validação de host/domínio.
- bloqueio de IPs privados e metadados cloud.
- redirects.
- sanitização fiscal.
- LGPD.
- logs.
- IA.
- idempotência.
- App Check.
- Firestore sob `users/{uid}`.
- integrações conceituais com movimentações, histórico de preços, Copilot e Timeline.

Fora de escopo:

- implementação de NFC-e.
- fetch fiscal.
- SEFAZ.
- scraping.
- alteração de código.
- criação de coleções, rules ou functions.
- migração de dados do SGC.
- leitura de `.env`, secrets, tokens ou credenciais.

### Critério de aceite

Tudo que depender de código, validação real de domínio fiscal ou integração com SEFAZ deve ficar marcado como **pendente de fase técnica**.

## 4. Ativos protegidos

### Risco

Compras Inteligentes amplia os ativos protegidos além de transações financeiras tradicionais. Dados de compra podem revelar comportamento íntimo do usuário.

### Impacto

Comprometimento desses ativos pode causar vazamento financeiro, fiscal, comportamental e de privacidade, além de violar LGPD.

### Defesa

Ativos protegidos:

- identidade Firebase Auth.
- `uid`.
- dados sob `users/{uid}`.
- movimentações financeiras.
- histórico append-only.
- histórico de preços.
- listas de compra.
- rascunhos de compra.
- documentos fiscais e derivados.
- CPF/CNPJ quando presentes.
- chave de acesso NFC-e.
- endereço ou dados de estabelecimento.
- padrões de consumo.
- consentimentos LGPD.
- logs.
- prompts/respostas de IA.
- chaves e credenciais server-side.
- metadados de cloud.

### Critério de aceite

Nenhum ativo acima pode aparecer em log bruto, erro de cliente, prompt sem minimização ou caminho fora de `users/{uid}`.

## 5. Dados sensíveis envolvidos

### Risco

Documentos fiscais e compras de supermercado podem conter dados pessoais e inferências sensíveis, mesmo quando o usuário não percebe.

### Impacto

Dados como CPF, CNPJ, chave de acesso, endereço, loja, horário, produtos e valores podem revelar hábitos de consumo, condição familiar, localização, rotina e preferências.

### Defesa

Classificação mínima:

- **Dados financeiros:** totais, preços, orçamento, impacto em saldo, vínculo com transações.
- **Dados fiscais:** chave de acesso, QR Code, número de nota, série, data/hora, emitente.
- **Dados pessoais:** CPF, nome, endereço quando presentes.
- **Dados comportamentais:** itens comprados, frequência, loja, categorias.
- **Dados técnicos sensíveis:** URLs, host, IP resolvido, respostas fiscais brutas.

### Critério de aceite

Fluxos futuros devem declarar quais dados são coletados, por que são necessários, onde são armazenados, por quanto tempo ficam retidos e quais dados são excluídos ou minimizados antes de IA. Pendente de fase técnica.

## 6. Atores e superfícies de ataque

### Risco

O módulo receberá conteúdo parcialmente controlado pelo usuário e por terceiros. QR Codes, URLs, XML e nomes de produtos podem ser maliciosos.

### Impacto

Um atacante pode tentar SSRF, XSS, injeção em logs, prompt injection, replay de importação, poluição de catálogo, manipulação de preços, exploração de parser e criação de dados financeiros incorretos.

### Defesa

Atores:

- usuário legítimo.
- usuário malicioso autenticado.
- terceiro que fornece QR Code adulterado.
- documento fiscal malformado.
- serviço fiscal comprometido ou indisponível.
- modelo de IA suscetível a prompt injection.
- atacante tentando replay/idempotency bypass.

Superfícies:

- campos manuais de produto.
- preço e quantidade.
- QR Code.
- chave de acesso.
- URL fiscal.
- XML/HTML/texto fiscal.
- upload futuro.
- parsing server-side.
- logs.
- prompts de IA.
- Firestore writes.
- integração com movimentações.
- Copilot IA.

### Critério de aceite

Toda superfície deve ter validação, sanitização, limite de tamanho, tratamento de erro sanitizado, idempotência e revisão humana antes de persistência definitiva.

## 7. Jornada segura do usuário

### Risco

Uma jornada orientada apenas à conveniência pode esconder risco fiscal e financeiro, levando o usuário a aceitar dados sugeridos pela IA sem entender origem, confiança ou impacto.

### Impacto

O usuário pode registrar compras incorretas, criar histórico de preços contaminado, vincular movimentações erradas ou tomar decisões financeiras baseadas em dados não revisados.

### Defesa

Jornada segura:

1. usuário expressa intenção de compra ou cria lista.
2. sistema mostra impacto financeiro estimado.
3. usuário informa itens manualmente ou usa fluxo permitido.
4. sistema valida formato e limites.
5. IA pode sugerir categorias, nomes canônicos e alertas, usando dados mínimos.
6. usuário revisa item por item.
7. usuário confirma gravação.
8. sistema grava histórico sob `users/{uid}`.
9. eventos de auditoria são append-only.
10. Copilot e Timeline passam a usar apenas dados revisados.

### Critério de aceite

Nenhum dado importado ou inferido deve virar movimentação, observação de preço ou decisão de planejamento sem etapa explícita de revisão humana.

## 8. Fluxo futuro de intenção de compra

### Risco

Simulação pode ser confundida com execução financeira. Uma sugestão da IA pode ser interpretada como autorização para comprar, registrar ou alterar orçamento.

### Impacto

Pode haver criação indevida de transações, pressão decisória incorreta, cálculo monetário impreciso ou alteração de orçamento sem consentimento.

### Defesa

Fluxo seguro:

- usuário informa intenção de compra.
- sistema calcula impacto usando centavos inteiros e `Decimal.js`.
- IA pode explicar cenário com fontes internas.
- UI separa claramente simulação, recomendação e ação.
- qualquer registro financeiro exige confirmação humana.

### Critério de aceite

Botões, textos e estados devem deixar claro quando algo é apenas simulação. Ação real deve ter confirmação, resumo de impacto e trilha de auditoria.

## 9. Fluxo futuro de importação manual

### Risco

Mesmo sem NFC-e, entrada manual pode conter valores inválidos, nomes maliciosos, tentativa de XSS, duplicidade, replay ou erro de categoria.

### Impacto

Pode contaminar histórico de preços, planejamento, Timeline e Copilot com dados errados ou conteúdo inseguro.

### Defesa

Fluxo recomendado:

- usuário cria rascunho de compra.
- campos passam por Zod `.strict()`.
- dinheiro é convertido para centavos inteiros.
- cálculo usa `Decimal.js`.
- nomes são sanitizados para exibição.
- registros ficam em estado de rascunho até confirmação.
- idempotency key evita duplicidade.
- gravação definitiva ocorre só após revisão humana.

### Critério de aceite

Importação manual só avança quando houver validação de payload, sanitização de texto, confirmação humana, audit trail e isolamento em `users/{uid}`. Pendente de fase técnica.

## 10. Fluxo futuro de NFC-e, ainda bloqueado

### Risco

NFC-e via URL/QR Code é a superfície mais perigosa. A URL pode apontar para host arbitrário, rede interna, metadata server, payload gigante, XML malicioso ou redirecionamento.

### Impacto

Pode causar SSRF, vazamento de credenciais cloud, indisponibilidade, exposição de dados fiscais, execução de parser inseguro e gravação de conteúdo malicioso.

### Defesa

Estado atual:

- NFC-e real bloqueada.
- nenhuma URL fiscal deve ser buscada agora.
- nenhuma chamada à SEFAZ deve ser feita agora.
- nenhum scraping deve ser feito agora.

Fluxo futuro permitido apenas após fase técnica:

- usuário informa dados de NFC-e.
- sistema extrai apenas campos validados.
- backend reconstrói URL canônica a partir desses campos.
- backend nunca usa URL bruta do usuário.
- host/domínio é validado por allowlist.
- IPs privados, localhost e metadados cloud são bloqueados.
- redirects inseguros são bloqueados.
- resposta é limitada, sanitizada e revisada.
- dados só são gravados após confirmação humana.

### Critério de aceite

Não há critério de aceite para implementação nesta fase. A liberação depende de fase técnica dedicada com testes de SSRF, validação de domínio, App Check, logs sanitizados, idempotência e revisão humana.

## 11. Modelo de revisão humana

### Risco

IA e parsers podem errar produtos, preços, quantidades, lojas, datas, categorias e vínculo com movimentações.

### Impacto

Erros podem afetar orçamento, histórico de preços, Timeline, Copilot e decisões de compra.

### Defesa

Modelo mínimo:

- todo item importado nasce como sugestão.
- cada sugestão exibe origem, confiança e campos extraídos.
- usuário pode aceitar, editar, ignorar ou marcar como incorreto.
- campos críticos exigem destaque: total, preço unitário, quantidade, data, loja e vínculo financeiro.
- gravação definitiva cria evento append-only.
- rejeições também podem virar aprendizado, sem treinar IA externa automaticamente.

### Critério de aceite

Nenhum item fiscal, preço histórico, vínculo com transação ou ajuste de planejamento deve ser salvo como definitivo sem confirmação humana explícita.

## 12. Riscos SSRF

### Risco

SSRF ocorre quando o backend é induzido a buscar recurso controlado pelo atacante. Em NFC-e, esse risco aparece se o servidor aceitar URL ou QR Code bruto.

### Impacto

Possíveis impactos:

- acesso a metadata server.
- exposição de credenciais temporárias.
- enumeração de rede interna.
- chamada a serviços internos.
- DoS por timeout ou resposta grande.
- vazamento de conteúdo em logs.
- bypass de controles de rede.

### Defesa

Defesas obrigatórias antes de qualquer fetch fiscal:

- não buscar URL bruta enviada pelo usuário.
- reconstruir URL canônica a partir de campos validados.
- allowlist estrita de domínios.
- HTTPS obrigatório.
- rejeição de IP literal.
- bloqueio de redes privadas, loopback, link-local e metadata.
- validação DNS antes da conexão.
- revalidação contra DNS rebinding.
- política segura de redirects.
- timeouts e limite de resposta.

### Critério de aceite

Testes futuros devem demonstrar bloqueio para `localhost`, `127.0.0.1`, `::1`, RFC1918, link-local, metadata IP, IP literal público não permitido, domínio não permitido, redirect para host proibido e DNS rebinding. Pendente de fase técnica.

## 13. Defesa contra URL arbitrária

### Risco

Se o backend aceitar uma URL pronta, o atacante controla esquema, host, porta, path, query, userinfo, fragmento, encoding, Unicode/punycode e redirects.

### Impacto

Pode haver SSRF, bypass de allowlist, phishing interno, log injection e download de payload não fiscal.

### Defesa

Regra central:

> O backend nunca deve fazer fetch da URL bruta enviada pelo usuário.

Abordagem segura futura:

- cliente envia apenas campos estruturados validados.
- backend valida campos permitidos.
- backend reconstrói URL canônica.
- URL reconstruída não aceita host, protocolo ou porta arbitrária.
- query string é montada por allowlist de parâmetros.
- qualquer campo desconhecido é rejeitado por Zod `.strict()`.

### Critério de aceite

Implementação futura deve ter testes que provem que URL completa enviada pelo usuário é rejeitada ou ignorada como fonte de fetch. Pendente de fase técnica.

## 14. Validação de host/domínio

### Risco

Allowlist fraca pode ser burlada por subdomínios falsos, sufixos parecidos, Unicode, punycode, userinfo, path enganoso ou domínio controlado pelo atacante.

### Impacto

Pode permitir fetch externo indevido, SSRF e coleta de conteúdo malicioso.

### Defesa

Política recomendada:

- allowlist explícita por domínio oficial.
- normalização de hostname.
- conversão e validação punycode.
- comparação por hostname real, não substring.
- rejeição de userinfo em URL.
- rejeição de portas não esperadas.
- rejeição de protocolo diferente de HTTPS.
- validação de path e parâmetros esperados.

### Critério de aceite

Testes futuros devem bloquear domínios parecidos, como `dominio-oficial.exemplo.attacker.com`, `attacker.com/dominio-oficial`, userinfo enganoso e host Unicode não autorizado. Pendente de fase técnica.

## 15. Bloqueio de IP privado, localhost e metadados cloud

### Risco

Mesmo domínio permitido pode resolver para IP proibido por DNS rebinding, configuração incorreta ou ataque de resolução.

### Impacto

Pode permitir acesso a redes internas, metadata server, serviços locais e infraestrutura cloud.

### Defesa

Bloquear:

- `localhost`.
- `127.0.0.0/8`.
- `::1`.
- RFC1918.
- link-local.
- multicast.
- IPv6 unique local.
- metadata cloud.
- IP literal em URL.
- hostname que resolve para faixa proibida.

Revalidar resolução no momento da conexão e recusar mudanças suspeitas. Detalhes técnicos ficam pendentes de fase técnica.

### Critério de aceite

Testes futuros devem cobrir IPv4, IPv6, hostname com múltiplos A/AAAA records e tentativa de DNS rebinding. Pendente de fase técnica.

## 16. Política de redirects

### Risco

Um host inicialmente permitido pode redirecionar para host proibido, IP privado, metadata server, payload malicioso ou URL com protocolo inseguro.

### Impacto

Redirects podem contornar validação inicial de host e causar SSRF.

### Defesa

Política recomendada:

- redirects desabilitados por padrão.
- se houver necessidade futura, cada redirect deve passar pela mesma validação completa de URL canônica, host, domínio, IP, protocolo, porta, tamanho e timeout.
- limitar número de redirects a zero ou valor mínimo justificado.
- nunca seguir redirect para HTTP, IP literal, domínio não permitido ou rede privada.

### Critério de aceite

Fase técnica deve provar que redirects para host não permitido são bloqueados e não aparecem em logs com dados sensíveis.

## 17. Timeouts, tamanho máximo e rate limit

### Risco

Fetch fiscal, parsing XML/HTML e upload futuro podem ser usados para DoS por resposta grande, conexão lenta, múltiplas tentativas ou payload complexo.

### Impacto

Pode gerar custo excessivo, indisponibilidade de functions, lentidão, estouro de memória e degradação para outros usuários.

### Defesa

Controles mínimos futuros:

- timeout curto de conexão.
- timeout curto de leitura.
- limite máximo de bytes.
- limite de itens fiscais por documento.
- limite de profundidade/tamanho de XML.
- rate limit por `uid`.
- idempotency key por tentativa.
- backoff controlado.
- rejeição de conteúdo comprimido perigoso ou não esperado.

### Critério de aceite

Testes futuros devem cobrir payload grande, resposta lenta, muitas tentativas, documento com itens excessivos e replay com mesma chave de idempotência. Pendente de fase técnica.

## 18. Sanitização de HTML/XML/texto fiscal

### Risco

Conteúdo fiscal pode conter XML malformado, entidades externas, HTML, scripts, tags, caracteres de controle, strings gigantes, encodings incomuns e texto desenhado para quebrar logs ou UI.

### Impacto

Pode causar XSS, XXE, DoS de parser, log injection, prompt injection e corrupção de dados.

### Defesa

Política:

- parser XML seguro, sem entidades externas.
- rejeição de DTD quando aplicável.
- normalização de encoding.
- limite de tamanho por campo.
- remoção ou escape de HTML.
- escape de texto na UI.
- rejeição de caracteres de controle perigosos.
- sanitização antes de logs.
- dados brutos não devem ser exibidos sem escape.

### Critério de aceite

Testes futuros devem incluir XML com DTD/XXE, HTML/script em nome de produto, caracteres de controle, strings longas e encoding inesperado. Pendente de fase técnica.

## 19. Riscos XSS por nomes de produtos

### Risco

Nomes de produtos vêm de documentos fiscais, OCR, PDF, XML, usuário ou IA. Um nome pode conter HTML, script, atributos, entidades e payloads de XSS.

### Impacto

Pode comprometer sessão, UI, dados exibidos, Copilot, Timeline ou exportações se renderizado sem escape.

### Defesa

Defesas:

- tratar nomes de produtos como texto não confiável.
- escapar na renderização.
- não usar `dangerouslySetInnerHTML` para conteúdo fiscal.
- aplicar limite de tamanho.
- normalizar whitespace.
- sanitizar antes de usar em logs, prompts e exportações.
- manter valor original bruto fora da UI principal quando não necessário.

### Critério de aceite

Fase técnica deve incluir testes de renderização segura para produto com `<script>`, atributos HTML, entidades e texto longo.

## 20. Riscos LGPD: CPF, CNPJ, chave de acesso, endereço, dados fiscais

### Risco

Dados fiscais podem conter identificadores pessoais e dados que permitem inferências sensíveis. Mesmo CNPJ e dados de loja, quando combinados com data/hora e itens, expõem rotina do usuário.

### Impacto

Pode haver violação de LGPD, perda de confiança e exposição de hábitos privados.

### Defesa

Política LGPD:

- consentimento explícito antes de processar documento fiscal.
- finalidade clara.
- minimização de dados.
- retenção definida.
- direito de exclusão.
- exportação transparente.
- mascaramento de CPF/chave quando exibidos.
- não registrar dados fiscais sensíveis em logs.
- evitar enviar dados brutos para IA.

### Critério de aceite

Antes de implementação, a fase técnica deve definir política de retenção, exclusão, exportação, consentimento e minimização para cada tipo de dado fiscal.

## 21. Política de logs sanitizados

### Risco

Logs podem capturar payloads fiscais, URLs, CPF, CNPJ, chave de acesso, descrição de itens, valores, prompts de IA, respostas de IA, paths `users/{uid}` e erros crus.

### Impacto

Logs viram um banco paralelo de dados sensíveis, mais difícil de auditar, excluir e proteger.

### Defesa

Nunca logar:

- documento fiscal bruto.
- URL fiscal bruta.
- CPF.
- chave de acesso completa.
- descrição completa de item.
- valores financeiros detalhados.
- paths `users/{uid}`.
- prompts/respostas de IA.
- tokens, secrets ou credenciais.
- stack trace com payload.
- objeto bruto de erro.

Permitido logar apenas metadados sanitizados:

- tipo de operação.
- status genérico.
- código de erro interno.
- hash não reversível de idempotency key quando necessário.
- contadores agregados.
- latência.
- resultado de validação sem PII.

### Critério de aceite

Testes futuros devem falhar se logs contiverem CPF, chave de acesso completa, URL fiscal, payload fiscal, descrição de item ou path `users/{uid}`. Pendente de fase técnica.

## 22. Política de IA no fluxo de compras

### Risco

IA pode alucinar, classificar errado, receber dados demais, vazar contexto, sofrer prompt injection por conteúdo fiscal ou ser percebida como autoridade decisória.

### Impacto

Pode induzir decisões financeiras erradas, contaminar histórico, vazar dados fiscais e reduzir a confiança do usuário.

### Defesa

Política:

- IA sugere, explica, categoriza e resume.
- usuário decide e confirma.
- IA deve receber o mínimo necessário.
- IA deve usar fontes internas revisadas sempre que possível.
- respostas devem indicar limitações.
- ações sensíveis exigem confirmação humana.
- prompts e respostas não devem ser logados com dados sensíveis.
- documentos fiscais brutos não devem ser enviados à IA sem minimização, consentimento e fase técnica aprovada.

### Critério de aceite

Toda interação de IA em compras deve ter origem/fonte, escopo, confiança ou limitação, e não pode executar gravação financeira sozinha.

## 23. O que a IA pode analisar

### Risco

Permitir IA ampla demais aumenta exposição de dados. Restringir demais pode reduzir utilidade. A fronteira precisa ser explícita.

### Impacto

Sem fronteira, dados fiscais brutos podem ser enviados indevidamente. Com fronteira clara, o Copilot ajuda sem assumir controle.

### Defesa

IA pode analisar, após minimização e conforme consentimento:

- itens já revisados pelo usuário.
- histórico de preços confirmado.
- categorias confirmadas.
- orçamento e planejamento agregados.
- variação de preço.
- impacto estimado em saldo.
- lista planejada.
- divergência planejado versus realizado.
- sugestões de categoria com confiança.
- padrões internos sem expor identificadores fiscais desnecessários.

### Critério de aceite

Entradas de IA devem ser derivadas de dados internos revisados ou minimizados. Qualquer uso de documento fiscal bruto fica pendente de fase técnica e consentimento explícito.

## 24. O que a IA não pode receber

### Risco

IA externa ou mesmo camada interna mal governada pode receber conteúdo fiscal e pessoal acima do necessário.

### Impacto

Risco de LGPD, vazamento, retenção indevida, perda de controle e exposição de consumo pessoal.

### Defesa

IA não deve receber, salvo fase técnica aprovada com minimização e base legal:

- documento fiscal bruto.
- XML bruto.
- HTML bruto.
- PDF bruto.
- QR Code bruto.
- URL fiscal bruta.
- CPF completo.
- chave de acesso completa.
- endereço completo.
- tokens ou credenciais.
- paths `users/{uid}`.
- logs.
- payload financeiro completo sem necessidade.
- dados de outro usuário.

### Critério de aceite

Testes futuros devem verificar minimização de payload para IA e bloquear envio de campos proibidos. Pendente de fase técnica.

## 25. Idempotência e replay protection

### Risco

Usuário pode reenviar a mesma compra, repetir fetch, duplicar histórico de preços, duplicar transações ou reprocessar uma NFC-e.

### Impacto

Duplicidade afeta orçamento, Timeline, Copilot, histórico de preço e reconciliação financeira.

### Defesa

Política futura:

- toda operação sensível exige idempotency key.
- chave associada a `uid`, operação e período de validade.
- resultado de operação repetida deve ser estável.
- replay fora da janela deve ser rejeitado ou exigir nova confirmação.
- gravações devem ser atômicas.
- histórico deve ser append-only para eventos, mas entidades finais não devem duplicar por replay.

### Critério de aceite

Testes futuros devem cobrir reenvio simultâneo, retry após erro, mesma NFC-e, mesmo rascunho manual e tentativa de alterar payload com mesma idempotency key. Pendente de fase técnica.

## 26. Integração com App Check

### Risco

Sem App Check, endpoints de parsing/importação podem ser chamados por clientes não autorizados, scripts, bots ou abuso automatizado.

### Impacto

Pode gerar custo, scraping indireto, DoS, enumeração e bypass de UX de revisão.

### Defesa

Política:

- toda Cloud Function de Compras Inteligentes deve exigir Auth e App Check.
- falha de App Check deve retornar erro genérico e seguro.
- nenhuma função fiscal deve aceitar chamada anônima.
- rate limit deve considerar `uid`, App Check e operação.

### Critério de aceite

Testes futuros devem cobrir chamada sem App Check, sem Auth, com App Check inválido e com excesso de tentativas. Pendente de fase técnica.

## 27. Integração com Firestore em `users/{uid}`

### Risco

Dados de compras fora de `users/{uid}` quebram isolamento, rules e expectativa de privacidade.

### Impacto

Pode haver vazamento cross-user, dificuldade de exclusão LGPD e inconsistência com arquitetura do Quantum.

### Defesa

Política:

- todos os dados pessoais de compras ficam sob `users/{uid}`.
- catálogos globais não são aceitos na primeira fase.
- qualquer índice ou coleção auxiliar deve preservar isolamento.
- paths não devem ser logados.
- exclusão LGPD deve contemplar compras, histórico de preços e sugestões.

### Critério de aceite

Antes de implementação, a modelagem deve provar que todo dado do usuário fica sob `users/{uid}` e que a exclusão de conta remove dados relacionados. Pendente de fase técnica.

## 28. Integração com movimentações financeiras

### Risco

Compra detalhada pode ser confundida com movimentação financeira. IA ou parser pode criar transação errada ou duplicada.

### Impacto

Afeta saldo, relatórios, planejamento, auditoria e confiança no ledger.

### Defesa

Política:

- compra detalhada não substitui transação financeira.
- movimentação representa lançamento financeiro agregado.
- itens explicam composição da compra.
- vínculo com transação é opcional e confirmado.
- divergência entre total de itens e valor da movimentação gera revisão.
- IA pode sugerir vínculo, mas não confirmar.

### Critério de aceite

Nenhuma transação financeira deve ser criada ou alterada por Compras Inteligentes sem tela de confirmação, resumo do impacto e evento append-only.

## 29. Integração com histórico de preços

### Risco

Histórico de preços pode ser contaminado por item errado, unidade errada, quantidade mal parseada, preço total confundido com unitário ou loja incorreta.

### Impacto

Comparações futuras, alertas e Copilot passam a recomendar com base em dados falsos.

### Defesa

Política:

- observação de preço nasce de item confirmado.
- armazenar origem e data.
- distinguir preço unitário, total, quantidade e unidade.
- dinheiro em centavos inteiros.
- cálculos com `Decimal.js`.
- quantidade sem `float`; usar representação decimal validada ou escala inteira definida.
- correções geram histórico append-only.

### Critério de aceite

Histórico de preços só aceita dados revisados e deve preservar rastreabilidade da origem. Estratégia de quantidade fica pendente de fase técnica.

## 30. Integração com Copilot IA

### Risco

Copilot pode responder com confiança excessiva, usar dados não revisados, expor dados fiscais ou sugerir ações sem confirmação.

### Impacto

Pode induzir decisões ruins, vazar privacidade e gerar automação indevida.

### Defesa

Política:

- Copilot usa apenas dados revisados ou explicitamente marcados como rascunho.
- respostas citam fonte interna quando possível.
- recomendações são separadas de ações.
- ações sensíveis exigem confirmação humana.
- dados fiscais brutos não entram no contexto do Copilot.
- Copilot não recebe URL fiscal bruta.

### Critério de aceite

Toda resposta sobre compras deve indicar base de dados ou limitação. Nenhuma resposta deve executar gravação, compra, importação ou vínculo financeiro sozinha.

## 31. Integração com Timeline Financeira

### Risco

Eventos de compra não revisados podem poluir a Timeline e confundir passado registrado com futuro projetado.

### Impacto

Usuário perde clareza sobre saldo, previsão e decisões pendentes.

### Defesa

Política:

- Timeline deve diferenciar rascunho, pendente, confirmado e rejeitado.
- intenção de compra é projeção.
- compra confirmada é evento histórico.
- vínculo com movimentação deve ser explícito.
- revisões e correções devem gerar eventos auditáveis.

### Critério de aceite

Timeline não deve apresentar item fiscal pendente como fato financeiro confirmado.

## 32. Critérios de aceite antes de implementação

### Risco

Começar implementação sem critérios objetivos pode abrir brecha para atalhos de segurança.

### Impacto

Pode resultar em dívida de segurança em área de alto risco.

### Defesa

Critérios mínimos antes de qualquer implementação:

- documento de threat model aceito.
- NFC-e real explicitamente fora do MVP inicial.
- domínio conceitual aprovado.
- dados sob `users/{uid}`.
- Cloud Functions TypeScript como backend.
- App Check obrigatório.
- Zod `.strict()` definido.
- dinheiro em centavos inteiros.
- `Decimal.js` obrigatório.
- política de quantidade sem `float`.
- política de logs sanitizados.
- política de IA e minimização.
- modelo de revisão humana.
- idempotência definida.
- testes obrigatórios planejados.
- zonas proibidas documentadas.

### Critério de aceite

Qualquer PR futuro de Compras Inteligentes deve referenciar estes critérios e declarar quais continuam pendentes de fase técnica.

## 33. Testes obrigatórios futuros

### Risco

Sem testes de segurança, regressões podem reabrir SSRF, XSS, logs sensíveis, duplicidade e ações sem confirmação.

### Impacto

Uma mudança visual ou de produto pode acidentalmente quebrar guardrails críticos.

### Defesa

Testes futuros obrigatórios:

- Zod `.strict()` rejeita campos excedentes.
- dinheiro persiste em centavos inteiros.
- cálculos monetários usam `Decimal.js`.
- payload com `float` indevido é rejeitado.
- importação manual exige confirmação.
- NFC-e real permanece bloqueada enquanto não liberada.
- URL bruta não é usada para fetch.
- host não permitido é bloqueado.
- IP privado, localhost e metadata são bloqueados.
- redirect inseguro é bloqueado.
- payload fiscal grande é bloqueado.
- XML com XXE/DTD é bloqueado.
- nome de produto com HTML/script é renderizado com escape.
- logs não contêm CPF, chave, URL, payload fiscal, descrição bruta ou `uid`.
- IA não recebe campos proibidos.
- replay/idempotência não duplica dados.
- App Check/Auth são obrigatórios.
- Firestore writes ficam sob `users/{uid}`.
- transação financeira exige confirmação humana.

### Critério de aceite

Nenhuma implementação de fluxo fiscal deve avançar sem cobertura automatizada dos testes acima. Pendente de fase técnica.

## 34. Zonas proibidas

### Risco

Zonas proibidas existem para impedir que redesign, produto ou IA atravessem limites do motor financeiro e da segurança.

### Impacto

Violar essas zonas pode comprometer o ledger, rules, LGPD e confiança do produto.

### Defesa

Zonas proibidas nesta fase:

- alterar código.
- alterar `src/`.
- alterar `functions/`.
- alterar `firestore.rules`.
- alterar `package.json`.
- alterar `package-lock.json`.
- alterar testes.
- recuperar stash.
- implementar NFC-e.
- executar fetch fiscal.
- chamar SEFAZ.
- rodar scraping.
- ler `.env`, secrets, tokens ou credenciais.
- copiar código do SGC.
- usar URL arbitrária enviada pelo usuário.
- gravar dados financeiros sem confirmação humana.
- enviar dados fiscais brutos desnecessários para IA.
- logar dados fiscais sensíveis.
- fazer commit.
- fazer push.

### Critério de aceite

Esta fase só é válida se gerar exclusivamente este documento e nenhuma alteração de código.

## 35. Fases futuras recomendadas

### Risco

Avançar diretamente para NFC-e real antes de maturar domínio manual, revisão humana e governança aumenta risco técnico e regulatório.

### Impacto

O produto pode ficar complexo cedo demais e carregar risco fiscal antes de entregar valor seguro.

### Defesa

Fases recomendadas:

1. **Fase 2D - Domínio e contratos de Compras Inteligentes**
   - definir entidades, estados, permissões, quantidade, dinheiro e auditoria.
   - NFC-e continua bloqueada.

2. **Fase 2E - Jornada manual e UX de revisão**
   - desenhar rascunho, itens, revisão, confirmação e histórico.
   - sem documento fiscal real.

3. **Fase 2F - Integração com Planejamento, Timeline e Movimentações**
   - integrar intenção, compra confirmada, impacto e vínculo opcional.

4. **Fase 2G - Política de IA e Copilot de compras**
   - definir minimização, fontes internas e respostas explicáveis.

5. **Fase 2H - Especificação técnica anti-SSRF**
   - detalhar validação canônica, DNS, IP, redirects, timeouts, parser e testes.

6. **Fase 2I - Prova controlada de parsing fiscal local**
   - somente com dados sintéticos e revisão humana.

7. **Fase futura - NFC-e real**
   - apenas após aprovação formal de segurança, LGPD, App Check, idempotência, logs sanitizados e testes automatizados.

### Critério de aceite

Cada fase deve declarar explicitamente o que continua proibido, quais riscos foram reduzidos e quais itens permanecem pendentes de fase técnica.

