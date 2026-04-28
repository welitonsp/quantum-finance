import { useCallback } from 'react';
import toast from 'react-hot-toast';
import { showAIFeedbackBatch } from '../shared/lib/aiFeedbackToast';
import { fromCentavos, toCentavos } from '../shared/types/money';
import type { Transaction, ImportResult } from '../shared/types/transaction';
import type { User } from 'firebase/auth';

interface UseImportActionsReturn {
  handleImport: (parsedData: Partial<Transaction>[]) => Promise<ImportResult | undefined>;
}

export function useImportActions(
  user: User | null,
  addBatch: (items: Partial<Transaction>[]) => Promise<string[]>
): UseImportActionsReturn {
  const uid = user?.uid;

  const handleImport = useCallback(async (parsedData: Partial<Transaction>[]): Promise<ImportResult | undefined> => {
    if (!uid || !parsedData.length) {
      toast.error('Ficheiro vazio ou dados corrompidos.');
      return;
    }

    const toastId = toast.loading('A sincronizar com o Cofre…');

    try {
      // Converte reais → centavos antes de persistir (Firestore armazena inteiros)
      const withCentavos = parsedData.map(tx => ({
        ...tx,
        value_cents: tx.value_cents ?? toCentavos(tx.value ?? 0),
        value: tx.value ?? fromCentavos(tx.value_cents ?? toCentavos(0)),
        schemaVersion: tx.schemaVersion ?? 2,
      }));
      await addBatch(withCentavos);

      const added = parsedData.length;
      toast.success(`${added} transaç${added === 1 ? 'ão adicionada' : 'ões adicionadas'} ao cofre.`, { id: toastId });

      // AI feedback toast (até 3 amostras com categoria conhecida)
      const sample = parsedData
        .filter(tx => tx.category && tx.category !== 'Importado' && tx.category !== 'Diversos')
        .slice(0, 3)
        .map(tx => ({ description: tx.description ?? '', category: tx.category ?? '' }));
      if (sample.length > 0) showAIFeedbackBatch(sample, 900, 3);

      return { added, duplicates: 0, invalid: 0 };
    } catch (error) {
      console.error('[useImportActions] Falha na importação:', error);
      toast.error('Falha crítica ao importar o ficheiro.', { id: toastId });
    }
  }, [uid, addBatch]);

  return { handleImport };
}
