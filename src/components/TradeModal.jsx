import React, { useState } from 'react';
import { X, TrendingUp, AlertCircle, Info } from 'lucide-react';
import toast from 'react-hot-toast';

export default function TradeModal({ isOpen, onClose, assetSymbol }) {
  const [quantity, setQuantity] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleTrade = async (e) => {
    e.preventDefault();
    const numQuantity = Number(quantity);
    if (isNaN(numQuantity) || numQuantity <= 0) {
      toast.error('Informe uma quantidade válida.');
      return;
    }

    setIsSubmitting(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 800));
      
      // Aviso Claro de Simulação
      toast(`📊 Simulação registada: Operação de ${quantity} ${assetSymbol}`, {
        icon: '🔬',
        style: { background: '#1E2A3F', color: '#fff', border: '1px solid #3b82f6' },
        duration: 5000,
      });
      
      setQuantity('');
      onClose();
    } catch (error) {
      toast.error('Erro na simulação. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 w-full max-w-md rounded-3xl p-6 shadow-2xl border border-white/10 animate-in zoom-in-95">
        
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-cyan-400" />
            Negociar {assetSymbol || 'Ativo'}
          </h2>
          <button onClick={onClose} className="p-1.5 bg-slate-800 text-slate-400 rounded-full hover:bg-slate-700 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleTrade} className="space-y-5">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 ml-1">Quantidade Simétrica</label>
            <input
              type="number"
              step="0.0001"
              min="0"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="Ex: 0.5"
              autoFocus
              className="w-full px-4 py-3 bg-slate-950 border border-white/10 rounded-xl text-white font-mono focus:outline-none focus:border-cyan-500 transition-all"
            />
          </div>

          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-2">
            <Info className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-amber-200/80 leading-relaxed">
              <strong>Modo de Simulação Ativo.</strong> Nenhuma ordem real será executada no mercado. Isto é apenas um teste de projeção de carteira.
            </p>
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !quantity}
            className="w-full py-3.5 font-bold rounded-xl transition-all shadow-lg bg-cyan-600 text-white hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'A Processar...' : 'Confirmar Ordem Fictícia'}
          </button>
        </form>
      </div>
    </div>
  );
}