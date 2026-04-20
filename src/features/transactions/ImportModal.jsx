import React, { useState, useRef } from 'react';
import { X, Upload, AlertTriangle, FileText, CheckCircle2, Trash2 } from 'lucide-react';
import { parseOFX } from '../../shared/lib/ofxParser';
import { parseCSV } from '../../shared/lib/csvParser';
import { formatCurrency, formatDate } from '../../utils/formatters';

export default function ImportModal({ isOpen, onClose, onConfirmImport }) {
  const [transactions, setTransactions] = useState([]);
  const [selectedIndices, setSelectedIndices] = useState(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsProcessing(true);
    setError('');

    try {
      const text = await file.text();
      const extension = file.name.split('.').pop().toLowerCase();

      let parsedData = [];
      if (extension === 'ofx') {
        parsedData = await parseOFX(text);
      } else if (extension === 'csv') {
        parsedData = await parseCSV(text);
      } else {
        throw new Error('Formato não suportado. Envie apenas ficheiros .OFX ou .CSV');
      }

      if (parsedData.length === 0) {
        throw new Error('Não foram encontradas transações válidas neste ficheiro.');
      }

      setTransactions(parsedData);
      // Auto-selecionar todas por defeito
      setSelectedIndices(new Set(parsedData.map((_, i) => i)));
      
    } catch (err) {
      setError(err.message || 'Erro ao processar o ficheiro bancário.');
    } finally {
      setIsProcessing(false);
      // Limpar o input para permitir enviar o mesmo ficheiro novamente se necessário
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const toggleSelection = (index) => {
    const newSet = new Set(selectedIndices);
    if (newSet.has(index)) newSet.delete(index);
    else newSet.add(index);
    setSelectedIndices(newSet);
  };

  const toggleAll = () => {
    if (selectedIndices.size === transactions.length) {
      setSelectedIndices(new Set());
    } else {
      setSelectedIndices(new Set(transactions.map((_, i) => i)));
    }
  };

  const handleImport = () => {
    const selectedTxs = transactions.filter((_, i) => selectedIndices.has(i));
    onConfirmImport(selectedTxs);
    
    // Limpar estado e fechar
    setTransactions([]);
    setSelectedIndices(new Set());
    onClose();
  };

  const handleReset = () => {
    setTransactions([]);
    setSelectedIndices(new Set());
    setError('');
  };

  const entradas = transactions.filter(t => t.type === 'entrada').length;
  const saidas = transactions.filter(t => t.type === 'saida').length;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 w-full max-w-4xl max-h-[90vh] rounded-3xl shadow-2xl border border-white/10 flex flex-col overflow-hidden animate-in zoom-in-95">
        
        {/* CABEÇALHO */}
        <div className="p-6 border-b border-white/10 flex items-center justify-between shrink-0 bg-slate-900/50">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Upload className="w-5 h-5 text-quantum-accent" />
              Câmara de Conciliação Bancária
            </h2>
            <p className="text-sm text-slate-400 mt-1">Importação segura OFX / CSV (Zero-Knowledge)</p>
          </div>
          <button onClick={onClose} className="p-2 bg-slate-800 text-slate-400 rounded-full hover:bg-slate-700 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* CORPO DO MODAL */}
        <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          {transactions.length === 0 ? (
            /* ZONA DE UPLOAD */
            <div className="flex flex-col items-center justify-center py-16 px-4 border-2 border-dashed border-slate-700 rounded-2xl bg-slate-800/30 hover:bg-slate-800/50 hover:border-quantum-accent/50 transition-all group relative">
              <input 
                type="file" 
                ref={fileInputRef}
                accept=".ofx,.csv"
                onChange={handleFileChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <div className="w-16 h-16 bg-slate-800 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <FileText className="w-8 h-8 text-quantum-accent" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Selecione o Extrato Bancário</h3>
              <p className="text-sm text-slate-400 text-center max-w-md">
                Arraste o seu ficheiro <strong className="text-white">.OFX</strong> ou <strong className="text-white">.CSV</strong> para aqui ou clique para procurar. 
                Os dados nunca saem do seu dispositivo.
              </p>
              {isProcessing && <p className="mt-4 text-sm font-bold text-quantum-accent animate-pulse">A decifrar ficheiro...</p>}
            </div>
          ) : (
            /* LISTA DE CONCILIAÇÃO */
            <div className="space-y-4 animate-in slide-in-from-bottom-4">
              <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-800/50 p-4 rounded-xl border border-white/5">
                <div className="flex gap-6">
                  <div>
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Lidas</p>
                    <p className="text-xl font-black text-white">{transactions.length}</p>
                  </div>
                  <div>
                    <p className="text-xs text-emerald-500 font-bold uppercase tracking-wider">Entradas</p>
                    <p className="text-xl font-black text-emerald-400">{entradas}</p>
                  </div>
                  <div>
                    <p className="text-xs text-red-500 font-bold uppercase tracking-wider">Saídas</p>
                    <p className="text-xl font-black text-red-400">{saidas}</p>
                  </div>
                </div>
                
                <div className="flex gap-3">
                  <button onClick={handleReset} className="px-4 py-2 text-sm font-bold text-slate-400 bg-slate-800 rounded-lg hover:text-white hover:bg-slate-700 transition-colors flex items-center gap-2">
                    <Trash2 className="w-4 h-4" /> Cancelar Ficheiro
                  </button>
                  <button onClick={toggleAll} className="px-4 py-2 text-sm font-bold text-white bg-slate-700 rounded-lg hover:bg-slate-600 transition-colors">
                    {selectedIndices.size === transactions.length ? 'Desmarcar Tudo' : 'Marcar Tudo'}
                  </button>
                </div>
              </div>

              <div className="border border-white/10 rounded-xl overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-900 border-b border-white/10 text-xs uppercase tracking-wider text-slate-400">
                      <th className="p-3 w-12 text-center">#</th>
                      <th className="p-3">Data</th>
                      <th className="p-3">Descrição Original</th>
                      <th className="p-3 text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 bg-slate-900/30">
                    {transactions.map((tx, idx) => {
                      const isSelected = selectedIndices.has(idx);
                      return (
                        <tr 
                          key={idx} 
                          onClick={() => toggleSelection(idx)}
                          className={`cursor-pointer transition-colors ${isSelected ? 'bg-quantum-accent/5 hover:bg-quantum-accent/10' : 'hover:bg-slate-800'}`}
                        >
                          <td className="p-3 text-center">
                            <input 
                              type="checkbox" 
                              checked={isSelected}
                              readOnly
                              className="w-4 h-4 rounded border-slate-600 bg-slate-900 accent-quantum-accent cursor-pointer"
                            />
                          </td>
                          <td className="p-3 text-sm text-slate-300">{formatDate(tx.date)}</td>
                          <td className="p-3 text-sm font-bold text-white">{tx.description}</td>
                          <td className={`p-3 text-sm font-bold font-mono text-right ${tx.type === 'entrada' ? 'text-emerald-400' : 'text-white'}`}>
                            {tx.type === 'saida' ? '-' : '+'}{formatCurrency(tx.value)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* RODAPÉ / AÇÕES */}
        {transactions.length > 0 && (
          <div className="p-6 border-t border-white/10 bg-slate-900/80 flex justify-between items-center shrink-0">
            <p className="text-sm text-slate-400">
              <strong className="text-white">{selectedIndices.size}</strong> transações prontas para importar.
            </p>
            <div className="flex gap-3">
              <button onClick={onClose} className="px-6 py-3 rounded-xl font-bold text-slate-400 hover:text-white hover:bg-white/5 transition-colors">
                Fechar
              </button>
              <button 
                onClick={handleImport}
                disabled={selectedIndices.size === 0}
                className="flex items-center gap-2 px-6 py-3 bg-quantum-accent text-slate-900 font-bold rounded-xl hover:bg-emerald-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <CheckCircle2 className="w-5 h-5" />
                Importar Selecionadas
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}