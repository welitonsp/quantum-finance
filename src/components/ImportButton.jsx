// src/components/ImportButton.jsx
import { useRef, useState } from "react";
import { parseOFX } from "../utils/ofxParser";
import { parsePDF } from "../utils/pdfParser";
import { parseCSV } from "../utils/csvParser";
import { autoCategorize } from "../utils/autoCategory";
import { FirestoreService } from "../services/FirestoreService";

export default function ImportButton({ onImportTransactions, uid }) {
  const fileInputRef = useRef(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleFileChange = async (event) => {
    const file = event.target.files[0];
    
    // Proteção: Garante que o sistema está conectado à base de dados
    if (!uid) {
      alert("Aguarde a conexão com a base de dados...");
      return;
    }
    
    if (!file) return;

    try {
      setIsProcessing(true);
      const ext = file.name.split('.').pop().toLowerCase();
      let extractedData = [];
      
      // Inteligência de Roteamento: Define a origem baseada no tipo de ficheiro
      let accountType = "conta_corrente"; 

      if (ext === 'ofx') {
        extractedData = await parseOFX(file);
        accountType = "conta_corrente"; // OFX = Extrato da Conta Corrente (Itaú)
      }
      else if (ext === 'csv') {
        extractedData = await parseCSV(file);
        accountType = "cartao_credito"; // CSV = Fatura do Cartão (C6/Itaú)
      }
      else if (ext === 'pdf') {
        extractedData = await parsePDF(file);
        accountType = "cartao_credito"; 
      }
      
      if (!extractedData || extractedData.length === 0) {
        throw new Error("Não foram encontrados dados válidos no ficheiro.");
      }

      // 1. Vai buscar as regras personalizadas que o utilizador criou no Firebase
      const customRules = await FirestoreService.getCategoryRules(uid);
      
      // 2. O Motor de IA entra em ação: Mapeia as transações e categoriza automaticamente
      const smartData = extractedData.map(tx => ({
        ...tx,
        // O motor lê a descrição crua (tx.description) e aplica a regra correta
        category: autoCategorize(tx.description, customRules), 
        account: accountType // Injeta a etiqueta da conta correta
      }));
      
      // 3. Envia o lote processado para o App.jsx gravar no Firebase
      await onImportTransactions(smartData);
      
      // Alerta de sucesso formatado
      const nomeModulo = accountType === 'cartao_credito' ? 'Cartão de Crédito' : 'Conta Corrente';
      alert(`Importação concluída com sucesso!\n\n${smartData.length} transações foram categorizadas pela IA e salvas no módulo: ${nomeModulo}.`);

    } catch (err) {
      console.error(err);
      alert("Erro na importação: " + err.message);
    } finally {
      setIsProcessing(false);
      // Limpa o input para permitir importar o mesmo ficheiro duas vezes seguidas, se necessário
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div>
      <input 
        type="file" 
        accept=".ofx,.pdf,.csv" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        className="hidden" 
      />
      <button 
        onClick={() => fileInputRef.current.click()} 
        disabled={isProcessing} 
        className="flex items-center gap-2 rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-4 py-3 font-bold text-indigo-400 hover:bg-indigo-500/20 disabled:opacity-50 transition-all shadow-lg"
      >
        {isProcessing ? (
          <>
            <span className="animate-spin text-xl">⏳</span>
            A processar com IA...
          </>
        ) : (
          "📄 Importar Extrato ou Fatura"
        )}
      </button>
    </div>
  );
}