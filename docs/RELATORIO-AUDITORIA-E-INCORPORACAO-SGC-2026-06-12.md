# Relatório de Auditoria e Plano de Incorporação SGC → Quantum Finance

> **Data:** 2026-06-12
> **Escopo:** (1) Auditoria do estado atual do Quantum Finance; (2) Leitura técnica do projeto SGC (`C:\SGC-Atual`); (3) Plano de incorporação para execução pelo programador.
> **Como usar:** Execute as partes na ordem. A Parte 1 é **bloqueante** (produção quebrada para clone limpo). As Partes 2–3 são preparação. A Parte 4 é o plano de incorporação faseado.

---

## PARTE 1 — HOTFIX P1: arquivo importado pela main nunca foi commitado (URGENTE)

### Diagnóstico

- `src/features/transactions/TransactionsManager.tsx` (commitado na main desde o PR #201 — FASE 2.5) contém:
  - Linha 22: `import { useSubscriptionAlerts } from '../../hooks/useSubscriptionAlerts';`
  - Linha 94: `const subscriptionAlerts = useSubscriptionAlerts(recurringTasks, transactions);`
- O arquivo `src/hooks/useSubscriptionAlerts.ts` está **untracked** — existe apenas na máquina local, **não existe em `origin/main`**.
- Consequência: `tsc --noEmit` e `vite build` **falham em qualquer clone limpo** (CI de terceiros, Vercel, outro dev). O deploy automático da Vercel a partir da main provavelmente está falhando desde o merge do #201.
- Mesma situação (menos grave, aditiva): `functions/test/executeScheduledRecurrents.test.js` está untracked — 128/128 testes passam localmente, mas o CI da main roda sem essa cobertura.

### Validação do conteúdo do hook (já auditado — aprovado)

O hook `useSubscriptionAlerts.ts` foi revisado e **respeita os contratos do projeto**:
- Opera exclusivamente em `value_cents` (inteiros). ✅
- O único `Math.round` existente é sobre **percentual de exibição** (`increasePercent`), não sobre valor monetário — permitido. ✅
- Sem `console.*` cru. ✅
- Hook puro (`useMemo`), sem escrita no Firestore — não envolve Modelo A. ✅

### Passo a passo do hotfix

```bash
cd C:\quantum-finance
git checkout main
git pull
git checkout -b fix/commit-missing-subscription-alerts

git add src/hooks/useSubscriptionAlerts.ts
git add functions/test/executeScheduledRecurrents.test.js

# Validação completa obrigatória antes do commit
npm run typecheck
npm run test -- --run
npm run build
npm --prefix functions run build
npm --prefix functions test

git commit -m "fix(build): commit useSubscriptionAlerts hook missing from PR #201"
git push origin fix/commit-missing-subscription-alerts
# Abrir PR, revisar diff, merge squash na main
```

**Critério de aceite:** após o merge, um `git clone` limpo + `npm ci && npm run build` deve passar. Verificar que o deploy da Vercel volta a ficar verde.

**Recomendação adicional (prevenção):** o hook não tem teste unitário. Criar `src/hooks/useSubscriptionAlerts.test.ts` em PR seguinte cobrindo: alerta de aumento de preço (>5%), sem alerta quando ≤5%, alerta de execução perdida (2+ ciclos), tarefas inativas ignoradas, frequência `anual` ignorada.

---

## PARTE 2 — Higiene do repositório

### 2.1 Worktrees órfãos (causa da falha de lint)

`git worktree list` mostra **~16 worktrees de agentes** acumulados em `.claude/worktrees/` (maioria travada no commit `5b387b9`, de fases já mergeadas), 1 em `.claire/worktrees/` e 1 em `/tmp/wt156`. O ESLint varre `.claire/worktrees/.../FirestoreService.ts` e falha com erro de parsing — **`npm run lint` está quebrado por artefato local**.

```bash
cd C:\quantum-finance

# Listar antes de remover (conferir que nenhum tem trabalho não commitado que importe)
git worktree list

# Remover cada worktree órfão (usar --force apenas nos travados/locked já mergeados)
git worktree remove --force C:/quantum-finance/.claude/worktrees/agent-<id>
# ... repetir para cada um ...
git worktree prune

# Remover o diretório .claire (artefato de agente, untracked)
Remove-Item -Recurse -Force C:\quantum-finance\.claire

# Apagar branches já mergeadas que os worktrees seguravam
git branch --merged main | Select-String 'worktree-agent|fase' # revisar e deletar
```

**Atenção:** antes de remover `feat/snapshot-server-filter` (em `/tmp/wt156`) e branches `fase*` não mergeadas, confirmar com o owner se há trabalho em andamento.

**Prevenção:** adicionar `.claire/` e `.claude/` ao `ignores` do ESLint (flat config) ou `.eslintignore`, e ao `.gitignore` se ainda não estiverem.

### 2.2 Warning de lint residual

`src/features/ai-chat/AIAssistantChat.tsx:187` tem uma diretiva `eslint-disable` sem uso. Corrigir com `npx eslint --fix src/features/ai-chat/AIAssistantChat.tsx` ou remoção manual.

### 2.3 Documento de processo solto

`docs/FLUXO DE PROCESSO INICIO E FIM.txt` (untracked) é um guia válido de fluxo de trabalho. Commitar (sugestão: renomear para `docs/fluxo-de-processo.md`).

### 2.4 Branch atual

`feat/fase5-4-offline-pwa` está em **paridade exata com origin/main** (0 ahead / 0 behind) — o trabalho do PWA já foi mergeado. Após o hotfix da Parte 1, este branch pode ser apagado.

---

## PARTE 3 — Atualizar CLAUDE.md (dívida de documentação)

O CLAUDE.md para no **PR #177** (FASE 26), mas a main contém **30 PRs a mais, até o #207**. Qualquer agente de IA que confiar nele trabalha com mapa errado. PRs ausentes da documentação:

| Bloco | PRs | Conteúdo |
|---|---|---|
| FASES 27–34 | #179–#186 | Float residuais + TTL idempotency, functions migradas para **TypeScript**, Copilot proativo, Budget AI + alertas, Score History, Fluxo de Caixa Semanal, Gamificação XP, Risk Score por transação |
| Correções P0 | #187–#189 | Transferências fora do saldo acumulado, parcelamento atômico cap 120, dupla contagem de quota IA |
| FASE 1.x (novo roadmap) | #190–#197 | toFixed monetário eliminado, pagar fatura via transferência, segurança 1.7, net worth com faturas/parcelas futuras, **competência por fechamento de cartão**, **Cloud Function agendada para recorrências server-side** (#196), Zod strict em transferências |
| FASE 2.x | #198–#201 | **FirestoreService dividido em repos de domínio** (#198), **TransactionsManager dividido em componentes** (#199), useInsightsEngine, quick wins UX |
| FASES 3–8 | #202–#207 | PurchaseSimulator, módulo de dívidas, fundo de emergência + projeções de metas, timeline 90 dias, AI copilot auditável com citações, LGPD compliance + hardening |

**Ações no CLAUDE.md:**
1. Novo bloco "Estado Consolidado" no topo cobrindo #178–#207 (mesmo formato dos blocos atuais).
2. Corrigir a "Referência Rápida de Arquivos Críticos": o `FirestoreService.ts` monolítico (1149 linhas) foi dividido em repos de domínio no #198; `functions/index.js` virou `functions/src/index.ts` (30KB) + `createTransactionValidation.ts` no #180. Regenerar a tabela com `Get-ChildItem` real.
3. Atualizar contagem de functions: existe agora pelo menos uma **function agendada** (`executeScheduledRecurrents`, #196) além das 5 callables.
4. Atualizar suíte de testes: **56 arquivos / 1034 testes** (não mais 52/915).

---

## PARTE 4 — Leitura do SGC e plano de incorporação

### 4.1 O que é o SGC (leitura completa em 2026-06-12)

**Sistema de Gestão de Compras V2.0** (`C:\SGC-Atual`) — sistema institucional de ingestão, auditoria e análise de documentos fiscais brasileiros.

| Dimensão | Detalhe |
|---|---|
| Backend | FastAPI assíncrono, SQLAlchemy 2 (typed), PostgreSQL (Neon), Alembic |
| Worker | ARQ + Redis (processamento em background) |
| Frontend | React 18 + Vite + Tailwind 4 (SPA separada, `frontend/`) |
| IA | Groq-first (`AI_PROVIDER=groq`); Gemini Vision **opcional** (`ENABLE_GEMINI=false` padrão) |
| Auth | JWT (python-jose) + RBAC: `admin`, `auditor`, `manager`, `operator` |
| Multi-tenant | `department_id` em quase todas as tabelas; isolamento por departamento |
| Testes | 52 arquivos pytest |
| Infra | Docker multi-stage, docker-compose, manifests k8s |

**Modelo de dados central** (`backend/models/compras.py`):
- `Fornecedor` (CNPJ único) → `NotaFiscal` (chave de acesso 44 dígitos, única; `valor_total Numeric(14,2)`; métricas de qualidade de extração) → `ItemNotaFiscal` (EAN, descrição original, quantidade/valores `Numeric`, categoria sugerida por IA com confidence)
- `Produto` (catálogo canônico por EAN/GTIN) + `CanonizacaoProduto` (mapeamento lógico reversível por departamento) + `HistoricoPreco` (preço pago por produto/loja/data)
- `ClassificacaoCache` (cache de classificação IA, tenant-aware), `AuditLog`, `Webhook`, `APIKey`

**Capacidade-chave — importação fiscal SEFAZ GO** (`backend/services/importador_sefaz.py`, 465 linhas, lido integralmente):
1. **3 métodos de entrada:** URL do QR Code da NFC-e (recomendado — sem CAPTCHA), HTML colado da consulta pública (contorna CAPTCHA), chave de acesso 44 dígitos (limitado em GO — sem QR Code não consulta).
2. **Estratégia de consulta** (`build_sefaz_go_query_strategy`): classifica o identificador (qrcode_url / qrcode_payload / plain_access_key), extrai a chave de acesso, monta `https://nfeweb.sefaz.go.gov.br/nfeweb/sites/nfce/danfeNFCe?p={payload url-encoded}`.
3. **Fetch resiliente** (`_fetch_url`): retry com backoff exponencial (`0.5 * 2^(n-1)`), retryable apenas em 429/502/503/504, timeout configurável (10s), User-Agent próprio, erros tipados (transporte/timeout/status).
4. **Idempotência:** checagem `nota_existe(chave_acesso)` **antes do fetch e novamente antes da persistência** → erro `NotaJaCadastradaError`.
5. **Extração em camadas:** parser determinístico CSS (`SefazGoParser`) → se falhar, fallback IA com HTML sanitizado (scripts/styles removidos, tags removidas, truncado em 20.000 chars). Mesmo no caminho determinístico, IA classifica categorias dos itens em lote.
6. **Gate de qualidade:** nota sem produtos extraídos é **bloqueada** (`ImportacaoSemProdutosError`); métricas de qualidade persistidas na nota (contagem de itens, EANs ausentes, mismatch de totais).
7. **Logs sanitizados:** chave de acesso sempre mascarada (`5226...1234`), payloads de URL redigidos — mesma filosofia da política de logging do Quantum Finance.

**Restrições do SGC (lista "não refazer" do README):** canonização, sanitização CSV/auditoria e todo o hardening do chat de auditoria (fases H9–H10T) são trabalho encerrado. Qualquer reuso de código do SGC deve preservar essas decisões.

### 4.2 Veredito de incorporação

| Caminho | Avaliação |
|---|---|
| **A. Portar a capacidade (reescrever em TS)** | ✅ **Recomendado.** Reescrever a importação NFC-e como Cloud Function do QF. Código Python não roda no Firebase; a lógica é portável. |
| B. Integração via API (SGC como serviço) | ❌ Dois deploys, dois bancos, duas auths para app pessoal; domínio institucional multi-tenant não mapeia para `users/{uid}`. |
| C. Fusão de código | ❌ Inviável — zero sobreposição de runtime. |

**Justificativa do A:** o QF já importa CSV/OFX/PDF com dedup por `importHash`; a NFC-e via QR Code é um quarto método de importação que entrega o que nenhum app pessoal tem: **despesa de supermercado quebrada por item, com categoria por produto**. O SGC fornece a especificação validada (estratégia de URL, retries, parser, gate de qualidade, mascaramento de chave) — o programador porta a **lógica**, não o código.

### 4.3 FASE NFC-1 — Importação de NFC-e via QR Code (escopo mínimo)

**Objetivo:** usuário cola a URL do QR Code da NFC-e → Cloud Function consulta a SEFAZ GO → cria **uma transação** (`saida`, total da nota) no QF, com auditoria Modelo A.

#### Arquitetura

```
[UI: ImportButton — nova aba "Cupom Fiscal (QR Code)"]
        │  httpsCallable('importNfceFromSefaz', { qrCodeUrl })
        ▼
[Cloud Function callable importNfceFromSefaz]  (southamerica-east1, Node 24, 2nd Gen)
  1. enforceAppCheck: true + consumeAppCheckToken: true  (padrão das 5 callables existentes)
  2. Validação estrita do payload (espelhar createTransactionValidation.ts)
  3. build_sefaz_go_query_strategy portado → chave_acesso + URL de consulta
  4. Idempotência: chave_acesso É a idempotency key natural
     → pre-check + escrita atômica em users/{uid}/idempotency/{chaveAcesso}
       (reusar o mecanismo da FASE 26, PR #177)
  5. fetch com retry/backoff (portar _fetch_url: 429/502/503/504, backoff 0.5*2^n, timeout 10s)
  6. Parser determinístico do HTML DANFE NFC-e (portar SefazGoParser para TS)
  7. Conversão Decimal → centavos NA FRONTEIRA (ver regra abaixo)
  8. Escrita server-side: transactions/{txId} + history/create no MESMO batch (Admin SDK)
        ▼
[Firestore: users/{uid}/transactions/{txId}]
```

#### Mapeamento de dados SGC → QF

| SGC (`NotaFiscal`) | QF (`Transaction`) | Regra |
|---|---|---|
| `valor_total: Numeric(14,2)` | `value_cents: Centavos` | **String decimal → inteiro de centavos SEM float.** Parse `"123.45"` → `12345` por manipulação de string (split no ponto, pad de 2 dígitos). **PROIBIDO** `Math.round(parseFloat(x) * 100)` — viola contrato e é bloqueado em review. |
| `data_emissao: date` | `date: 'YYYY-MM-DD'` | Direto (mesmo formato ISO). |
| `fornecedor.nome_fantasia ?? razao_social` | `description` | Ex.: `"NFC-e — Supermercado X"`. Max 500 chars (limite do validador atual). |
| `chave_acesso` (44 dígitos) | `importHash` | A chave de acesso é hash de dedup perfeito — única por nota nacional. Manter regra: `importHash` fica **só na transação**, nunca em `audit_logs`/history (contrato vivo). |
| — | `source` | **Decisão necessária:** o union atual é `'csv' \| 'ofx' \| 'pdf' \| 'manual'`. Adicionar `'nfce'` exige tocar: `transaction.ts`, `financialSchemas.ts`, `firestore.rules` (whitelist de source) e o validador da callable. Alternativa de menor toque: `source: 'pdf'` + tag `nfce` — **não recomendado** (perde semântica). Recomendação: novo source `'nfce'` com cobertura de rules. |
| `type` | `'saida'` | NFC-e de consumo é sempre despesa. |
| `category` | Categoria dominante dos itens classificados, ou `'Mercado'` como default na FASE NFC-1. |

#### Contratos invioláveis do QF que a implementação DEVE respeitar

1. **`value_cents` canônico; zero float em cálculo financeiro.** Somatório de itens em centavos inteiros. O teste de functions já tem guarda "codigo novo nao contem matematica float proibida" — a nova function será varrida por ela.
2. **Modelo A:** criação deve gravar `transactions/{txId}` + `history/create` no mesmo batch (espelhar o que `createTransaction` callable já faz). UPDATE futuro exige `_lastOpId` + history pareado.
3. **Logs sanitizados:** portar também o **mascaramento de chave** do SGC (`_mascarar_chave`: `5226...1234`). Nunca logar chave completa, URL com payload, uid, valores ou descrições. Usar o logger sanitizado de `functions/src/logger.ts` / `piiMasker.ts`.
4. **App Check:** `enforceAppCheck: true` + `consumeAppCheckToken: true`, como nas 5 callables existentes.
5. **Validação estrita de payload:** allowed-keys + forbidden-keys, como `createTransactionValidation.ts`. Payload de entrada: `{ qrCodeUrl: string }` (max ~2000 chars). Rejeitar HTML colado na FASE NFC-1 (superfície de ataque maior — adiar para fase posterior com sanitização dedicada).
6. **Rules:** se criar coleções novas (itens — fase 2), deny-all client-side write como em `idempotency/{key}`; toda mudança em `firestore.rules` exige ampliação de `npm run test:rules`.
7. **Idempotência server-side** (FASE 26): reusar `users/{uid}/idempotency/{key}` com a chave de acesso como key. Vantagem sobre UUID: retries do cliente E reenvios do mesmo cupom são deduplicados.
8. **Não instalar dependências sem autorização do owner.** O fetch pode usar `fetch` nativo do Node 24 (sem axios). O parse de HTML: avaliar regex/parser manual antes de propor `cheerio` (proposta de dependência = decisão do owner).

#### Lógica a portar do Python (referência exata)

| Função SGC (`importador_sefaz.py`) | Porta TS | Notas |
|---|---|---|
| `build_sefaz_go_query_strategy` (l.98) | `buildSefazQueryStrategy()` | Classificação qrcode_url/payload/chave; extração da chave 44 dígitos por regex `\d{44}`; URL `danfeNFCe?p={encodeURIComponent(payload)}` |
| `_fetch_url` (l.379) | `fetchSefazHtml()` | Retry 3x, backoff `0.5 * 2^(n-1)`s, retryable {429,502,503,504}, timeout 10s, User-Agent próprio |
| `_mascarar_chave` / `_redigir_chaves` (l.61–72) | `maskAccessKey()` / `redactKeys()` | Obrigatório em TODO log |
| `SefazGoParser.parse` (`services/parsers/sefaz_go.py`) | `parseDanfeNfceHtml()` | Parser determinístico do layout DANFE NFC-e GO — ler o arquivo Python antes de portar |
| Gate `ImportacaoSemProdutosError` (l.313) | — | FASE NFC-1: falhar se `valor_total` não extraído; FASE NFC-2: falhar se 0 itens |
| `classify_sefaz_html_response` (`sefaz_diagnostics.py`) | `classifySefazHtml()` | Detecta página de erro/CAPTCHA/sem conteúdo fiscal antes de tentar parse |

**Fora de escopo na FASE NFC-1** (explicitamente): fallback de extração por IA, importação por HTML colado, importação por chave sem QR Code (a própria SEFAZ GO não suporta — ver `SEFAZ_ACCESS_KEY_UNSUPPORTED_MESSAGE`), OCR de PDF, catálogo de produtos, multi-UF (só SEFAZ GO).

#### Testes exigidos (FASE NFC-1)

- **Unit (functions):** `buildSefazQueryStrategy` (URL válida, payload sem chave, chave pura → erro controlado, identificador lixo); conversão decimal→centavos (casos: `"123.45"`, `"0.01"`, `"1234567.89"`, `"10"`, `"10.5"`, vírgula brasileira `"123,45"`); parser com fixtures de HTML DANFE real (anonimizado); mascaramento de chave em logs.
- **Unit (validação):** payload allowed/forbidden keys, URL muito longa, não-string.
- **Idempotência:** segunda chamada com mesma chave retorna o mesmo `txId` sem nova escrita (espelhar os 4 testes da FASE 26).
- **Rules (`npm run test:rules`):** se `source: 'nfce'` for adicionado à whitelist.
- **Guarda float:** garantir que a suíte existente varre o arquivo novo.

#### Critérios de aceite FASE NFC-1

1. Colar URL de QR Code válida → transação `saida` criada com `value_cents` exato, `importHash = chave_acesso`, history `CREATE` no mesmo batch.
2. Colar a mesma URL de novo → mensagem "nota já importada", nenhuma escrita nova.
3. SEFAZ fora do ar → erro amigável, retry automático interno, nenhuma escrita parcial.
4. Logs de produção não contêm chave completa, payload, uid nem valores.
5. Bateria completa verde: `typecheck`, `lint`, `test --run`, `test:rules`, `build`, `npm --prefix functions test`, `npm --prefix functions run build`.

### 4.4 Fases seguintes (visão, não implementar agora)

| Fase | Escopo | Pré-requisito |
|---|---|---|
| **NFC-2** | Itens da nota: subcoleção `users/{uid}/transactions/{txId}/nfceItems/{itemId}` (deny-all client write; leitura owner-only), drawer de itens na UI (padrão `InstallmentGroupDrawer`), categoria da transação derivada da categoria dominante dos itens | NFC-1 |
| **NFC-3** | Classificação de itens por IA (reusar `categorizeTransactionsBatch` existente ou prompt dedicado; cache de classificação por descrição normalizada, inspirado em `ClassificacaoCache` — mas por uid, não por department) | NFC-2 |
| **NFC-4** | Histórico de preços pessoal por produto/EAN (inspirado em `HistoricoPreco` do SGC): "este item subiu 12% desde a última compra" — integra com `AnomalyAlerts`/`useSubscriptionAlerts` | NFC-3 |
| **NFC-5** | HTML colado (contorno de CAPTCHA) com sanitização dedicada; avaliação de outras UFs | NFC-1 |

### 4.5 Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Layout do portal SEFAZ GO muda e quebra o parser | Gate de qualidade (falha controlada, nunca dado errado); fixtures de teste com HTML real; logs sanitizados de diagnóstico (portar `summarize_sefaz_html`) |
| SEFAZ bloqueia IP do Google Cloud (egress de Cloud Function) | Validar com spike: 1 fetch real desde a function deployada ANTES de implementar o resto. Se bloquear, fallback = HTML colado (NFC-5) vira a fase 1 |
| CAPTCHA na consulta por QR Code | Método QR Code com payload completo não exige CAPTCHA (validado pelo SGC em produção); chave pura sem QR não é suportada — não prometer na UI |
| Custo Blaze (egress + invocações) | Volume pessoal é baixo; sem worker/fila necessária (diferente do SGC institucional) |
| `source: 'nfce'` esquecido em alguma whitelist | Checklist: `transaction.ts` + `financialSchemas.ts` + `firestore.rules` + validador da callable + testes de rules |

### 4.6 Ordem de execução consolidada

1. **PR hotfix** (Parte 1) — desbloqueio imediato da main. ⛔ Bloqueante
2. **PR higiene** (Parte 2) — lint verde, worktrees limpos.
3. **PR docs** (Parte 3) — CLAUDE.md refletindo #178–#207.
4. **Spike de viabilidade** — fetch real à SEFAZ GO desde Cloud Function deployada (risco nº 2). Sem código de produção.
5. **Investigação read-only** de `services/parsers/sefaz_go.py` do SGC + plano técnico curto da FASE NFC-1 → **aprovação explícita do owner** (processo permanente do projeto).
6. **FASE NFC-1** em branch própria, PR pequeno, auditoria independente, merge squash, atualizar CLAUDE.md.

---

## PARTE 5 — AUDITORIA DE CIBERSEGURANÇA (executada em 2026-06-12)

### 5.1 🔴 P0 — SGC: segredos reais commitados no histórico do git

**Achado:** o arquivo `.env` foi commitado no repositório do SGC (commit `ea0e672` — "V1: Sistema funcional...") contendo valores **reais**:
- `GEMINI_API_KEY` — formato `AIza…`, 41 caracteres (chave Google real, não placeholder)
- `DATABASE_URL` — connection string PostgreSQL de 148 caracteres (Neon, **com usuário e senha embutidos**)

O arquivo foi removido depois (commit `6653b25` — "remove local secret files"), **mas o histórico do git preserva os valores**, e o repositório tem remote no GitHub (`github.com/welitonsp/sistema-gestao-compras`). Qualquer pessoa com acesso ao repositório (ou a um fork/clone) recupera os segredos com `git show ea0e672:.env`.

**Remediação obrigatória, nesta ordem:**
1. **Rotacionar a chave Gemini** (Google AI Studio / Console GCP → revogar e gerar nova). Imediato — independe do git.
2. **Rotacionar a senha do banco Neon** (console Neon → reset password do role usado na connection string). Atualizar `.env` local e secrets de deploy.
3. Verificar a visibilidade do repositório no GitHub. Se já foi público em algum momento, **assumir os segredos como comprometidos** (a rotação dos passos 1–2 resolve).
4. Expurgar o histórico: `git filter-repo --invert-paths --path .env` + force push, e invalidar clones antigos. *Nota: a rotação (passos 1–2) é o que de fato neutraliza o vazamento; o expurgo é higiene complementar.*
5. Habilitar **GitHub Secret Scanning + Push Protection** no repositório para impedir reincidência.

**Não é vazamento (verificado):** `k8s/config-secrets.yaml` está rastreado mas contém apenas placeholders (`base64_encoded_...`). Recomendação: renomear para `config-secrets.example.yaml` para evitar que alguém preencha valores reais e commite por engano.

### 5.2 🔴 P1 — Quantum Finance: dependências com vulnerabilidades conhecidas

`npm audit --omit=dev` (somente produção):

| Pacote | Severidade | Vulnerabilidade | Origem |
|---|---|---|---|
| `protobufjs` | **Crítica** | Execução arbitrária de código / code injection via `toObject` | Transitiva do SDK Firebase (frontend e functions) |
| `@grpc/grpc-js` | Alta | Crash de cliente/servidor via mensagem malformada | Transitiva (Firestore gRPC) |
| `undici` | Alta | Valores insuficientemente aleatórios + exaustão de recursos via descompressão | Transitiva (`@firebase/storage`, `firebase-admin`) |

Total: **13 vulnerabilidades no frontend** (10 moderate, 2 high, 1 critical) e **17 nas functions** (1 low, 13 moderate, 2 high, 1 critical).

**Remediação:** os PRs do Dependabot (#165–#170, já na main) cobrem parte; rodar `npm audit fix` em ambos os `package.json` e subir as majors do SDK Firebase se necessário. **Regra do projeto: alteração de `package.json`/`package-lock.json` exige autorização do owner** — abrir PR dedicado `chore(deps): fix npm audit criticals` com o diff de lockfile para revisão.

### 5.3 🟡 P2 — Quantum Finance: headers de segurança só cobrem Firebase Hosting

`firebase.json` define um conjunto correto de headers (HSTS 1 ano, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, CSP) — **mas o fluxo documentado de deploy é a Vercel** (`docs/FLUXO DE PROCESSO INICIO E FIM.txt`), e **não existe `vercel.json`**. Se a produção real é Vercel, os usuários navegam **sem nenhum desses headers**.

**Ações:**
1. Confirmar com o owner qual é o host de produção real (Vercel, Firebase Hosting ou ambos).
2. Se Vercel: criar `vercel.json` com o mesmo bloco de headers do `firebase.json`.
3. Endurecer a CSP nos dois: o `script-src` atual inclui `'unsafe-inline'`, o que enfraquece a proteção anti-XSS. Avaliar migração para nonces/hashes (o Vite suporta build sem inline scripts).

### 5.4 🟡 P2 — SGC: login sem rate limiting

`backend/api/v1/auth.py` é bem construído — mitigação de timing attack com hash dummy, cookie `HttpOnly` + `SameSite=Lax` + `Secure` (padrão BFF), JWT HS256 com expiração de 30 min — **mas não há proteção contra força bruta** no `/auth/login`: um atacante pode tentar senhas ilimitadamente.

**Remediação:** rate limiting por IP/username (ex.: `slowapi` no FastAPI, ou limite no reverse proxy/ingress k8s) + lockout progressivo ou CAPTCHA após N falhas.

### 5.5 🟢 Verificado e aprovado (sem ação)

**Quantum Finance:**
- ✅ Nenhum `.env` jamais commitado (histórico verificado); `.gitignore` cobre `.env`/`.env.*` com exceção apenas do `.example`.
- ✅ Nenhuma chave sensível no bundle do cliente: variáveis `VITE_` são só config pública do Firebase, site key do reCAPTCHA (pública por design) e flags de emulador; token de debug do App Check só em `import.meta.env.DEV`.
- ✅ Chave Gemini **no Secret Manager** (`defineSecret('GEMINI_API_KEY')` em `functions/src/index.ts:35`) — a pendência histórica "mover chave Gemini para backend" está resolvida.
- ✅ App Check `enforceAppCheck: true` + `consumeAppCheckToken: true` (replay protection) em todas as callables.
- ✅ Firestore Rules: deny-all catch-all, Modelo A com `existsAfter`, whitelists de campos, testadas em emulador (`npm run test:rules`).
- ✅ Validação server-side estrita de payload (allowed/forbidden keys) + idempotência server-side.
- ✅ Zero superfície XSS óbvia: nenhum `dangerouslySetInnerHTML`, `innerHTML`, `eval` ou `new Function` em `src/`.
- ✅ Política de logs sanitizados com guarda automatizada no CI (`consoleLoggingPolicy.test.ts`).
- ℹ️ `storage.rules` não existe — verificar no console se o Firebase Storage está **desabilitado** no projeto; se estiver habilitado com rules default, é exposição. Se não usa Storage, nenhuma ação.

**SGC:**
- ✅ `config.py` exemplar: `SecretStr`, segredos obrigatórios fail-fast (sem default inseguro para `SECRET_KEY`/`DATABASE_URL`), `debug=False` default, CORS default vazio (fail-closed).
- ✅ Senhas com bcrypt; redação central de `AuditLog` (allow-list); sanitização de chaves fiscais/CNPJ nos logs; chat de auditoria com SQL allow-list, `LIMIT 50` forçado, RBAC e saída sanitizada (H10A–H10T).

### 5.6 ⚠️ Implicação de segurança para a FASE NFC-1 (adendo à Parte 4)

**Risco de SSRF (Server-Side Request Forgery):** a nova callable receberá uma URL do usuário e fará fetch server-side. Se a function buscar a URL fornecida diretamente, um atacante pode forçá-la a acessar endpoints internos (metadata server do GCP `169.254.169.254`, serviços internos, etc.).

**Mitigação obrigatória (o SGC já faz isso — portar o padrão):** **nunca fazer fetch da URL fornecida pelo usuário.** Extrair apenas o *payload* do QR Code do input (`build_sefaz_go_query_strategy`), validar formato (chave 44 dígitos + estrutura `|`), e **reconstruir a URL canônica** sobre o host fixo hardcoded `nfeweb.sefaz.go.gov.br`. A URL do usuário é tratada como dado, não como destino. Incluir teste negativo: input com host malicioso → erro de validação, zero requisições de rede.

---

*Relatório gerado a partir de auditoria executada em 2026-06-12: typecheck ✅, lint ❌ (artefato local), 1034 testes unitários ✅, build ✅, 128 testes de functions ✅, `npm audit` frontend+functions, varredura de segredos (working tree + histórico git dos dois repositórios), revisão de headers/CSP, superfície XSS, App Check, Firestore Rules e autenticação do SGC. Leitura do SGC: README, ROADMAP, modelos ORM, importador SEFAZ (integral), config, auth, guia de importação, estrutura de testes e frontend.*
