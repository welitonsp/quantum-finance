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
    // BLINDAGEM: Se não houver utilizador logado, avisa antes de tentar
    if (!uid) {
      alert("Aguarde a conexão com o banco de dados...");
      return;
    }
    if (!file) return;

    try {
      setIsProcessing(true);
      const ext = file.name.split('.').pop().toLowerCase();
      let extractedData = [];

      if (ext === 'ofx') extractedData = await parseOFX(file);
      else if (ext === 'pdf') extractedData = await parsePDF(file);
      else if (ext === 'csv') extractedData = await parseCSV(file);
      
      if (!extractedData || extractedData.length === 0) {
        throw new Error("Não foram encontrados dados válidos no ficheiro.");
      }

      const customRules = await FirestoreService.getCategoryRules(uid);
      
      const smartData = extractedData.map(tx => ({
        ...tx,
        category: autoCategorize(tx.category, customRules)
      }));
      
      await onImportTransactions(smartData);
      alert(`Importação concluída: ${smartData.length} itens.`);

    } catch (err) {
      console.error(err);
      alert("Erro na importação: " + err.message);
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div>
      <input type="file" accept=".ofx,.pdf,.csv" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
      <button 
        onClick={() => fileInputRef.current.click()} 
        disabled={isProcessing} 
        className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-4 py-3 font-bold text-indigo-400 hover:bg-indigo-500/20 disabled:opacity-50 transition-all"
      >
        {isProcessing ? "A processar..." : "📄 Importar (OFX/PDF/CSV)"}
      </button>
    </div>
  );
}