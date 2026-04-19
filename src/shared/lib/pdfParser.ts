// src/shared/lib/pdfParser.ts
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export interface ParsedPDFTransaction {
  id: string;
  date: string;
  description: string;
  value: number;
  type: 'entrada' | 'saida';
  account: string;
  category: string;
}

export const parsePDF = async (file: File, password: string | null = null): Promise<ParsedPDFTransaction[]> => {
  try {
    if (!file || file.type !== 'application/pdf') throw new Error('O ficheiro não é um PDF válido.');

    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer, password: password || undefined });

    let pdf: pdfjsLib.PDFDocumentProxy;
    try {
      pdf = await loadingTask.promise;
    } catch (err) {
      const e = err as Error & { name?: string };
      if (e.name === 'PasswordException' || e.message?.toLowerCase().includes('password')) {
        throw new Error('PASSWORD_REQUIRED');
      }
      throw err;
    }

    let faturaYear  = new Date().getFullYear();
    let faturaMonth = new Date().getMonth() + 1;
    let isCartao    = true;

    try {
      const firstPage   = await pdf.getPage(1);
      const textContent = await firstPage.getTextContent();
      const firstPageText = textContent.items
        .map(i => ('str' in i ? i.str : ''))
        .join(' ');

      if (firstPageText.toLowerCase().includes('extrato conta corrente')) isCartao = false;
      const vencimentoMatch = firstPageText.match(/Vencimento:\s*\d{2}\/(\d{2})\/(\d{4})/i);
      if (vencimentoMatch) {
        faturaMonth = parseInt(vencimentoMatch[1], 10);
        faturaYear  = parseInt(vencimentoMatch[2], 10);
      }
    } catch { console.warn('Erro ao ler cabeçalho.'); }

    const regexTransacao = /(?:^|[^0-9])([0-3]\d\/[0-1]\d(?:\/\d{4})?)\s+(.+?)\s+(-?\s?\d{1,3}(?:[.\s]\d{3})*,\d{2})\s*([DC\-])?(?:\s.*)?$/i;
    const transactions: ParsedPDFTransaction[] = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page        = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const viewport    = page.getViewport({ scale: 1 });
      const midX        = viewport.width / 2;

      type RawItem = { str: string; transform: number[] };
      const items = textContent.items.filter((i): i is RawItem => 'str' in i && !!(i as RawItem).str.trim());

      const leftCol  = items.filter(i => i.transform[4] < midX);
      const rightCol = items.filter(i => i.transform[4] >= midX);

      const buildLines = (colItems: RawItem[]): string[] => {
        const sorted = [...colItems].sort((a, b) =>
          Math.round(b.transform[5]) - Math.round(a.transform[5]) || a.transform[4] - b.transform[4]);
        const lines: string[] = [];
        let currentLine: string[] = [], lastY: number | null = null;
        for (const item of sorted) {
          const y = Math.round(item.transform[5]);
          if (lastY === null || Math.abs(y - lastY) <= 6) currentLine.push(item.str.trim());
          else { lines.push(currentLine.join(' ')); currentLine = [item.str.trim()]; }
          lastY = y;
        }
        if (currentLine.length) lines.push(currentLine.join(' '));
        return lines;
      };

      for (const line of [...buildLines(leftCol), ...buildLines(rightCol)]) {
        const match = line.match(regexTransacao);
        if (!match) continue;
        const [, dataRaw, descricao, valorRaw, sufixo] = match;
        const valorNum  = parseFloat(valorRaw.replace(/\s/g, '').replace(/\./g, '').replace(',', '.').replace(/^-/, ''));
        const isNegative = valorRaw.includes('-') || sufixo === 'D' || sufixo === '-';
        if (isNaN(valorNum) || descricao.length < 3) continue;

        const dParts = dataRaw.split('/');
        let ano: string | number = dParts.length === 3 ? dParts[2] : faturaYear;
        if (dParts.length === 2 && dParts[1] === '12' && faturaMonth <= 3)  ano = faturaYear - 1;
        else if (dParts.length === 2 && dParts[1] === '01' && faturaMonth >= 11) ano = faturaYear + 1;

        transactions.push({
          id:          crypto.randomUUID(),
          date:        `${ano}-${dParts[1].padStart(2,'0')}-${dParts[0].padStart(2,'0')}`,
          description: descricao.substring(0, 50).trim(),
          value:       valorNum,
          type:        isCartao ? (isNegative ? 'entrada' : 'saida') : (isNegative ? 'saida' : 'entrada'),
          account:     isCartao ? 'cartao_credito' : 'conta_corrente',
          category:    'Importado',
        });
      }
    }

    if (transactions.length === 0) throw new Error('Nenhuma transação encontrada no PDF.');
    return transactions;
  } catch (error) {
    const e = error as Error;
    if (e.message === 'PASSWORD_REQUIRED') throw error;
    throw new Error(`Falha no PDF: ${e.message}`);
  }
};
