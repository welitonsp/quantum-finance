// src/shared/lib/csvParser.ts

export interface ParsedTransaction {
  id: string;
  date: string;
  description: string;
  value: number;
  type: 'entrada' | 'saida';
  category: string;
  source: string;
}

export interface ColumnMapping {
  dateIdx: number;
  descIdx: number;
  valueIdx: number;
}

export interface CSVHeaders {
  headers: string[];
  separator: string;
  previewRows: string[][];
  autoMap: ColumnMapping;
}

export interface CSVParseError extends Error {
  code: string;
  headers: string[];
  separator: string;
  autoMap: ColumnMapping;
  previewRows: string[][];
}

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
    return isNaN(new Date(s + 'T00:00:00').getTime()) ? null : s;
  }
  if (/^\d{8}$/.test(s)) {
    const iso = `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
    return isNaN(new Date(iso + 'T00:00:00').getTime()) ? null : iso;
  }
  const ptBR = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (ptBR) {
    const [, dd, mm, yyyy] = ptBR;
    const iso = `${yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`;
    const d = new Date(iso + 'T00:00:00');
    if (!isNaN(d.getTime()) && d.getMonth() + 1 === Number(mm)) return iso;
  }
  const altISO = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (altISO) {
    const [, yyyy, mm, dd] = altISO;
    const iso = `${yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`;
    return isNaN(new Date(iso + 'T00:00:00').getTime()) ? null : iso;
  }
  return null;
}

function parseAmount(raw: string | undefined): number | null {
  if (!raw) return null;
  let s = raw.replace(/"/g, '').replace(/[R$\s]/g, '').trim();
  if (!s) return null;
  const negative = s.startsWith('-') || s.startsWith('(');
  s = s.replace(/[()+-]/g, '');
  if (/^\d{1,3}(\.\d{3})+,\d{2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(,\d{3})+\.\d{2}$/.test(s)) s = s.replace(/,/g, '');
  else if (s.includes(',') && !s.includes('.')) s = s.replace(',', '.');
  const val = parseFloat(s);
  if (isNaN(val)) return null;
  return negative ? -Math.abs(val) : val;
}

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/"/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

function autoDetectColumns(headers: string[]): ColumnMapping {
  const normalized = headers.map(normalizeHeader);
  const DATE_KEYS  = ['data','date','datamovimento','datalancamento','datalcto','dataoperacao','dataaplicacao','datahora'];
  const DESC_KEYS  = ['lancamento','descricao','historico','memo','description','estabelecimento','detalhes','detalhe','complemento','observacao','nomefornecedor','loja','comercio'];
  const VALUE_KEYS = ['valor','value','amount','quantia','debito','credito','montante','valortransacao','valorpago','valoroperacao','valormov','importancia'];

  const find = (keys: string[]): number => {
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

export async function getCSVHeaders(file: File): Promise<CSVHeaders> {
  const text       = await readFileAsText(file);
  const lines      = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 1) throw new Error('Ficheiro CSV vazio.');
  const separator  = detectSeparator(lines[0]);
  const headers    = splitLine(lines[0], separator);
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
  const separator = detectSeparator(lines[0]);
  const transactions: ParsedTransaction[] = [];
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = splitLine(lines[i], separator);
    const date   = validateDate(fields[dateIdx]);
    const amount = parseAmount(fields[valueIdx]);
    const desc   = (fields[descIdx] || '').trim() || `Linha ${i + 1}`;
    if (!date)          { errors.push(`Linha ${i+1}: data inválida ("${fields[dateIdx]}")`); continue; }
    if (amount === null){ errors.push(`Linha ${i+1}: valor inválido ("${fields[valueIdx]}")`); continue; }
    if (amount === 0)   { continue; }
    transactions.push({
      id: crypto.randomUUID(), date, description: desc,
      value: Math.abs(amount), type: amount > 0 ? 'entrada' : 'saida',
      category: 'Diversos', source: 'csv',
    });
  }

  if (transactions.length === 0) {
    const detail = errors.length > 0 ? `\n\nProblemas detectados:\n${errors.slice(0,5).join('\n')}` : '';
    throw new Error(`Nenhuma transação válida encontrada no CSV.${detail}`);
  }
  return transactions;
}

export async function parseCSV(file: File): Promise<ParsedTransaction[]> {
  const text      = await readFileAsText(file);
  const lines     = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) throw new Error('O CSV está vazio ou não tem dados válidos.');
  const separator  = detectSeparator(lines[0]);
  const rawHeaders = splitLine(lines[0], separator);
  const { dateIdx, descIdx, valueIdx } = autoDetectColumns(rawHeaders);

  if (dateIdx === -1 || descIdx === -1 || valueIdx === -1) {
    const previewRows = lines.slice(1, 4).map(l => splitLine(l, separator));
    const err = Object.assign(
      new Error(`Não foi possível identificar as colunas automaticamente.\nHeaders encontrados: "${rawHeaders.join('", "')}"`),
      { code: 'COLUMNS_NOT_FOUND', headers: rawHeaders, separator, autoMap: { dateIdx, descIdx, valueIdx }, previewRows },
    ) as CSVParseError;
    throw err;
  }

  return parseCSVWithMapping(file, { dateIdx, descIdx, valueIdx });
}
