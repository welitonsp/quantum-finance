import type { Transaction } from '../../../shared/types/transaction';

export type ImportStatus =
  | 'idle' | 'parsing' | 'col_mapping' | 'ai_processing'
  | 'preview' | 'importing' | 'success' | 'error' | 'reconciliation'
  | 'password_required';

export type CrossPageStatus = 'idle' | 'loading' | 'success' | 'skipped' | 'failed';

export interface ParsedTransaction extends Omit<Transaction, 'id'> {
  id:              string;
  _selected?:      boolean;
  _aiCategorized?: boolean;
  _reconciled?:    boolean;
  _mergedWith?:    string;
}

export interface ColMapState {
  headers:     string[];
  previewRows: string[][];
  autoMap:     { dateIdx: number; descIdx: number; valueIdx: number };
  file:        File;
}

export interface ImportStats {
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

export interface ImportResult {
  added?:      number;
  duplicates?: number;
}

export interface ColumnMapping {
  dateIdx:  number;
  descIdx:  number;
  valueIdx: number;
}

export const COLUMN_MAPPING_KEYS = ['dateIdx', 'descIdx', 'valueIdx'] as const;
export type ColumnMappingField = typeof COLUMN_MAPPING_KEYS[number];
export type ColumnMappingDraft = Record<ColumnMappingField, number | ''>;

export type BankMappingTemplateId =
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

export interface BankColumnAliases {
  dateIdx:        string[];
  descIdx:        string[];
  valueIdx:       string[];
  debitValueIdx:  string[];
  creditValueIdx: string[];
}

export interface BankMappingTemplate {
  id:      BankMappingTemplateId;
  label:   string;
  aliases: BankColumnAliases;
}

export type ColumnMappingSuggestionId = 'auto' | BankMappingTemplateId;

export interface ParseError extends Error {
  code?:        string;
  headers?:     string[];
  previewRows?: string[][];
  autoMap?:     { dateIdx: number; descIdx: number; valueIdx: number };
}

export interface PreviewItem extends ParsedTransaction { _selected: boolean }

export type PreviewTotalSource = Pick<ParsedTransaction, 'type' | 'value_cents' | 'value' | 'schemaVersion'>;

export type LoadingStatus = 'parsing' | 'ai_processing' | 'importing';
