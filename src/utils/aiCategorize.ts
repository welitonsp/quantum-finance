import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../shared/api/firebase/index';
import type { Transaction } from '../shared/types/transaction';

interface CategorizeResult {
  id: string;
  category: string;
}

export async function classifyWithAI(transactions: Transaction[]): Promise<Transaction[]> {
  if (!transactions || transactions.length === 0) return [];

  try {
    console.log(`🚀 A enviar ${transactions.length} transações para o Motor Quântico na Nuvem...`);

    const functions = getFunctions(app);
    const categorizeTransactionsBatch = httpsCallable<
      { transactions: Transaction[] },
      CategorizeResult[]
    >(functions, 'categorizeTransactionsBatch');

    const result = await categorizeTransactionsBatch({ transactions });
    const categorizedResult = result.data;

    console.log('✅ Resposta da Nuvem recebida com sucesso!');

    return transactions.map(tx => {
      const aiMatch = categorizedResult.find(c => c.id === tx.id);
      return {
        ...tx,
        category: (aiMatch?.category) ? aiMatch.category : (tx.category || 'Diversos')
      };
    });
  } catch (error) {
    console.error('❌ Falha na comunicação com a Cloud Function:', error);
    return transactions;
  }
}
