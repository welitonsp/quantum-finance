# Auditoria Big Tech — Quantum Finance (Relatório CODEX/OpenAI)

> Recebido em 2026-07-02. Preservado para auditoria cruzada com relatório Gemini.

**Resumo executivo**
O projeto tem uma base forte: React/Vite bem modularizado, Firebase com App Check em Functions, Firestore Rules extensas, testes numerosos, Zod/centavos para dinheiro e pipeline CI robusto. Mas **não está pronto para comercialização com risco aceitável hoje**.

Veredito: **7,1/10 - precisa evoluir antes de produção comercial ampla**.
Bloqueadores principais: deploy de `main` quebrado, regressão real em parcelamentos, regras frágeis em despesas compartilhadas, logs/auditoria client-forgeable, cobertura baixa para um produto financeiro.

Não alterei arquivos, commits, deploys ou secrets. O `git diff` final está limpo.

**Validações**
| Check | Resultado |
|---|---|
| `npm run typecheck` | Passou |
| `npm run lint` | Passou |
| `npm run test -- --run` | Passou: 1378 testes, 210 skipped |
| `npm run coverage` | Passou: statements 60,11%, branches 50,87% |
| `npm run build` | Passou, mas com chunks >500 KB |
| `npm run test:rules` | Passou |
| `npm --prefix functions run build` | Passou |
| `npm --prefix functions test` | Passou: 189 testes |
| `npm audit` | Root: 1 low |
| `npm --prefix functions audit` | 13 vulns, incluindo 1 high |
| GitHub Actions | PR #326 verde; deploy de `main` falhando |

**P0**
1. **Deploy de produção quebrado em `main`**
   O workflow de merge falha ao publicar índices Firestore: índice `recurringTasks.active ASC` é rejeitado como desnecessário. As rules são enviadas antes da falha, criando risco de deploy parcial.
   Evidência: `firestore.indexes.json:51`, `.github/workflows/firebase-hosting-merge.yml`.

**P1**
1. **Parcelamentos provavelmente quebrados em produção**
   `installmentRepo` grava `competencia`, mas `txAllowedKeys` em `firestore.rules` não permite esse campo. Resultado esperado: `permission-denied` ao criar parcelas.
   Evidência: `src/shared/services/installmentRepo.ts:71`, `firestore.rules:110`.

2. **Despesas compartilhadas permitem adulteração por qualquer membro do grupo**
   `allow update/delete` aceita qualquer membro sem validar imutáveis, soma de cotas, `payerUid`, dono da cota ou integridade de `shares`.
   Evidência: `firestore.rules:1478`, `src/hooks/useGroups.ts:269`.

3. **Convites de grupos têm lacunas de integridade**
   Falta enforcement forte de expiração, campos imutáveis, `acceptedAt == request.time` e transação atômica no aceite. Pode gerar convite aceito sem membership efetivo.

4. **Audit logs e system logs podem ser criados pelo cliente**
   Para fintech/auditoria, logs críticos devem ser server-trusted. Hoje o owner pode forjar eventos em `audit_logs`/`system_logs`.

5. **Functions têm dependência vulnerável high no audit**
   `functions` reporta 13 vulnerabilidades, incluindo `form-data <2.5.6` CRLF injection. Precisa entrar no CI.

**P2**
- Cobertura insuficiente para domínio financeiro: 60,11% statements e 50,87% branches. Muitos hooks/parsers centrais com 0%.
- 210 testes skipped reduzem confiança de release.
- AI usa `localStorage` para memória conversacional com possível conteúdo financeiro. Falta evidência clara de consentimento, retenção e limpeza LGPD.
- Classificador de intenção chama Gemini via fluxo genérico de conselho, podendo dobrar custo/latência por pergunta.
- Build tem chunks grandes: `pdf.worker`, `parserWorker`, `vendor-firebase`, `vendor-charts`, `index`.
- `test:rules` é muito ruidoso e expõe metadados locais nos logs.
- Workflow de deploy deveria usar cleanup com `trap` também no job de rules/indexes.
- UI tem identidade forte, mas ainda parece mais "power user/cyber" que fintech sóbria em alguns pontos.

**P3**
- Padronizar tom PT-BR/PT-PT em mensagens como "ficheiro".
- Reduzir linguagem interna de produção, exemplo: erro de IA mencionando `.env`.
- Adicionar budgets de performance e cobertura como gates, não só relatórios.

**STRIDE**
| Categoria | Risco principal |
|---|---|
| Spoofing | Convites/participação de grupo dependem demais de validação client-side |
| Tampering | Shared expenses podem ser alteradas por membros |
| Repudiation | Audit/system logs client-forgeable |
| Information disclosure | Memória de IA em `localStorage`; logs ruidosos |
| Denial of service | AI com dupla chamada e rate limit sensível |
| Elevation of privilege | Regras de grupo precisam ser mais estritas em update/delete |

**Integridade financeira**
Pontos bons: uso extensivo de centavos, schemas, `decimal.js`, testes de reconciliação e regras.
Risco central: inconsistência schema/rules em parcelamentos e validação fraca de despesas compartilhadas. Isso afeta confiança contábil, não só segurança.

**IA e agentes**
Bom: há rate limit, App Check, sanitização parcial, prompt hardening e logs server-side para decisões.
A melhorar: separar endpoint/classificador de intenção, minimizar contexto enviado, dar controle explícito ao usuário sobre memória, retenção e limpeza.

**Módulos**
| Módulo | Nota | Prioridade |
|---|---:|---|
| Auth/Firebase base | 7,5 | P2 |
| Transações core | 8,0 | P1 por `competencia` |
| Cartões/faturas/parcelas | 6,0 | P1 |
| Grupos/shared finance | 4,5 | P1 |
| IA/agent | 7,5 | P2 |
| Cloud Functions | 8,0 | P1 por audit deps |
| Firestore Rules | 7,0 | P1 |
| UI/UX | 7,0 | P2 |
| CI/CD | 6,5 | P0 pelo deploy |
| Testes | 7,0 volume, 5,8 cobertura | P2 |

**Backlog recomendado**
1. Remover/corrigir índice `recurringTasks.active` e separar deploy de rules/indexes com rollback/validação.
2. Alinhar `competencia` entre schema, rules e testes de parcelamento.
3. Endurecer rules de `groups/{groupId}/expenses`: imutáveis, membership, soma, update granular de cota própria.
4. Tornar aceite de convite transacional e validar expiração/campos imutáveis.
5. Mover audit/system logs críticos para escrita exclusiva via Admin SDK.
6. Corrigir vulnerabilidades de `functions` e adicionar `npm audit` ao CI.
7. Definir coverage gates mínimos, especialmente branches para rules, hooks financeiros e parsers.
8. Revisar privacidade da IA: consentimento, retenção, limpeza, minimização e copy de erro.
9. Rodar axe/E2E acessibilidade e reduzir peso inicial do bundle.
10. Transformar deploy main quebrado em bloqueio obrigatório de release.

**Matriz Big Tech**
- **Security**: bom fundamento, mas P1 em rules/logs.
- **Privacy/LGPD**: funcionalidades existem, mas IA/localStorage precisa governança mais explícita.
- **Reliability**: testes fortes, deploy main falhando.
- **Financial correctness**: boa arquitetura de centavos, porém regressão de parcelamento é séria.
- **Maintainability**: modularidade boa, complexidade alta e cobertura irregular.
- **Commercial readiness**: ainda abaixo do necessário para fintech com usuários pagantes.

**Veredito final**
Eu não colocaria o Quantum Finance em produção comercial ampla hoje. Colocaria em beta controlado somente após resolver o P0 de deploy e os P1 de Firestore Rules/parcelamentos. A boa notícia: a fundação é bem acima da média; o projeto não precisa ser refeito. Ele precisa de uma rodada objetiva de hardening, testes de abuso e disciplina de release.
