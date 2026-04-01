// src/features/transactions/ImportButton.jsx
import { useState, useRef } from "react";
import { UploadCloud, FileType, Loader2, AlertCircle, CheckCircle2, X, Download, Lock } from "lucide-react";
import toast from 'react-hot-toast';

// ✅ CORREÇÕES: Apontando para o novo cofre de utilitários no shared
import { parseOFX } from "../../shared/lib/ofxParser";
import { parsePDF } from "../../shared/lib/pdfParser";
import { parseCSV } from "../../shared/lib/csvParser";

// ✅ 1. IMPORTAÇÃO DO MOTOR DE INTELIGÊNCIA ARTIFICIAL
import { classifyWithAI } from "../../utils/aiCategorize";

export default function ImportButton({ onImportTransactions, uid, existingTransactions }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState('idle'); // 'idle', 'loading', 'success', 'error', 'password'
  const [errorMessage, setErrorMessage] = useState('');
  
  // Estados para lidar com senhas de PDF
  const [selectedFile, setSelectedFile] = useState(null);
  const [pdfPassword, setPdfPassword] = useState('');
  
  const fileInputRef = useRef(null);

  const processFile = async (file, password = null) => {
    if (!file) return;
    
    setSelectedFile(file);
    setStatus('loading');
    setErrorMessage('');
    const toastId = toast.loading("A analisar ficheiro...");

    try {
      const extension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
      let transacoesProcessadas = [];

      // FASE 1: DESCODIFICAÇÃO DO FICHEIRO
      if (extension === '.ofx') {
        toast.loading("A ler ficheiro OFX...", { id: toastId });
        transacoesProcessadas = await parseOFX(file);
      } else if (extension === '.pdf') {
        toast.loading(password ? "A desencriptar PDF..." : "A descodificar PDF...", { id: toastId });
        transacoesProcessadas = await parsePDF(file, password);
      } else if (extension === '.csv') {
        toast.loading("A estruturar dados do CSV...", { id: toastId });
        transacoesProcessadas = await parseCSV(file);
      } else {
        throw new Error("Formato não suportado. Use OFX, PDF ou CSV.");
      }

      if (!transacoesProcessadas || transacoesProcessadas.length === 0) {
        throw new Error("Nenhuma transação válida encontrada neste ficheiro.");
      }

      // ✅ FASE 2: CLASSIFICAÇÃO QUÂNTICA (GEMINI AI)
      toast.loading(`A injetar ${transacoesProcessadas.length} registos na Rede Neural (Gemini)...`, { id: toastId });
      transacoesProcessadas = await classifyWithAI(transacoesProcessadas);

      // FASE 3: GRAVAÇÃO NO FIREBASE
      toast.loading(`A sincronizar os dados categorizados...`, { id: toastId });
      let resultado;
      if (onImportTransactions) {
        resultado = await onImportTransactions(transacoesProcessadas);
      }

      // Exibir mensagem detalhada usando o resultado
      if (resultado && typeof resultado === 'object') {
        const { added, duplicates } = resultado;
        if (added > 0 && duplicates > 0) {
          toast.success(`${added} transações adicionadas e categorizadas com IA. ${duplicates} duplicadas ignoradas.`, { id: toastId });
        } else if (added > 0) {
          toast.success(`${added} transações classificadas e importadas com sucesso!`, { id: toastId });
        } else if (duplicates > 0) {
          toast.warning(`Todas as ${duplicates} transações já existiam. Nenhuma duplicada foi adicionada.`, { id: toastId });
        } else {
          toast.success(`${transacoesProcessadas.length} transações processadas!`, { id: toastId });
        }
      } else {
        toast.success(`${transacoesProcessadas.length} transações importadas com IA!`, { id: toastId });
      }

      setStatus('success');
      
      setTimeout(() => {
        closeModal();
      }, 2500);

    } catch (error) {
      console.error("Erro na importação:", error);
      
      if (error.message === 'PASSWORD_REQUIRED') {
        setStatus('password');
        toast.error("Ficheiro protegido. É necessária a password.", { id: toastId });
        return;
      }

      setStatus('error');
      setErrorMessage(error.message || 'Falha ao processar o extrato. Verifique o ficheiro.');
      toast.error("Processo interrompido.", { id: toastId });
    }
  };

  const handlePasswordSubmit = (e) => {
    e.preventDefault();
    if (pdfPassword.trim() && selectedFile) {
      processFile(selectedFile, pdfPassword);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const closeModal = () => {
    if (status === 'loading') return; 
    setIsOpen(false);
    setStatus('idle');
    setPdfPassword('');
    setSelectedFile(null);
  };

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        className="px-4 py-2 bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 rounded-xl flex items-center text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-indigo-600 dark:hover:text-white transition-all shadow-sm dark:shadow-inner hover:shadow-indigo-500/20"
      >
        <Download className="w-4 h-4 mr-2 text-indigo-500 dark:text-indigo-400" /> Importar Extrato (IA)
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm animate-in fade-in" onClick={closeModal}></div>
          
          <div className="glass-card-quantum p-1 w-full max-w-md relative z-10 animate-in zoom-in-95 duration-200">
            <div className="bg-white dark:bg-slate-900 rounded-[20px] p-6 relative overflow-hidden">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-32 bg-indigo-500/20 blur-3xl rounded-full"></div>

              <div className="flex justify-between items-center mb-6 relative z-10">
                <div>
                  <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                    <FileType className="w-5 h-5 text-indigo-500" /> Ingestão de Dados
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">Sincronize as suas faturas (OFX, PDF, CSV)</p>
                </div>
                <button onClick={closeModal} disabled={status === 'loading'} className="p-2 text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 rounded-xl transition-colors disabled:opacity-50">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {status === 'idle' && (
                <div 
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`relative z-10 border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${isDragging ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 scale-[1.02]' : 'border-slate-300 dark:border-slate-700 hover:border-indigo-500/50 hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
                >
                  <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" accept=".ofx,.pdf,.csv" />
                  <div className={`p-4 rounded-xl mb-4 transition-colors ${isDragging ? 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}>
                    <UploadCloud className="w-8 h-8" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-800 dark:text-white mb-1">Clique ou Arraste o seu ficheiro</h4>
                  <p className="text-xs text-slate-500">A IA categorizará automaticamente o ficheiro.</p>
                </div>
              )}

              {status === 'password' && (
                <form onSubmit={handlePasswordSubmit} className="relative z-10 py-6 animate-in zoom-in">
                  <div className="flex justify-center mb-4">
                    <div className="p-4 bg-orange-100 dark:bg-orange-500/20 rounded-full border border-orange-200 dark:border-orange-500/30">
                      <Lock className="w-8 h-8 text-orange-600 dark:text-orange-400" />
                    </div>
                  </div>
                  <h4 className="text-base text-center font-bold text-slate-800 dark:text-white mb-2">PDF Protegido</h4>
                  <p className="text-xs text-center text-slate-500 mb-6">Este extrato do banco está encriptado. Digite a senha (geralmente os primeiros dígitos do CPF/NIF) para o sistema o ler.</p>
                  
                  <input 
                    type="password" 
                    value={pdfPassword}
                    onChange={(e) => setPdfPassword(e.target.value)}
                    placeholder="Senha do PDF..."
                    className="w-full bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm text-slate-800 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 mb-4 outline-none"
                    autoFocus
                  />
                  
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setStatus('idle')} className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">Cancelar</button>
                    <button type="submit" disabled={!pdfPassword} className="flex-1 py-3 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors">Desbloquear e Ler</button>
                  </div>
                </form>
              )}

              {status === 'loading' && (
                <div className="relative z-10 py-12 flex flex-col items-center text-center animate-in fade-in">
                  <Loader2 className="w-12 h-12 text-indigo-500 animate-spin mb-4" />
                  <h4 className="text-sm font-bold text-slate-800 dark:text-white tracking-widest uppercase animate-pulse">A Processar IA...</h4>
                </div>
              )}

              {status === 'success' && (
                <div className="relative z-10 py-12 flex flex-col items-center text-center animate-in zoom-in">
                  <CheckCircle2 className="w-16 h-16 text-emerald-500 mb-4" />
                  <h4 className="text-lg font-bold text-emerald-600 dark:text-emerald-400">Sucesso!</h4>
                </div>
              )}

              {status === 'error' && (
                <div className="relative z-10 py-8 flex flex-col items-center text-center animate-in zoom-in">
                  <AlertCircle className="w-16 h-16 text-red-500 mb-4" />
                  <p className="text-xs text-slate-500 mb-6">{errorMessage}</p>
                  <button onClick={() => setStatus('idle')} className="px-6 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-white font-bold rounded-xl">Tentar Novamente</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}