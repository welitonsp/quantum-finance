// src/utils/pdfParser.js
import * as pdfjsLib from 'pdfjs-dist';

// Configuração do Worker do PDF.js (Obrigatório no Vite/React)
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

export const parsePDF = async (file) => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const transactions = [];

    // Regex para encontrar o padrão Itaú/C6: "05/01" ou "05/01/2026" + "NOME" + "150,00"
    const regexTransacao = /(\d{2}\/\d{2}(?:\/\d{4})?)\s+(.+?)\s+(-?\d{1,3}(?:\.\d{3})*,\d{2})/g;

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      
      // MÁGICA DE ENGENHARIA: Ordenar os blocos de texto pelas coordenadas Y (linha) e X (coluna)
      // Isso impede que o PDF leia as colunas de forma embaralhada.
      const items = textContent.items;
      items.sort((a, b) => {
        // Se a diferença do eixo Y for maior que 5 pixels, é outra linha
        const yDiff = b.transform[5] - a.transform[5];
        if (Math.abs(yDiff) > 5) return yDiff; 
        // Se for na mesma linha, ordena da esquerda para a direita (Eixo X)
        return a.transform[4] - b.transform[4]; 
      });

      // Junta as palavras ordenadas para formar um texto legível
      const pageText = items.map(item => item.str).join(' ');

      let match;
      // Procura transações no texto reconstruído
      while ((match = regexTransacao.exec(pageText)) !== null) {
        const dataRaw = match[1]; 
        const descricao = match[2].trim();
        const valorRaw = match[3];

        // Filtro: Ignorar a linha de pagamento da fatura para não baralhar o saldo
        if (descricao.toLowerCase().includes("pagamento") || descricao.toLowerCase().includes("saldo")) continue;

        // Normalização de Data
        const anoAtual = new Date().getFullYear();
        const partes = dataRaw.split('/');
        const dia = partes[0];
        const mes = partes[1];
        const ano = partes.length === 3 ? partes[2] : anoAtual;
        
        // Normalização de Valor (BRL para Decimal)
        let valorNum = parseFloat(valorRaw.replace(/\./g, '').replace(',', '.'));
        const tipo = valorNum >= 0 ? 'saida' : 'entrada';
        valorNum = Math.abs(valorNum);

        transactions.push({
          id: crypto.randomUUID(),
          date: `${ano}-${mes}-${dia}`,
          description: descricao,
          value: valorNum,
          type: tipo,
          account: 'cartao_credito'
        });
      }
    }

    return transactions;
  } catch (error) {
    console.error("Erro no motor de IA do PDF:", error);
    throw new Error("Não foi possível ler a estrutura deste PDF. Por favor, importe a versão CSV desta fatura.");
  }
};