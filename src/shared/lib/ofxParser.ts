// src/shared/lib/ofxParser.ts

export interface ParsedTransaction {
  id: string;
  fitId: string | null;
  description: string;
  value: number;
  type: 'entrada' | 'saida' | 'receita';
  date: string;
  category: string;
  source: string;
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`Falha ao ler o arquivo: ${file.name}`));
    reader.readAsText(file, 'windows-1252');
  });
}

function extractTag(block: string, tag: string): string | null {
  const match = block.match(new RegExp(`<${tag}>([^<\\r\\n]+)`));
  return match ? match[1].trim() : null;
}

function parseOFXDate(raw: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 8) return null;
  const year = digits.slice(0, 4), month = digits.slice(4, 6), day = digits.slice(6, 8);
  const date = new Date(`${year}-${month}-${day}T12:00:00`);
  return isNaN(date.getTime()) ? null : `${year}-${month}-${day}`;
}

export async function parseOFX(file: File): Promise<ParsedTransaction[]> {
  if (!file) throw new Error('Nenhum arquivo fornecido.');
  const text = await readFileAsText(file);

  if (!text.includes('OFXHEADER') && !text.includes('<OFX>')) {
    throw new Error('Formato inválido. O ficheiro não é um OFX reconhecido.');
  }

  const trnRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
  const transactions: ParsedTransaction[] = [];
  const seenFitIds = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = trnRegex.exec(text)) !== null) {
    const block = match[1];
    const fitId = extractTag(block, 'FITID');
    if (fitId && seenFitIds.has(fitId)) continue;
    if (fitId) seenFitIds.add(fitId);

    const amountStr = extractTag(block, 'TRNAMT');
    const amount = amountStr ? parseFloat(amountStr.replace(',', '.')) : null;
    if (amount === null || isNaN(amount) || amount === 0) continue;

    const date = parseOFXDate(extractTag(block, 'DTPOSTED')) ?? new Date().toISOString().split('T')[0];
    const memo = extractTag(block, 'MEMO') ?? extractTag(block, 'NAME') ?? 'Transação OFX';

    transactions.push({
      id:          fitId || crypto.randomUUID(),
      fitId:       fitId || null,
      description: memo.replace(/\s+/g, ' ').trim(),
      value:       Math.abs(amount),
      type:        amount > 0 ? 'receita' : 'saida',
      date,
      category:    'Diversos',
      source:      'ofx',
    });
  }

  return transactions;
}
