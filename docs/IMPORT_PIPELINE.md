# Pipeline de Importação Híbrida

> **Versão do documento:** 1.0.0 | **Data:** 2026-04-22  
> **Owners:** `src/features/transactions/ImportButton.tsx` · `src/shared/lib/workers/parserWorker.ts` · `src/utils/aiCategorize.ts`

---

## 📖 Resumo

O módulo de importação converte extratos financeiros brutos (faturas de cartão, extratos bancários) em transações estruturadas, categorizadas e sincronizadas com o Firestore — sem que o utilizador precise digitar nenhum dado manualmente.

O fluxo é executado quase inteiramente **no browser** (Web Worker + `pdfjs-dist`). Apenas a etapa de categorização por IA sai para a nuvem, via Cloud Function protegida, garantindo que a chave de API do Gemini nunca é exposta ao cliente.

---

## 🎯 Escopo & Problema

### Problema

O input manual de transações é lento, propenso a erros e abandonado por ≥ 80% dos utilizadores após 2 semanas. Bancos brasileiros exportam dados em formatos heterogéneos (CSV com separadores variáveis, OFX proprietário, PDF de fatura) sem nenhuma padronização de colunas ou encoding.

### Escopo deste módulo

| Responsabilidade | In Scope | Out of Scope |
|---|:---:|:---:|
| Parsing de CSV, OFX, PDF | ✅ | |
| Deduplicação contra transações existentes | ✅ | |
| Categorização automática (dicionário local + IA) | ✅ | |
| Reconciliação manual de conflitos | ✅ | |
| Sincronização com Firestore via fila LWW | ✅ | |
| OCR de imagens de comprovantes | | ❌ |
| Integração direta com Open Finance / Plaid | | ❌ |
| Importação de múltiplos ficheiros simultaneamente | | ❌ |

---

## 🛠️ Implementação & Solução

### Máquina de Estados

O componente `ImportButton` implementa uma máquina de estados explícita que governa toda a UX:

```
idle
  │  (utilizador faz upload)
  ▼
parsing  ──── COLUMNS_NOT_FOUND ──▶  col_mapping
  │                                        │
  │                              (utilizador mapeia manualmente)
  │◀───────────────────────────────────────┘
  │  (parse bem-sucedido)
  ▼
ai_processing
  │  (batch Gemini concluído)
  ▼
reconciliation  (portal React, fora do modal principal)
  │  (utilizador confirma ou resolve conflitos)
  ▼
importing
  │  (addBatch → fila LWW → Firestore)
  ▼
success ──── (auto-close após 3s) ──▶  idle

  ► error: qualquer etapa pode transitar para error, com botão "Tentar Novamente"
```

### Diagrama de Fluxo Completo

```
┌──────────────┐    ArrayBuffer    ┌──────────────────────┐
│  ImportButton │ ───────────────▶ │   parserWorker.ts    │
│  (main thread)│ ◀─────────────── │   (Web Worker)       │
└──────┬───────┘  ParsedTx[]      └──────────────────────┘
       │                               │ CSV  │ OFX  │ PDF
       │                               ▼      ▼      ▼
       │                          parseCSV  parseOFX  parsePDF
       │                          (pdfjs-dist para PDF)
       │
       │  1. Deduplicação local
       │     hash = `${date}-${Math.round(value*100)}-${desc.slice(0,12)}`
       │
       │  2. Dicionário local (O(n) lookup, zero latência)
       │     "IFOOD" → Alimentação, "NETFLIX" → Assinaturas ...
       │
       │  3. Transações sem match → forAI[]
       │
       ▼
┌─────────────────────┐   1 request/arquivo   ┌──────────────────────┐
│  batchCategorize    │ ─────────────────────▶ │  Cloud Function      │
│  Descriptions()     │ ◀───────────────────── │  chatWithQuantumAI   │
│  aiCategorize.ts    │  Record<desc, cat>     │  (Gemini Pro)        │
└──────┬──────────────┘                        └──────────────────────┘
       │
       │  Marca tx._aiCategorized = true
       │
       ▼
┌─────────────────────┐
│ ReconciliationEngine│  (React Portal — renderiza em document.body)
│  Diff view, edição  │
│  de categoria, etc. │
└──────┬──────────────┘
       │  (utilizador confirma seleção)
       ▼
┌─────────────────────┐
│  useTransactions    │
│  .addBatch()        │  → optimistic UI (tempId) + fila LWW → Firestore
└─────────────────────┘
```

### Componentes e Arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/features/transactions/ImportButton.tsx` | Orquestrador principal: máquina de estados, deduplicação, dicionário local, cola os parsers e a IA |
| `src/shared/lib/workers/parserWorker.ts` | Web Worker: parsers de CSV, OFX e PDF isolados do main thread |
| `src/shared/lib/useParserWorker.ts` | Hook React: interface Promise-based para o Worker via `postMessage` / `onmessage` |
| `src/shared/lib/pdfParser.ts` | Parser PDF standalone (usado também fora do Worker quando necessário) |
| `src/utils/aiCategorize.ts` | Batch categorization: extrai descrições únicas, chama GeminiService, devolve mapa desc→cat |
| `src/features/transactions/ReconciliationEngine.tsx` | UI de reconciliação: diff card, edição inline, badge `IA` nos itens categorizados |
| `src/shared/schemas/financialSchemas.ts` | Zod schema de validação + helpers `toCentavos` / `fromCentavos` |

---

## 🧠 Conceitos Críticos

### `transactionDate` vs. `billingPeriod`

Este é o ponto que mais causa confusão em PDFs de cartão de crédito. É essencial entendê-lo antes de qualquer modificação no parser.

| Conceito | Definição | Campo na interface | Fonte no PDF |
|---|---|---|---|
| **`transactionDate`** | Data em que a compra foi realizada (data do lançamento no extrato) | `date: "YYYY-MM-DD"` | Linha de cada transação, ex: `15/01` |
| **`billingPeriod`** | Mês de competência da fatura (mês de vencimento do cartão) | **Não existe como campo** — usado apenas internamente pelo parser | Cabeçalho da fatura, ex: `Vencimento: 10/02/2026` |

#### Por que isso importa?

Faturas de cartão frequentemente contêm transações de **dezembro** em uma fatura de **janeiro** (compras do fim de ano que fecham no ciclo seguinte) — e vice-versa. Se o parser assumir que o ano da compra é sempre o ano da fatura, erra.

O PDF parser resolve isso com a seguinte lógica de "year crossing":

```typescript
// Extraído de parserWorker.ts → parsePDFBuffer()
const vencimentoMatch = firstPageText.match(/Vencimento:\s*\d{2}\/(\d{2})\/(\d{4})/i);
if (vencimentoMatch) {
  faturaMonth = parseInt(vencimentoMatch[1], 10);  // mês da fatura
  faturaYear  = parseInt(vencimentoMatch[2], 10);  // ano  da fatura
}

// Para cada linha de transação (ex: "15/12"):
let ano = faturaYear;
// Transação em dezembro mas fatura em janeiro → compra do ano anterior
if (dParts[1] === '12' && faturaMonth <= 3) ano = faturaYear - 1;
// Transação em janeiro mas fatura em novembro → compra do próximo ano
if (dParts[1] === '01' && faturaMonth >= 11) ano = faturaYear + 1;

// `date` final sempre reflete a data REAL da compra
date = `${ano}-${dParts[1].padStart(2, '0')}-${dParts[0].padStart(2, '0')}`;
```

> **Regra:** `date` na interface é sempre a **data da compra**. O `billingPeriod` é um artefato interno do parser, nunca persiste no Firestore.

### Deduplicação

O algoritmo de deduplicação usa um hash triplo para tolerar pequenas variações de formatação vindas de bancos diferentes:

```typescript
// ImportButton.tsx → deduplicate()
const hash = `${date.substring(0,10)}-${Math.round(value * 100)}-${desc.substring(0,12).toLowerCase().trim()}`;
```

Dois hashes são gerados por transação existente (com valor em centavos e valor arredondado) para absorver diferenças de ponto flutuante entre exportações.

### Categorização em Duas Camadas

```
Transação nova
      │
      ▼
┌─────────────────┐   match?   ┌──────────────────────┐
│ Dicionário local │ ─── Sim ──▶│ category = "Alimenta" │
│ (28 keywords)   │            │  (sem custo de API)   │
└────────┬────────┘            └──────────────────────┘
         │ Não (type === 'saida' ou 'despesa')
         ▼
┌─────────────────┐
│ forAI[]         │  acumula até ter todas as txs do arquivo
└────────┬────────┘
         │ (1 única chamada por arquivo)
         ▼
┌──────────────────────────────────────────────────────┐
│  batchCategorizeDescriptions(uniqueDescs)            │
│  → GeminiService.categorizeTransactionsBatch(        │
│      pseudoTxs: [{ id: desc, description: desc }]    │  
│    )                                                 │
│  → Record<description, category>                    │
└──────────────────────────────────────────────────────┘
```

**Regra inviolável:** Exatamente **1 request à Cloud Function por importação de arquivo**, independentemente do número de transações. A deduplicação de descrições é feita com `new Set()` antes do envio.

---

## 📦 Dependências

Dependências relevantes para o pipeline de importação (extraídas de `package.json`):

| Pacote | Versão | Papel |
|---|---|---|
| `pdfjs-dist` | `^5.6.205` | Extração de texto de PDFs no Web Worker e no main thread |
| `firebase` | `^10.8.0` | Firestore SDK para persistência das transações |
| `zod` | `^4.3.6` | Validação de schema das transações (`transactionSchema`) |
| `decimal.js` | `^10.6.0` | Aritmética de ponto flutuante segura (`toCentavos`, `fromCentavos`) |
| `typescript` | `^6.0.3` | Tipagem estática end-to-end do contrato de dados |
| `framer-motion` | `^12.38.0` | Animações da máquina de estados (step bar, transições de painel) |
| `react-hot-toast` | `^2.6.0` | Notificações de sucesso/erro/duplicado |

> **Nota de segurança:** A chave de API do Gemini nunca é enviada pelo cliente. `GeminiService` chama a Cloud Function `chatWithQuantumAI`, que executa a chamada ao Gemini no servidor.

---

## ✅ Critérios de Sucesso

Um import é considerado **bem-sucedido** quando todos os seguintes critérios são atendidos:

### Critérios Funcionais

| # | Critério | Como verificar |
|---|---|---|
| F1 | **Integridade de valor:** A soma dos `value` de todas as transações importadas deve bater com o total impresso na fatura/extrato | Comparar `SuccessPanel.stats.total` com soma calculada na `PreviewPanel` |
| F2 | **Zero duplicatas:** Nenhuma transação já existente no Firestore é reinserida | `stats.duplicates > 0` aciona o toast `"Todos os registos já existem"` |
| F3 | **1 request de IA por arquivo:** O `batchCategorizeDescriptions` é chamado no máximo uma vez por `processFile()` | Verificar no Network tab: apenas 1 chamada a `chatWithQuantumAI` |
| F4 | **Datas corretas em PDFs:** Transações de dezembro numa fatura de janeiro devem ter `year = faturaYear - 1` | Inspecionar o campo `date` nas transações extraídas de faturas com year-crossing |
| F5 | **Deduplicação cross-encoding:** O mesmo lançamento exportado em CSV e em OFX não gera duplicata | Hash triplo `date-centavos-desc12` coincide nos dois formatos |
| F6 | **Categorias válidas:** Toda transação importada tem `category` pertencente a `ALLOWED_CATEGORIES` ou `'Importado'` | Sem erros de validação Zod no `transactionSchema` |

### Critérios de Performance

| # | Critério | Target |
|---|---|---|
| P1 | Parsing de CSV/OFX (500 linhas) concluído sem bloquear UI | < 200 ms (Web Worker) |
| P2 | Parsing de PDF (12 páginas) concluído sem bloquear UI | < 2 s (Web Worker + pdfjs) |
| P3 | Batch AI (50 descrições únicas) respondido | < 4 s (Cloud Function cold start incluso) |
| P4 | `addBatch` com 200 transações não bloqueia UI | < 100 ms (optimistic update imediato) |

---

## 💡 Exemplo de Saída — Contrato JSON

Este é o formato exato da interface `ParsedTransaction` que o parser entrega à `ReconciliationEngine` e, subsequentemente, ao `addBatch` do `useTransactions`.

```typescript
// Definição TypeScript (src/features/transactions/ImportButton.tsx)
interface ParsedTransaction extends Omit<Transaction, 'id'> {
  id:              string;   // UUID gerado pelo parser
  _selected?:      boolean;  // UI-only: seleção na PreviewPanel (stripped antes do sync)
  _aiCategorized?: boolean;  // UI-only: exibe badge "IA" na ReconciliationEngine (stripped antes do sync)
}
```

### Exemplo: transação de cartão (PDF)

```json
{
  "id":             "3f7a1c2e-8b4d-4e9f-a012-bc3456789def",
  "date":           "2026-01-15",
  "description":    "IFOOD*RESTAURANTE SABOR",
  "value":          47.90,
  "type":           "saida",
  "category":       "Alimentação",
  "source":         "pdf",
  "account":        "cartao_credito",
  "_aiCategorized": false
}
```

### Exemplo: transação de extrato (OFX)

```json
{
  "id":             "20260310001234",
  "fitId":          "20260310001234",
  "date":           "2026-03-10",
  "description":    "PIX RECEBIDO CLIENTE XYZ",
  "value":          1500.00,
  "type":           "receita",
  "category":       "Freelance",
  "source":         "ofx",
  "_aiCategorized": true
}
```

### Exemplo: transação de CSV com mapeamento manual

```json
{
  "id":             "a9b2c3d4-1111-2222-3333-444455556666",
  "date":           "2026-02-28",
  "description":    "DROGASIL FARMACIA 0242",
  "value":          89.50,
  "type":           "saida",
  "category":       "Saúde",
  "source":         "csv",
  "_aiCategorized": false
}
```

### Campos e invariantes

| Campo | Tipo | Invariante |
|---|---|---|
| `id` | `string` | UUID v4 (crypto.randomUUID) para CSV/PDF; `fitId` para OFX quando disponível |
| `date` | `string` | Sempre `YYYY-MM-DD`. Nunca contém a data de vencimento da fatura — sempre a data da compra |
| `description` | `string` | Truncada a 50 chars no PDF; sem truncagem em CSV/OFX |
| `value` | `number` | Sempre positivo, em reais (float). A conversão para centavos ocorre no `addBatch` via `toCentavos()` |
| `type` | `'entrada' \| 'saida' \| 'receita' \| 'despesa'` | Em PDFs de cartão: `saida` para débitos, `entrada` para estornos (lógica invertida em relação ao extrato bancário) |
| `category` | `AllowedCategory \| 'Importado'` | `'Importado'` é o fallback do PDF parser quando a IA não responde |
| `source` | `'csv' \| 'ofx' \| 'pdf'` | Rastreabilidade de origem para auditoria |
| `fitId` | `string \| null` | Exclusivo de OFX. Usado como `id` e para deduplicação nativa do formato |
| `_aiCategorized` | `boolean` | `true` apenas quando a IA (não o dicionário local) definiu a categoria. Stripped antes do Firestore |
| `_selected` | `boolean` | Estado UI da `PreviewPanel`. Stripped antes do Firestore |

> **Campos NOT presentes na saída:** `uid`, `createdAt`, `updatedAt` são injetados pelo `addBatch` durante a gravação no Firestore, nunca pelo parser.

---

## 🚀 Evolução Planejada

### Curto prazo (próximos 2 sprints)

| Item | Descrição | Impacto |
|---|---|---|
| **Suporte a XLSX** | Adicionar parser de Excel no Worker via `SheetJS` | Cobre exportações do Nubank Web e bancos corporativos |
| **Memória de categorias do utilizador** | Aprender com edições manuais na `ReconciliationEngine` e atualizar o dicionário local persistido no Firestore (`UserCategory`) | Reduz chamadas à IA progressivamente |
| **Progresso de parsing em tempo real** | Web Worker emitir mensagens de progresso (`{ page, totalPages }`) para o main thread exibir uma progress bar no PDF | Melhora UX em PDFs longos (> 30 páginas) |

### Médio prazo

| Item | Descrição | Impacto |
|---|---|---|
| **Refinamento do prompt de categorização** | Incluir contexto do utilizador (categorias mais usadas, histórico de palavras-chave) no prompt do Gemini | Acurácia da IA sobe de ~75% para ~90% estimado |
| **Importação em lote (múltiplos ficheiros)** | Fila de processamento com `Promise.allSettled`, exibindo progresso global | Permite importar 12 faturas de uma vez no onboarding |
| **Parser de PDF estruturado (OFD/CNAB240)** | Suporte a formatos bancários estruturados (CNAB 240/400) usados por bancos corporativos | Elimina necessidade de regex para extratos Bradesco/Itaú empresarial |
| **Validação pós-import com Zod** | Passar cada `ParsedTransaction` pelo `transactionSchema` antes de entregar à `ReconciliationEngine` | Captura erros de parsing silenciosos antes de chegarem ao Firestore |

### Longo prazo

| Item | Descrição |
|---|---|
| **Open Finance / Plaid integration** | Substituir o pipeline de parsing por conexão direta via API bancária, mantendo a camada de IA e Reconciliation |
| **Multi-moeda** | Estender `value` para suportar `{ amount, currency, brlEquivalent }` para faturas internacionais |

---

## 🔐 Segurança

| Vetor | Mitigação |
|---|---|
| Chave de API do Gemini exposta no cliente | API key exclusivamente no servidor (Cloud Function). O cliente envia apenas texto e recebe categorias |
| Arquivo malicioso via upload | `pdfjs-dist` roda em Web Worker isolado; falhas de parsing são capturadas e nunca crasham o main thread |
| Injeção via descrição de transação | Descrições são sanitizadas (trim, substring 50 chars) antes de serem enviadas à IA. O prompt usa delimitadores estruturados |
| PII em logs de debug | `src/shared/lib/piiMasker.ts` disponível para mascarar dados sensíveis antes de qualquer `console.log` em produção |

---

*Documento gerado com base em análise direta dos ficheiros de código-fonte. Qualquer discrepância com o comportamento em produção deve ser reportada e este documento atualizado.*
