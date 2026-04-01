// src/utils/pdfParser.js
import * as pdfjsLib from 'pdfjs-dist';
// Importação NATIVA do Worker para o Vite (Isto resolve o erro do CDN)
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

// Configuração do Worker usando o arquivo local do seu node_modules
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export const parsePDF = async (file, password = null) => {
  try {
    if (!file || file.type !== 'application/pdf') {
      throw new Error('O ficheiro não é um PDF válido.');
    }

    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ 
      data: arrayBuffer,
      password: password || undefined 
    });
    
    let pdf;
    try {
      pdf = await loadingTask.promise;
    } catch (err) {
      if (err.name === 'PasswordException' || err.message?.toLowerCase().includes('password')) {
        throw new Error('PASSWORD_REQUIRED');
      }
      throw err;
    }

    // --- Extrai metadados da primeira página ---
    let faturaYear = new Date().getFullYear();
    let faturaMonth = new Date().getMonth() + 1;
    let isCartao = true; 

    try {
      const firstPage = await pdf.getPage(1);
      const firstPageTextContent = await firstPage.getTextContent();
      const firstPageText = firstPageTextContent.items.map(i => i.str).join(' ');
      
      const textoLower = firstPageText.toLowerCase();
      if (textoLower.includes('extrato conta corrente')) {
        isCartao = false;
      } else if (textoLower.includes('resumo da fatura') || textoLower.includes('cartão')) {
        isCartao = true;
      }

      const vencimentoMatch = firstPageText.match(/Vencimento:\s*\d{2}\/(\d{2})\/(\d{4})/i);
      if (vencimentoMatch) {
        faturaMonth = parseInt(vencimentoMatch[1], 10);
        faturaYear = parseInt(vencimentoMatch[2], 10);
      } else {
        const yearMatch = firstPageText.match(/202[0-9]/); 
        if (yearMatch) faturaYear = parseInt(yearMatch[0], 10);
      }
    } catch (e) {
      console.warn("Aviso: Não foi possível ler o cabeçalho do PDF.");
    }

    // --- Regex Quântica Blindada (Ignora símbolos @ e ☑ do Itaú) ---
    const regexTransacao = /(?:^|[^0-9])([0-3]\d\/[0-1]\d(?:\/\d{4})?)\s+(.+?)\s+(-?\s?\d{1,3}(?:[.\s]\d{3})*,\d{2})\s*([DC\-])?(?:\s.*)?$/i;
    const transactions = [];

    // --- Percorre as páginas ---
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      
      // ========================================================
      // ENGINE DE COLUNAS (O Radar Espacial do Comandante)
      // ========================================================
      const viewport = page.getViewport({ scale: 1 });
      const midX = viewport.width / 2; 

      const leftColItems = [];
      const rightColItems = [];

      textContent.items.forEach(item => {
        if (!item.str || !item.str.trim()) return;
        if (item.transform[4] < midX) {
          leftColItems.push(item);
        } else {
          rightColItems.push(item);
        }
      });

      // Função O(N log N) para reconstruir linhas de uma coluna
      const buildLinesFromItems = (items) => {
        if (!items.length) return [];
        
        const sorted = items.sort((a, b) => {
          const yDiff = Math.round(b.transform[5]) - Math.round(a.transform[5]);
          if (yDiff !== 0) return yDiff; // Decrescente (Topo -> Base)
          return a.transform[4] - b.transform[4]; // Esquerda -> Direita
        });

        const lines = [];
        let currentLine = [];
        let lastY = null;

        for (const item of sorted) {
          const y = Math.round(item.transform[5]);
          if (lastY === null || Math.abs(y - lastY) <= 6) { // Tolerância de 6px
            currentLine.push(item.str.trim());
          } else {
            if (currentLine.length) lines.push(currentLine.join(' '));
            currentLine = [item.str.trim()];
          }
          lastY = y;
        }
        if (currentLine.length) lines.push(currentLine.join(' '));
        return lines;
      };

      const leftLines = buildLinesFromItems(leftColItems);
      const rightLines = buildLinesFromItems(rightColItems);
      
      // Junta as linhas das duas colunas para processamento sequencial
      const lines = [...leftLines, ...rightLines];

      // ------------------------------------------------------------
      // Processa cada linha isolada
      // ------------------------------------------------------------
      for (const line of lines) {
        const match = line.match(regexTransacao);
        if (!match) continue;

        let dataRaw = match[1];
        let descricao = match[2].trim();
        let valorRaw = match[3].trim();
        let sufixo = match[4]?.toUpperCase();

        let valorClean = valorRaw.replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
        let isNegative = valorClean.startsWith('-') || sufixo === 'D' || sufixo === '-';
        valorClean = valorClean.replace(/^-/, '');

        const descLower = descricao.toLowerCase();
        if (
          descLower.includes("pagamento efetuado") || descLower.includes("saldo") ||
          descLower.includes("total") || descLower.includes("limite") ||
          descLower.includes("encargos") || descLower.includes("juros") ||
          descLower.includes("multa") || descLower.includes("rendimento") ||
          descLower === "lançamentos atuais" || descLower === "próxima fatura" ||
          descLower === "demais faturas" || descLower.includes("fatura anterior")
        ) {
          continue;
        }

        descricao = descricao.replace(/\s\d{2}\/\d{2}$/, '').trim();
        const valorNum = parseFloat(valorClean);
        
        if (isNaN(valorNum) || valorNum === 0 || descricao.length < 3) continue;

        let tipo = 'saida';
        if (isCartao) {
          tipo = isNegative ? 'entrada' : 'saida';
        } else {
          tipo = isNegative ? 'saida' : 'entrada';
        }

        const partesData = dataRaw.split('/');
        let dia = partesData[0];
        let mes = partesData[1];
        let ano = partesData.length === 3 ? partesData[2] : faturaYear;

        if (parseInt(mes, 10) === 0 || parseInt(dia, 10) === 0) continue;

        // INTELIGÊNCIA TEMPORAL DE VIRAGEM DE ANO
        if (partesData.length === 2 && mes === '12' && faturaMonth <= 3) {
            ano = faturaYear - 1;
        } else if (partesData.length === 2 && mes === '01' && faturaMonth >= 11) {
            ano = faturaYear + 1;
        }

        const dataFormatada = `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;

        transactions.push({
          id: crypto.randomUUID(),
          date: dataFormatada,
          description: descricao.substring(0, 50),
          value: valorNum,
          type: tipo,
          account: isCartao ? 'cartao_credito' : 'conta_corrente',
          category: 'Importado'
        });
      }
    }

    if (transactions.length === 0) {
      throw new Error('Nenhuma transação encontrada no formato esperado.');
    }

    return transactions;

  } catch (error) {
    console.error("Erro no parsePDF:", error);
    if (error.message === 'PASSWORD_REQUIRED') throw new Error('PASSWORD_REQUIRED');
    throw new Error(`Falha ao processar PDF: ${error.message}`);
  }
};