// src/components/ImportButton.jsx
import { useRef, useState } from "react";
import { parseOFX } from "../utils/ofxParser";
import { parseCSV } from "../utils/csvParser";
import { parsePDF } from "../utils/pdfParser"; 
import { autoCategorize } from "../utils/autoCategory";
import { FirestoreService } from "../services/FirestoreService";
import { generateTransactionHash } from "../utils/hashGenerator"; // MÓDULO DE HASH GLOBAL
import toast from "react-hot-toast";
import { CheckCircle2, XCircle, UploadCloud } from "lucide-react";

export default function ImportButton({ onImportTransactions, uid }) {
  const fileInputRef = useRef(null);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [showModal, setShowModal] = useState(false);
  const [previewData, setPreviewData] = useState([]);
  const [importSummary, setImportSummary] = useState({ novas: 0, duplicadas: 0, conta: '' });

  const handleFileChange = async (event) => {
    const file = event.target.files[0];
    
    if (!uid) {
      toast.error("Aguarde a conexão com a base de dados...");
      return;
    }
    if (!file) return;

    const toastId = toast.loading(`A analisar os dados e consultar a base...`);

    try {
      setIsProcessing(true);
      const ext = file.name.split('.').pop().toLowerCase();
      let extractedData = [];
      let accountType = "conta_corrente"; 

      if (ext === 'ofx') {
        extractedData = await parseOFX(file);
        accountType = "conta_corrente";
      } else if (ext === 'csv') {
        extractedData = await parseCSV(file);
        accountType = "cartao_credito";
      } else if (ext === 'pdf') {
        extractedData = await parsePDF(file);
        accountType = "cartao_credito"; 
      }
      
      if (!extractedData || extractedData.length === 0) {
        throw new Error("Não foram encontrados dados válidos no ficheiro.");
      }

      const customRules = await FirestoreService.getCategoryRules(uid);
      const smartData = extractedData.map(tx => ({
        ...tx,
        category: autoCategorize(tx.description, customRules), 
        account: accountType 
      }));

      // 📡 O NOVO RADAR GLOBAL
      const timestamps = smartData.map(tx => new Date(`${tx.date}T12:00:00`).getTime()).filter(t => !isNaN(t));
      const minDate = new Date(Math.min(...timestamps));
      const maxDate = new Date(Math.max(...timestamps));

      const transacoesNoBanco = await FirestoreService.getTransactionsByPeriod(uid, minDate, maxDate);
      
      // 🛡️ USA O MOTOR DE HASH GLOBAL
      const assinaturasGlobais = new Set(transacoesNoBanco.map(generateTransactionHash));
      
      let novas = 0;
      let duplicadas = 0;
      
      const dataWithStatus = smartData.map(tx => {
        const hash = generateTransactionHash(tx);
        const isDuplicate = assinaturasGlobais.has(hash);
        
        if (isDuplicate) {
          duplicadas++;
        } else {
          novas++;
          assinaturasGlobais.add(hash); // Bloqueia repetidas dentro da própria fatura
        }

        return {
          ...tx,
          uniqueHash: hash, // O Hash mestre que será enviado para o Firebase
          isDuplicate
        };
      });

      setPreviewData(dataWithStatus);
      setImportSummary({ novas, duplicadas, conta: accountType });
      
      toast.dismiss(toastId); 
      setShowModal(true);     

    } catch (err) {
      console.error(err);
      toast.error(err.message, { id: toastId, duration: 5000 });
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = ''; 
    }
  };

  const handleConfirmImport = async () => {
    const transacoesParaSalvar = previewData
      .filter(tx => !tx.isDuplicate)
      .map(({ isDuplicate, ...txRest }) => txRest); 

    if (transacoesParaSalvar.length === 0) {
      toast.error("Nenhuma transação nova para salvar.");
      setShowModal(false);
      return;
    }

    const toastId = toast.loading("A trancar no cofre do Firebase...");
    
    try {
      await onImportTransactions(transacoesParaSalvar);
      const nomeModulo = importSummary.conta === 'cartao_credito' ? 'Cartão de Crédito' : 'Conta Corrente';
      toast.success(`${transacoesParaSalvar.length} transações gravadas em ${nomeModulo}.`, { id: toastId, duration: 5000 });
      setShowModal(false);
    } catch (error) {
      toast.error("Erro ao guardar transações.", { id: toastId });
    }
  };

  return (
    <>
      <div>
        <input type="file" accept=".ofx,.pdf,.csv" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
        <button 
          onClick={() => fileInputRef.current.click()} 
          disabled={isProcessing} 
          className="flex items-center gap-3 rounded-2xl border border-indigo-500/30 bg-indigo-500/10 px-6 py-3 text-sm xl:text-base font-bold text-indigo-400 hover:bg-indigo-500/20 hover:border-indigo-500/50 disabled:opacity-50 transition-all shadow-lg backdrop-blur-sm"
        >
          <UploadCloud className="w-5 h-5" />
          {isProcessing ? "A processar..." : "Importar Extrato"}
        </button>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#0f0f13] border border-zinc-800 rounded-[2rem] w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            
            <div className="p-6 xl:p-8 border-b border-zinc-800/60 bg-zinc-900/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h2 className="text-xl xl:text-2xl font-black text-zinc-100 tracking-tight">Revisão Inteligente</h2>
                <p className="text-sm text-zinc-500 mt-1 font-medium">Verifique os dados decifrados antes de guardar no cofre.</p>
              </div>
              <div className="flex gap-4">
                <div className="flex flex-col items-center bg-emerald-500/10 border border-emerald-500/20 px-4 py-2 rounded-xl">
                  <span className="text-2xl font-black text-emerald-400 leading-none">{importSummary.novas}</span>
                  <span className="text-[10px] font-bold text-emerald-500/70 uppercase tracking-wider mt-1">Novas</span>
                </div>
                <div className="flex flex-col items-center bg-red-500/10 border border-red-500/20 px-4 py-2 rounded-xl opacity-80">
                  <span className="text-2xl font-black text-red-400 leading-none">{importSummary.duplicadas}</span>
                  <span className="text-[10px] font-bold text-red-500/70 uppercase tracking-wider mt-1">Repetidas</span>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-[#09090b]">
              <ul className="space-y-3">
                {previewData.map((tx, idx) => (
                  <li key={idx} className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${tx.isDuplicate ? 'bg-zinc-900/30 border-zinc-800/30 opacity-50 grayscale' : 'bg-zinc-900/80 border-zinc-700/50 shadow-md hover:border-indigo-500/50'}`}>
                    <div className="flex items-center gap-4 overflow-hidden flex-1">
                      {tx.isDuplicate ? (
                        <XCircle className="w-6 h-6 text-red-500/50 flex-shrink-0" />
                      ) : (
                        <CheckCircle2 className="w-6 h-6 text-emerald-500 flex-shrink-0" />
                      )}
                      <div className="flex flex-col truncate">
                        <span className={`font-bold text-sm xl:text-base truncate ${tx.isDuplicate ? 'text-zinc-500' : 'text-zinc-200'}`}>{tx.description}</span>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-[11px] font-mono text-zinc-500">{tx.date.split('-').reverse().join('/')}</span>
                          <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded border ${tx.isDuplicate ? 'border-zinc-800 text-zinc-600' : 'border-indigo-500/30 text-indigo-400 bg-indigo-500/10'}`}>
                            {tx.category}
                          </span>
                          {tx.isDuplicate && (
                            <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">Bloqueada (Já Existe)</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className={`font-mono font-bold text-lg whitespace-nowrap ml-4 ${tx.isDuplicate ? 'text-zinc-700' : (tx.type === 'saida' ? 'text-zinc-300' : 'text-emerald-400')}`}>
                      {tx.type === 'saida' ? '-' : '+'} R$ {Number(tx.value).toFixed(2)}
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="p-6 border-t border-zinc-800/60 bg-zinc-900/50 flex justify-end gap-4">
              <button 
                onClick={() => setShowModal(false)}
                className="px-6 py-3 rounded-xl font-bold text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={handleConfirmImport}
                disabled={importSummary.novas === 0}
                className="flex items-center gap-2 px-8 py-3 rounded-xl font-bold text-sm text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:bg-zinc-800 disabled:text-zinc-500 disabled:cursor-not-allowed transition-all shadow-[0_0_20px_rgba(79,70,229,0.3)]"
              >
                {importSummary.novas > 0 ? `Gravar ${importSummary.novas} Novas Transações` : 'Nenhuma Nova Transação'}
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  );
}