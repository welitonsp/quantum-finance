// src/utils/aiCategorize.js
import toast from "react-hot-toast";
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../firebase/index'; // Confirma se o caminho para inicializar a app Firebase está correto

const functions = getFunctions(app);

export async function classifyWithAI(transactions) {
  if (!transactions || transactions.length === 0) return transactions;

  try {
    // 1. Apontamos para a nossa Cloud Function segura em vez da API direta do Google
    const categorizeBatchFn = httpsCallable(functions, 'categorizeTransactionsBatch');
    
    // 2. Enviamos o array de transações para o nosso servidor
    const response = await categorizeBatchFn({ transactions });
    
    // 3. O servidor devolve o Array JSON processado pelo Gemini
    const aiResults = response.data; 

    if (!Array.isArray(aiResults)) {
      throw new Error("Formato de resposta inválido do servidor.");
    }

    // 4. Mapeamos os resultados de volta para as transações originais (Tua lógica mantida)
    return transactions.map(tx => {
      const result = aiResults.find(r => r.id === tx.id);
      return result ? { ...tx, category: result.category } : tx;
    });

  } catch (err) {
    console.error("Falha Quântica (Cloud Function):", err);
    toast.error("A rede neural falhou ou está indisponível.");
    // Retorna o array original intacto em caso de erro para não bloquear a importação
    return transactions; 
  }
}