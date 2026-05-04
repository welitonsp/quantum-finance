// src/features/transactions/ImportButton.tsx
// Fluxo de estados: idle → parsing → [col_mapping] → ai_processing → preview → importing → success | error | reconciliation
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  UploadCloud, Loader2, AlertTriangle, CheckCircle2,
  X, FileUp, BrainCircuit, ChevronDown, ArrowRight,
  CheckSquare, Square, RotateCcw, Zap,
} from 'lucide-react';
import toast from 'react-hot-toast';

import { useParserWorker } from '../../shared/lib/useParserWorker';
import { batchCategorizeDescriptions } from '../../utils/aiCategorize';
import { ALLOWED_CATEGORIES, transactionCreateSchema } from '../../shared/schemas/financialSchemas';
import { CATEGORY_KEYWORDS } from '../../shared/data/categoryKeywords';
import { useCategories } from '../../hooks/useCategories';
import type { UserCategory } from '../../shared/schemas/categorySchemas';
import ReconciliationEngine from './ReconciliationEngine';
import type { Transaction } from '../../shared/types/transaction';
import type { AllowedCategory } from '../../shared/schemas/financialSchemas';
import { getTransactionAbsCentavos, isIncome, isExpense } from '../../utils/transactionUtils';
import { fromCentavos, toCentavos, type Centavos } from '../../shared/types/money';
import { FirestoreService } from '../../shared/services/FirestoreService';
import { AuditService } from '../../shared/services/AuditService';
import { formatCurrency } from '../../utils/formatters';
import { findImportCandidateTransactions } from './importCandidateSearch';

// ─── Types ────────────────────────────────────────────────────────────────────
type ImportStatus =
  | 'idle' | 'parsing' | 'col_mapping' | 'ai_processing'
  | 'preview' | 'importing' | 'success' | 'error' | 'reconciliation'
  | 'password_required';

type CrossPageStatus = 'idle' | 'loading' | 'success' | 'skipped' | 'failed';

interface ParsedTransaction extends Omit<Transaction, 'id'> {
  id:              string;
  _selected?:      boolean;
  _aiCategorized?: boolean;
  _reconciled?:    boolean;
  _mergedWith?:    string;
}

interface ColMapState {
  headers:     string[];
  previewRows: string[][];
  autoMap:     { dateIdx: number; descIdx: number; valueIdx: number };
  file:        File;
}

interface ImportStats {
  total:          number;
  added:          number;
  duplicates:     number;
  importable:     number;
  reconciled:     number;
  invalid:        number;
  source:         'CSV' | 'OFX' | 'PDF' | 'Desconhecido';
  fileName:       string;
  periodStart:    string | null;
  periodEnd:      string | null;
  totalInCents:   number;
  totalOutCents:  number;
  netCents:       number;
}

interface ImportResult {
  added?:      number;
  duplicates?: number;
}

interface ColumnMapping {
  dateIdx:  number;
  descIdx:  number;
  valueIdx: number;
}

const COLUMN_MAPPING_KEYS = ['dateIdx', 'descIdx', 'valueIdx'] as const;
type ColumnMappingField = typeof COLUMN_MAPPING_KEYS[number];
type ColumnMappingDraft = Record<ColumnMappingField, number | ''>;
type BankMappingTemplateId =
  | 'nubank'
  | 'inter'
  | 'itau'
  | 'bradesco'
  | 'banco-do-brasil'
  | 'caixa'
  | 'santander'
  | 'c6'
  | 'mercado-pago'
  | 'picpay'
  | 'generic-br';

interface BankColumnAliases {
  dateIdx:         string[];
  descIdx:         string[];
  valueIdx:        string[];
  debitValueIdx:   string[];
  creditValueIdx:  string[];
}

interface BankMappingTemplate {
  id:      BankMappingTemplateId;
  label:   string;
  aliases: BankColumnAliases;
}

type ColumnMappingSuggestionId = 'auto' | BankMappingTemplateId;

const COMMON_COLUMN_ALIASES: BankColumnAliases = {
  dateIdx: [
    'data', 'date', 'dt', 'data lançamento', 'data lancamento',
    'lançamento data', 'lancamento data', 'data movimento', 'data mov',
    'data operação', 'data operacao', 'data transação', 'data transacao',
    'data de lançamento', 'data do lançamento', 'data da transação',
    'posted date',
  ],
  descIdx: [
    'descrição', 'descricao', 'histórico', 'historico', 'lançamento',
    'lancamento', 'detalhes', 'estabelecimento', 'title', 'memo',
    'description', 'descrição da transação', 'descricao da transacao',
    'descrição lançamento', 'descricao lancamento', 'complemento', 'nome',
    'identificador',
  ],
  valueIdx: [
    'valor', 'amount', 'value', 'quantia', 'total', 'montante',
    'valor lançamento', 'valor lancamento', 'valor transação',
    'valor transacao', 'valor da transação', 'valor movimentação',
    'valor movimentacao', 'valor r$', 'valor centavos',
    'valor em centavos', 'value cents', 'value_cents', 'amount cents',
    'amount_cents', 'centavos', 'vlr',
  ],
  debitValueIdx: [
    'débito', 'debito', 'saída', 'saida', 'saídas', 'saidas', 'debit',
    'valor débito', 'valor debito', 'valor saída', 'valor saida', 'despesa',
  ],
  creditValueIdx: [
    'crédito', 'credito', 'entrada', 'entradas', 'credit', 'valor crédito',
    'valor credito', 'valor entrada', 'receita',
  ],
};

function uniqueAliases(aliases: string[]): string[] {
  return Array.from(new Set(aliases));
}

function withCommonColumnAliases(overrides: Partial<BankColumnAliases> = {}): BankColumnAliases {
  return {
    dateIdx:        uniqueAliases([...COMMON_COLUMN_ALIASES.dateIdx,        ...(overrides.dateIdx        ?? [])]),
    descIdx:        uniqueAliases([...COMMON_COLUMN_ALIASES.descIdx,        ...(overrides.descIdx        ?? [])]),
    valueIdx:       uniqueAliases([...COMMON_COLUMN_ALIASES.valueIdx,       ...(overrides.valueIdx       ?? [])]),
    debitValueIdx:  uniqueAliases([...COMMON_COLUMN_ALIASES.debitValueIdx,  ...(overrides.debitValueIdx  ?? [])]),
    creditValueIdx: uniqueAliases([...COMMON_COLUMN_ALIASES.creditValueIdx, ...(overrides.creditValueIdx ?? [])]),
  };
}

const BANK_MAPPING_TEMPLATES: BankMappingTemplate[] = [
  {
    id: 'nubank',
    label: 'Nubank',
    aliases: withCommonColumnAliases({
      dateIdx:  ['data', 'date', 'data da compra'],
      descIdx:  ['title', 'descrição', 'descricao', 'estabelecimento', 'identificador'],
      valueIdx: ['amount', 'valor'],
    }),
  },
  {
    id: 'inter',
    label: 'Inter',
    aliases: withCommonColumnAliases({
      dateIdx:        ['data lançamento', 'data lancamento', 'data movimento'],
      descIdx:        ['histórico', 'historico', 'descrição', 'descricao'],
      valueIdx:       ['valor'],
      debitValueIdx:  ['débito', 'debito', 'saída', 'saida'],
      creditValueIdx: ['crédito', 'credito', 'entrada'],
    }),
  },
  {
    id: 'itau',
    label: 'Itaú',
    aliases: withCommonColumnAliases({
      dateIdx:  ['data', 'data lançamento', 'data lancamento'],
      descIdx:  ['lançamento', 'lancamento', 'histórico', 'historico'],
      valueIdx: ['valor', 'valor lançamento', 'valor lancamento'],
    }),
  },
  {
    id: 'bradesco',
    label: 'Bradesco',
    aliases: withCommonColumnAliases({
      dateIdx:        ['data', 'data lançamento', 'data lancamento'],
      descIdx:        ['histórico', 'historico', 'descrição', 'descricao', 'documento'],
      valueIdx:       ['valor'],
      debitValueIdx:  ['débito', 'debito'],
      creditValueIdx: ['crédito', 'credito'],
    }),
  },
  {
    id: 'banco-do-brasil',
    label: 'Banco do Brasil',
    aliases: withCommonColumnAliases({
      dateIdx:  ['data', 'data movimento'],
      descIdx:  ['histórico', 'historico', 'lançamento', 'lancamento', 'documento'],
      valueIdx: ['valor', 'valor r$'],
    }),
  },
  {
    id: 'caixa',
    label: 'Caixa',
    aliases: withCommonColumnAliases({
      dateIdx:        ['data mov', 'data movimento', 'data'],
      descIdx:        ['histórico', 'historico', 'descrição', 'descricao', 'nr doc'],
      valueIdx:       ['valor'],
      debitValueIdx:  ['débito', 'debito'],
      creditValueIdx: ['crédito', 'credito'],
    }),
  },
  {
    id: 'santander',
    label: 'Santander',
    aliases: withCommonColumnAliases({
      dateIdx:  ['data', 'data transação', 'data transacao'],
      descIdx:  ['descrição', 'descricao', 'histórico', 'historico'],
      valueIdx: ['valor', 'valor transação', 'valor transacao'],
    }),
  },
  {
    id: 'c6',
    label: 'C6',
    aliases: withCommonColumnAliases({
      dateIdx:  ['data', 'data movimentação', 'data movimentacao'],
      descIdx:  ['descrição', 'descricao', 'nome', 'detalhes'],
      valueIdx: ['valor', 'amount'],
    }),
  },
  {
    id: 'mercado-pago',
    label: 'Mercado Pago',
    aliases: withCommonColumnAliases({
      dateIdx:  ['data de criação', 'data de criacao', 'data aprovação', 'data aprovacao'],
      descIdx:  ['descrição', 'descricao', 'operação', 'operacao', 'detalhes'],
      valueIdx: ['valor da transação', 'valor da transacao', 'valor líquido', 'valor liquido'],
    }),
  },
  {
    id: 'picpay',
    label: 'PicPay',
    aliases: withCommonColumnAliases({
      dateIdx:        ['data da transação', 'data da transacao', 'data'],
      descIdx:        ['descrição', 'descricao', 'detalhes', 'nome'],
      valueIdx:       ['valor'],
      debitValueIdx:  ['saída', 'saida'],
      creditValueIdx: ['entrada'],
    }),
  },
  {
    id: 'generic-br',
    label: 'Genérico CSV BR',
    aliases: withCommonColumnAliases(),
  },
];

const COLUMN_MAPPING_SUGGESTION_OPTIONS: Array<{ id: ColumnMappingSuggestionId; label: string }> = [
  { id: 'auto', label: 'Detectar automaticamente' },
  ...BANK_MAPPING_TEMPLATES.map(({ id, label }) => ({ id, label })),
];

const AUTO_COLUMN_ALIASES: BankColumnAliases = {
  dateIdx:        uniqueAliases(BANK_MAPPING_TEMPLATES.flatMap(template => template.aliases.dateIdx)),
  descIdx:        uniqueAliases(BANK_MAPPING_TEMPLATES.flatMap(template => template.aliases.descIdx)),
  valueIdx:       uniqueAliases(BANK_MAPPING_TEMPLATES.flatMap(template => template.aliases.valueIdx)),
  debitValueIdx:  uniqueAliases(BANK_MAPPING_TEMPLATES.flatMap(template => template.aliases.debitValueIdx)),
  creditValueIdx: uniqueAliases(BANK_MAPPING_TEMPLATES.flatMap(template => template.aliases.creditValueIdx)),
};

function normalizeColumnHeader(header: string): string {
  return header
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function headerMatchesAlias(normalizedHeader: string, normalizedAlias: string): boolean {
  if (!normalizedHeader || !normalizedAlias) return false;
  if (normalizedHeader === normalizedAlias) return true;

  const headerTokens = normalizedHeader.split(' ');
  if (normalizedAlias.length <= 3) return headerTokens.includes(normalizedAlias);

  const compactHeader = normalizedHeader.replace(/\s+/g, '');
  const compactAlias = normalizedAlias.replace(/\s+/g, '');
  return (
    normalizedHeader.startsWith(`${normalizedAlias} `) ||
    normalizedHeader.endsWith(` ${normalizedAlias}`) ||
    normalizedHeader.includes(` ${normalizedAlias} `) ||
    compactHeader === compactAlias ||
    compactHeader.startsWith(compactAlias) ||
    compactHeader.includes(compactAlias)
  );
}

function findHeaderIndex(headers: string[], aliases: string[], usedIndexes: Set<number>): number | undefined {
  const normalizedHeaders = headers.map((header, index) => ({
    index,
    normalized: normalizeColumnHeader(header),
  }));
  const normalizedAliases = uniqueAliases(aliases.map(normalizeColumnHeader).filter(Boolean));

  for (const alias of normalizedAliases) {
    const exact = normalizedHeaders.find(({ index, normalized }) =>
      !usedIndexes.has(index) && normalized === alias
    );
    if (exact) return exact.index;
  }

  for (const alias of normalizedAliases) {
    const partial = normalizedHeaders.find(({ index, normalized }) =>
      !usedIndexes.has(index) && headerMatchesAlias(normalized, alias)
    );
    if (partial) return partial.index;
  }

  return undefined;
}

function findValueHeaderIndex(headers: string[], aliases: BankColumnAliases, usedIndexes: Set<number>): number | undefined {
  const debitIndex = findHeaderIndex(headers, aliases.debitValueIdx, usedIndexes);
  const creditIndex = findHeaderIndex(headers, aliases.creditValueIdx, usedIndexes);

  const excludedSeparatedIndexes = new Set(usedIndexes);
  if (debitIndex !== undefined) excludedSeparatedIndexes.add(debitIndex);
  if (creditIndex !== undefined) excludedSeparatedIndexes.add(creditIndex);

  const genericIndex = findHeaderIndex(headers, aliases.valueIdx, excludedSeparatedIndexes);
  if (genericIndex !== undefined) return genericIndex;

  if (debitIndex !== undefined && creditIndex !== undefined) {
    return debitIndex === creditIndex ? debitIndex : undefined;
  }

  return debitIndex ?? creditIndex;
}

function suggestColumnMapping(headers: string[], template?: BankMappingTemplate): Partial<ColumnMapping> {
  const aliases = template?.aliases ?? AUTO_COLUMN_ALIASES;
  const usedIndexes = new Set<number>();
  const suggestion: Partial<ColumnMapping> = {};

  const dateIdx = findHeaderIndex(headers, aliases.dateIdx, usedIndexes);
  if (dateIdx !== undefined) {
    suggestion.dateIdx = dateIdx;
    usedIndexes.add(dateIdx);
  }

  const descIdx = findHeaderIndex(headers, aliases.descIdx, usedIndexes);
  if (descIdx !== undefined) {
    suggestion.descIdx = descIdx;
    usedIndexes.add(descIdx);
  }

  const valueIdx = findValueHeaderIndex(headers, aliases, usedIndexes);
  if (valueIdx !== undefined) suggestion.valueIdx = valueIdx;

  return suggestion;
}

function countSuggestedFields(suggestion: Partial<ColumnMapping>): number {
  return COLUMN_MAPPING_KEYS.filter(key => suggestion[key] !== undefined && suggestion[key]! >= 0).length;
}

function mergeSuggestedMapping(current: ColumnMappingDraft, suggestion: Partial<ColumnMapping>): ColumnMappingDraft {
  return COLUMN_MAPPING_KEYS.reduce<ColumnMappingDraft>((next, key) => {
    const suggestedIndex = suggestion[key];
    if (suggestedIndex !== undefined && suggestedIndex >= 0) next[key] = suggestedIndex;
    return next;
  }, { ...current });
}

interface ParseError extends Error {
  code?:       string;
  headers?:    string[];
  previewRows?: string[][];
  autoMap?:    { dateIdx: number; descIdx: number; valueIdx: number };
}

interface Props {
  onImportTransactions: (txs: ParsedTransaction[]) => Promise<ImportResult | void>;
  uid?:                  string | undefined;
  existingTransactions?: Transaction[];
  userRules?:            import('../../hooks/useCategoryRules').UserCategoryRule[] | undefined;
}

const EMPTY_IMPORT_STATS: ImportStats = {
  total:         0,
  added:         0,
  duplicates:    0,
  importable:    0,
  reconciled:    0,
  invalid:       0,
  source:        'Desconhecido',
  fileName:      '',
  periodStart:   null,
  periodEnd:     null,
  totalInCents:  0,
  totalOutCents: 0,
  netCents:      0,
};

const CROSS_PAGE_CANDIDATE_TIMEOUT_MS = 5000;

function getImportSource(file: File): ImportStats['source'] {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'csv') return 'CSV';
  if (ext === 'ofx') return 'OFX';
  if (ext === 'pdf') return 'PDF';
  return 'Desconhecido';
}

function formatPeriodDate(date: string | null): string {
  if (!date) return 'N/D';
  return date.split('-').reverse().join('/');
}

function buildImportStats(
  transactions: ParsedTransaction[],
  file: File,
  duplicates: number,
  importable: number,
): ImportStats {
  let periodStart: string | null = null;
  let periodEnd: string | null = null;
  let totalInCents = 0;
  let totalOutCents = 0;

  transactions.forEach(tx => {
    if (tx.date) {
      if (periodStart === null || tx.date < periodStart) periodStart = tx.date;
      if (periodEnd === null || tx.date > periodEnd) periodEnd = tx.date;
    }

    const cents = getTransactionAbsCentavos(tx);
    if (isIncome(tx.type)) totalInCents += cents;
    if (isExpense(tx.type)) totalOutCents += cents;
  });

  return {
    ...EMPTY_IMPORT_STATS,
    total: transactions.length,
    duplicates,
    importable,
    source: getImportSource(file),
    fileName: file.name,
    periodStart,
    periodEnd,
    totalInCents,
    totalOutCents,
    netCents: totalInCents - totalOutCents,
  };
}

function normalizeImportDescriptionForDedupe(description: string): string {
  return description
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(token => token && !/^\d{8,}$/.test(token))
    .join(' ')
    .trim();
}

function buildImportDedupeFingerprint(tx: Pick<Transaction, 'date' | 'description' | 'type' | 'source' | 'fitId' | 'value_cents' | 'value' | 'schemaVersion'>): string {
  const valueCents = getTransactionAbsCentavos(tx);
  const type = tx.type ?? '';
  const source = tx.source ?? '';
  const fitId = tx.fitId?.trim();

  if (fitId) {
    return ['fitid', source, fitId, valueCents, type].join('|');
  }

  const date = (tx.date ?? '').substring(0, 10);
  const description = normalizeImportDescriptionForDedupe(tx.description ?? '');
  return ['tx', date, valueCents, type, source, description].join('|');
}


// ─── Reconcile Routing ────────────────────────────────────────────────────────

/**
 * Routes each resolved transaction to the correct write path.
 * Exported for regression testing without React component rendering.
 */
export async function processResolvedImportBatch(
  uid: string | undefined,
  selectedTxs: ParsedTransaction[],
  onImportTransactions: (txs: ParsedTransaction[]) => Promise<ImportResult | void>,
): Promise<{
  added:           number;
  reconciledCount: number;
  invalidCount:    number;
  duplicates:      number | undefined;
  validCount:      number;
}> {
  const toImport: Partial<Transaction>[] = [];
  const toUpdate: Array<{ id: string; data: Partial<Transaction> }> = [];
  let invalidCount = 0;

  for (const tx of selectedTxs) {
    const {
      id: previewId,
      value: legacyValue,
      _selected,
      _aiCategorized,
      _reconciled,
      _mergedWith,
      ...rawTx
    } = tx;
    void _selected;
    void _aiCategorized;
    void _mergedWith;

    const cleanTx = {
      ...rawTx,
      value_cents: rawTx.value_cents ?? toCentavos(legacyValue ?? 0),
      schemaVersion: 2,
      source: rawTx.source ?? 'csv',
    };

    const zodResult = transactionCreateSchema.safeParse(cleanTx);
    if (!zodResult.success) {
      invalidCount++;
      console.warn('[Import] Transação rejeitada:', cleanTx, zodResult.error.issues);
      continue;
    }

    const parsedData = zodResult.data;
    const validData: Partial<Transaction> = {
      description: parsedData.description,
      value_cents: parsedData.value_cents as Centavos,
      type:        parsedData.type,
      category:    parsedData.category,
      date:        parsedData.date,
      source:      parsedData.source,
      schemaVersion: 2,
    };
    if (parsedData.account    !== undefined) validData.account    = parsedData.account;
    if (parsedData.accountId  !== undefined) validData.accountId  = parsedData.accountId;
    if (parsedData.cardId     !== undefined) validData.cardId     = parsedData.cardId;
    if (parsedData.fitId      !== undefined) validData.fitId      = parsedData.fitId;
    if (parsedData.tags       !== undefined) validData.tags       = parsedData.tags;
    if (parsedData.isRecurring !== undefined) validData.isRecurring = parsedData.isRecurring;

    // Reconciled against an existing Firestore doc: update in place so no duplicate is created at the hash path
    if (_reconciled === true && !!previewId && !previewId.startsWith('__temp_') && !!uid) {
      toUpdate.push({ id: previewId, data: validData });
    } else {
      toImport.push(validData);
    }
  }

  for (const { id, data } of toUpdate) {
    if (!uid) continue;
    await FirestoreService.updateTransaction(uid, id, data);
    void AuditService.logTransactionHistory(uid, id, {
      action:        'UPDATE',
      txId:          id,
      after:         { category: data.category },
      changedFields: ['category'],
      origin:        'reconcile',
      ...(data.value_cents !== undefined ? { amount_cents: data.value_cents as number } : {}),
      ...(data.category    !== undefined ? { category:     data.category              } : {}),
    });
  }

  let added      = 0;
  let duplicates: number | undefined;
  if (toImport.length > 0) {
    const result = await onImportTransactions(toImport as ParsedTransaction[]);
    added      = result?.added      ?? toImport.length;
    duplicates = result?.duplicates ?? undefined;
  }

  return {
    added,
    reconciledCount: toUpdate.length,
    invalidCount,
    duplicates,
    validCount: toUpdate.length + toImport.length,
  };
}

const CAT_COLORS: Record<string, string> = {
  'Alimentação':    'text-amber-400  bg-amber-400/10  border-amber-400/20',
  'Transporte':     'text-blue-400   bg-blue-400/10   border-blue-400/20',
  'Assinaturas':    'text-cyan-400   bg-cyan-400/10   border-cyan-400/20',
  'Saúde':          'text-rose-400   bg-rose-400/10   border-rose-400/20',
  'Moradia':        'text-orange-400 bg-orange-400/10 border-orange-400/20',
  'Educação':       'text-indigo-400 bg-indigo-400/10 border-indigo-400/20',
  'Lazer':          'text-pink-400   bg-pink-400/10   border-pink-400/20',
  'Salário':        'text-quantum-accent bg-quantum-accent/10 border-quantum-accent/20',
  'Investimento':   'text-quantum-accent bg-quantum-accent/10 border-quantum-accent/20',
  'Impostos/Taxas': 'text-red-400    bg-red-400/10    border-red-400/20',
  'Vestuário':      'text-purple-400 bg-purple-400/10 border-purple-400/20',
  'Freelance':      'text-teal-400   bg-teal-400/10   border-teal-400/20',
  'Diversos':       'text-quantum-fgMuted bg-white/5   border-quantum-border',
  'Outros':         'text-quantum-fgMuted bg-white/5   border-quantum-border',
};
const catClass = (cat: string | undefined): string =>
  CAT_COLORS[cat ?? 'Diversos'] ?? CAT_COLORS['Diversos']!;

// ─── StepBar ─────────────────────────────────────────────────────────────────
const STEPS = ['Ficheiro', 'Categorizar', 'Pré-visualizar', 'Importar'];
const STEP_MAP: Partial<Record<ImportStatus, number>> = {
  parsing: 0, col_mapping: 0, ai_processing: 1, preview: 2, importing: 3,
};

function StepBar({ current }: { current: ImportStatus }) {
  const active = STEP_MAP[current] ?? -1;
  return (
    <div className="flex items-center gap-1 px-6 py-3 bg-quantum-bg/50 border-b border-quantum-border">
      {STEPS.map((label, i) => (
        <React.Fragment key={label}>
          <div className="flex items-center gap-1.5" aria-current={i === active ? 'step' : undefined}>
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black transition-all duration-300 ${
              i < active   ? 'bg-quantum-accent text-quantum-bg' :
              i === active ? 'bg-quantum-accent/20 border border-quantum-accent text-quantum-accent animate-pulse' :
                             'bg-quantum-bgSecondary border border-quantum-border text-quantum-fgMuted'
            }`}>
              {i < active ? '✓' : i + 1}
            </div>
            <span className={`text-[10px] font-bold uppercase tracking-wider transition-colors ${
              i === active ? 'text-quantum-accent' : i < active ? 'text-quantum-fg' : 'text-quantum-fgMuted'
            }`}>{label}</span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={`flex-1 h-px transition-all duration-500 ${i < active ? 'bg-quantum-accent/50' : 'bg-quantum-border'}`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ─── DropZone ─────────────────────────────────────────────────────────────────
interface DropZoneProps {
  onFile: (f: File) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
}
function DropZone({ onFile, fileInputRef }: DropZoneProps) {
  const [dragging, setDragging] = useState(false);
  return (
    <>
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {dragging ? 'Arquivo sobre a área de soltar. Solte para importar.' : ''}
      </span>
      <div
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]); }}
      onClick={() => fileInputRef.current?.click()}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          fileInputRef.current?.click();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label="Importar arquivo de extrato bancário"
      className={`border-2 border-dashed rounded-2xl p-10 flex flex-col items-center text-center cursor-pointer transition-all duration-300 ${
        dragging
          ? 'border-quantum-accent bg-quantum-accent/5 scale-[1.01]'
          : 'border-quantum-border hover:border-quantum-accent/40 hover:bg-white/[0.02]'
      } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-quantum-accent`}
    >
      <input
        type="file" ref={fileInputRef} className="hidden" accept=".csv,.ofx,.pdf"
        aria-hidden="true" tabIndex={-1}
        onChange={e => { if (e.target.files?.[0]) onFile(e.target.files[0]); }}
      />
      <motion.div
        animate={dragging ? { scale: 1.1 } : { scale: 1 }}
        className="w-16 h-16 rounded-2xl bg-quantum-bgSecondary border border-quantum-border flex items-center justify-center mb-5"
      >
        <UploadCloud className={`w-8 h-8 transition-colors ${dragging ? 'text-quantum-accent' : 'text-quantum-fgMuted'}`} />
      </motion.div>
      <p className="font-bold text-quantum-fg mb-1.5">
        {dragging ? 'Largar aqui!' : 'Arraste o seu extrato'}
      </p>
      <p className="text-xs text-quantum-fgMuted max-w-xs leading-relaxed">
        Formatos suportados: <span className="text-quantum-fg font-mono">CSV</span>,{' '}
        <span className="text-quantum-fg font-mono">OFX</span> e{' '}
        <span className="text-quantum-fg font-mono">PDF</span>.
        Processado localmente — o Motor Gemini categoriza automaticamente.
      </p>
      <div className="mt-5 flex gap-2">
        {['CSV','OFX','PDF'].map(f => (
          <span key={f} className="text-[10px] font-mono font-bold px-2.5 py-1 bg-quantum-bgSecondary border border-quantum-border rounded-lg text-quantum-fgMuted">
            .{f.toLowerCase()}
          </span>
        ))}
      </div>
    </div>
    </>
  );
}

// ─── LoadingPanel ─────────────────────────────────────────────────────────────
type LoadingStatus = 'parsing' | 'ai_processing' | 'importing';
const LOADING_MSGS: Record<LoadingStatus, { title: string; sub: string }> = {
  parsing:       { title: 'A Extrair Dados...',    sub: 'A ler e filtrar duplicados do extrato.' },
  ai_processing: { title: 'Deep Scan Gemini Ativo', sub: 'A categorizar despesas desconhecidas com IA.' },
  importing:     { title: 'A Sincronizar com o Cofre', sub: 'A gravar as transações no Firestore.' },
};
function LoadingPanel({ status }: { status: LoadingStatus }) {
  const msg = LOADING_MSGS[status] ?? { title: 'A processar...', sub: '' };
  return (
    <div role="status" aria-live="polite" className="py-14 flex flex-col items-center text-center gap-4">
      <div className="relative">
        <div className="absolute inset-0 bg-quantum-accent/20 rounded-full blur-2xl animate-pulse" />
        {status === 'ai_processing'
          ? <BrainCircuit className="w-14 h-14 text-quantum-accent relative z-10 animate-pulse" />
          : <Loader2 className="w-14 h-14 text-quantum-accent relative z-10 animate-spin" />
        }
      </div>
      <div>
        <h4 className="text-sm font-black text-quantum-fg tracking-widest uppercase mb-1">{msg.title}</h4>
        <p className="text-xs text-quantum-fgMuted">{msg.sub}</p>
      </div>
    </div>
  );
}

// ─── ColumnMapper ─────────────────────────────────────────────────────────────
interface ColumnMapperProps {
  headers:     string[];
  previewRows: string[][];
  autoMap:     ColumnMapping;
  onApply:     (m: ColumnMapping) => void;
  onCancel:    () => void;
}
function ColumnMapper({ headers, previewRows, autoMap, onApply, onCancel }: ColumnMapperProps) {
  const [mapping, setMapping] = useState<ColumnMappingDraft>({
    dateIdx:  autoMap.dateIdx  >= 0 ? autoMap.dateIdx  : '',
    descIdx:  autoMap.descIdx  >= 0 ? autoMap.descIdx  : '',
    valueIdx: autoMap.valueIdx >= 0 ? autoMap.valueIdx : '',
  });
  const [selectedSuggestion, setSelectedSuggestion] = useState<ColumnMappingSuggestionId>('auto');
  const [suggestionFeedback, setSuggestionFeedback] = useState('');

  const set = (k: keyof typeof mapping, v: number | '') => setMapping(m => ({ ...m, [k]: v }));
  const ready = mapping.dateIdx !== '' && mapping.descIdx !== '' && mapping.valueIdx !== '';

  const handleApplySuggestion = () => {
    const template = selectedSuggestion === 'auto'
      ? undefined
      : BANK_MAPPING_TEMPLATES.find(item => item.id === selectedSuggestion);
    const suggestion = suggestColumnMapping(headers, template);
    const foundFields = countSuggestedFields(suggestion);

    if (foundFields === 0) {
      setSuggestionFeedback('Não foi possível identificar colunas suficientes para este modelo.');
      return;
    }

    const nextMapping = mergeSuggestedMapping(mapping, suggestion);
    setMapping(nextMapping);
    setSuggestionFeedback(
      COLUMN_MAPPING_KEYS.every(key => nextMapping[key] !== '')
        ? 'Mapeamento sugerido aplicado. Revise antes de continuar.'
        : 'Mapeamento parcial aplicado. Complete as colunas restantes manualmente.'
    );
  };

  const FIELDS: { key: keyof typeof mapping; label: string; color: string }[] = [
    { key: 'dateIdx',  label: 'Coluna de Data',      color: 'text-cyan-400'       },
    { key: 'descIdx',  label: 'Coluna de Descrição',  color: 'text-quantum-fg'     },
    { key: 'valueIdx', label: 'Coluna de Valor',      color: 'text-quantum-accent' },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
      <div className="flex items-start gap-3 p-3.5 bg-quantum-goldDim border border-quantum-gold/20 rounded-xl">
        <AlertTriangle className="w-4 h-4 text-quantum-gold shrink-0 mt-0.5" />
        <p className="text-xs text-quantum-fg leading-relaxed">
          Não foi possível detetar automaticamente as colunas. Mapeie manualmente abaixo.
        </p>
      </div>

      <div className="space-y-3 rounded-xl border border-quantum-border bg-quantum-bgSecondary/40 p-3.5">
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-quantum-fg">
            Sugestões de mapeamento
          </h4>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <select
            value={selectedSuggestion}
            onChange={e => setSelectedSuggestion(e.target.value as ColumnMappingSuggestionId)}
            aria-label="Selecionar sugestão de mapeamento por banco"
            className="input-quantum flex-1 appearance-none pr-8"
          >
            {COLUMN_MAPPING_SUGGESTION_OPTIONS.map(option => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleApplySuggestion}
            aria-label="Aplicar sugestão de mapeamento selecionada"
            className="btn-quantum-secondary flex items-center justify-center gap-2 whitespace-nowrap"
          >
            <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
            Aplicar
          </button>
        </div>

        {suggestionFeedback && (
          <p role="status" aria-live="polite" className="text-xs text-quantum-fgMuted">
            {suggestionFeedback}
          </p>
        )}
      </div>

      <div className="space-y-3">
        {FIELDS.map(({ key, label, color }) => (
          <div key={key}>
            <label className={`text-xs font-bold uppercase tracking-wider mb-1.5 block ${color}`}>{label}</label>
            <select
              value={mapping[key]}
              onChange={e => set(key, e.target.value === '' ? '' : Number(e.target.value))}
              aria-label={label}
              className="input-quantum appearance-none pr-8"
            >
              <option value="">— Selecionar coluna —</option>
              {headers.map((h, i) => (
                <option key={i} value={i}>{h || `Coluna ${i + 1}`}</option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {previewRows.length > 0 && (
        <div>
          <p className="text-xs text-quantum-fgMuted uppercase tracking-wider mb-2">
            Pré-visualização (primeiras {previewRows.length} linhas)
          </p>
          <div className="overflow-x-auto rounded-xl border border-quantum-border">
            <table className="w-full text-xs" aria-label="Pré-visualização do arquivo">
              <thead>
                <tr className="bg-quantum-bgSecondary">
                  {headers.map((h, i) => (
                    <th key={i} scope="col" className={`px-3 py-2 text-left font-bold border-b border-quantum-border truncate max-w-[100px] ${
                      i === Number(mapping.dateIdx)  ? 'text-cyan-400' :
                      i === Number(mapping.descIdx)  ? 'text-quantum-fg' :
                      i === Number(mapping.valueIdx) ? 'text-quantum-accent' :
                      'text-quantum-fgMuted'
                    }`}>{h || `Col ${i+1}`}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, ri) => (
                  <tr key={ri} className="border-b border-quantum-border/50 last:border-0">
                    {row.map((cell, ci) => (
                      <td key={ci} className={`px-3 py-2 truncate max-w-[100px] ${
                        ci === Number(mapping.dateIdx)  ? 'text-cyan-400  font-mono' :
                        ci === Number(mapping.descIdx)  ? 'text-quantum-fg' :
                        ci === Number(mapping.valueIdx) ? 'text-quantum-accent font-mono' :
                        'text-quantum-fgMuted'
                      }`}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex gap-3 pt-1">
        <button onClick={onCancel} className="btn-quantum-secondary flex-1">Cancelar</button>
        <button
          onClick={() => {
            if (ready) {
              onApply({
                dateIdx:  Number(mapping.dateIdx),
                descIdx:  Number(mapping.descIdx),
                valueIdx: Number(mapping.valueIdx),
              });
            }
          }}
          disabled={!ready}
          className="btn-quantum-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ArrowRight className="w-4 h-4" /> Aplicar Mapeamento
        </button>
      </div>
    </motion.div>
  );
}

// ─── PreviewPanel ─────────────────────────────────────────────────────────────
interface PreviewItem extends ParsedTransaction { _selected: boolean }
interface PreviewPanelProps {
  transactions:                  ParsedTransaction[];
  onConfirm:                     (txs: ParsedTransaction[]) => void;
  onCancel:                      () => void;
  crossPageStatus?:              CrossPageStatus;
  crossPageMatchedFingerprints?: Set<string>;
  crossPageMatchCount?:          number;
  categories?:                   UserCategory[];
}

type PreviewTotalSource = Pick<ParsedTransaction, 'type' | 'value_cents' | 'value' | 'schemaVersion'>;

export function calculatePreviewTotals(transactions: PreviewTotalSource[]) {
  let entryCents = 0;
  let exitCents = 0;

  transactions.forEach(tx => {
    const cents = getTransactionAbsCentavos(tx);
    if (isIncome(tx.type))  entryCents += cents;
    if (isExpense(tx.type)) exitCents  += cents;
  });

  return {
    totEntry: fromCentavos(entryCents),
    totExit:  fromCentavos(exitCents),
  };
}

function PreviewPanel({ transactions, onConfirm, onCancel, crossPageStatus, crossPageMatchedFingerprints, crossPageMatchCount, categories }: PreviewPanelProps) {
  const [items, setItems]       = useState<PreviewItem[]>(() => transactions.map(tx => ({ ...tx, _selected: true })));
  const [editingId, setEditingId] = useState<string | null>(null);

  const selected   = items.filter(t => t._selected);
  const allChecked = selected.length === items.length;

  const toggle    = (id: string) => setItems(prev => prev.map(t => t.id === id ? { ...t, _selected: !t._selected } : t));
  const toggleAll = () => setItems(prev => prev.map(t => ({ ...t, _selected: !allChecked })));
  const setCat    = (id: string, cat: string) => setItems(prev => prev.map(t => t.id === id ? { ...t, category: cat } : t));

  const { totEntry, totExit } = calculatePreviewTotals(selected);
  const crossPageCount = crossPageMatchCount ?? 0;

  const fmt = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const handleConfirm = () => {
    const out = selected.map(({ _selected: _s, ...tx }) => tx as ParsedTransaction);
    onConfirm(out);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-quantum-bgSecondary rounded-xl p-3 text-center border border-quantum-border">
          <p className="text-[10px] text-quantum-fgMuted uppercase mb-1">Total</p>
          <p className="text-sm font-black text-quantum-fg font-mono">{items.length}</p>
        </div>
        <div className="bg-quantum-accentDim border border-quantum-accent/20 rounded-xl p-3 text-center">
          <p className="text-[10px] text-quantum-accent uppercase mb-1">Entradas</p>
          <p className="text-xs font-black text-quantum-accent font-mono">{fmt(totEntry)}</p>
        </div>
        <div className="bg-quantum-redDim border border-quantum-red/20 rounded-xl p-3 text-center">
          <p className="text-[10px] text-quantum-red uppercase mb-1">Saídas</p>
          <p className="text-xs font-black text-quantum-red font-mono">{fmt(totExit)}</p>
        </div>
      </div>

      {crossPageStatus === 'loading' && (
        <div role="status" aria-live="polite" className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs border bg-quantum-bgSecondary border-quantum-border text-quantum-fgMuted">
          <Loader2 className="w-3 h-3 shrink-0 animate-spin" aria-hidden="true" />
          <span>Verificando duplicatas no histórico...</span>
        </div>
      )}
      {crossPageStatus === 'success' && crossPageCount > 0 && (
        <div role="status" aria-live="polite" className="px-3 py-2 rounded-xl text-xs border bg-quantum-goldDim border-quantum-gold/20 text-quantum-gold">
          {crossPageCount} duplicata{crossPageCount !== 1 ? 's' : ''} provável{crossPageCount !== 1 ? 'is' : ''} encontrada{crossPageCount !== 1 ? 's' : ''} no histórico
        </div>
      )}
      {crossPageStatus === 'success' && crossPageCount === 0 && (
        <div role="status" aria-live="polite" className="px-3 py-2 rounded-xl text-xs border bg-quantum-accentDim border-quantum-accent/20 text-quantum-accent">
          Nenhuma duplicata adicional encontrada
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-2">
          <button onClick={toggleAll} aria-pressed={allChecked} className="flex items-center gap-2 text-xs text-quantum-fgMuted hover:text-quantum-fg transition-colors">
            {allChecked ? <CheckSquare className="w-4 h-4 text-quantum-accent" /> : <Square className="w-4 h-4" />}
            {allChecked ? 'Desmarcar tudo' : 'Selecionar tudo'}
          </button>
          <span className="text-xs text-quantum-fgMuted">
            <span className="text-quantum-accent font-bold">{selected.length}</span> / {items.length} selecionadas
          </span>
        </div>

        <div className="border border-quantum-border rounded-xl overflow-hidden max-h-60 overflow-y-auto custom-scrollbar">
          <table className="w-full text-xs" aria-label="Pré-visualização das transações a importar">
            <thead className="sticky top-0 bg-quantum-bg z-10">
              <tr className="border-b border-quantum-border">
                <th scope="col" aria-label="Selecionar" className="w-8 px-3 py-2" />
                <th scope="col" className="px-3 py-2 text-left text-quantum-fgMuted font-bold uppercase tracking-wider">Data</th>
                <th scope="col" className="px-3 py-2 text-left text-quantum-fgMuted font-bold uppercase tracking-wider">Descrição</th>
                <th scope="col" className="px-3 py-2 text-left text-quantum-fgMuted font-bold uppercase tracking-wider">Categoria</th>
                <th scope="col" className="px-3 py-2 text-right text-quantum-fgMuted font-bold uppercase tracking-wider">Valor</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {items.map((tx, i) => (
                  <motion.tr
                    key={tx.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: Math.min(i * 0.02, 0.3) }}
                    className={`border-b border-quantum-border/50 last:border-0 transition-colors ${
                      tx._selected ? 'bg-transparent' : 'bg-quantum-bg/40 opacity-40'
                    }`}
                  >
                    <td className="px-3 py-2">
                      <button onClick={() => toggle(tx.id)} aria-label={`${tx._selected ? 'Desmarcar' : 'Selecionar'} transação ${tx.description || 'sem descrição'}`} className="flex items-center justify-center w-full">
                        {tx._selected
                          ? <CheckSquare className="w-3.5 h-3.5 text-quantum-accent" />
                          : <Square     className="w-3.5 h-3.5 text-quantum-fgMuted" />
                        }
                      </button>
                    </td>
                    <td className="px-3 py-2 font-mono text-quantum-fgMuted whitespace-nowrap">{tx.date}</td>
                    <td className="px-3 py-2 text-quantum-fg max-w-[140px]" title={tx.description}>
                      <span className="truncate block">{tx.description}</span>
                      {crossPageMatchedFingerprints?.has(buildImportDedupeFingerprint(tx)) && (
                        <span
                          aria-label="Duplicata provável no histórico"
                          className="inline-flex mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-quantum-goldDim border border-quantum-gold/30 text-quantum-gold leading-none"
                        >
                          Duplicata provável no histórico
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {editingId === tx.id ? (
                        <select
                          autoFocus
                          value={tx.category ?? ''}
                          onChange={e => { setCat(tx.id, e.target.value); setEditingId(null); }}
                          onBlur={() => setEditingId(null)}
                          aria-label={`Selecionar categoria da transação ${tx.description || 'sem descrição'}`}
                          className="bg-quantum-bgSecondary border border-quantum-accent/30 rounded-lg px-1 py-0.5 text-[10px] text-quantum-fg outline-none"
                        >
                          {(() => {
                            const defaults = (categories ?? []).filter(c => c.isDefault);
                            const custom   = (categories ?? []).filter(c => !c.isDefault);
                            const base     = defaults.length > 0 ? defaults : [...ALLOWED_CATEGORIES].map(n => ({ id: n, name: n } as UserCategory));
                            return custom.length > 0 ? (
                              <>
                                <optgroup label="Padrão">
                                  {base.map(c => <option key={c.id ?? c.name} value={c.name}>{c.name}</option>)}
                                </optgroup>
                                <optgroup label="Personalizadas">
                                  {custom.map(c => <option key={c.id ?? c.name} value={c.name}>{c.name}</option>)}
                                </optgroup>
                              </>
                            ) : (
                              base.map(c => <option key={c.id ?? c.name} value={c.name}>{c.name}</option>)
                            );
                          })()}
                        </select>
                      ) : (
                        <button
                          onClick={() => setEditingId(tx.id)}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[10px] font-bold transition-all hover:opacity-80 ${catClass(tx.category)}`}
                          title="Clique para editar"
                          aria-label={`Editar categoria da transação ${tx.description || 'sem descrição'}`}
                        >
                          {tx.category ?? 'Diversos'}
                          <ChevronDown className="w-2.5 h-2.5" />
                        </button>
                      )}
                    </td>
                    <td className={`px-3 py-2 text-right font-mono font-bold whitespace-nowrap ${
                      (tx.type === 'entrada' || tx.type === 'receita') ? 'text-quantum-accent' : 'text-quantum-red'
                    }`}>
                      {(tx.type === 'entrada' || tx.type === 'receita') ? '+' : '-'}{fmt(fromCentavos(getTransactionAbsCentavos(tx)))}
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      </div>
      <div className="flex gap-3">
        <button onClick={onCancel} className="btn-quantum-secondary flex items-center gap-2">
          <RotateCcw className="w-3.5 h-3.5" /> Recomeçar
        </button>
        <button
          onClick={handleConfirm}
          disabled={selected.length === 0}
          className="btn-quantum-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-40"
        >
          <Zap className="w-4 h-4" />
          Importar {selected.length} transaç{selected.length === 1 ? 'ão' : 'ões'}
        </button>
      </div>
    </motion.div>
  );
}

// ─── SuccessPanel ─────────────────────────────────────────────────────────────
function SuccessPanel({ stats }: { stats: ImportStats }) {
  const periodLabel = stats.periodStart && stats.periodEnd
    ? `${formatPeriodDate(stats.periodStart)} - ${formatPeriodDate(stats.periodEnd)}`
    : 'N/D';
  const netLabel = `${stats.netCents >= 0 ? '+' : ''}${formatCurrency(stats.netCents, { cents: true })}`;

  return (
    <motion.div
      role="status"
      aria-live="polite"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="py-8 flex flex-col items-center text-center gap-5"
    >
      <div className="relative">
        <div className="absolute inset-0 bg-quantum-accent/20 rounded-full blur-2xl" />
        <CheckCircle2 className="w-16 h-16 text-quantum-accent relative z-10" />
      </div>
      <div>
        <h4 className="text-lg font-black text-quantum-fg mb-1">Ingestão Concluída</h4>
        <p className="text-xs text-quantum-fgMuted">O cofre foi atualizado com sucesso.</p>
      </div>
      <div className="flex gap-3">
        <div className="px-4 py-2.5 bg-quantum-bgSecondary rounded-xl border border-quantum-border text-center">
          <p className="text-[10px] text-quantum-fgMuted uppercase mb-1">Lidas</p>
          <p className="text-lg font-black text-quantum-fg font-mono">{stats.total}</p>
        </div>
        <div className="px-4 py-2.5 bg-quantum-accentDim border border-quantum-accent/20 rounded-xl text-center">
          <p className="text-[10px] text-quantum-accent uppercase mb-1">Novas</p>
          <p className="text-lg font-black text-quantum-accent font-mono">{stats.added}</p>
        </div>
        <div className="px-4 py-2.5 bg-quantum-bgSecondary border border-quantum-border rounded-xl text-center">
          <p className="text-[10px] text-quantum-fgMuted uppercase mb-1">Ignoradas</p>
          <p className="text-lg font-black text-quantum-fgMuted font-mono">{stats.duplicates}</p>
        </div>
      </div>

      <div className="w-full rounded-xl border border-quantum-border bg-quantum-bgSecondary/50 p-3 text-left">
        <p className="text-[10px] text-quantum-fgMuted uppercase mb-1">Arquivo</p>
        <p className="text-xs font-bold text-quantum-fg truncate" title={stats.fileName || 'Arquivo importado'}>
          {stats.fileName || 'Arquivo importado'}
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-quantum-fgMuted">
          <span>Origem: <strong className="text-quantum-fg">{stats.source}</strong></span>
          <span>Periodo: <strong className="text-quantum-fg">{periodLabel}</strong></span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 w-full">
        <div className="px-3 py-2.5 bg-quantum-bgSecondary rounded-xl border border-quantum-border text-center">
          <p className="text-[10px] text-quantum-fgMuted uppercase mb-1">Importaveis</p>
          <p className="text-lg font-black text-quantum-fg font-mono">{stats.importable}</p>
        </div>
        <div className="px-3 py-2.5 bg-cyan-500/10 rounded-xl border border-cyan-500/20 text-center">
          <p className="text-[10px] text-cyan-300 uppercase mb-1">Reconciliadas</p>
          <p className="text-lg font-black text-cyan-300 font-mono">{stats.reconciled}</p>
        </div>
        <div className="px-3 py-2.5 bg-quantum-redDim rounded-xl border border-quantum-red/20 text-center">
          <p className="text-[10px] text-quantum-red uppercase mb-1">Invalidas</p>
          <p className="text-lg font-black text-quantum-red font-mono">{stats.invalid}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 w-full">
        <div className="px-3 py-2.5 bg-quantum-bgSecondary rounded-xl border border-quantum-border text-center">
          <p className="text-[10px] text-quantum-fgMuted uppercase mb-1">Entradas</p>
          <p className="text-sm font-black text-quantum-accent font-mono">{formatCurrency(stats.totalInCents, { cents: true })}</p>
        </div>
        <div className="px-3 py-2.5 bg-quantum-bgSecondary rounded-xl border border-quantum-border text-center">
          <p className="text-[10px] text-quantum-fgMuted uppercase mb-1">Saidas</p>
          <p className="text-sm font-black text-quantum-red font-mono">{formatCurrency(stats.totalOutCents, { cents: true })}</p>
        </div>
        <div className="px-3 py-2.5 bg-quantum-bgSecondary rounded-xl border border-quantum-border text-center">
          <p className="text-[10px] text-quantum-fgMuted uppercase mb-1">Saldo</p>
          <p className={`text-sm font-black font-mono ${stats.netCents >= 0 ? 'text-quantum-accent' : 'text-quantum-red'}`}>{netLabel}</p>
        </div>
      </div>
    </motion.div>
  );
}

// ─── ErrorPanel ───────────────────────────────────────────────────────────────
function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <motion.div
      role="alert"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="py-10 flex flex-col items-center text-center gap-4"
    >
      <AlertTriangle className="w-14 h-14 text-quantum-red" />
      <div>
        <h4 className="text-base font-bold text-quantum-fg mb-2">Interferência Detetada</h4>
        <p className="text-xs text-quantum-fgMuted bg-quantum-redDim border border-quantum-red/20 p-3 rounded-xl max-w-sm mx-auto leading-relaxed">
          {message}
        </p>
      </div>
      <button onClick={onRetry} className="btn-quantum-secondary flex items-center gap-2">
        <RotateCcw className="w-3.5 h-3.5" /> Tentar Novamente
      </button>
    </motion.div>
  );
}

// ─── PasswordPanel ────────────────────────────────────────────────────────────
interface PasswordPanelProps {
  file:         File;
  wrongPassword: boolean;
  onSubmit:     (pwd: string) => void;
  onCancel:     () => void;
}
function PasswordPanel({ file, wrongPassword, onSubmit, onCancel }: PasswordPanelProps) {
  const [password,    setPassword]    = useState('');
  const [submitting,  setSubmitting]  = useState(false);

  useEffect(() => {
    if (wrongPassword) setSubmitting(false);
  }, [wrongPassword]);

  const handleSubmit = () => {
    if (!password.trim() || submitting) return;
    setSubmitting(true);
    onSubmit(password);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-5"
    >
      <div className="flex items-start gap-3 p-3.5 bg-quantum-bgSecondary border border-quantum-border rounded-xl">
        <AlertTriangle className="w-4 h-4 text-quantum-gold shrink-0 mt-0.5" aria-hidden="true" />
        <div className="text-xs text-quantum-fg leading-relaxed">
          <p className="font-bold mb-0.5">PDF Protegido por Senha</p>
          <p className="text-quantum-fgMuted truncate max-w-xs" title={file.name}>{file.name}</p>
        </div>
      </div>

      <div>
        <label htmlFor="pdf-password-input" className="block text-xs font-bold uppercase tracking-wider text-quantum-fgMuted mb-1.5">
          Senha do PDF
        </label>
        <input
          id="pdf-password-input"
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
          autoFocus
          autoComplete="new-password"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          data-form-type="other"
          aria-label="Senha do PDF"
          aria-describedby={wrongPassword ? 'pdf-password-error' : undefined}
          aria-invalid={wrongPassword ? true : undefined}
          placeholder="Digite a senha..."
          className="input-quantum w-full"
        />
        {wrongPassword && (
          <span
            id="pdf-password-error"
            role="alert"
            className="block mt-1.5 text-xs text-quantum-red"
          >
            Senha incorreta. Tente novamente.
          </span>
        )}
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="btn-quantum-secondary flex-1"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || !password.trim()}
          className="btn-quantum-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {submitting
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> A verificar...</>
            : <><ArrowRight className="w-3.5 h-3.5" aria-hidden="true" /> Confirmar</>
          }
        </button>
      </div>
    </motion.div>
  );
}

// ─── Componente Principal ─────────────────────────────────────────────────────
export default function ImportButton({ onImportTransactions, uid, existingTransactions = [], userRules }: Props) {
  const [isOpen,              setIsOpen]              = useState(false);
  const [status,              setStatus]              = useState<ImportStatus>('idle');
  const [errorMessage,        setErrorMessage]        = useState('');
  const [preview,             setPreview]             = useState<ParsedTransaction[]>([]);
  const [stats,               setStats]               = useState<ImportStats>(EMPTY_IMPORT_STATS);
  const [colMapState,         setColMapState]         = useState<ColMapState | null>(null);
  const [reconciliationQueue, setReconciliationQueue] = useState<ParsedTransaction[]>([]);
  const [crossPageStatus,              setCrossPageStatus]              = useState<CrossPageStatus>('idle');
  const [crossPageMatchCount,          setCrossPageMatchCount]          = useState(0);
  const [crossPageMatchedFingerprints, setCrossPageMatchedFingerprints] = useState<Set<string>>(new Set());
  const [pdfPasswordFile,              setPdfPasswordFile]              = useState<File | null>(null);
  const [pdfPasswordWrong,             setPdfPasswordWrong]             = useState(false);

  const fileInputRef   = useRef<HTMLInputElement>(null);
  const triggerRef     = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const modalRef       = useRef<HTMLDivElement>(null);

  const { categories: userCategories } = useCategories(uid ?? '');

  const { parseFile, parseFileWithMapping } = useParserWorker();

  const deduplicate = useCallback((parsed: ParsedTransaction[]) => {
    const existingHashes = new Set<string>();
    existingTransactions.forEach(t => {
      existingHashes.add(buildImportDedupeFingerprint(t));
    });

    let duplicates = 0;
    const fresh = parsed.filter(tx => {
      const hash = buildImportDedupeFingerprint(tx);
      if (existingHashes.has(hash)) { duplicates++; return false; }
      existingHashes.add(hash);
      return true;
    });

    return { fresh, duplicates };
  }, [existingTransactions]);

  const localCategorize = (txs: ParsedTransaction[]): ParsedTransaction[] => {
    const forAI: ParsedTransaction[] = [];
    txs.forEach(tx => {
      const upper = tx.description.toUpperCase();
      let found = false;
      // FIX P0.1: regras do usuário têm prioridade sobre dicionário
      for (const rule of (userRules ?? [])) {
        for (const kw of rule.keywords) {
          if (upper.includes(kw.toUpperCase())) {
            tx.category = rule.category as AllowedCategory; found = true; break;
          }
        }
        if (found) break;
      }
      if (!found) {
        for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
          for (const kw of keywords) {
            if (upper.includes(kw.toUpperCase())) {
              tx.category = category as AllowedCategory; found = true; break;
            }
          }
          if (found) break;
        }
      }
      if (!found && isExpense(tx.type)) forAI.push(tx);
    });
    return forAI;
  };

  const closeModal = () => {
    if (status === 'parsing' || status === 'ai_processing' || status === 'importing') return;
    setIsOpen(false);
    setStatus('idle');
    setPreview([]);
    setReconciliationQueue([]);
    setColMapState(null);
    setStats(EMPTY_IMPORT_STATS);
    setErrorMessage('');
    setCrossPageStatus('idle');
    setCrossPageMatchCount(0);
    setCrossPageMatchedFingerprints(new Set());
    setPdfPasswordFile(null);
    setPdfPasswordWrong(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setTimeout(() => triggerRef.current?.focus(), 0);
  };

  useEffect(() => {
    if (isOpen) {
      const id = setTimeout(() => { (closeButtonRef.current ?? modalRef.current)?.focus(); }, 0);
      return () => clearTimeout(id);
    }
  }, [isOpen]);

  const handleModalKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      if (status === 'password_required') {
        setPdfPasswordFile(null);
        setPdfPasswordWrong(false);
        setStatus('idle');
        return;
      }
      closeModal();
      return;
    }
    if (e.key === 'Tab' && modalRef.current) {
      const focusable = modalRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      const els   = Array.from(focusable).filter(el => !el.closest('[aria-hidden="true"]'));
      if (els.length === 0) return;
      const first = els[0]!;
      const last  = els[els.length - 1]!;
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last)  { e.preventDefault(); first.focus(); }
      }
    }
  };

  const processFile = useCallback(async (file: File, customMapping: ColumnMapping | null = null, pdfPassword: string | null = null): Promise<void> => {
    setStatus('parsing');
    setErrorMessage('');

    try {
      let parsed: ParsedTransaction[];
      try {
        parsed = customMapping
          ? await parseFileWithMapping(file, customMapping) as ParsedTransaction[]
          : await parseFile(file, pdfPassword ? { password: pdfPassword } : {}) as ParsedTransaction[];
      } catch (rawErr) {
        const err = rawErr as ParseError;
        if (err.code === 'COLUMNS_NOT_FOUND') {
          setColMapState({
            headers:     err.headers     ?? [],
            previewRows: err.previewRows ?? [],
            autoMap:     err.autoMap     ?? { dateIdx: -1, descIdx: -1, valueIdx: -1 },
            file,
          });
          setStatus('col_mapping');
          return;
        }
        if (err.message === 'PASSWORD_REQUIRED') {
          setPdfPasswordFile(file);
          setPdfPasswordWrong(pdfPassword !== null);
          setStatus('password_required');
          return;
        }
        throw err;
      }

      if (!parsed || parsed.length === 0) throw new Error('Nenhuma transação válida encontrada no ficheiro.');

      const { fresh, duplicates } = deduplicate(parsed);
      const parsedStats = buildImportStats(parsed, file, duplicates, fresh.length);
      if (fresh.length === 0) {
        toast('Todos os registos já existem no Cofre.', { icon: '🛡️' });
        setStats(parsedStats);
        setStatus('success');
        setTimeout(() => closeModal(), 3000);
        return;
      }

      // Busca cross-page em background — não bloqueia o fluxo de importação
      setCrossPageStatus('loading');
      if (uid && parsedStats.periodStart && parsedStats.periodEnd) {
        const _uid   = uid;
        const _start = parsedStats.periodStart;
        const _end   = parsedStats.periodEnd;
        void (async () => {
          try {
            const timeoutProm = new Promise<null>(resolve =>
              setTimeout(() => resolve(null), CROSS_PAGE_CANDIDATE_TIMEOUT_MS)
            );
            const result = await Promise.race([
              findImportCandidateTransactions({ uid: _uid, periodStart: _start, periodEnd: _end }),
              timeoutProm,
            ]);
            if (result === null) {
              setCrossPageStatus('skipped');
              return;
            }
            const candidateFps = new Set(result.map(buildImportDedupeFingerprint));
            const matched = new Set<string>();
            fresh.forEach(tx => {
              const fp = buildImportDedupeFingerprint(tx);
              if (candidateFps.has(fp)) matched.add(fp);
            });
            setCrossPageMatchedFingerprints(matched);
            setCrossPageMatchCount(matched.size);
            setCrossPageStatus('success');
          } catch {
            setCrossPageStatus('failed');
          }
        })();
      } else {
        setCrossPageStatus('skipped');
      }

      setStatus('ai_processing');
      // Local dictionary first — items not matched go to AI
      const forAI = localCategorize(fresh);

      if (forAI.length > 0) {
        // Extract unique descriptions for a single batch request (RULE: 1 request / file)
        const uniqueDescs = [...new Set(forAI.map(tx => tx.description).filter(Boolean))];
        const categoryMap = await batchCategorizeDescriptions(uniqueDescs);

        forAI.forEach(tx => {
          const aiCat = categoryMap[tx.description];
          if (aiCat) {
            tx.category       = aiCat;
            tx._aiCategorized = true;
          }
        });
      }

      setReconciliationQueue(fresh);
      setStats(parsedStats);
      setStatus('reconciliation');

    } catch (rawErr) {
      const err = rawErr as Error;
      console.error('Importação falhou:', err);
      setErrorMessage(err.message || 'Falha desconhecida ao processar o ficheiro.');
      setStatus('error');
    }
  }, [deduplicate, parseFile, parseFileWithMapping, uid]);

  const handleConfirmImport = useCallback(async (selectedTxs: ParsedTransaction[]) => {
    setStatus('importing');
    try {
      const { added, reconciledCount, invalidCount, duplicates, validCount } =
        await processResolvedImportBatch(uid, selectedTxs, onImportTransactions);

      if (invalidCount > 0) {
        toast.error(`${invalidCount} transação(ões) inválida(s) ignorada(s).`);
      }

      if (validCount === 0) {
        toast.error('Nenhuma transação válida para importar.');
        setStatus('idle');
        return;
      }

      setStats(prev => ({
        ...prev,
        added,
        reconciled: reconciledCount,
        invalid: invalidCount,
        duplicates: duplicates ?? prev.duplicates,
      }));
      setStatus('success');
      setTimeout(() => closeModal(), 3000);
    } catch (rawErr) {
      const err = rawErr as Error;
      console.error('Erro ao gravar no Firestore:', err);
      setErrorMessage(err.message || 'Falha ao guardar as transações. Tente novamente.');
      setStatus('error');
    }
  }, [uid, onImportTransactions]);  

  const handleApplyMapping = useCallback((mapping: ColumnMapping) => {
    if (colMapState?.file) void processFile(colMapState.file, mapping);
  }, [colMapState, processFile]);

  const showStepBar = (['parsing','ai_processing','col_mapping','preview','importing'] as ImportStatus[]).includes(status);

  return (
    <>
      <button ref={triggerRef} onClick={() => setIsOpen(true)} aria-label="Importar ficheiro de extrato" className="btn-quantum-secondary flex items-center gap-2">
        <FileUp className="w-4 h-4" aria-hidden="true" />
        <span className="hidden sm:inline">Importar Ficheiro</span>
      </button>

      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {status === 'reconciliation' && (
            <ReconciliationEngine
              queue={reconciliationQueue}
              existingTransactions={existingTransactions}
              onComplete={(resolvedTxs: Transaction[]) => {
                setPreview(resolvedTxs as ParsedTransaction[]);
                setStatus('preview');
              }}
              onCancel={() => {
                setReconciliationQueue([]);
                setStatus('idle');
                setIsOpen(false);
              }}
            />
          )}
        </AnimatePresence>,
        document.body
      )}

      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {isOpen && status !== 'reconciliation' && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
              <motion.div
                ref={modalRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="import-dialog-title"
                tabIndex={-1}
                onKeyDown={handleModalKeyDown}
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                className={`bg-quantum-card w-full max-h-[90vh] rounded-3xl border border-quantum-border shadow-[0_0_60px_rgba(0,0,0,0.6)] flex flex-col ${
                  status === 'preview' ? 'max-w-2xl' : 'max-w-lg'
                }`}
              >
              <div className="p-4 border-b border-quantum-border flex items-center justify-between bg-quantum-bg/60">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-quantum-accent/10 rounded-xl border border-quantum-accent/20">
                    <UploadCloud className="w-5 h-5 text-quantum-accent" />
                  </div>
                  <div>
                    <h3 id="import-dialog-title" className="font-black text-quantum-fg text-sm tracking-wide">Ingestão Quântica</h3>
                    <p className="text-[10px] text-quantum-fgMuted">CSV · OFX · PDF · IA Categorization</p>
                  </div>
                </div>
                {!(['parsing','ai_processing','importing'] as ImportStatus[]).includes(status) && (
                  <button ref={closeButtonRef} onClick={closeModal} aria-label="Fechar diálogo de importação" className="p-2 text-quantum-fgMuted hover:text-quantum-fg hover:bg-white/5 rounded-xl transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>

              {showStepBar && <StepBar current={status} />}

              <div className="p-6 overflow-y-auto custom-scrollbar flex-1 min-h-0">
                <AnimatePresence mode="wait">
                  {status === 'idle' && (
                    <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <DropZone onFile={f => void processFile(f)} fileInputRef={fileInputRef} />
                    </motion.div>
                  )}

                  {(['parsing','ai_processing','importing'] as ImportStatus[]).includes(status) && (
                    <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <LoadingPanel status={status as LoadingStatus} />
                    </motion.div>
                  )}

                  {status === 'col_mapping' && colMapState && (
                    <motion.div key="col_mapping" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <ColumnMapper
                        headers={colMapState.headers}
                        previewRows={colMapState.previewRows}
                        autoMap={colMapState.autoMap}
                        onApply={handleApplyMapping}
                        onCancel={closeModal}
                      />
                    </motion.div>
                  )}

                  {status === 'password_required' && pdfPasswordFile && (
                    <motion.div key="password_required" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <PasswordPanel
                        file={pdfPasswordFile}
                        wrongPassword={pdfPasswordWrong}
                        onSubmit={pwd => void processFile(pdfPasswordFile, null, pwd)}
                        onCancel={() => {
                          setPdfPasswordFile(null);
                          setPdfPasswordWrong(false);
                          setStatus('idle');
                        }}
                      />
                    </motion.div>
                  )}

                  {status === 'preview' && (
                    <motion.div key="preview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <PreviewPanel
                        transactions={preview}
                        onConfirm={txs => void handleConfirmImport(txs)}
                        onCancel={() => setStatus('idle')}
                        crossPageStatus={crossPageStatus}
                        crossPageMatchedFingerprints={crossPageMatchedFingerprints}
                        crossPageMatchCount={crossPageMatchCount}
                        categories={userCategories}
                      />
                    </motion.div>
                  )}

                  {status === 'success' && (
                    <motion.div key="success" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <SuccessPanel stats={stats} />
                    </motion.div>
                  )}

                  {status === 'error' && (
                    <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <ErrorPanel message={errorMessage} onRetry={() => setStatus('idle')} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </div>
        )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
