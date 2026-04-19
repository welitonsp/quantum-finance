// src/hooks/useImportActions.ts
import { useCallback } from 'react';
import toast from 'react-hot-toast';
import { FirestoreService } from '../shared/services/FirestoreService';
import { showAIFeedbackBatch } from '../shared/lib/aiFeedbackToast';

interface User {
  uid?: string;
}

type AnyRecord = Record<string, unknown>;

export function useImportActions(user: User | null | undefined) {
  const uid = user?.uid;

  const handleImport = useCallback(async (parsedData: AnyRecord[]) => {
    if (!uid || !parsedData || parsedData.length === 0) {
      toast.error('Ficheiro vazio ou dados corrompidos.');
      return;
    }

    const toastId = toast.loading('A importar dados bancários...');

    try {
      const result = await FirestoreService.saveAllTransactions(uid, parsedData);

      if (result.added > 0) {
        toast.success(`Importação concluída: ${result.added} registos adicionados.`, { id: toastId });
        const sample = parsedData
          .filter(tx => tx['category'] && tx['category'] !== 'Importado' && tx['category'] !== 'Diversos')
          .slice(0, 3)
          .map(tx => ({ description: tx['description'] as string, category: tx['category'] as string }));
        if (sample.length > 0) showAIFeedbackBatch(sample, 900, 3);
      } else if (result.duplicates > 0) {
        toast.success(`Ficheiro importado. ${result.duplicates} registos ignorados (duplicados).`, { id: toastId });
      } else {
        toast.error('Nenhuma movimentação nova foi adicionada.', { id: toastId });
      }

      return result;
    } catch (error) {
      console.error('Interferência na Importação:', error);
      toast.error('Falha crítica ao importar o ficheiro.', { id: toastId });
    }
  }, [uid]);

  return { handleImport };
}
