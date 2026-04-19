// src/utils/aiCategorize.ts
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../shared/api/firebase/index';

interface TxInput {
  id: string;
  category?: string;
  [key: string]: unknown;
}

interface AIResult {
  id: string;
  category: string;
}

export async function classifyWithAI(transactions: TxInput[]): Promise<TxInput[]> {
  if (!transactions || transactions.length === 0) return [];

  try {
    console.log(`🚀 A enviar ${transactions.length} transações para o Motor Quântico na Nuvem...`);
    const functions = getFunctions(app);
    const categorizeTransactionsBatch = httpsCallable<{ transactions: TxInput[] }, AIResult[]>(
      functions, 'categorizeTransactionsBatch'
    );
    const result = await categorizeTransactionsBatch({ transactions });
    const categorizedResult = result.data;
    console.log('✅ Resposta da Nuvem recebida com sucesso!');

    return transactions.map(tx => {
      const aiMatch = categorizedResult.find(c => c.id === tx.id);
      return { ...tx, category: aiMatch?.category || tx.category || 'Diversos' };
    });
  } catch (error) {
    console.error('❌ Falha na comunicação com a Cloud Function:', error);
    return transactions;
  }
}
