# Auditoria 360 Security & Systems — Quantum Finance

> Data: 2026-07-18  
> Escopo: auditoria técnica profunda do checkout local `main @ 93d5c6e`  
> Perfil: Principal Security & Systems Auditor  
> Status: documento consolidado para orientar remediação e re-auditoria

## 1. Sumário executivo

**Risco global: ALTO.** O sistema tem fundações fortes para um Personal Finance Manager: isolamento por `uid`, Firestore Rules restritivas, App Check, validações Zod, trilhas de histórico em parte do domínio, uso predominante de centavos inteiros/Decimal.js e boa cobertura automatizada. Ainda assim, a auditoria 360 identificou falhas de contrato entre camadas, gaps de idempotência durável, riscos LGPD operacionais e fragilidades de deploy/observabilidade que impedem classificar o sistema como pronto para operação financeira crítica.

Se o produto vier a iniciar pagamentos, transferências externas, Open Finance regulado, carteira, cartão real ou qualquer liquidação monetária fora do ambiente PFM, o risco deve ser reclassificado para **CRÍTICO** até que haja ledger contábil, reconciliação operacional, DR testado, observabilidade formal e controles regulatórios completos.

## 2. Checklist em andamento localizado em `docs/`

Arquivos revisados:

| Documento | Estado consolidado | Observação |
|---|---:|---|
| `docs/PENDENCIAS.md` | Em andamento | Backlog único anterior. Mantém M-01 opcional, M-03 owner-pending, F-09/F-15 infra e fases de produto. |
| `docs/CHECKLISTS.md` | Ativo | Gate operacional de PR, deploy, rollback e incidente. Não é backlog de achados, mas deve reger a remediação. |
| `docs/audit/M03_CHECKLIST_VERIFICACOES_REAIS.md` | Aberto | Checklist real em dispositivo: MFA TOTP, FCM background push e NFC-e manual. |
| `docs/audit/AUDITORIA_EXTERNA_2026-07-11.md` | Parcialmente superado | Registrava remediação de auditoria anterior. A auditoria 360 encontrou novos gaps e divergências. |
| `docs/audit/AUDITORIA_BIG_FOUR_2026-07-09.md` | Histórico | Útil como baseline, mas não substitui esta auditoria 360. |

Conclusão: havia checklists em andamento, mas dispersos. Este documento consolida o estado atual e passa a ser o dossiê de remediação da auditoria 360.

## 3. Vulnerabilidades críticas e altas

| ID | Severidade | Achado | CWE/OWASP | Impacto direto | Remediação exigida |
|---|---:|---|---|---|---|
| QF-360-01 | Alta | Deploy do Hosting pode ser gerado sem `VITE_FIREBASE_*` e `VITE_RECAPTCHA_SITE_KEY`. | CWE-16 / OWASP A05 | Sistema publicado com autenticação/App Check quebrados ou comportamento divergente do ambiente local. | Validar env obrigatória no build; configurar secrets/env no GitHub Actions; falhar CI antes do deploy. |
| QF-360-02 | Alta | Idempotência não é obrigatória/durável em todas as mutações financeiras. TTL de 24h e fallback silencioso permitem replay. | CWE-841 / CWE-345 | Cobrança, lançamento ou estorno duplicado em retentativas, offline outbox ou falha de rede. | Tornar idempotency key obrigatória, persistente por janela compatível com negócio e validada por operação/uid/payload. |
| QF-360-03 | Alta | Execução recorrente One Touch tem passos separados entre transação, marcação de recorrente e atualização de tarefa. | CWE-362 | Corrida ou falha parcial pode duplicar competência mensal. | Unificar fluxo em callable/transaction server-side com chave única por recorrente e competência. |
| QF-360-04 | Alta | Contrato de consentimento LGPD/IA diverge entre client/backend e Firestore Rules. | CWE-20 / OWASP A04 | Consentimento pode falhar, IA fecha incorretamente ou evidência legal fica inconsistente. | Alinhar schema único, migrar dados antigos e testar rules/client/functions juntos. |
| QF-360-05 | Alta | `dataProcessingLog` é negado por rules e o erro é tratado como não bloqueante. | CWE-778 | Trilha LGPD pode não existir embora o produto aparente registrar eventos. | Tornar escrita server-trusted ou permitir caminho validado; remover swallow silencioso. |
| QF-360-06 | Alta | Modelo híbrido saldo/ledger: receitas/despesas comuns não atualizam saldo armazenado; transferências atualizam. | CWE-682 | Dashboard, patrimônio e decisões de IA podem divergir da realidade financeira. | Definir uma fonte canônica: ledger derivado ou saldo materializado com invariantes e reconciliação. |
| QF-360-07 | Alta | Despesas compartilhadas não têm idempotência na criação. | CWE-841 | Duplicidade de despesas em grupo por retry, duplo clique ou instabilidade de rede. | Exigir chave idempotente por grupo/usuário/payload. |
| QF-360-08 | Alta | Exclusão de grupo remove documento raiz sem limpeza recursiva garantida. | CWE-459 | Subcoleções órfãs com dados financeiros/PII. | Usar callable com recursive delete e audit trail. |
| QF-360-09 | Alta | `deleteUserData` continua após falha de limpeza de grupos. | CWE-703 / CWE-459 | Conta pode ser removida enquanto PII permanece em coleções globais. | Transformar em saga verificável; falhar fechado quando cleanup obrigatório falhar. |
| QF-360-10 | Alta | Exportação LGPD client-side omite coleções server-only e dados de grupos. | CWE-200 / CWE-359 | Titular recebe exportação incompleta; risco regulatório. | Export server-side com inventário completo e manifesto de coleções exportadas. |

## 4. Problemas arquiteturais

1. **Transações financeiras ainda não têm garantia sistêmica de exactly-once.** O padrão atual reduz risco, mas não fecha duplicidade em todos os caminhos.
2. **Não há ledger contábil de partidas dobradas.** Para PFM isso é aceitável como estágio, mas para produto financeiro crítico é insuficiente.
3. **Concorrência depende de Firestore transaction em alguns fluxos, mas não em todos.** Fluxos client-orchestrated continuam sensíveis a falha parcial e disputa entre sessões.
4. **Resiliência operacional é fraca para escala.** Há região única, scans amplos, ausência de DLQ/checkpoint/circuit breaker documentado e jobs sequenciais.
5. **Observabilidade é insuficiente para incidentes financeiros.** Logs existem, mas faltam SLOs, alertas, reconciliação periódica e trilha imutável completa.
6. **Contratos entre client, functions e rules não são governados como schema único.** Divergências de tamanho/campos tornam possível criar dados pelo backend que depois o cliente não consegue alterar.

## 5. Dívida técnica e qualidade de código

| Área | Problema | Risco |
|---|---|---|
| Functions | Arquivo monolítico com lógica crítica extensa. | Dificulta revisão, testes por domínio e ownership. |
| Firestore Rules | Arquivo grande e com risco de limite de expressões. | Mudanças futuras podem quebrar autorização de forma difícil de auditar. |
| Offline outbox | Payload financeiro em IndexedDB sem expiração forte/criptografia de aplicação. | Exposição local e replay tardio. |
| LGPD | Consentimento, log, exportação e delete não fecham ciclo verificável. | Não conformidade prática, mesmo com documentação boa. |
| Supply chain | Falta SAST/Semgrep/CodeQL, SBOM, dependency review, provenance e DAST. | Dependência de inspeção manual e npm audit. |
| MFA | MFA opcional para mutações financeiras comuns. | Conta comprometida pode executar alterações financeiras sem step-up. |

## 6. Evidências de validação executada

Resultado consolidado das verificações recentes:

| Verificação | Resultado |
|---|---:|
| Typecheck | Verde |
| Lint | Verde |
| Testes unitários frontend | 2038 passed, 227 skipped |
| Firestore Rules | 227 passed |
| Functions | 304 passed |
| E2E Playwright | 28 passed |
| Build/bundle | Verde |
| `npm audit` raiz/functions | 0 vulnerabilidades conhecidas |
| Cobertura | 78,86% statements; 69,29% branches; 80,16% functions; 82,02% lines |

Esses resultados comprovam maturidade de engenharia, mas não eliminam os achados acima porque vários são falhas de arquitetura, contrato, operação e conformidade, não apenas bugs detectáveis por suíte local.

## 7. Plano de ação priorizado

### P0 — Bloqueador antes de deploy público

- Corrigir pipeline de Hosting para exigir `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID` e `VITE_RECAPTCHA_SITE_KEY`.
- Tornar idempotência obrigatória em `createTransaction`, `createTransfer`, `executeAgentAction` e criação de despesas compartilhadas.
- Unificar recorrência One Touch em operação server-side atômica por competência.
- Corrigir schema de consentimento e log LGPD.
- Alinhar schemas de client/functions/rules e adicionar testes de contrato.

### P1 — Até 7 dias após P0

- Definir modelo canônico de saldo: ledger derivado ou saldo materializado com reconciliação.
- Implementar delete recursivo de grupos e saga de exclusão de usuário com verificação final.
- Trocar exportação LGPD para callable server-side.
- Criar política explícita para saldo negativo e limites por tipo de conta.
- Migrar conversões monetárias legadas para normalização segura com validação de safe integer.

### P2 — Até 30 dias

- Adicionar SLOs, alertas, métricas estruturadas, DLQ/checkpoints e reconciliação periódica.
- Modularizar `functions/src/index.ts` por domínio financeiro, IA, LGPD e grupos.
- Reduzir complexidade de `firestore.rules` com testes de regressão por contrato.
- Aplicar MFA step-up para mutações sensíveis.
- Fechar CORS para origens exatas.
- Incluir CodeQL/Semgrep, dependency review, SBOM, provenance e DAST report-only.

### P3 — 60 a 90 dias

- Testar backup, point-in-time recovery, restore drill, RPO/RTO e plano regional de DR.
- Produzir threat model formal por domínio.
- Fazer pentest independente após P0/P1.
- Revisar enquadramento LGPD/PCI/Bacen com jurídico/compliance antes de qualquer integração regulada.

## 8. Critérios de aceite para re-auditoria

- Build de produção falha se env obrigatória estiver ausente.
- Toda mutação financeira crítica exige idempotency key e possui teste de replay.
- Recorrente executa no máximo uma vez por competência, inclusive sob concorrência.
- Consentimento, log, exportação e deleção LGPD têm prova ponta a ponta.
- Saldo exibido, transações e histórico têm uma fonte de verdade verificável.
- Dados de grupo são exportados e deletados sem órfãos.
- Alertas e runbook existem para falha de callable, job agendado, custo e erro de autenticação.
- Checklist M-03 em dispositivo real foi executado e evidenciado.

## 9. Decisão operacional

Este dossiê não substitui os documentos históricos; ele os consolida. A partir desta auditoria, qualquer PR de remediação deve referenciar o ID `QF-360-*` correspondente e atualizar este documento quando o achado for fechado.
