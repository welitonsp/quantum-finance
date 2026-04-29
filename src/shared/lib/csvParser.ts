import type { ParsedTransaction } from '../types/transaction';
import { fromCentavos, type Centavos } from '../types/money';
import { parseImportedMoneyToCentavos } from './importMoneyParser';

function readFileAsText(file: File, encoding = 'utf-8'): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      let text = reader.result as string;
      if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
      resolve(text);
    };
    reader.onerror = () => reject(new Error(`Falha ao ler o ficheiro: ${file.name}`));
    reader.readAsText(file, encoding);
  });
}

function detectSeparator(firstLine: string): string {
  const semicolons = (firstLine.match(/;/g) || []).length;
  const commas     = (firstLine.match(/,/g) || []).length;
  const pipes      = (firstLine.match(/\|/g) || []).length;
  if (pipes > semicolons && pipes > commas) return '|';
  return semicolons > commas ? ';' : ',';
}

function validateDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const s = raw.replace(/"/g, '').trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(s + 'T00:00:00Z');
    return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s ? s : null;
  }
  if (/^\d{8}$/.test(s)) {
    const iso = `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
    const d = new Date(iso + 'T00:00:00Z');
    return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : null;
  }
  const ptBR = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (ptBR) {
    const [, dd = '', mm = '', yyyy = ''] = ptBR;
    const iso = `${yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`;
    const d = new Date(iso + 'T00:00:00Z');
    if (!isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso) return iso;
  }
  const altISO = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (altISO) {
    const [, yyyy = '', mm = '', dd = ''] = altISO;
    const iso = `${yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`;
    const d = new Date(iso + 'T00:00:00Z');
    return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : null;
  }
  return null;
}

const CENTS_HEADER_KEYS = ['valorcentavos', 'valuecents', 'amountcents', 'cents', 'centavos', 'valoremcentavos'];

function isCentsHeader(normalizedHeader: string): boolean {
  return CENTS_HEADER_KEYS.some(k => normalizedHeader === k || normalizedHeader.endsWith(k));
}

function parseAmountCents(raw: string | undefined, integerMinorUnits = false): Centavos | null {
  if (!raw) return null;
  const s = raw.replace(/"/g, '').trim();
  if (!s) return null;

  try {
    return parseImportedMoneyToCentavos(s, { integerMinorUnits });
  } catch {
    return null;
  }
}

function normalizeDescription(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

function normalizeHeader(h: string): string {
  return h.toLowerCase()
    .replace(/"/g, '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

export interface ColumnMapping {
  dateIdx: number;
  descIdx: number;
  valueIdx: number;
  /** Força interpretação da coluna de valor como inteiro em centavos (minor units). */
  valueIntegerMinorUnits?: boolean;
}

function autoDetectColumns(headers: string[]): ColumnMapping {
  const normalized = headers.map(normalizeHeader);

  const DATE_KEYS  = ['data','date','datamovimento','datalancamento','datalcto','dataoperacao','dataaplicacao','datahora'];
  const DESC_KEYS  = ['lancamento','descricao','historico','memo','description','estabelecimento',
                      'detalhes','detalhe','complemento','observacao','nomefornecedor','loja','comercio'];
  const VALUE_KEYS = ['valor','value','amount','quantia','debito','credito','montante',
                      'valortransacao','valorpago','valoroperacao','valormov','importancia'];

  const find = (keys: string[]) => {
    for (const key of keys) {
      const idx = normalized.findIndex(h => h === key || h.startsWith(key));
      if (idx !== -1) return idx;
    }
    for (const key of keys) {
      const idx = normalized.findIndex(h => h.includes(key));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  return { dateIdx: find(DATE_KEYS), descIdx: find(DESC_KEYS), valueIdx: find(VALUE_KEYS) };
}

function splitLine(line: string, sep: string): string[] {
  const regex = new RegExp(`${sep === '|' ? '\\|' : sep}(?=(?:(?:[^"]*"){2})*[^"]*$)`);
  return line.split(regex).map(f => f.replace(/^"|"$/g, '').trim());
}

export interface CSVHeaders {
  headers: string[];
  separator: string;
  previewRows: string[][];
  autoMap: ColumnMapping;
}

export async function getCSVHeaders(file: File): Promise<CSVHeaders> {
  const text      = await readFileAsText(file);
  const lines     = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 1) throw new Error('Ficheiro CSV vazio.');

  const firstLine = lines[0] ?? '';
  const separator  = detectSeparator(firstLine);
  const headers    = splitLine(firstLine, separator);
  const previewRows = lines.slice(1, 4).map(l => splitLine(l, separator));
  const autoMap    = autoDetectColumns(headers);

  return { headers, separator, previewRows, autoMap };
}

export async function parseCSVWithMapping(file: File, mapping: ColumnMapping): Promise<ParsedTransaction[]> {
  const { dateIdx, descIdx, valueIdx } = mapping;
  if (dateIdx < 0 || descIdx < 0 || valueIdx < 0) {
    throw new Error('Mapeamento de colunas incompleto. Atribua Data, Descrição e Valor.');
  }

  const text      = await readFileAsText(file);
  const lines     = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) throw new Error('O CSV está vazio ou não tem dados válidos.');

  const firstLine = lines[0] ?? '';
  const separator = detectSeparator(firstLine);

  // Detectar se a coluna de valor exporta centavos como inteiro sem separador decimal
  const rawHeaders = splitLine(firstLine, separator);
  const valueHeaderNorm = normalizeHeader(rawHeaders[valueIdx] ?? '');
  const integerMinorUnits = mapping.valueIntegerMinorUnits ?? isCentsHeader(valueHeaderNorm);

  const transactions: ParsedTransaction[] = [];
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = splitLine(lines[i] ?? '', separator);

    const date   = validateDate(fields[dateIdx]);
    const amountCents = parseAmountCents(fields[valueIdx], integerMinorUnits);
    const desc   = normalizeDescription(fields[descIdx] || '') || `Linha ${i + 1}`;

    if (!date)          { errors.push(`Linha ${i+1}: data inválida ("${fields[dateIdx]}")`); continue; }
    if (amountCents === null){ errors.push(`Linha ${i+1}: valor inválido ("${fields[valueIdx]}")`); continue; }
    if (amountCents === 0)   { continue; }

    transactions.push({
      id:          `csv:${i}:${date}:${Math.abs(amountCents)}:${desc.slice(0, 24)}`,
      date,
      description: desc,
      value:       fromCentavos(Math.abs(amountCents)),
      value_cents: Math.abs(amountCents) as Centavos,
      schemaVersion: 2,
      type:        amountCents > 0 ? 'entrada' : 'saida',
      category:    'Diversos',
      source:      'csv',
    });
  }

  if (transactions.length === 0) {
    const detail = errors.length > 0 ? `\n\nProblemas detectados:\n${errors.slice(0,5).join('\n')}` : '';
    throw new Error(`Nenhuma transação válida encontrada no CSV.${detail}`);
  }

  return transactions;
}

export interface CSVParseError extends Error {
  code?: string;
  headers?: string[];
  separator?: string;
  autoMap?: ColumnMapping;
}

export async function parseCSV(file: File): Promise<ParsedTransaction[]> {
  const text      = await readFileAsText(file);
  const lines     = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) throw new Error('O CSV está vazio ou não tem dados válidos.');

  const firstLine = lines[0] ?? '';
  const separator = detectSeparator(firstLine);
  const rawHeaders = splitLine(firstLine, separator);
  const { dateIdx, descIdx, valueIdx } = autoDetectColumns(rawHeaders);

  if (dateIdx === -1 || descIdx === -1 || valueIdx === -1) {
    const err: CSVParseError = new Error(
      `Não foi possível identificar as colunas automaticamente.\n` +
      `Headers encontrados: "${rawHeaders.join('", "')}"`
    );
    err.code      = 'COLUMNS_NOT_FOUND';
    err.headers   = rawHeaders;
    err.separator = separator;
    err.autoMap   = { dateIdx, descIdx, valueIdx };
    throw err;
  }

  return parseCSVWithMapping(file, { dateIdx, descIdx, valueIdx });
}
