// src/utils/aiCategorize.js
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../firebase'; 

export async function classifyWithAI(transactions) {
  if (!transactions || transactions.length === 0) return [];

  try {
    console.log(`🚀 A enviar ${transactions.length} transações para o Motor Quântico na Nuvem...`);
    
    const functions = getFunctions(app);
    // Chama EXATAMENTE o nome da função que você exportou no seu functions/index.js
    const categorizeTransactionsBatch = httpsCallable(functions, 'categorizeTransactionsBatch');

    const result = await categorizeTransactionsBatch({ transactions });

    // A sua função já devolve o JSON parseado, por isso basta ler result.data
    const categorizedResult = result.data;

    console.log("✅ Resposta da Nuvem recebida com sucesso!");

    const updatedTransactions = transactions.map(tx => {
      const aiMatch = categorizedResult.find(c => c.id === tx.id);
      return {
        ...tx,
        category: (aiMatch && aiMatch.category) ? aiMatch.category : (tx.category || 'Diversos')
      };
    });

    return updatedTransactions;

  } catch (error) {
    console.error("❌ Falha na comunicação com a Cloud Function:", error);
    return transactions;
  }
}