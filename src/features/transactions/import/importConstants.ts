import { getTransactionAbsCentavos, isIncome, isExpense } from '../../../utils/transactionUtils';
import type { Transaction } from '../../../shared/types/transaction';
import type {
  BankColumnAliases, BankMappingTemplate,
  ColumnMapping, ColumnMappingDraft, ColumnMappingField, ColumnMappingSuggestionId,
  ImportStats,
} from './importTypes';
import { COLUMN_MAPPING_KEYS } from './importTypes';
import type { ParsedTransaction } from './importTypes';

// ─── Column alias helpers ─────────────────────────────────────────────────────

export const COMMON_COLUMN_ALIASES: BankColumnAliases = {
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

export function uniqueAliases(aliases: string[]): string[] {
  return Array.from(new Set(aliases));
}

export function withCommonColumnAliases(overrides: Partial<BankColumnAliases> = {}): BankColumnAliases {
  return {
    dateIdx:        uniqueAliases([...COMMON_COLUMN_ALIASES.dateIdx,        ...(overrides.dateIdx        ?? [])]),
    descIdx:        uniqueAliases([...COMMON_COLUMN_ALIASES.descIdx,        ...(overrides.descIdx        ?? [])]),
    valueIdx:       uniqueAliases([...COMMON_COLUMN_ALIASES.valueIdx,       ...(overrides.valueIdx       ?? [])]),
    debitValueIdx:  uniqueAliases([...COMMON_COLUMN_ALIASES.debitValueIdx,  ...(overrides.debitValueIdx  ?? [])]),
    creditValueIdx: uniqueAliases([...COMMON_COLUMN_ALIASES.creditValueIdx, ...(overrides.creditValueIdx ?? [])]),
  };
}

export const BANK_MAPPING_TEMPLATES: BankMappingTemplate[] = [
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

export const COLUMN_MAPPING_SUGGESTION_OPTIONS: Array<{ id: ColumnMappingSuggestionId; label: string }> = [
  { id: 'auto', label: 'Detectar automaticamente' },
  ...BANK_MAPPING_TEMPLATES.map(({ id, label }) => ({ id, label })),
];

export const AUTO_COLUMN_ALIASES: BankColumnAliases = {
  dateIdx:        uniqueAliases(BANK_MAPPING_TEMPLATES.flatMap(t => t.aliases.dateIdx)),
  descIdx:        uniqueAliases(BANK_MAPPING_TEMPLATES.flatMap(t => t.aliases.descIdx)),
  valueIdx:       uniqueAliases(BANK_MAPPING_TEMPLATES.flatMap(t => t.aliases.valueIdx)),
  debitValueIdx:  uniqueAliases(BANK_MAPPING_TEMPLATES.flatMap(t => t.aliases.debitValueIdx)),
  creditValueIdx: uniqueAliases(BANK_MAPPING_TEMPLATES.flatMap(t => t.aliases.creditValueIdx)),
};

// ─── Column mapping helpers ───────────────────────────────────────────────────

export function normalizeColumnHeader(header: string): string {
  return header
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function headerMatchesAlias(normalizedHeader: string, normalizedAlias: string): boolean {
  const compactHeader = normalizedHeader.replace(/\s+/g, '');
  const compactAlias  = normalizedAlias.replace(/\s+/g, '');
  return (
    normalizedHeader === normalizedAlias ||
    normalizedHeader.startsWith(normalizedAlias + ' ') ||
    normalizedHeader.endsWith(' ' + normalizedAlias) ||
    normalizedHeader.includes(' ' + normalizedAlias + ' ') ||
    compactHeader === compactAlias ||
    compactHeader.startsWith(compactAlias) ||
    compactHeader.includes(compactAlias)
  );
}

export function findHeaderIndex(headers: string[], aliases: string[], usedIndexes: Set<number>): number | undefined {
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
  const debitIndex  = findHeaderIndex(headers, aliases.debitValueIdx, usedIndexes);
  const creditIndex = findHeaderIndex(headers, aliases.creditValueIdx, usedIndexes);

  const excludedSeparatedIndexes = new Set(usedIndexes);
  if (debitIndex  !== undefined) excludedSeparatedIndexes.add(debitIndex);
  if (creditIndex !== undefined) excludedSeparatedIndexes.add(creditIndex);

  const genericIndex = findHeaderIndex(headers, aliases.valueIdx, excludedSeparatedIndexes);
  if (genericIndex !== undefined) return genericIndex;

  if (debitIndex !== undefined && creditIndex !== undefined) {
    return debitIndex === creditIndex ? debitIndex : undefined;
  }

  return debitIndex ?? creditIndex;
}

export function suggestColumnMapping(headers: string[], template?: BankMappingTemplate): Partial<ColumnMapping> {
  const aliases    = template?.aliases ?? AUTO_COLUMN_ALIASES;
  const usedIndexes = new Set<number>();
  const suggestion: Partial<ColumnMapping> = {};

  const dateIdx = findHeaderIndex(headers, aliases.dateIdx, usedIndexes);
  if (dateIdx !== undefined) { suggestion.dateIdx = dateIdx; usedIndexes.add(dateIdx); }

  const descIdx = findHeaderIndex(headers, aliases.descIdx, usedIndexes);
  if (descIdx !== undefined) { suggestion.descIdx = descIdx; usedIndexes.add(descIdx); }

  const valueIdx = findValueHeaderIndex(headers, aliases, usedIndexes);
  if (valueIdx !== undefined) suggestion.valueIdx = valueIdx;

  return suggestion;
}

export function countSuggestedFields(suggestion: Partial<ColumnMapping>): number {
  return COLUMN_MAPPING_KEYS.filter(key => suggestion[key] !== undefined && suggestion[key]! >= 0).length;
}

export function mergeSuggestedMapping(current: ColumnMappingDraft, suggestion: Partial<ColumnMapping>): ColumnMappingDraft {
  return COLUMN_MAPPING_KEYS.reduce<ColumnMappingDraft>((next, key: ColumnMappingField) => {
    const suggestedIndex = suggestion[key];
    if (suggestedIndex !== undefined && suggestedIndex >= 0) next[key] = suggestedIndex;
    return next;
  }, { ...current });
}

// ─── Category colors ──────────────────────────────────────────────────────────

export const CAT_COLORS: Record<string, string> = {
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

export const catClass = (cat: string | undefined): string =>
  CAT_COLORS[cat ?? 'Diversos'] ?? CAT_COLORS['Diversos']!;

// ─── Import stats helpers ─────────────────────────────────────────────────────

export const EMPTY_IMPORT_STATS: ImportStats = {
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

export const CROSS_PAGE_CANDIDATE_TIMEOUT_MS = 5000;

export function getImportSource(file: File): ImportStats['source'] {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'csv') return 'CSV';
  if (ext === 'ofx') return 'OFX';
  if (ext === 'pdf') return 'PDF';
  return 'Desconhecido';
}

export function formatPeriodDate(date: string | null): string {
  if (!date) return 'N/D';
  return date.split('-').reverse().join('/');
}

export function buildImportStats(
  transactions: ParsedTransaction[],
  file: File,
  duplicates: number,
  importable: number,
): ImportStats {
  let periodStart: string | null = null;
  let periodEnd:   string | null = null;
  let totalInCents  = 0;
  let totalOutCents = 0;

  transactions.forEach(tx => {
    if (tx.date) {
      if (periodStart === null || tx.date < periodStart) periodStart = tx.date;
      if (periodEnd   === null || tx.date > periodEnd)   periodEnd   = tx.date;
    }
    const cents = getTransactionAbsCentavos(tx);
    if (isIncome(tx.type))  totalInCents  += cents;
    if (isExpense(tx.type)) totalOutCents += cents;
  });

  return {
    ...EMPTY_IMPORT_STATS,
    total: transactions.length,
    duplicates,
    importable,
    source:       getImportSource(file),
    fileName:     file.name,
    periodStart,
    periodEnd,
    totalInCents,
    totalOutCents,
    netCents: totalInCents - totalOutCents,
  };
}

// ─── Deduplication fingerprint ────────────────────────────────────────────────

function normalizeImportDescriptionForDedupe(description: string): string {
  return description
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(token => token && !/^\d{8,}$/.test(token))
    .join(' ')
    .trim();
}

export function buildImportDedupeFingerprint(tx: Pick<Transaction, 'date' | 'description' | 'type' | 'source' | 'fitId' | 'value_cents' | 'value' | 'schemaVersion'>): string {
  const valueCents = getTransactionAbsCentavos(tx);
  const type   = tx.type   ?? '';
  const source = tx.source ?? '';
  const fitId  = tx.fitId?.trim();

  if (fitId) {
    return ['fitid', source, fitId, valueCents, type].join('|');
  }

  const date        = (tx.date ?? '').substring(0, 10);
  const description = normalizeImportDescriptionForDedupe(tx.description ?? '');
  return ['tx', date, valueCents, type, source, description].join('|');
}
