// src/shared/lib/csvParser.js
/**
 * Lê o arquivo como texto removendo o BOM se existir.
 */
function readFileAsText(file, encoding = 'utf-8') {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => {
      let text = reader.result;
      if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
      resolve(text);
    };
    reader.onerror = () => reject(new Error(`Falha ao ler o arquivo: ${file.name}`));
    reader.readAsText(file, encoding);
  });
}

function detectSeparator(firstLine) {
  const semicolons = (firstLine.match(/;/g) || []).length;
  const commas     = (firstLine.match(/,/g) || []).length;
  return semicolons > commas ? ';' : ',';
}

function validateISODate(raw) {
  if (!raw) return null;
  const s = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(s + 'T00:00:00');
  return isNaN(d.getTime()) ? null : s;
}

function parseAmount(raw) {
  if (raw === undefined || raw === null) return null;
  const n = parseFloat(raw.toString().trim());
  return isNaN(n) ? null : n;
}

function mapHeaders(headers) {
  const map = { date: -1, description: -1, value: -1 };
  headers.forEach((h, i) => {
    const norm = h.toLowerCase()
      .replace(/^\uFEFF/, '')       
      .replace(/[^a-zà-ú]/g, '');  
    if (['data', 'date'].includes(norm))                                   map.date = i;
    if (['lancamento', 'lançamento', 'descricao', 'descrição',
         'historico', 'histórico', 'memo', 'description'].includes(norm))  map.description = i;
    if (['valor', 'value', 'amount', 'quantia'].includes(norm))            map.value = i;
  });
  return map;
}

function resolveType(amount) {
  return amount < 0 ? 'entrada' : 'saida';
}

export async function parseCSV(file) {
  if (!file) throw new Error('Nenhum arquivo fornecido.');
  if (!file.name.toLowerCase().endsWith('.csv')) {
    throw new Error('O arquivo precisa ter extensão .csv');
  }

  const text  = await readFileAsText(file, 'utf-8');
  const lines = text.split(/\r?\n/).filter(l => l.trim());

  if (lines.length < 2) {
    throw new Error('O arquivo CSV está vazio ou não contém transações.');
  }

  const separator  = detectSeparator(lines[0]);
  const rawHeaders = lines[0].split(separator).map(h => h.trim());
  const colMap     = mapHeaders(rawHeaders);

  const missing = Object.entries(colMap)
    .filter(([, idx]) => idx === -1)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(
      `Colunas não encontradas: ${missing.join(', ')}.\n` +
      `Cabeçalhos detectados: "${rawHeaders.join('", "')}"`
    );
  }

  const transactions = [];
  const errors       = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = lines[i].split(separator);

    const rawDate  = fields[colMap.date]?.trim();
    const rawDesc  = fields[colMap.description]?.trim();
    const rawValue = fields[colMap.value]?.trim();

    const date   = validateISODate(rawDate);
    const amount = parseAmount(rawValue);

    if (!date) {
      errors.push(`Linha ${i + 1}: data inválida ("${rawDate}")`);
      continue;
    }
    if (amount === null) {
      errors.push(`Linha ${i + 1}: valor inválido ("${rawValue}")`);
      continue;
    }

    transactions.push({
      id         : crypto.randomUUID(),
      value      : Math.abs(amount),
      type       : resolveType(amount),
      category   : 'Importado',
      description: rawDesc || 'Importação CSV',
      date,
      importedAt : new Date().toISOString(),
    });
  }

  if (transactions.length === 0) {
    const detail = errors.length > 0 ? `\n\nProblemas:\n${errors.join('\n')}` : '';
    throw new Error(`Nenhuma transação válida encontrada no CSV.${detail}`);
  }

  return transactions;
}