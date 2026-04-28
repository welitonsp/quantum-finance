import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
import type { ParsedTransaction } from '../types/transaction';
import { fromCentavos, toCentavos, type Centavos } from '../types/money';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export const parsePDF = async (file: File, password: string | null = null): Promise<ParsedTransaction[]> => {
  try {
    if (!file || file.type !== 'application/pdf') {
      throw new Error('O ficheiro não é um PDF válido.');
    }

    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({
      data: arrayBuffer,
      password: password || undefined
    });

    let pdf: pdfjsLib.PDFDocumentProxy;
    try {
      pdf = await loadingTask.promise;
    } catch (err: unknown) {
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
      const firstPage = await pdf.getPage(1);
      const textContent = await firstPage.getTextContent();
      const firstPageText = textContent.items.map(i => ('str' in i ? i.str : '')).join(' ');

      if (firstPageText.toLowerCase().includes('extrato conta corrente')) isCartao = false;

      const vencimentoMatch = firstPageText.match(/Vencimento:\s*\d{2}\/(\d{2})\/(\d{4})/i);
      if (vencimentoMatch) {
        faturaMonth = parseInt(vencimentoMatch[1] ?? String(faturaMonth), 10);
        faturaYear  = parseInt(vencimentoMatch[2] ?? String(faturaYear), 10);
      }
    } catch { console.warn('Erro ao ler cabeçalho.'); }

    const regexTransacao = /(?:^|[^0-9])([0-3]\d\/[0-1]\d(?:\/\d{4})?)\s+(.+?)\s+(-?\s?\d{1,3}(?:[.\s]\d{3})*,\d{2})\s*([DC-])?(?:\s.*)?$/i;
    const transactions: ParsedTransaction[] = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const viewport = page.getViewport({ scale: 1 });
      const midX = viewport.width / 2;

      const items = textContent.items.filter(item => 'str' in item && item.str && item.str.trim());

      const leftCol  = items.filter(i => ('transform' in i) && ((i.transform[4] ?? 0) < midX));
      const rightCol = items.filter(i => ('transform' in i) && ((i.transform[4] ?? 0) >= midX));

      type TextItem = { str: string; transform: number[] };

      const buildLines = (colItems: typeof items): string[] => {
        const sorted = (colItems as TextItem[]).sort((a, b) =>
          Math.round(b.transform[5] ?? 0) - Math.round(a.transform[5] ?? 0) || (a.transform[4] ?? 0) - (b.transform[4] ?? 0)
        );
        const lines: string[] = [];
        let currentLine: string[] = [];
        let lastY: number | null = null;
        for (const item of sorted) {
          const y = Math.round(item.transform[5] ?? 0);
          if (lastY === null || Math.abs(y - lastY) <= 6) currentLine.push(item.str.trim());
          else { lines.push(currentLine.join(' ')); currentLine = [item.str.trim()]; }
          lastY = y;
        }
        if (currentLine.length) lines.push(currentLine.join(' '));
        return lines;
      };

      const lines = [...buildLines(leftCol), ...buildLines(rightCol)];

      for (const line of lines) {
        const match = line.match(regexTransacao);
        if (!match) continue;

        const [, dataRaw = '', descricao = '', valorRaw = '', sufixo] = match;
        const isNegative = valorRaw.includes('-') || sufixo === 'D' || sufixo === '-';
        let valueCents: Centavos;
        try {
          valueCents = toCentavos(valorRaw.replace(/\s/g, '').replace(/^-/, ''));
        } catch {
          continue;
        }
        if (valueCents === 0 || descricao.length < 3) continue;
        valueCents = Math.abs(valueCents) as Centavos;

        const dParts = dataRaw.split('/');
        let ano: string | number = dParts.length === 3 ? dParts[2] ?? faturaYear : faturaYear;
        if (dParts.length === 2 && dParts[1] === '12' && faturaMonth <= 3) ano = faturaYear - 1;
        else if (dParts.length === 2 && dParts[1] === '01' && faturaMonth >= 11) ano = faturaYear + 1;
        const monthPart = dParts[1] ?? '';
        const dayPart = dParts[0] ?? '';
        const date = `${ano}-${monthPart.padStart(2, '0')}-${dayPart.padStart(2, '0')}`;
        const parsedDate = new Date(`${date}T00:00:00Z`);
        if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) continue;

        transactions.push({
          id:          `pdf:${pageNum}:${transactions.length}:${date}:${valueCents}`,
          date,
          description: descricao.substring(0, 50).trim(),
          value:       fromCentavos(valueCents),
          value_cents: valueCents,
          schemaVersion: 2,
          type:        isCartao ? (isNegative ? 'entrada' : 'saida') : (isNegative ? 'saida' : 'entrada'),
          account:     isCartao ? 'cartao_credito' : 'conta_corrente',
          category:    'Importado',
          source:      'pdf',
        });
      }
    }

    if (transactions.length === 0) throw new Error('Nenhuma transação encontrada no PDF.');
    return transactions;
  } catch (error: unknown) {
    const e = error as Error;
    if (e.message === 'PASSWORD_REQUIRED') throw error;
    throw new Error(`Falha no PDF: ${e.message}`);
  }
};
