import type { ParsedTransaction } from '../types/transaction';
import { fromCentavos, toCentavos, type Centavos } from '../types/money';

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
  return match?.[1]?.trim() ?? null;
}

function parseOFXDate(raw: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 8) return null;

  const year  = digits.slice(0, 4);
  const month = digits.slice(4, 6);
  const day   = digits.slice(6, 8);

  const iso = `${year}-${month}-${day}`;
  const date = new Date(`${iso}T12:00:00Z`);
  return !isNaN(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : null;
}

function parseAmountCents(raw: string | null): Centavos | null {
  if (!raw) return null;
  try {
    return toCentavos(raw.replace(',', '.'));
  } catch {
    return null;
  }
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
    const block = match[1] ?? '';

    const fitId = extractTag(block, 'FITID');
    if (fitId && seenFitIds.has(fitId)) continue;
    if (fitId) seenFitIds.add(fitId);

    const amount = parseAmountCents(extractTag(block, 'TRNAMT'));

    if (amount === null || amount === 0) continue;

    const dateRaw = extractTag(block, 'DTPOSTED');
    const date = parseOFXDate(dateRaw) ?? new Date().toISOString().split('T')[0] ?? '';

    const memo = extractTag(block, 'MEMO') ?? extractTag(block, 'NAME') ?? 'Transação OFX';
    const type = amount > 0 ? 'entrada' : 'saida';
    const amountCents = Math.abs(amount) as Centavos;

    transactions.push({
      id:          fitId || `ofx:${transactions.length}:${date}:${amountCents}`,
      fitId:       fitId || null,
      description: (memo as string).replace(/\s+/g, ' ').trim(),
      value:       fromCentavos(amountCents),
      value_cents: amountCents,
      schemaVersion: 2,
      type,
      date,
      category:    'Diversos',
      source:      'ofx',
    });
  }

  return transactions;
}
