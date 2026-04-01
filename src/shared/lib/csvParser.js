// src/utils/csvParser.js
// Baseado na estrutura real das faturas do Itaú Personnalité exportadas em CSV.
//
// Estrutura confirmada do arquivo:
//   - Encoding : UTF-8 com BOM (EF BB BF)
//   - Separador: vírgula ','
//   - Cabeçalho: data,lançamento,valor
//   - Data      : YYYY-MM-DD (já ISO — não precisa converter)
//   - Valor     : ponto como decimal (ex: 29.98, -4314.29)
//   - Negativos : pagamentos (PAGAMENTO EFETUADO) e estornos → type = 'entrada'
//   - Sem aspas nos campos

/**
 * Lê o arquivo como texto removendo o BOM se existir.
 * O FileReader com 'utf-8' preserva o BOM no resultado — precisamos removê-lo.
 */
function readFileAsText(file, encoding = 'utf-8') {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => {
      let text = reader.result;
      // Remove BOM UTF-8 (U+FEFF) que o Itaú inclui no início do arquivo
      if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
      resolve(text);
    };
    reader.onerror = () => reject(new Error(`Falha ao ler o arquivo: ${file.name}`));
    reader.readAsText(file, encoding);
  });
}

/**
 * Detecta o separador testando a primeira linha.
 * Itaú usa vírgula — mas mantemos detecção automática para robustez.
 */
function detectSeparator(firstLine) {
  const semicolons = (firstLine.match(/;/g) || []).length;
  const commas     = (firstLine.match(/,/g) || []).length;
  return semicolons > commas ? ';' : ',';
}

/**
 * Valida se a string é uma data ISO válida (YYYY-MM-DD).
 * O Itaú já exporta nesse formato — só validamos.
 */
function validateISODate(raw) {
  if (!raw) return null;
  const s = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(s + 'T00:00:00');
  return isNaN(d.getTime()) ? null : s;
}

/**
 * Converte o valor string para número.
 * O Itaú usa ponto como decimal (formato americano): "29.98", "-4314.29".
 */
function parseAmount(raw) {
  if (raw === undefined || raw === null) return null;
  const n = parseFloat(raw.toString().trim());
  return isNaN(n) ? null : n;
}

/**
 * Mapeia os cabeçalhos para índices, independente da ordem.
 * Remove BOM residual e normaliza para minúsculo.
 */
function mapHeaders(headers) {
  const map = { date: -1, description: -1, value: -1 };
  headers.forEach((h, i) => {
    const norm = h.toLowerCase()
      .replace(/^\uFEFF/, '')       // BOM residual
      .replace(/[^a-zà-ú]/g, '');  // só letras
    if (['data', 'date'].includes(norm))                                   map.date = i;
    if (['lancamento', 'lançamento', 'descricao', 'descrição',
         'historico', 'histórico', 'memo', 'description'].includes(norm))  map.description = i;
    if (['valor', 'value', 'amount', 'quantia'].includes(norm))            map.value = i;
  });
  return map;
}

/**
 * Determina o tipo da transação pelo sinal do valor.
 *
 * Lógica do CSV de fatura Itaú:
 *   valor positivo → compra/gasto              → 'saida'
 *   valor negativo → pagamento ou estorno       → 'entrada'
 *     ex: PAGAMENTO EFETUADO (-4314.29)  = crédito na fatura
 *     ex: estorno MercadoLivre  (-0.16)  = crédito recebido
 */
function resolveType(amount) {
  return amount < 0 ? 'entrada' : 'saida';
}

/**
 * Faz o parse de um CSV de fatura do Itaú e retorna transações normalizadas.
 *
 * @param {File} file - Arquivo .csv selecionado pelo usuário
 * @returns {Promise<Array>} - Transações no formato interno da aplicação
 * @throws {Error} Mensagem descritiva para exibir ao usuário
 */
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
    const detail = errors.length > 0
      ? `\n\nProblemas:\n${errors.join('\n')}`
      : '';
    throw new Error(`Nenhuma transação válida encontrada no CSV.${detail}`);
  }

  if (errors.length > 0) {
    console.warn(`[parseCSV] ${errors.length} linha(s) ignorada(s):\n${errors.join('\n')}`);
  }

  return transactions;
}
