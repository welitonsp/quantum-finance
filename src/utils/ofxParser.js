// src/utils/ofxParser.js
// Baseado na estrutura real dos extratos do Itaú exportados em OFX (SGML v1.02).
//
// Estrutura confirmada do arquivo:
//   - OFXHEADER:100 / DATA:OFXSGML / VERSION:102
//   - CHARSET:1252 / ENCODING:USASCII (na prática: ASCII puro nos MEMOs)
//   - Tags fechadas com </STMTTRN> (apesar do SGML, o Itaú fecha as tags)
//   - Data: 20260102100000[-03:EST] — 14 dígitos + sufixo timezone
//   - Valor: ponto como decimal, negativo = débito
//   - FITID presente em todas as transações

/**
 * Lê o arquivo OFX como texto.
 * O Itaú declara CHARSET:1252 mas usa ASCII puro nos campos de texto,
 * então UTF-8 e latin1 produzem o mesmo resultado na prática.
 * Usamos latin1 como segurança caso algum memo tenha caracteres especiais.
 */
function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`Falha ao ler o arquivo: ${file.name}`));
    reader.readAsText(file, 'windows-1252'); // charset declarado no header OFX do Itaú
  });
}

/**
 * Extrai o valor de uma tag OFX dentro de um bloco.
 * Suporta tanto OFX SGML (sem fechamento) quanto XML (com fechamento).
 * Retorna null se a tag não existir.
 */
function extractTag(block, tag) {
  // Captura até fim de linha, tag de fechamento, ou outra tag — o que vier primeiro
  const match = block.match(new RegExp(`<${tag}>([^<\r\n]+)`));
  return match ? match[1].trim() : null;
}

/**
 * Converte data OFX para YYYY-MM-DD.
 *
 * Formatos suportados (todos confirmados no arquivo real):
 *   20260102100000[-03:EST]  → 2026-01-02
 *   20260102                 → 2026-01-02
 *
 * Estratégia: pega apenas os primeiros 8 dígitos, ignora hora e timezone.
 */
function parseOFXDate(raw) {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, ''); // remove tudo que não é dígito
  if (digits.length < 8) return null;

  const year  = digits.slice(0, 4);
  const month = digits.slice(4, 6);
  const day   = digits.slice(6, 8);

  // Valida a data construída
  const date = new Date(`${year}-${month}-${day}T00:00:00`);
  return isNaN(date.getTime()) ? null : `${year}-${month}-${day}`;
}

/**
 * Determina 'entrada' ou 'saida' usando TRNTYPE e o sinal do valor.
 *
 * TRNTYPE confirmados no arquivo Itaú: DEBIT, CREDIT
 * Usar TRNTYPE é mais confiável que só o sinal para estornos/transferências.
 */
function resolveType(trnType, amount) {
  if (trnType) {
    const t = trnType.toUpperCase();
    if (['CREDIT', 'DEP', 'INT', 'DIV', 'DIRECTDEP'].includes(t)) return 'entrada';
    if (['DEBIT', 'CHECK', 'PAYMENT', 'ATM', 'POS'].includes(t))  return 'saida';
  }
  // Fallback pelo sinal (negativo = saída no padrão OFX)
  return amount < 0 ? 'saida' : 'entrada';
}

/**
 * Faz o parse de um arquivo OFX do Itaú (extrato conta corrente).
 *
 * @param {File} file - Arquivo .ofx selecionado pelo usuário
 * @returns {Promise<Array>} - Transações no formato interno da aplicação
 * @throws {Error} Mensagem descritiva para exibir ao usuário
 */
export async function parseOFX(file) {
  if (!file) throw new Error('Nenhum arquivo fornecido.');
  if (!file.name.toLowerCase().endsWith('.ofx')) {
    throw new Error('O arquivo precisa ter extensão .ofx');
  }

  const text = await readFileAsText(file);

  // Validação básica: deve parecer um arquivo OFX
  if (!text.includes('OFXHEADER') && !text.includes('<OFX>')) {
    throw new Error('O arquivo não parece ser um OFX válido.');
  }
  if (!text.includes('<STMTTRN>')) {
    throw new Error('Nenhuma transação encontrada no OFX (tag <STMTTRN> ausente).');
  }

  // O Itaú fecha com </STMTTRN> — o regex funciona para SGML e XML
  const trnRegex   = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
  const transactions = [];
  const seenFitIds   = new Set(); // deduplicação: evita reimportar o mesmo arquivo
  let match;

  while ((match = trnRegex.exec(text)) !== null) {
    const block = match[1];

    const fitId = extractTag(block, 'FITID');

    // Ignora duplicatas dentro do mesmo arquivo
    if (fitId && seenFitIds.has(fitId)) continue;
    if (fitId) seenFitIds.add(fitId);

    const amountStr = extractTag(block, 'TRNAMT');
    const amount    = amountStr ? parseFloat(amountStr.replace(',', '.')) : null;

    // Transação sem valor válido é descartada
    if (amount === null || isNaN(amount)) continue;

    const dateRaw = extractTag(block, 'DTPOSTED');
    const date    = parseOFXDate(dateRaw) ?? new Date().toISOString().split('T')[0];

    const trnType    = extractTag(block, 'TRNTYPE');
    const memo       = extractTag(block, 'MEMO')
                    ?? extractTag(block, 'NAME')
                    ?? 'Importação OFX';

    transactions.push({
      id         : fitId ?? crypto.randomUUID(),
      value      : Math.abs(amount),
      type       : resolveType(trnType, amount),
      category   : 'Importado',
      description: memo,
      date,
      importedAt : new Date().toISOString(),
    });
  }

  if (transactions.length === 0) {
    throw new Error('Nenhuma transação válida encontrada no arquivo OFX.');
  }

  return transactions;
}
