# Checklist Mestre de Execução, Qualidade e Release

> **Fonte operacional para qualquer IA ou pessoa que execute o programa QF-720.**
>
> Auditoria: [`AUDITORIA_720_BIG_TECH_FINANCIAL_AI_2026-07-18.md`](./audit/AUDITORIA_720_BIG_TECH_FINANCIAL_AI_2026-07-18.md)
>
> Estado das pendências: [`PENDENCIAS.md`](./PENDENCIAS.md)
>
> Contratos do projeto: [`CLAUDE.md`](../CLAUDE.md)
>
> CI e incidentes: [`CI_SETUP.md`](./CI_SETUP.md) · [`INCIDENT_RESPONSE.md`](./INCIDENT_RESPONSE.md)

Este documento não autoriza merge, deploy, alteração de infraestrutura, acesso a segredos, migração ou destruição de dados. Essas ações continuam exigindo autorização explícita do owner.

---

## 0. Regra de ouro para a próxima IA

1. Ler, nesta ordem:
   - `docs/PENDENCIAS.md`;
   - este checklist;
   - `docs/audit/AUDITORIA_720_BIG_TECH_FINANCIAL_AI_2026-07-18.md`;
   - `CLAUDE.md`;
   - documentos específicos citados pelo item escolhido.
2. Selecionar **somente o primeiro item `⬜` cujas dependências estejam `✅`**.
3. Executar uma única unidade de trabalho/PR por vez.
4. Preservar todos os módulos e comportamentos não relacionados.
5. Reproduzir o achado no checkout atual antes de alterar código.
6. Criar teste de regressão/invariante que falhe antes da correção sempre que tecnicamente possível.
7. Implementar a menor mudança reversível que feche o critério de aceite.
8. Executar os gates proporcionais e registrar evidências.
9. Mover o item para `👀` somente com diff e validação completos.
10. Mover para `✅` somente após PR revisado, merge confirmado e verificação pós-merge.
11. Ao fechar uma dependência, promover para `⬜` somente os próximos itens que passarem integralmente no DoR.

**É proibido iniciar P1 enquanto o gate integral de P0 não estiver aprovado.**

### Estados permitidos

| Estado | Significado |
|---|---|
| `⬜` | pronto para seleção se todas as dependências estiverem fechadas |
| `🔄` | uma única IA/pessoa está executando; branch/PR devem estar registrados |
| `🚧` | bloqueado; motivo e autoridade necessária devem estar escritos |
| `👀` | implementação concluída, aguardando revisão/CI/merge |
| `✅` | mergeada e verificada; evidência registrada |

---

## 1. Preflight obrigatório de cada sessão

- [ ] Executar `git status -sb` e preservar alterações existentes do usuário.
- [ ] Registrar branch, `HEAD`, upstream e worktree no comentário/handoff.
- [ ] Confirmar que não há merge/rebase/cherry-pick em andamento.
- [ ] Ler o item, dependências, critério de aceite e documentos associados.
- [ ] Validar que nenhuma outra IA está trabalhando no mesmo item/arquivos.
- [ ] Inspecionar o código atual; não confiar apenas em auditoria ou comentário antigo.
- [ ] Reproduzir o defeito ou provar o gap com evidência atual.
- [ ] Rodar o teste/baseline mínimo antes da mudança.
- [ ] Definir arquivos previstos e confirmar que o escopo cabe em um PR focado.
- [ ] Identificar risco de contrato, migração, dado real, infraestrutura ou decisão de produto.
- [ ] Alterar o status do item para `🔄` somente quando a execução realmente começar.

### Definition of Ready — DoR

Um item só está pronto quando:

- [ ] dependências estão `✅`;
- [ ] achado continua reproduzível;
- [ ] comportamento esperado está inequívoco;
- [ ] invariantes financeiros, segurança e privacidade estão definidos;
- [ ] teste de regressão foi planejado;
- [ ] rollback/compatibilidade foram avaliados;
- [ ] autoridade necessária está disponível;
- [ ] não existe edição conflitante no worktree.

Se qualquer condição falhar, marcar `🚧`, registrar o bloqueio e **não improvisar a decisão**.

---

## 2. Fila executável QF-720 P0

### 2.1 Ordem e dependências

| Ordem | Unidade executável | Entrega | Depende de | Gate humano/infra |
|---:|---|---|---|---|
| 1 | `QF720-GOV-01` | retirar garantias absolutas e exibir estado honesto/provisório | nenhuma | não |
| 2 | `QF720-ENV-01` | validador fail-closed de env de produção + testes | nenhuma | não |
| 3 | `QF720-ADR-01` | ADR da verdade contábil: ledger, postings, saldo e migração | nenhuma | **sim: aprovação arquitetural** |
| 4 | `QF720-ENV-02` | configurar GitHub/Firebase e smoke pós-deploy | `ENV-01` | **sim: secrets/console/deploy** |
| 5 | `QF720-SCHEMA-01` | contrato compartilhado Functions × Rules × client | `ADR-01` | Rules/Functions autorizadas |
| 6 | `QF720-IDEM-01` | idempotência obrigatória com operação + hash + conflito | `SCHEMA-01` | Functions autorizadas |
| 7 | `QF720-IDEM-02` | outbox durável `pending/sent/acknowledged` + lote | `IDEM-01` | não |
| 8 | `QF720-FIN-01` | taxonomia canônica e invariantes de conservação | `ADR-01`, `SCHEMA-01` | não |
| 9 | `QF720-FIN-02` | corrigir agregadores de transferência e KPIs | `FIN-01` | não |
| 10 | `QF720-FIN-03` | settlement atômico/idempotente de fatura | `FIN-01`, `IDEM-01` | Functions autorizadas |
| 11 | `QF720-FIN-04` | reconciliar patrimônio, metas e dívidas com a verdade canônica | `FIN-01`, `FIN-03` | decisão de migração se necessária |
| 12 | `QF720-CONSENT-01` | schema único e fluxo server-trusted de consentimento/log | `SCHEMA-01` | Rules/Functions autorizadas |
| 13 | `QF720-PRIV-01` | exportação server-side com manifesto | `CONSENT-01` | retenção/base legal |
| 14 | `QF720-PRIV-02` | exclusão em saga com pseudonimização e recibo | `PRIV-01`, `IDEM-01` | **sim: jurídico/retenção** |
| 15 | `QF720-AI-01` | Financial Snapshot server-trusted, versionado e reconciliado | `FIN-04`, `CONSENT-01` | Functions autorizadas |
| 16 | `QF720-AI-02` | resposta estruturada + claims determinísticos + fail-closed | `AI-01` | não |
| 17 | `QF720-AI-03` | proposta server-side e confirmação em duas fases | `AI-01`, `AI-02`, `IDEM-01` | política de MFA/risco |
| 18 | `QF720-SHARED-01` | cotas server-owned, soft-delete e trilha compartilhada | `IDEM-01`, `CONSENT-01` | retenção |
| 19 | `QF720-RECUR-01` | recorrência atômica por tarefa + competência | `IDEM-01`, `FIN-01` | Functions autorizadas |
| 20 | `QF720-UI-01` | Relatórios usa escopo temporal completo e declarado | `FIN-02` | não |
| 21 | `QF720-UI-02` | convite compartilhado recebe identidade autenticada | `SHARED-01` | não |
| 22 | `QF720-UI-03` | split proporcional exige pesos e prévia válida | `SHARED-01` | regra de produto inequívoca |
| 23 | `QF720-UI-04` | Quantum AI usa recorrentes reais/renomeia métrica | `FIN-01` | não |
| 24 | `QF720-UI-05` | Privacidade cobre valores, gráficos, tooltip, push e cache | `CONSENT-01` | política de push |
| 25 | `QF720-SIM-01` | corrigir competência, defaults e proveniência de simulações | `FIN-01` | não |
| 26 | `QF720-P0-CERT` | reauditoria, E2E financeiro e certificação do gate P0 | todos acima | **sim: revisão independente** |

Itens independentes podem ser preparados em paralelo somente se não compartilharem arquivos, contratos ou decisões. A sequência de merge continua obedecendo as dependências.

**Limite arquitetural de P0:** `FIN-04` entrega reconciliador shadow, operações críticas balanceadas e delta zero nos cenários de aceite. A materialização integral, migração e eventual backfill do ledger pertencem a P1 e não podem ser iniciados sem plano, backup, dry-run e autorização próprios.

### 2.2 Critérios de aceite por unidade

#### `QF720-GOV-01`

- [ ] remover “100%”, “zero duplicidade”, “hard-delete completo” e equivalentes não medidos;
- [ ] declarar processador, memória e transferências de forma fiel;
- [ ] estados provisórios são `Não verificado`/`Parcial`, nunca “Premium” estático;
- [ ] teste de regressão impede retorno das garantias absolutas.

#### `QF720-ENV-01/02`

- [ ] build de produção falha quando qualquer variável obrigatória estiver ausente;
- [ ] debug App Check é impossível em produção;
- [ ] Firebase, App Check e VAPID possuem validação;
- [ ] workflow usa variáveis/secrets do ambiente correto;
- [ ] smoke publicado comprova login e callable protegida;
- [ ] nenhum valor secreto é gravado em git, log ou artefato.

#### `QF720-ADR-01` e `QF720-FIN-*`

- [ ] semântica de `accounts.balance`, ledger e postings aprovada;
- [ ] toda operação possui lançamentos balanceados;
- [ ] transferência interna não muda resultado nem patrimônio;
- [ ] pagamento de fatura reduz caixa e passivo atomicamente;
- [ ] aporte em meta e pagamento de dívida informam origem do recurso;
- [ ] dashboard, patrimônio, relatórios, Gêmeo e IA retornam a mesma verdade;
- [ ] cálculos permanecem em centavos inteiros/Decimal/BigInt seguro;
- [ ] migração, se necessária, tem dry-run, backup, rollback e autorização.

#### `QF720-SCHEMA-01`

- [ ] cliente, Zod, Function e Rules aceitam/rejeitam o mesmo contrato;
- [ ] campos server-owned não são graváveis pelo cliente;
- [ ] testes positivos, negativos e de compatibilidade legada;
- [ ] nenhuma Function Admin cria documento impossível de atualizar pelo fluxo suportado.

#### `QF720-IDEM-*`

- [ ] chave obrigatória para toda mutação financeira;
- [ ] namespace inclui usuário e operação;
- [ ] hash canônico vincula chave ao payload;
- [ ] mesma chave + payload diferente retorna conflito;
- [ ] retry ambíguo retorna o mesmo resultado;
- [ ] crash/reload não recria operação já confirmada;
- [ ] lote é persistido;
- [ ] testes de replay depois da janela do cliente e concorrência simultânea.

#### `QF720-CONSENT-01`

- [ ] schema único para UI, Rules e Functions;
- [ ] consentimento separado por finalidade ou plano de migração documentado;
- [ ] conceder, usar, revogar e bloquear funcionam ponta a ponta;
- [ ] log é server-trusted, append-only e não falha silenciosamente;
- [ ] processador, finalidade e retenção aparecem para o titular.

#### `QF720-PRIV-*`

- [ ] inventário inclui documento raiz, subcoleções, grupos, convites e despesas;
- [ ] exportação possui contagens, hash, falhas por domínio e manifesto;
- [ ] nenhuma falha é convertida em “coleção vazia” ou sucesso;
- [ ] exclusão usa checkpoints, retries e estado terminal verificável;
- [ ] PII compartilhada é apagada ou pseudonimizada conforme decisão jurídica;
- [ ] Auth só é excluído após verificação;
- [ ] cache, outbox e memória locais são limpos;
- [ ] recibo final prova o que ocorreu e o que foi retido.

#### `QF720-AI-*`

- [ ] contexto vem de snapshot server-trusted;
- [ ] snapshot inclui versão, hash, data de corte, cobertura e reconciliação;
- [ ] LLM não cria claim monetário final;
- [ ] resposta usa schema estrito, fontes, premissas e placeholders;
- [ ] resposta inválida falha fechada;
- [ ] proposta é criada no servidor com ID, hash, expiração e risco;
- [ ] confirmação referencia a proposta e não pode ser fabricada pelo cliente;
- [ ] MFA/step-up é aplicado conforme política;
- [ ] prompt injection, adulteração, replay e tool abuse estão cobertos.

#### `QF720-SHARED-01`

- [ ] servidor ignora `paid/paidAt` enviados na criação e cria cotas não pagas;
- [ ] somente o fluxo de settlement altera quitação;
- [ ] exclusão vira tombstone/soft-delete com retenção e trilha;
- [ ] owner/payer/membro não apagam evidência unilateralmente;
- [ ] concorrência e acesso horizontal possuem testes.

#### `QF720-RECUR-01`

- [ ] comando usa `{recurringTaskId, competência}` e ID determinístico;
- [ ] somente dados do snapshot fresco são materializados;
- [ ] transação, histórico e marcação são atômicos;
- [ ] One Touch e scheduler não duplicam;
- [ ] contador só aumenta quando a escrita ocorrer.

#### `QF720-UI-*` e `QF720-SIM-01`

- [ ] defeito reproduzido por teste;
- [ ] identidade autenticada chega ao convite;
- [ ] split proporcional coleta pesos, soma válida e mostra prévia;
- [ ] relatório recebe todos os dados necessários e declara o período;
- [ ] “despesa fixa” usa recorrentes reais ou recebe nome correto;
- [ ] privacidade global cobre toda representação monetária;
- [ ] simulação diferencia `demo`, `estimado` e `dados reais`;
- [ ] competência usa mês correto e datas inválidas falham fechadas;
- [ ] jornada crítica validada em desktop e mobile.

### 2.3 Gate de certificação P0

- [ ] todos os itens P0 estão `✅`;
- [ ] delta de reconciliação é zero;
- [ ] zero duplicidade no conjunto adversarial;
- [ ] 100% das mutações críticas possuem histórico e idempotência;
- [ ] zero claim monetário livre do LLM;
- [ ] consentimento e direitos LGPD possuem evidência E2E;
- [ ] CI, Rules, Functions, build e E2E estão verdes;
- [ ] QA em dispositivo real concluído;
- [ ] auditor independente revisou o diff e as evidências;
- [ ] owner autorizou explicitamente a abertura de P1.

---

## 3. Regras de parada obrigatória

A IA deve parar, marcar `🚧` e pedir decisão quando ocorrer qualquer condição:

- [ ] dependência ainda não está `✅`;
- [ ] baseline já está vermelho por motivo não relacionado;
- [ ] achado não é reproduzível no checkout atual;
- [ ] worktree contém alteração conflitante do usuário/outra IA;
- [ ] escopo atravessa mais de uma unidade/PR;
- [ ] é necessário segredo, console, dispositivo, dado real ou credencial;
- [ ] é necessária decisão jurídica, regulatória, contábil ou de produto;
- [ ] há migração, deleção física, pseudonimização ou mudança irreversível;
- [ ] contrato público muda sem compatibilidade e rollback;
- [ ] teste crítico não pode ser executado;
- [ ] a única forma de “passar” é enfraquecer/remover teste ou gate;
- [ ] seria necessário remover um módulo ou funcionalidade existente;
- [ ] seria necessário `git reset --hard`, force-push ou sobrescrever trabalho alheio.

Bloqueios permanentes até nova decisão explícita:

- fetch/scraping automático de NFC-e/SEFAZ;
- Open Finance/Bacen;
- migração automática de float para `value_cents`;
- pagamento/transferência externa autônoma.

---

## 4. Definition of Done — DoD

Um item só pode ir para `👀` quando:

- [ ] critério funcional foi atendido;
- [ ] teste de regressão/invariante foi adicionado;
- [ ] caso feliz, erro, concorrência/replay e autorização foram testados conforme risco;
- [ ] cálculos financeiros permanecem exatos;
- [ ] logs não contêm PII, valores, tokens, prompts ou respostas brutas;
- [ ] compatibilidade, rollout e rollback foram documentados;
- [ ] documentação afetada foi atualizada;
- [ ] `git diff --check` está limpo;
- [ ] gates proporcionais foram executados;
- [ ] evidência e handoff foram preenchidos.

Um item só pode ir para `✅` quando:

- [ ] CI remoto está verde;
- [ ] revisão independente foi concluída;
- [ ] PR e commit de merge estão registrados;
- [ ] verificação pós-merge/deploy foi executada quando aplicável;
- [ ] `docs/PENDENCIAS.md` foi atualizado;
- [ ] limitações remanescentes foram abertas como novo item, não ocultadas.

---

## 5. Evidência obrigatória e handoff

Cada item deve registrar no PR ou em `docs/audit/evidence/QF720-<ID>.md`:

```markdown
# Evidência QF720-<ID>

- Status:
- Base commit:
- Branch:
- PR:
- Commit final/merge:
- Owner/revisor:
- Data:

## Achado reproduzido
- Evidência antes:
- Teste vermelho:

## Mudança
- Arquivos:
- Decisão arquitetural:
- Compatibilidade/rollback:

## Validação
- Comando:
- Resultado:
- Teste novo:
- CI:

## Segurança e integridade
- Centavos/invariantes:
- Auth/App Check/Rules:
- Idempotência/concorrência:
- Privacidade/logs:

## Limitações e próximo passo
- Limitações:
- Dependências desbloqueadas:
```

### Handoff obrigatório em qualquer pausa

- [ ] item e status;
- [ ] branch e último commit;
- [ ] arquivos modificados;
- [ ] último passo verde;
- [ ] erro/bloqueio exato;
- [ ] tentativas já realizadas;
- [ ] comando seguinte recomendado;
- [ ] decisão/autoridade necessária;
- [ ] worktree preservado.

---

## 6. Checklist de PR

- [ ] Um ID QF-720 por PR; título e descrição citam o ID.
- [ ] Branch própria; PR pequeno e focado, preferencialmente até 5 arquivos.
- [ ] Diff não remove nem oculta módulo existente.
- [ ] Teste de regressão prova o achado corrigido.
- [ ] `npm run typecheck` aprovado.
- [ ] `npm run lint` aprovado.
- [ ] `npm run test:run` aprovado.
- [ ] `npm run build` aprovado com política de env aplicável.
- [ ] `npm run test:rules` aprovado se tocou Rules/schema/autorização.
- [ ] `npm --prefix functions test` aprovado se tocou Functions/contrato compartilhado.
- [ ] E2E Playwright aprovado se tocou jornada crítica.
- [ ] `npm run bundlecheck` aprovado se alterou dependências, imports ou code splitting.
- [ ] Sem `parseFloat`, `Number(x) * 100` ou `Math.round(x * 100)` em cálculo financeiro.
- [ ] Payloads externos validados com schema estrito.
- [ ] Logs sanitizados; sem PII, valores, segredos, prompts ou respostas brutas.
- [ ] Modelo A/ledger e audit trail preservados.
- [ ] IA declara dados, ferramentas, fontes, confiança, confirmação e auditoria.
- [ ] `git diff --check` limpo.
- [ ] PENDENCIAS, ADRs e checklist atualizados quando aplicável.

### Matriz de testes

| Alteração | Testes obrigatórios |
|---|---|
| Motor financeiro | unit + property/invariantes + limites monetários |
| Agregador/KPI | unit + conservação + dataset cruzado entre módulos |
| Hook/serviço persistente | unit + retry/rollback + trilha |
| Rules | positivos, negativos, acesso horizontal e schema |
| Functions | unit + auth + App Check + idempotência + concorrência |
| IA | golden set + grounding + prompt injection + fail-closed |
| LGPD | E2E conceder/revogar/exportar/excluir + manifesto |
| UI crítica | RTL/a11y + E2E desktop/mobile |
| Scheduler | idempotência + catch-up + concorrência + métrica real |

---

## 7. Checklist de deploy

- [ ] autorização explícita do owner registrada;
- [ ] todos os checks de CI verdes;
- [ ] `main` atualizada e worktree limpa;
- [ ] artefato corresponde ao commit aprovado;
- [ ] variáveis obrigatórias validadas antes do build;
- [ ] nenhum debug token/segredo está no bundle;
- [ ] Rules/Functions compatíveis com clientes antigos durante rollout;
- [ ] backup/rollback e janela de mudança confirmados;
- [ ] preview com TTL ≤ 3 dias;
- [ ] canary/rollout gradual quando o risco justificar;
- [ ] smoke pós-deploy: login, App Check, leitura, mutação idempotente e reconciliação;
- [ ] métricas/alertas observados após a mudança;
- [ ] resultado e commit implantado registrados.

---

## 8. Checklist de rollback

- [ ] identificar último artefato e contratos estáveis;
- [ ] bloquear novas mutações se houver risco de corrupção;
- [ ] preservar evidências e dados do intervalo;
- [ ] Hosting: rollback/redeploy do artefato anterior;
- [ ] Rules/Functions: confirmar compatibilidade antes de reverter;
- [ ] executar compensação, nunca apagar evidência financeira;
- [ ] validar reconciliação e idempotência após rollback;
- [ ] registrar causa, impacto, período e dados afetados;
- [ ] abrir teste de regressão e post-mortem.

---

## 9. Checklist de incidente

> Detalhe em [`INCIDENT_RESPONSE.md`](./INCIDENT_RESPONSE.md).

- [ ] classificar SEV-1/2/3;
- [ ] interromper dano sem destruir evidência;
- [ ] ativar kill switch da ferramenta/callable afetada;
- [ ] revogar credencial ou aplicar contenção restritiva;
- [ ] preservar correlation IDs, versões e janela;
- [ ] reconciliar operações financeiras afetadas;
- [ ] comunicar controlador; avaliar ANPD/titulares;
- [ ] remediar com PR pequeno e teste de regressão;
- [ ] executar revisão independente;
- [ ] registrar post-mortem e atualizar risk register.

---

## 10. Processo permanente

```text
read-only → preflight → DoR → um ID → teste vermelho/invariante
→ menor mudança reversível → gates → evidência → revisão independente
→ autorização → merge → verificação → atualizar backlog → handoff limpo
```
