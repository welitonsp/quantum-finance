// src/utils/ofxParser.js

export async function parseOFX(file) {
  const text = await file.text();
  const transactions = [];
  const trnRegex = /<STMTTRN>[\s\S]*?<\/STMTTRN>/g;
  const matches = text.match(trnRegex);
  
  if (!matches) throw new Error("OFX sem transações válidas.");

  matches.forEach(match => {
    const amountStr = match.match(/<TRNAMT>(.+)/)?.[1]?.trim() || '0';
    const amount = parseFloat(amountStr);
    const dateStr = match.match(/<DTPOSTED>(\d{8})/)?.[1]; 
    const memo = match.match(/<MEMO>(.+)/)?.[1]?.trim() || 'Importação';

    let formattedDate = new Date().toISOString().split('T')[0];
    if (dateStr) {
       const year = dateStr.substring(0,4);
       const month = dateStr.substring(4,6);
       const day = dateStr.substring(6,8);
       formattedDate = `${year}-${month}-${day}`;
    }

    transactions.push({
      value: Math.abs(amount),
      type: amount < 0 ? 'saida' : 'entrada',
      category: memo,
      date: formattedDate
    });
  });

  return transactions;
}