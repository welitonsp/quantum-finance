# Política do Copilot IA - Quantum Finance 2.0

Data: 2026-06-12  
Projeto: Quantum Finance 2.0  
Fase: 2D - Política de IA, Produto e Governança

Este documento define a política oficial de uso da IA no Quantum Finance 2.0. A IA deve atuar como copiloto financeiro: observa, entende, explica, alerta, sugere e prepara ações para revisão, mas não decide nem executa ações sensíveis sozinha.

Esta política não autoriza implementação, alteração de código, alteração de regras, deploy, uso real de NFC-e ou envio de dados fiscais brutos para IA.

Referências de base:

- `docs/product/QUANTUM_FINANCE_VISAO_ESTRATEGICA_2_0.md`
- `docs/product/THREAT_MODEL_COMPRAS_INTELIGENTES_NFCE_2026-06-12.md`
- `CLAUDE.md`

## 1. Sumário executivo

### Permitido

A IA pode apoiar o usuário com explicações, alertas, resumos, detecção de padrões, categorização sugerida, simulações, análise de orçamento, análise de metas, análise de dívidas, insights de compras e preparação de rascunhos revisáveis.

### Exige confirmação

Qualquer ação que altere dados financeiros, preferências de categorização, orçamento, meta, dívida, regra, vínculo, importação, revisão ou histórico exige confirmação humana explícita antes da gravação.

### Proibido

A IA não pode criar, editar ou apagar transações sozinha; não pode alterar orçamento, metas, dívidas, categorias, regras ou compras confirmadas sem revisão humana; não pode receber dados sensíveis desnecessários; não pode usar dados fiscais brutos sem fase técnica aprovada; não pode executar decisão financeira sem confirmação humana.

### Diretriz central

O Quantum Finance 2.0 é uma plataforma de inteligência financeira pessoal com IA integrada, explicável, proativa, auditável e subordinada à decisão humana. O motor financeiro permanece protegido por Firestore em `users/{uid}`, centavos inteiros, `Decimal.js`, Zod `.strict()`, history append-only, logs sanitizados, idempotência e App Check.

## 2. Decisão de governança da IA

### Permitido

A IA pode ser usada como camada de interpretação, priorização e assistência. Ela pode reduzir carga cognitiva, destacar riscos, explicar recomendações e preparar propostas para aprovação.

### Exige confirmação

Toda ação sensível precisa de aceite humano registrado. Isso inclui gravações financeiras, mudanças de orçamento, alterações de metas, recategorização persistente, regras automáticas, importações, reconciliação, compras e sugestões que afetem planejamento.

### Proibido

É proibido tratar a IA como autoridade final. A IA não substitui consentimento, não substitui revisão, não substitui auditoria e não substitui validação de domínio financeiro.

### Critério de governança

Toda feature com IA deve responder antes de avançar: quais dados usa, qual ação sugere, qual fonte cita, qual confiança possui, qual confirmação exige, qual evento de auditoria registra e quais dados ficam fora de logs.

## 3. Escopo da política

### Permitido

Esta política cobre:

- Copilot IA transversal.
- chat contextual.
- cards proativos.
- insights e alertas.
- categorização sugerida.
- auditoria assistida.
- simulações.
- recomendações de economia.
- planejamento e orçamentos.
- metas.
- dívidas.
- Compras Inteligentes.
- NFC-e e dados fiscais, apenas como zona bloqueada e governança futura.
- logs, auditoria, aceite/rejeição e testes futuros.

### Exige confirmação

Qualquer uso que passe de leitura/análise para escrita, atualização, exclusão, importação, vínculo ou criação de regra exige confirmação humana.

### Proibido

Esta política não autoriza:

- implementação.
- deploy.
- alteração de código.
- alteração de `src/`, `functions/`, `firestore.rules`, `package.json`, `package-lock.json` ou testes.
- NFC-e real.
- fetch fiscal.
- scraping.
- envio de documento fiscal bruto para IA.
- execução financeira sem confirmação humana.

## 4. Definição de Copilot IA no Quantum

### Permitido

O Copilot IA é uma camada assistiva que:

- observa dados financeiros autorizados.
- entende contexto temporal e financeiro.
- explica eventos e anomalias.
- alerta sobre riscos.
- sugere opções.
- prepara ações para revisão.
- ajuda o usuário a decidir.

### Exige confirmação

Quando o Copilot preparar uma ação, a ação deve permanecer em estado de proposta até o usuário revisar e confirmar.

### Proibido

O Copilot não é agente de execução financeira. Ele não deve mover dinheiro, criar transações, alterar limites, aceitar importações, apagar dados, enviar dados fiscais ou mudar regras sem confirmação.

## 5. Princípios da IA explicável

### Permitido

A IA deve explicar:

- quais dados usou.
- quais fontes internas sustentam a recomendação.
- qual período analisou.
- qual limitação existe.
- qual incerteza foi detectada.
- qual ação é sugerida e por quê.

### Exige confirmação

Quando a explicação prepara uma ação sensível, a UI deve separar claramente: análise, recomendação e ação confirmável.

### Proibido

É proibido apresentar recomendação sem base identificável quando a recomendação impactar dinheiro, orçamento, metas, dívidas, compras ou categorias persistentes.

### Critério de aceite

Toda recomendação sensível deve ser acompanhada de fonte interna ou mensagem explícita de baixa confiança. Pendente de fase técnica.

## 6. Princípios da IA proativa

### Permitido

A IA pode ser proativa em:

- alertar sobre vencimentos.
- indicar anomalias.
- detectar ritmo de gasto incomum.
- sugerir revisão de categoria.
- apontar orçamento próximo do limite.
- avisar impacto de compra.
- sugerir simulação.
- destacar risco de dívida.
- informar oportunidade de economia.

### Exige confirmação

Proatividade pode gerar proposta, nunca execução automática. Aprovar, rejeitar, adiar ou ajustar deve ser decisão humana.

### Proibido

É proibido transformar alerta proativo em alteração automática de dados financeiros.

## 7. Princípios da IA auditável

### Permitido

A IA pode gerar eventos auditáveis quando:

- uma sugestão é apresentada.
- uma sugestão é aceita.
- uma sugestão é rejeitada.
- uma sugestão é editada antes de aceite.
- uma recomendação sensível é descartada.

### Exige confirmação

Eventos de aceite/rejeição devem registrar metadados sanitizados suficientes para auditoria, sem copiar payloads sensíveis, prompts completos ou respostas brutas.

### Proibido

É proibido registrar em audit logs: prompt bruto, resposta bruta, CPF, chave fiscal, URL fiscal, descrição financeira completa, path `users/{uid}`, tokens, secrets ou payload financeiro detalhado.

### Critério de aceite

Auditoria de IA deve preservar rastreabilidade sem virar repositório paralelo de dados sensíveis. Pendente de fase técnica.

## 8. Papel do usuário como autoridade final

### Permitido

O usuário pode aceitar, rejeitar, editar, adiar, ignorar ou pedir explicação adicional sobre recomendações da IA.

### Exige confirmação

Toda ação sensível deve ter revisão humana com resumo claro de impacto antes da gravação.

### Proibido

É proibido desenhar fluxos onde a IA assume consentimento por silêncio, ausência de resposta, padrão pré-marcado ou confirmação implícita.

### Critério de aceite

Confirmações devem ser explícitas, compreensíveis, reversíveis quando aplicável e auditáveis.

## 9. Matriz de Ações Permitidas sem Gravação

**Nota importante:** As ações permitidas pela IA operam estritamente em modo read-only, limitando-se a sugestões, rascunhos, explicações ou pré-preenchimentos. Não há commit no Firestore, alteração definitiva, categorização persistente nem gravação de histórico até confirmação humana explícita.

| Ação | Permitido | Condição |
|---|---|---|
| Explicar saldo, gasto ou tendência | Sim | Usar dados internos autorizados, sem gravação. |
| Resumir movimentações | Sim | Sem expor dados desnecessários e sem alterar registros. |
| Detectar anomalias | Sim | Apresentar como alerta revisável. |
| Sugestão visual de categoria | Sim | Em modo read-only ou rascunho, sem gravação definitiva, sem alteração de histórico e sem categorização persistente até confirmação humana explícita. |
| Sugerir orçamento | Sim | Não criar nem alterar orçamento sem confirmação. |
| Sugerir meta | Sim | Não criar nem alterar meta sem confirmação. |
| Sugerir plano de dívida | Sim | Não alterar dívida sem confirmação. |
| Simular compra | Sim | Separar simulação de execução. |
| Explicar impacto de compra | Sim | Usar centavos inteiros e fontes internas. |
| Extração de texto de imagens, comprovantes ou cupons | Sim | Somente para pré-preenchimento e revisão humana, respeitando sanitização, minimização de dados e política específica para dados fiscais. NFC-e real permanece bloqueada. |
| Preparar rascunho de ação | Sim | Deve ficar pendente de confirmação humana. |
| Responder perguntas financeiras | Sim | Citar fontes internas e limitações. |

## 10. Matriz de ações que exigem confirmação humana

| Ação | Exige confirmação | Critério mínimo |
|---|---|---|
| Criar transação | Sim | Resumo, valor em centavos, categoria, data e origem. |
| Editar transação | Sim | Antes/depois, impacto e history append-only. |
| Apagar transação | Sim | Confirmação destrutiva e auditoria. |
| Recategorizar transações | Sim | Escopo claro e opção de revisão. |
| Criar orçamento | Sim | Valor, período, categoria e impacto. |
| Alterar orçamento | Sim | Antes/depois e justificativa. |
| Criar meta | Sim | Valor, prazo e contribuição esperada. |
| Alterar meta | Sim | Antes/depois e impacto. |
| Alterar dívida | Sim | Parcelas, saldo, juros, vencimento e impacto. |
| Criar regra automática | Sim | Condição, efeito e escopo. |
| Importar dados financeiros | Sim | Preview, deduplicação e revisão. |
| Vincular compra a transação | Sim | Total, divergência e origem. |
| Aceitar item de compra | Sim | Produto, preço, quantidade, loja e data. |
| Executar ação em lote | Sim | Escopo, contagem, amostra e possibilidade de desfazer quando aplicável. |

## 11. Matriz de ações proibidas

| Ação | Status | Motivo |
|---|---|---|
| Criar transação sem confirmação | Proibido | Altera ledger financeiro. |
| Editar transação sem confirmação | Proibido | Altera histórico financeiro. |
| Apagar transação sem confirmação | Proibido | Ação destrutiva. |
| Alterar orçamento automaticamente | Proibido | Afeta planejamento. |
| Alterar meta automaticamente | Proibido | Afeta objetivos. |
| Alterar dívida automaticamente | Proibido | Afeta passivos. |
| Criar regra automática sem aceite | Proibido | Pode afetar dados futuros. |
| Executar ação em lote sem confirmação | Proibido | Alto impacto e risco de erro. |
| Buscar URL fiscal arbitrária | Proibido | Risco SSRF. |
| Enviar NFC-e bruta para IA | Proibido | Risco LGPD e exposição fiscal. |
| Logar prompt/resposta com dados sensíveis | Proibido | Vazamento de dados. |
| Usar dados fora de `users/{uid}` | Proibido | Quebra isolamento. |
| Tomar decisão financeira sem confirmação humana | Proibido | Usuário é autoridade final. |

## 12. Dados que a IA pode usar

### Permitido

A IA pode usar, conforme consentimento e necessidade:

- dados financeiros internos do usuário.
- transações já salvas e autorizadas.
- categorias confirmadas.
- orçamentos existentes.
- metas existentes.
- dívidas cadastradas.
- contas e cartões, quando necessários para contexto.
- recorrências.
- histórico de auditoria sanitizado.
- histórico de preços confirmado.
- compras revisadas.
- simulações feitas pelo usuário.
- preferências explícitas do usuário.

### Exige confirmação

O uso de dados recém-importados, dados de compra em rascunho, sugestões pendentes ou itens com baixa confiança deve ser apresentado como análise de rascunho, não como fato financeiro consolidado.

### Proibido

A IA não deve acessar dados de outro usuário, dados fora de `users/{uid}`, segredos, tokens, credenciais, `.env`, logs brutos ou payloads fiscais brutos.

## 13. Dados que a IA não deve receber

### Proibido

A IA não deve receber:

- secrets, tokens ou credenciais.
- `.env`.
- CPF completo.
- chave NFC-e completa.
- URL fiscal bruta.
- QR Code fiscal bruto.
- XML fiscal bruto.
- HTML fiscal bruto.
- PDF fiscal bruto.
- documento fiscal integral.
- endereço completo sem necessidade.
- dados de outro usuário.
- paths `users/{uid}`.
- prompts/respostas anteriores com PII.
- logs brutos.
- stack traces.
- payload financeiro completo quando uma versão minimizada basta.

### Exige confirmação

Qualquer exceção relacionada a dados fiscais depende de fase técnica, consentimento explícito, minimização, base legal, testes e revisão de segurança.

### Permitido

Versões minimizadas, agregadas ou revisadas podem ser usadas quando suficientes para a finalidade.

## 14. Dados que nunca devem ir para logs

### Proibido

Nunca logar:

- CPF.
- chave de acesso fiscal completa.
- URL fiscal.
- QR Code.
- XML/PDF/HTML fiscal.
- prompt bruto.
- resposta bruta de IA.
- descrição completa de transação.
- valores financeiros detalhados.
- deltas `before`/`after` completos.
- `uid`.
- paths `users/{uid}`.
- `importHash`.
- tokens.
- secrets.
- credenciais.
- stack trace com payload.
- objeto bruto de erro.

### Permitido

Logs podem conter metadados sanitizados:

- tipo de operação.
- status genérico.
- código interno de erro.
- contadores agregados.
- latência.
- identificador técnico não reversível quando necessário.

### Critério de aceite

Testes futuros devem bloquear regressões de logs sensíveis. Pendente de fase técnica.

## 15. Política para movimentações financeiras

### Permitido

A IA pode:

- explicar movimentações.
- sugerir categoria.
- detectar possível duplicidade.
- sugerir reconciliação.
- explicar variação de gasto.
- preparar rascunho de transação.

### Exige confirmação

Criar, editar, apagar, reconciliar, recategorizar ou importar movimentação exige confirmação humana.

### Proibido

A IA não pode alterar o ledger, contornar history append-only, criar transação direta, apagar lançamento, alterar valor ou mudar data/categoria sem aceite explícito.

### Critério de aceite

Qualquer mudança em movimentação deve preservar centavos inteiros, `Decimal.js`, Zod `.strict()`, idempotência e trilha de auditoria.

## 16. Política para categorização

### Permitido

A IA pode:

- sugerir categoria para transação.
- explicar por que sugeriu.
- indicar confiança.
- sugerir criação de regra.
- apontar categorias inconsistentes.

### Exige confirmação

Persistir categoria, aplicar regra automática, recategorizar lote ou criar nova categoria exige confirmação humana.

### Proibido

A IA não pode recategorizar histórico sozinha, criar regra oculta, alterar categorias em lote sem preview ou usar dados sensíveis desnecessários para classificar.

### Critério de aceite

Toda sugestão de categoria deve mostrar base, escopo e efeito antes de persistir.

## 17. Política para orçamentos

### Permitido

A IA pode:

- analisar ritmo de gasto.
- alertar limite próximo.
- sugerir orçamento por categoria.
- explicar estouro.
- comparar mês atual com histórico.

### Exige confirmação

Criar, alterar, pausar, excluir ou aceitar orçamento sugerido exige confirmação humana.

### Proibido

A IA não pode ajustar orçamento automaticamente para acomodar comportamento de gasto, esconder estouro ou alterar limites sem aceite.

### Critério de aceite

Sugestões de orçamento devem exibir valor, período, categoria, fonte interna e impacto esperado.

## 18. Política para metas

### Permitido

A IA pode:

- sugerir metas.
- calcular progresso.
- explicar atraso.
- simular contribuição mensal.
- alertar risco de não cumprimento.

### Exige confirmação

Criar, alterar, excluir, pausar ou redefinir meta exige confirmação humana.

### Proibido

A IA não pode mover dinheiro, mudar prioridade, alterar prazo ou redefinir valor-alvo sem aceite.

### Critério de aceite

Recomendações sobre metas devem separar simulação de alteração real.

## 19. Política para dívidas

### Permitido

A IA pode:

- explicar composição da dívida.
- alertar vencimentos.
- simular antecipação.
- sugerir estratégia de pagamento.
- indicar risco de juros.

### Exige confirmação

Alterar dívida, marcar parcela como paga, criar plano de pagamento, registrar pagamento ou mudar vencimento exige confirmação humana.

### Proibido

A IA não pode registrar pagamento, renegociar, alterar saldo, apagar dívida ou priorizar pagamento sem decisão humana.

### Critério de aceite

Toda recomendação sobre dívida deve deixar claros custo, prazo, premissas e impacto no fluxo de caixa.

## 20. Política para Compras Inteligentes

### Permitido

A IA pode:

- explicar impacto de compra.
- sugerir categorias de itens.
- comparar preço histórico confirmado.
- sugerir lista planejada.
- apontar item com preço atípico.
- preparar rascunho de compra.
- responder perguntas com fontes internas revisadas.

### Exige confirmação

Salvar compra, aceitar item, vincular compra a movimentação, criar observação de preço, alterar lista ou usar item importado exige confirmação humana.

### Proibido

A IA não pode criar transação, confirmar compra, aceitar item fiscal, alterar planejamento ou registrar preço histórico sozinha.

### Critério de aceite

Compras Inteligentes deve manter dados em `users/{uid}`, dinheiro em centavos, logs sanitizados, idempotência e revisão humana. Detalhes de domínio permanecem pendentes de fase técnica.

## 21. Política para NFC-e e dados fiscais

### Permitido

Nesta fase, apenas documentação, threat modeling e definição de governança são permitidos. NFC-e real permanece bloqueada.

### Exige confirmação

Qualquer uso futuro de dado fiscal exige consentimento explícito, minimização, revisão humana e fase técnica aprovada.

Qualquer consulta fiscal futura dependerá de fase técnica própria com regras rígidas:

- o backend nunca deve fazer fetch da URL bruta enviada pelo usuário;
- a URL fiscal futura deve ser reconstruída de forma canônica a partir de dados validados;
- deve haver allowlist de domínio;
- deve haver bloqueio de IP privado, localhost e metadata cloud;
- redirects devem ser controlados;
- deve haver timeout, tamanho máximo e rate limit;
- deve haver App Check;
- deve haver idempotência;
- logs devem ser sanitizados;
- deve haver revisão humana.

### Proibido

É proibido:

- implementar NFC-e agora.
- buscar URL fiscal via fetch da URL bruta enviada pelo usuário.
- chamar SEFAZ diretamente pelo cliente.
- rodar scraping.
- enviar NFC-e bruta para IA.
- enviar XML/PDF/HTML fiscal bruto para IA.
- logar dados fiscais.
- aceitar item fiscal sem revisão.

### Critério de aceite

NFC-e real permanece bloqueada até aprovação formal de segurança, SSRF, LGPD, App Check, idempotência, logs sanitizados, validação canônica de URL, revisão humana e testes. Pendente de fase técnica.

## 22. Política para insights e alertas

### Permitido

A IA pode gerar:

- alertas de anomalia.
- alertas de orçamento.
- alertas de vencimento.
- alertas de saldo projetado.
- alertas de gasto recorrente.
- insights de economia.
- explicações de tendência.

### Exige confirmação

Se o alerta oferecer uma ação sensível, a execução exige confirmação.

### Proibido

Alertas não podem alterar dados automaticamente, gerar medo sem explicação, ocultar incerteza ou apresentar dados rascunho como confirmados.

### Critério de aceite

Todo alerta deve ter severidade, fonte, período e ação sugerida ou caminho de revisão.

## 23. Política para recomendações de economia

### Permitido

A IA pode recomendar:

- revisar assinatura.
- reduzir categoria de gasto.
- adiar compra.
- comparar compra com orçamento.
- priorizar dívida cara.
- reforçar meta.
- buscar alternativa de menor impacto.

### Exige confirmação

Qualquer ação derivada da recomendação exige aceite humano, especialmente cancelar, pausar, alterar recorrência, ajustar orçamento ou registrar transação.

### Proibido

A IA não pode cancelar serviço, excluir recorrência, mover dinheiro, alterar orçamento ou assumir que uma recomendação econômica é obrigatória.

### Critério de aceite

Recomendações devem ser opcionais, explicáveis e reversíveis quando virarem ação.

## 24. Política para simulações

### Permitido

A IA pode:

- explicar simulação.
- comparar cenários.
- destacar premissas.
- sugerir novo cenário.
- estimar impacto em saldo, fatura, orçamento ou meta.

### Exige confirmação

Transformar simulação em transação, orçamento, meta ou plano de pagamento exige confirmação humana.

### Proibido

A IA não pode apresentar simulação como garantia, promessa de retorno, aconselhamento financeiro definitivo ou execução automática.

### Critério de aceite

Toda simulação deve exibir premissas e diferenciar claramente projeção de fato registrado.

## 25. Política para ações em lote

### Permitido

A IA pode identificar candidatos a ação em lote e preparar preview.

### Exige confirmação

Ações em lote exigem:

- escopo claro.
- quantidade de itens.
- amostra.
- critério de seleção.
- efeito antes/depois.
- confirmação explícita.
- auditoria.

### Proibido

A IA não pode executar recategorização, exclusão, importação, reconciliação ou alteração em lote sem confirmação.

### Critério de aceite

Toda ação em lote deve ter preview e caminho de revisão antes de persistir.

## 26. Política para explicação de recomendações

### Permitido

Explicações devem incluir, quando aplicável:

- fonte interna.
- período.
- valores agregados.
- categorias envolvidas.
- premissas.
- confiança.
- limitações.
- alternativa de não agir.

### Exige confirmação

Quando a explicação antecede ação sensível, o usuário deve ver o impacto antes de confirmar.

### Proibido

É proibido ocultar incerteza, inventar fonte, afirmar causalidade não demonstrada ou usar linguagem que pressione o usuário a aceitar.

### Critério de aceite

Toda recomendação deve ser auditável e reconstituível a partir de dados internos ou registrar baixa confiança.

## 27. Política de fontes internas

### Permitido

Fontes internas aceitas:

- transações confirmadas.
- categorias confirmadas.
- orçamentos aprovados.
- metas cadastradas.
- dívidas cadastradas.
- contas/cartões cadastrados.
- recorrências.
- importações revisadas.
- compras confirmadas.
- histórico de preços confirmado.
- eventos de auditoria sanitizados.

### Exige confirmação

Dados em rascunho, importações pendentes e sugestões não aceitas só podem aparecer como "pendente" ou "não confirmado".

### Proibido

A IA não deve usar dados fiscais brutos, dados externos não validados, dados de outro usuário ou fontes sem origem clara para recomendar ação sensível.

### Critério de aceite

Respostas do Copilot devem indicar fonte ou limitação quando tratarem de decisão financeira.

## 28. Política de aceite/rejeição pelo usuário

### Permitido

O usuário pode:

- aceitar sugestão.
- rejeitar sugestão.
- editar antes de aceitar.
- pedir explicação.
- adiar.
- silenciar alerta.
- transformar sugestão em rascunho.

### Exige confirmação

Aceite de ação sensível deve gerar evento auditável sanitizado. Rejeição de ação sensível também pode ser registrada como metadado de melhoria, sem armazenar payload sensível.

### Proibido

É proibido considerar sugestão aceita por ausência de resposta, fechamento de modal ou timeout.

### Critério de aceite

Fluxos futuros devem representar claramente estados: sugerido, visto, editado, aceito, rejeitado, expirado e aplicado. Pendente de fase técnica.

## 29. Política de auditoria

### Permitido

Auditoria pode registrar:

- tipo da sugestão.
- status.
- horário.
- origem do módulo.
- ação aceita/rejeitada.
- metadados agregados.
- versão de política quando aplicável.

### Exige confirmação

Eventos derivados de ação sensível devem estar ligados ao aceite humano.

### Proibido

Auditoria não deve conter payload bruto, prompt bruto, resposta bruta, PII, CPF, chave fiscal, URL fiscal, `uid`, path `users/{uid}` ou valores financeiros detalhados.

### Critério de aceite

Auditoria deve ser append-only e sanitizada, sem reintroduzir dados proibidos.

## 30. Política de fallback quando a IA não tiver confiança

### Permitido

Quando confiança for baixa, a IA deve:

- dizer que não tem certeza.
- explicar o motivo.
- pedir revisão humana.
- oferecer opções conservadoras.
- sugerir consulta manual.
- não persistir mudança.

### Exige confirmação

Se mesmo com baixa confiança o usuário quiser prosseguir, a ação deve ser manual, explícita e auditada.

### Proibido

A IA não pode ocultar baixa confiança, escolher uma opção aleatória, inventar dado ausente ou aplicar alteração sem confirmação.

### Critério de aceite

Estados de baixa confiança devem ser visíveis e não bloqueados por texto genérico. Pendente de fase técnica.

## 31. Riscos de hallucination

### Risco

IA pode inventar transações, fontes, causalidades, categorias, valores, projeções ou justificativas.

### Impacto

Pode induzir decisões financeiras incorretas, perda de confiança e contaminação de dados.

### Defesa

Defesas:

- citar fontes internas.
- limitar recomendações ao escopo dos dados.
- mostrar baixa confiança.
- separar fato, inferência e sugestão.
- exigir confirmação humana.
- bloquear escrita sem confirmação.

### Critério de aceite

Recomendações sem fonte suficiente devem ser apresentadas como hipótese, não como fato.

## 32. Riscos de vazamento de dados

### Risco

Dados sensíveis podem vazar por prompts, respostas, logs, erros, eventos de auditoria, exportações, integrações ou uso excessivo de contexto.

### Impacto

Pode violar LGPD e expor dados financeiros, fiscais e comportamentais.

### Defesa

Defesas:

- minimização de payload.
- logs sanitizados.
- não enviar dados fiscais brutos.
- não enviar secrets.
- não registrar prompts/respostas brutas.
- restringir dados a `users/{uid}`.
- mascarar campos sensíveis.
- usar App Check e Auth nas superfícies server-side.

### Critério de aceite

Testes futuros devem provar que campos proibidos não chegam a logs nem payloads de IA. Pendente de fase técnica.

## 33. Riscos de automação indevida

### Risco

Busca por conveniência pode levar a alterações automáticas que afetem a vida financeira do usuário sem consentimento.

### Impacto

Pode causar perdas, dados errados, orçamento alterado, histórico poluído e quebra de confiança.

### Defesa

Defesas:

- usuário como autoridade final.
- confirmação explícita.
- preview antes/depois.
- audit trail.
- idempotência.
- ações reversíveis quando possível.
- separação visual entre sugestão e execução.

### Critério de aceite

Nenhuma feature com IA deve ter caminho de escrita sensível sem confirmação humana.

## 34. Critérios de aceite para futuras implementações

### Permitido

Futuras implementações podem avançar quando respeitarem esta política.

### Exige confirmação

Cada PR futuro com IA deve declarar:

- dados usados.
- dados excluídos.
- fonte interna.
- ação permitida.
- ação sensível e confirmação.
- logs gerados.
- auditoria.
- idempotência.
- App Check, se server-side.
- Zod `.strict()`.
- uso de centavos e `Decimal.js` quando houver dinheiro.
- fallback de baixa confiança.

### Proibido

Não aceitar implementação que:

- crie escrita financeira sem confirmação.
- envie dados fiscais brutos para IA.
- logue dados sensíveis.
- ignore `users/{uid}`.
- use float para dinheiro persistido.
- omita confirmação humana.
- omita testes de regressão para guardrails.

## 35. Testes obrigatórios futuros

### Permitido

Testes devem cobrir política, segurança e comportamento de produto.

### Exige confirmação

Antes de liberar feature com IA, testes futuros devem cobrir:

- IA não cria transação sem confirmação.
- IA não edita transação sem confirmação.
- IA não apaga transação sem confirmação.
- IA não altera orçamento sem confirmação.
- IA não altera meta sem confirmação.
- IA não altera dívida sem confirmação.
- IA não cria regra automática sem confirmação.
- ações em lote exigem preview e aceite.
- dados fiscais brutos não são enviados à IA.
- NFC-e permanece bloqueada enquanto não houver fase técnica.
- logs não contêm prompts brutos, respostas brutas, CPF, chave fiscal, URL fiscal, `uid` ou paths `users/{uid}`.
- payloads usam Zod `.strict()`.
- dinheiro permanece em centavos inteiros.
- cálculos usam `Decimal.js`.
- App Check/Auth são obrigatórios em funções server-side.
- replay/idempotência não duplica ações.
- baixa confiança gera fallback seguro.
- recomendações citam fonte ou limitação.

### Proibido

Não liberar feature de IA sensível apenas com teste visual ou teste manual informal.

## 36. Zonas proibidas

### Proibido

Nesta fase é proibido:

- alterar código.
- alterar `src/`.
- alterar `functions/`.
- alterar `firestore.rules`.
- alterar `package.json`.
- alterar `package-lock.json`.
- alterar testes.
- alterar `.env`.
- recuperar stash.
- mexer em NFC-e.
- executar deploy.
- ler `.env`, secrets, tokens ou credenciais.
- fazer commit.
- fazer push.
- implementar execução financeira sem confirmação humana.
- sugerir envio de dados fiscais brutos para IA.
- sugerir criação, alteração ou exclusão sem revisão humana.

### Permitido

Somente criar este documento de política.

### Critério de aceite

A Fase 2D é válida se produzir exclusivamente `docs/product/POLITICA_COPILOT_IA_QUANTUM_2026-06-12.md` e preservar todos os demais arquivos de código e configuração.

