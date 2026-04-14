// src/shared/lib/csvParser.js

// ─── Leitura do ficheiro ─────────────────────────────────────────────────────
function readFileAsText(file, encoding = 'utf-8') {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      let text = reader.result;
      if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); // Remove BOM
      resolve(text);
    };
    reader.onerror = () => reject(new Error(`Falha ao ler o ficheiro: ${file.name}`));
    reader.readAsText(file, encoding);
  });
}

function detectSeparator(firstLine) {
  const semicolons = (firstLine.match(/;/g) || []).length;
  const commas     = (firstLine.match(/,/g) || []).length;
  const pipes      = (firstLine.match(/\|/g) || []).length;
  if (pipes > semicolons && pipes > commas) return '|';
  return semicolons > commas ? ';' : ',';
}

/**
 * Normaliza datas em múltiplos formatos → YYYY-MM-DD
 * Suporta: YYYY-MM-DD | DD/MM/YYYY | DD-MM-YYYY | MM/DD/YYYY | YYYYMMDD
 */
function validateDate(raw) {
  if (!raw) return null;
  const s = raw.replace(/"/g, '').trim();

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(s + 'T00:00:00');
    return isNaN(d.getTime()) ? null : s;
  }
  // YYYYMMDD (sem separadores)
  if (/^\d{8}$/.test(s)) {
    const iso = `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
    const d = new Date(iso + 'T00:00:00');
    return isNaN(d.getTime()) ? null : iso;
  }
  // DD/MM/YYYY ou DD-MM-YYYY (padrão Brasil/Portugal)
  const ptBR = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (ptBR) {
    const [, dd, mm, yyyy] = ptBR;
    const iso = `${yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`;
    const d = new Date(iso + 'T00:00:00');
    if (!isNaN(d.getTime()) && d.getMonth() + 1 === Number(mm)) return iso;
  }
  // YYYY/MM/DD
  const altISO = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (altISO) {
    const [, yyyy, mm, dd] = altISO;
    const iso = `${yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`;
    const d = new Date(iso + 'T00:00:00');
    return isNaN(d.getTime()) ? null : iso;
  }
  return null;
}

/**
 * Parse de valor monetário robusto.
 * Suporta: 1.200,50 | 1,200.50 | 1200,50 | -150.00 | R$ 150,00
 */
function parseAmount(raw) {
  if (!raw) return null;
  let s = raw.replace(/"/g, '').replace(/[R$\s]/g, '').trim();
  if (!s) return null;

  const negative = s.startsWith('-') || s.startsWith('(');
  s = s.replace(/[()+-]/g, '');

  // Formato PT-BR: 1.200,50
  if (/^\d{1,3}(\.\d{3})+,\d{2}$/.test(s)) {
    s = s.replace(/\./g, '').replace(',', '.');
  }
  // Formato US: 1,200.50
  else if (/^\d{1,3}(,\d{3})+\.\d{2}$/.test(s)) {
    s = s.replace(/,/g, '');
  }
  // Só vírgula decimal: 1200,50
  else if (s.includes(',') && !s.includes('.')) {
    s = s.replace(',', '.');
  }

  const val = parseFloat(s);
  if (isNaN(val)) return null;
  return negative ? -Math.abs(val) : val;
}

/**
 * Normaliza o nome de um header para comparação (sem acentos, minúsculas, sem especiais).
 */
function normalizeHeader(h) {
  return h
    .toLowerCase()
    .replace(/"/g, '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Deteta automaticamente os índices de coluna a partir dos headers.
 * Retorna {dateIdx, descIdx, valueIdx} — -1 se não encontrado.
 */
function autoDetectColumns(headers) {
  const normalized = headers.map(normalizeHeader);

  const DATE_KEYS  = ['data','date','datamovimento','datalancamento','datalcto','dataoperacao','dataaplicacao','datahora'];
  const DESC_KEYS  = ['lancamento','descricao','historico','memo','description','estabelecimento',
                      'detalhes','detalhe','complemento','observacao','nomefornecedor','loja','comercio'];
  const VALUE_KEYS = ['valor','value','amount','quantia','debito','credito','montante',
                      'valortransacao','valorpago','valoroperacao','valormov','importancia'];

  const find = (keys) => {
    for (const key of keys) {
      const idx = normalized.findIndex(h => h === key || h.startsWith(key));
      if (idx !== -1) return idx;
    }
    // Fallback: partial match
    for (const key of keys) {
      const idx = normalized.findIndex(h => h.includes(key));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  return { dateIdx: find(DATE_KEYS), descIdx: find(DESC_KEYS), valueIdx: find(VALUE_KEYS) };
}

/**
 * Divide uma linha CSV respeitando campos entre aspas.
 */
function splitLine(line, sep) {
  const regex = new RegExp(`${sep === '|' ? '\\|' : sep}(?=(?:(?:[^"]*"){2})*[^"]*$)`);
  return line.split(regex).map(f => f.replace(/^"|"$/g, '').trim());
}

// ─── API PÚBLICA ─────────────────────────────────────────────────────────────

/**
 * Lê os headers brutos do CSV sem fazer o parse completo.
 * Útil para mostrar o mapeamento manual ao utilizador.
 * @returns {{ headers: string[], separator: string, previewRows: string[][] }}
 */
export async function getCSVHeaders(file) {
  const text      = await readFileAsText(file);
  const lines     = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 1) throw new Error('Ficheiro CSV vazio.');

  const separator  = detectSeparator(lines[0]);
  const headers    = splitLine(lines[0], separator);
  const previewRows = lines.slice(1, 4).map(l => splitLine(l, separator));
  const autoMap    = autoDetectColumns(headers);

  return { headers, separator, previewRows, autoMap };
}

/**
 * Parse completo do CSV com mapeamento explícito de colunas.
 * @param {File}   file
 * @param {{ dateIdx: number, descIdx: number, valueIdx: number }} mapping
 */
export async function parseCSVWithMapping(file, mapping) {
  const { dateIdx, descIdx, valueIdx } = mapping;
  if (dateIdx < 0 || descIdx < 0 || valueIdx < 0) {
    throw new Error('Mapeamento de colunas incompleto. Atribua Data, Descrição e Valor.');
  }

  const text      = await readFileAsText(file);
  const lines     = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) throw new Error('O CSV está vazio ou não tem dados válidos.');

  const separator = detectSeparator(lines[0]);
  const transactions = [];
  const errors = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = splitLine(lines[i], separator);

    const date   = validateDate(fields[dateIdx]);
    const amount = parseAmount(fields[valueIdx]);
    const desc   = (fields[descIdx] || '').trim() || `Linha ${i + 1}`;

    if (!date)          { errors.push(`Linha ${i+1}: data inválida ("${fields[dateIdx]}")`); continue; }
    if (amount === null){ errors.push(`Linha ${i+1}: valor inválido ("${fields[valueIdx]}")`); continue; }
    if (amount === 0)   { continue; }

    transactions.push({
      id:          crypto.randomUUID(),
      date,
      description: desc,
      value:       Math.abs(amount),
      type:        amount > 0 ? 'entrada' : 'saida',
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

/**
 * Parse automático com deteção inteligente de colunas.
 * Se não conseguir detetar, lança erro com `{ code: 'COLUMNS_NOT_FOUND', headers, separator }`.
 */
export async function parseCSV(file) {
  const text      = await readFileAsText(file);
  const lines     = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) throw new Error('O CSV está vazio ou não tem dados válidos.');

  const separator = detectSeparator(lines[0]);
  const rawHeaders = splitLine(lines[0], separator);
  const { dateIdx, descIdx, valueIdx } = autoDetectColumns(rawHeaders);

  if (dateIdx === -1 || descIdx === -1 || valueIdx === -1) {
    const err = new Error(
      `Não foi possível identificar as colunas automaticamente.\n` +
      `Headers encontrados: "${rawHeaders.join('", "')}"`
    );
    err.code     = 'COLUMNS_NOT_FOUND';
    err.headers  = rawHeaders;
    err.separator = separator;
    err.autoMap  = { dateIdx, descIdx, valueIdx };
    throw err;
  }

  return parseCSVWithMapping(file, { dateIdx, descIdx, valueIdx });
}
