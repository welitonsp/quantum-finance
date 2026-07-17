# Documento Mestre Quantum Finance 2.0

## 1. Sumário Executivo
O Quantum Finance está evoluindo de uma ferramenta tradicional de controle financeiro para um copiloto financeiro pessoal inteligente e proativo. A versão 2.0 consolida o produto como uma plataforma de inteligência financeira com IA integrada, auditável e segura. O motor financeiro robusto atual servirá como base inviolável ("Quantum Ledger invisível"), enquanto a experiência principal passa a ser orientada por decisão, clareza, alertas, planejamento, simulações e recomendações. O projeto autônomo "Sistema Gestão de Compras" não continuará como produto separado, servindo apenas como referência conceitual para um novo módulo interno.

## 2. Decisão Estratégica
A transição para a versão 2.0 foca na integração proativa da inteligência artificial mantendo rigorosa segurança técnica. Toda ação sensível passa por confirmação humana. O Sistema Gestão de Compras será descontinuado como entidade isolada e integrado como o módulo "Compras Inteligentes" diretamente no Quantum Finance. As premissas fundamentais (Firestore, Firebase Auth, Cloud Functions TypeScript, App Check) seguem como a fundação inegociável do sistema.

## 3. Missão do Quantum Finance 2.0
Empoderar o usuário com um ecossistema financeiro pessoal altamente seguro, unindo a precisão e resiliência de uma arquitetura bancária a um copiloto inteligente que facilita a tomada de decisão financeira de maneira auditável, clara e explicável.

## 4. Visão de Produto
Tornar-se o copiloto financeiro pessoal definitivo, atuando além da retrospectiva de gastos. A interface deve antecipar eventos, sugerir melhorias e oferecer simulações baseadas no comportamento do usuário, assegurando que o controle e a autorização final das decisões permaneçam, invariavelmente, nas mãos humanas.

## 5. Problema que o Produto Resolve
O controle financeiro tradicional exige alto esforço cognitivo para classificar transações, analisar fluxos e projetar orçamentos futuros. As ferramentas reativas falham em prever cenários ou atuar preventivamente. O Quantum Finance 2.0 soluciona a estagnação e a complexidade manual através da automação inteligente que propõe e prepara as informações para a deliberação do usuário.

## 6. Proposta de Valor
Visibilidade, controle e previsibilidade com esforço mínimo. A plataforma atua proativamente antecipando cenários e propondo estratégias via inteligência explicável, apoiada sobre um motor financeiro rígido, blindado contra falhas sistêmicas (histórico append-only, cálculos estritos em centavos).

## 7. Princípios Técnicos Inegociáveis
*   **Firebase Auth:** Único provedor de identidade do sistema.
*   **Firestore:** Dados rigidamente contidos e isolados sob `users/{uid}`.
*   **Cloud Functions TypeScript:** Camada exclusiva para regras de backend.
*   **App Check:** Mandatório para acesso aos recursos e APIs.
*   **Valores Financeiros:** Exclusivamente em centavos inteiros na persistência.
*   **Decimal.js:** Uso estritamente obrigatório para aritmética financeira.
*   **Zod `.strict()`:** Validação de payload rígida e sem propriedades excedentes.
*   **History Append-only:** Mutabilidade controlada, garantindo rastreabilidade.
*   **Logs Sanitizados:** Ausência total de dados pessoais ou sensíveis nos logs.
*   **Idempotência:** Toda function/backend deve suportar re-tentativas de forma segura.
*   **Revisão Humana:** Mandatória antes de qualquer ação destrutiva ou movimentação sensível.
*   **LGPD:** Direito à exclusão e transparência no trato dos dados.

## 8. Princípios da IA no Quantum
*   **IA Explicável:** As sugestões deverão referenciar explicitamente suas fontes de dados internas.
*   **Sem Autonomia em Decisões:** A IA sugere, categoriza, explica e prepara; **o usuário decide e confirma**.
*   **Restrições Externas:** É estritamente proibido o fetch indiscriminado de URL arbitrária fornecida pelo usuário.

## 9. Nova Arquitetura de Módulos
O painel de navegação será reestruturado para refletir a transição de um "livro-caixa" para uma suíte modular de acompanhamento, decisão e projeção financeira.

## 10. Centro de Comando
O dashboard consolidado. Focado no panorama imediato: saldo atual, fluxo pendente de revisão (sugestões da IA), vencimentos iminentes, alertas proativos e insights de anomalias no comportamento de consumo.

## 11. Timeline Financeira
Visão unificada das movimentações ao longo do tempo (passado registrado e futuro projetado). Permite navegação rápida sobre o fluxo de caixa no decorrer dos dias e semanas.

## 12. Movimentações
Módulo core de listagem e controle de transações. Entrada rápida e categorização automatizada (com revisão do usuário). Base do motor financeiro inalterado.

## 13. Planejamento
Controle de orçamentos e limites por categoria. Monitoramento contínuo sobre teto de gastos e alertas da IA sobre o ritmo das despesas frente aos orçamentos aprovados.

## 14. Patrimônio & Objetivos
Gestão consolidada de ativos, evolução patrimonial de longo prazo e metas de investimento. Base de simulações do copiloto para atingimento de objetivos específicos.

## 15. Compras Inteligentes
Módulo refeito inteiramente dentro do Quantum Finance (substituindo o descontinuado Sistema Gestão de Compras). Voltado para listas e estimativas de mercado.
*   **Proibido agora:** Qualquer importação fiscal ou leitura de NFC-e real está temporariamente bloqueada.
*   **Aprovado futuro:** NFC-e será inserida apenas *após* um Threat Model completo contra SSRF, exigindo validação estrita de host/domínio permitido, logs sanitizados e revisão humana obrigatória.

## 16. Copilot IA
Camada transversal e interativa. Apresenta-se como um chat context-aware e cards proativos em outras telas. Facilita o onboarding e possibilita questionamentos avançados ("Como esta compra afeta meu orçamento mensal?").

## 17. Cofre / Governança
Módulo administrativo dedicado ao controle do usuário. Gestão de conta, LGPD, exclusão de dados, exportação de registros e gerenciamento dos limites de permissões da IA.

## 18. Design System e UI/UX
Foco integral em interface limpa, orientada à clareza visual e acessibilidade. 
*   **Regra de Ouro:** O redesign visual não pode, de forma alguma, alterar o motor financeiro. Funções, regras do Firestore, idempotência, a regra dos centavos, uso de Decimal.js, validações Zod e sanitização de logs são invioláveis por intervenções na UI.

## 19. O que será aproveitado do Sistema Gestão de Compras
Do antigo sistema, manteremos apenas a inteligência conceitual: lógicas de separação de lista prevista versus carrinho real, fluxos mentais de estimativa e os conceitos das categorias de produtos.

## 20. O que será descartado do Sistema Gestão de Compras
O repositório e infraestrutura isolada, os sistemas de autenticação paralelos, ferramentas de scraping de notas não seguras, e todo fluxo que infrinja o core rígido de segurança e anti-SSRF do Quantum Finance. A migração direta de código é expressamente proibida.

## 21. Zonas Proibidas de Alteração
Qualquer alteração na Fase 1 e seguintes que modifiquem as bases estruturais está vetada:
*   Não alterar código das `Cloud Functions` fundamentais já estabilizadas.
*   Não afrouxar ou alterar as `Firestore Rules` (exceto adições pontuais para novas coleções seguindo a regra `users/{uid}`).
*   Não remover ou alterar a cobertura de testes e validação Zod `.strict()`.

## 22. Roadmap por Fases
*   **Fase 1 (Atual):** Consagração do Documento Mestre e Visão Estratégica.
*   **Fase 2:** Estruturação inicial do Design System e mockups do Centro de Comando.
*   **Fase 3:** Refatoração visual (UI/UX) da Timeline Financeira e Movimentações sobre o core blindado.
*   **Fase 4:** Desenvolvimento do Copilot IA (MVP) e alertas proativos integrados.
*   **Fase 5:** Arquitetura limpa e Threat Modeling para iniciar o módulo Compras Inteligentes.

## 23. Critérios de Aceite
*   As regras técnicas inegociáveis permanecem ativas, respeitadas e documentadas.
*   O documento reflete a mudança de posicionamento para inteligência financeira assistida sem delegar decisões sensíveis à máquina.
*   As premissas de segurança e threat models futuros estão claros como impeditivos de avanço imprudente no módulo de compras.

## 24. Processo de Trabalho com ChatGPT, Antigravity, Codex e Claude Code
Os LLMs atuarão como aceleradores estritos, sem sobrepor as regras de negócio:
*   Qualquer prompt voltado a backend ou modelagem deverá receber explicitamente o contexto das regras (`uid`, `centavos`, `Decimal.js`, `Zod`).
*   Nenhum código gerado pela IA será implementado sem auditoria contra problemas de SSRF e falhas de idempotência.
*   O controle de versão e aceitação continuará humano e revisado de forma granular.

## 25. Próximas Fases Recomendadas
1. Elaboração do manual de padrões arquiteturais Frontend (gestão de estado, design patterns da UI e tratamento da comunicação com funções IA).
2. Estudo de Threat Model de SSRF e segurança em inputs de origem externa para pavimentar a reconstrução do fluxo de NFC-e.
3. Rascunho das definições das novas coleções do Firestore (sob `users/{uid}`) que suportarão as funcionalidades de Planejamento e Inteligência Proativa.
