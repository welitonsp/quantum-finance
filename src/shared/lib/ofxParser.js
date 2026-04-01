// src/shared/lib/ofxParser.js
function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`Falha ao ler o arquivo: ${file.name}`));
    reader.readAsText(file, 'windows-1252'); 
  });
}

function extractTag(block, tag) {
  const match = block.match(new RegExp(`<${tag}>([^<\r\n]+)`));
  return match ? match[1].trim() : null;
}

function parseOFXDate(raw) {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, ''); 
  if (digits.length < 8) return null;

  const year  = digits.slice(0, 4);
  const month = digits.slice(4, 6);
  const day   = digits.slice(6, 8);

  const date = new Date(`${year}-${month}-${day}T00:00:00`);
  return isNaN(date.getTime()) ? null : `${year}-${month}-${day}`;
}

function resolveType(trnType, amount) {
  if (trnType) {
    const t = trnType.toUpperCase();
    if (['CREDIT', 'DEP', 'INT', 'DIV', 'DIRECTDEP'].includes(t)) return 'entrada';
    if (['DEBIT', 'CHECK', 'PAYMENT', 'ATM', 'POS'].includes(t))  return 'saida';
  }
  return amount < 0 ? 'saida' : 'entrada';
}

export async function parseOFX(file) {
  if (!file) throw new Error('Nenhum arquivo fornecido.');
  const text = await readFileAsText(file);

  if (!text.includes('OFXHEADER') && !text.includes('<OFX>')) {
    throw new Error('O arquivo não parece ser um OFX válido.');
  }

  const trnRegex   = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
  const transactions = [];
  const seenFitIds   = new Set();
  let match;

  while ((match = trnRegex.exec(text)) !== null) {
    const block = match[1];
    const fitId = extractTag(block, 'FITID');

    if (fitId && seenFitIds.has(fitId)) continue;
    if (fitId) seenFitIds.add(fitId);

    const amountStr = extractTag(block, 'TRNAMT');
    const amount    = amountStr ? parseFloat(amountStr.replace(',', '.')) : null;

    if (amount === null || isNaN(amount)) continue;

    const dateRaw = extractTag(block, 'DTPOSTED');
    const date    = parseOFXDate(dateRaw) ?? new Date().toISOString().split('T')[0];

    const memo = extractTag(block, 'MEMO') ?? extractTag(block, 'NAME') ?? 'Importação OFX';

    transactions.push({
      id         : fitId ?? crypto.randomUUID(),
      value      : Math.abs(amount),
      type       : resolveType(extractTag(block, 'TRNTYPE'), amount),
      category   : 'Importado',
      description: memo,
      date,
      importedAt : new Date().toISOString(),
    });
  }

  if (transactions.length === 0) throw new Error('Nenhuma transação válida no OFX.');
  return transactions;
}