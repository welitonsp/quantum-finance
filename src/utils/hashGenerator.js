// src/utils/hashGenerator.js

/**
 * Gera uma assinatura única e inviolável para cada transação.
 * Combina Data + Valor + Conta + Descrição para evitar colisões.
 */
export function generateTransactionHash(tx) {
  // 1. Valor exato com 2 casas decimais
  const valorNum = Number(tx.value).toFixed(2);
  
  // 2. Data formatada (YYYY-MM-DD)
  let dataStr = tx.date;
  if (!dataStr && tx.createdAt && typeof tx.createdAt.getFullYear === 'function') {
    const ano = tx.createdAt.getFullYear();
    const mes = String(tx.createdAt.getMonth() + 1).padStart(2, '0');
    const dia = String(tx.createdAt.getDate()).padStart(2, '0');
    dataStr = `${ano}-${mes}-${dia}`;
  } else if (!dataStr) {
     // Fallback de segurança se não houver data
     const hoje = new Date();
     dataStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
  }

  // 3. Descrição limpa
  const desc = (tx.description || '').toLowerCase().trim();
  
  // 4. Módulo de Conta (Crucial para evitar colisão entre Cartão e Conta Corrente)
  const conta = tx.account || 'geral';

  // O Hash Final (Ex: 2026-02-05_150.00_cartao_credito_mc donalds)
  return `${dataStr}_${valorNum}_${conta}_${desc}`;
}