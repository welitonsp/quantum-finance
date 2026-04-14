// src/hooks/useImportActions.js
// Responsabilidade única: lógica de importação de ficheiros bancários (CSV/OFX/PDF).
import { useCallback } from 'react';
import toast from 'react-hot-toast';
import { FirestoreService } from '../shared/services/FirestoreService';

export function useImportActions(user) {
  // Depende apenas da uid primitiva — não do objeto user completo,
  // para evitar recriações desnecessárias quando o Firebase renova o token.
  const uid = user?.uid;

  const handleImport = useCallback(async (parsedData) => {
    if (!uid || !parsedData || parsedData.length === 0) {
      toast.error("Ficheiro vazio ou dados corrompidos.");
      return;
    }

    const toastId = toast.loading("A importar dados bancários...");

    try {
      const result = await FirestoreService.saveAllTransactions(uid, parsedData);

      if (result.added > 0) {
        toast.success(`Importação concluída: ${result.added} registos adicionados.`, { id: toastId });
      } else if (result.duplicates > 0) {
        toast.success(`Ficheiro importado. ${result.duplicates} registos ignorados (duplicados).`, { id: toastId });
      } else {
        toast.error("Nenhuma movimentação nova foi adicionada.", { id: toastId });
      }

      return result;
    } catch (error) {
      console.error("Interferência na Importação:", error);
      toast.error("Falha crítica ao importar o ficheiro.", { id: toastId });
    }
  }, [uid]);

  return { handleImport };
}
