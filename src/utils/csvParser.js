// src/utils/csvParser.js

/**
 * Extrator de CSV para o formato C6 Bank (data,lançamento,valor)
 */
export async function parseCSV(file) {
  const text = await file.text();
  const lines = text.split('\n');
  const transactions = [];

  // Pulamos a primeira linha (cabeçalho)
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Divide a linha pelas vírgulas
    const [date, description, value] = line.split(',');

    if (date && description && value) {
      transactions.push({
        value: Math.abs(parseFloat(value)),
        type: 'saida', // CSV de fatura é sempre saída
        category: description.trim(),
        date: date.trim() // Já está no formato YYYY-MM-DD
      });
    }
  }

  return transactions;
}