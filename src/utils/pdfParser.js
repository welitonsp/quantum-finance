// src/utils/pdfParser.js
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

export async function parsePDF(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = "";

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    fullText += textContent.items.map(item => item.str).join(" ") + "\n";
  }

  const transactions = [];
  // Regex ajustado para capturar compras do C6 (Ex: 25/01 SUPERMERCADO 29,98)
  const regexFatura = /(\d{2}\/\d{2})\s+([A-Za-z0-9\s*.-]+?)\s+(\d+,\d{2})/g;
  let match;

  while ((match = regexFatura.exec(fullText)) !== null) {
    const dataCrua = match[1];
    const descricao = match[2].trim();
    const valorFinal = parseFloat(match[3].replace('.', '').replace(',', '.'));

    const [dia, mes] = dataCrua.split('/');
    const ano = new Date().getFullYear();
    
    transactions.push({
      value: valorFinal,
      type: 'saida',
      category: descricao,
      date: `${ano}-${mes}-${dia}`
    });
  }

  return transactions;
}