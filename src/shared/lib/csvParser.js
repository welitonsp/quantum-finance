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

/**
 * Normaliza datas em múltiplos formatos para YYYY-MM-DD.
 * Suporta: YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY, DD-MM-YYYY
 */
function validateISODate(raw) {
  if (!raw) return null;
  const s = raw.trim();

  // Formato ISO já correto: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(s + 'T00:00:00');
    return isNaN(d.getTime()) ? null : s;
  }

  // Formato DD/MM/YYYY (mais comum em bancos brasileiros/portugueses)
  const ptBR = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (ptBR) {
    const [, dd, mm, yyyy] = ptBR;
    const iso = `${yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`;
    const d = new Date(iso + 'T00:00:00');
    if (!isNaN(d.getTime()) && d.getMonth() + 1 === Number(mm)) return iso;
  }

  // Formato YYYY/MM/DD
  const altISO = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (altISO) {
    const [, yyyy, mm, dd] = altISO;
    const iso = `${yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`;
    const d = new Date(iso + 'T00:00:00');
    return isNaN(d.getTime()) ? null : iso;
  }

  return null;
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
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // Remove acentos
      .replace(/[^a-z0-9]/g, '');

    // Data
    if (['data', 'date', 'datamovimento', 'datalan', 'datalancamento',
         'datalcto', 'dataoperacao', 'dataaplicacao'].includes(norm)) {
      map.date = i;
    }
    // Descrição
    if (['lancamento', 'descricao', 'historico', 'memo', 'description',
         'estabelecimento', 'detalhes', 'detalhe', 'complemento',
         'observacao', 'notadedetalhe', 'nomefornecedor'].includes(norm)) {
      map.description = i;
    }
    // Valor
    if (['valor', 'value', 'amount', 'quantia', 'debito', 'credito',
         'montante', 'valortransacao', 'valorpago', 'valoroperacao',
         'valormov'].includes(norm)) {
      if (map.value === -1) map.value = i; // Pega o primeiro encontrado
    }
  });
  return map;
}

function resolveType(amount) {
  // Débitos bancários são negativos → 'saida'; créditos são positivos → 'entrada'
  return amount < 0 ? 'saida' : 'entrada';
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