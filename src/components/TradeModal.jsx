// src/components/TradeModal.jsx
import { useState, useEffect } from 'react';
import { X, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import toast from 'react-hot-toast';

export default function TradeModal({ isOpen, onClose, assetSymbol, onSuccess }) {
  const [type, setType] = useState('buy'); // 'buy' ou 'sell'
  const [quantity, setQuantity] = useState(1);
  const [price, setPrice] = useState('');

  // Limpa o formulário sempre que o modal abre para um novo ativo
  useEffect(() => {
    if (isOpen) {
      setQuantity(1);
      setPrice('');
      setType('buy');
    }
  }, [isOpen, assetSymbol]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!price || Number(price) <= 0) {
      toast.error("Por favor, insira um preço válido.");
      return;
    }

    if (!quantity || Number(quantity) <= 0) {
      toast.error("Por favor, insira uma quantidade válida.");
      return;
    }

    // Aqui futuramente integraremos com Firebase
    const total = (Number(quantity) * Number(price)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const actionText = type === 'buy' ? 'Compraste' : 'Vendeste';
    
    toast.success(`${actionText} ${quantity} ${assetSymbol} por ${total}!`);
    
    if (onSuccess) onSuccess();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-quantum-card w-full max-w-md rounded-3xl p-6 shadow-2xl border border-quantum-border animate-in zoom-in-95">
        
        {/* Header do Modal */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            Nova Operação
          </h2>
          <button onClick={onClose} className="p-1.5 bg-quantum-bgSecondary text-quantum-fgMuted rounded-full hover:bg-quantum-border hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          
          {/* Toggle Compra/Venda */}
          <div className="flex gap-2 p-1 bg-quantum-bgSecondary border border-quantum-border rounded-xl">
            <button
              type="button"
              onClick={() => setType('buy')}
              className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${
                type === 'buy'
                  ? 'bg-quantum-accentDim text-quantum-accent shadow-md border border-quantum-accent/20'
                  : 'text-quantum-fgMuted hover:text-white'
              }`}
            >
              <ArrowUpRight className="w-4 h-4" /> Compra
            </button>
            <button
              type="button"
              onClick={() => setType('sell')}
              className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${
                type === 'sell'
                  ? 'bg-quantum-redDim text-quantum-red shadow-md border border-quantum-red/20'
                  : 'text-quantum-fgMuted hover:text-white'
              }`}
            >
              <ArrowDownRight className="w-4 h-4" /> Venda
            </button>
          </div>

          {/* Ativo (Disabled) */}
          <div>
            <label className="block text-xs font-bold text-quantum-fgMuted uppercase tracking-wider mb-1.5 ml-1">Ativo Selecionado</label>
            <input
              type="text"
              value={assetSymbol}
              disabled
              className="w-full px-4 py-3 bg-quantum-bgSecondary border border-quantum-border rounded-xl text-white font-mono font-bold opacity-70 cursor-not-allowed"
            />
          </div>

          {/* Inputs Quantidade e Preço */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-quantum-fgMuted uppercase tracking-wider mb-1.5 ml-1">Quantidade</label>
              <input
                type="number"
                step="0.00001"
                min="0.00001"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full px-4 py-3 bg-quantum-bg border border-quantum-border rounded-xl text-white font-mono focus:outline-none focus:border-quantum-accent focus:ring-1 focus:ring-quantum-accent transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-quantum-fgMuted uppercase tracking-wider mb-1.5 ml-1">Preço Unitário (R$)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="Ex: 352840.00"
                className="w-full px-4 py-3 bg-quantum-bg border border-quantum-border rounded-xl text-white font-mono focus:outline-none focus:border-quantum-accent focus:ring-1 focus:ring-quantum-accent transition-all"
              />
            </div>
          </div>

          {/* Botão de Submit Dinâmico */}
          <button
            type="submit"
            className={`w-full py-3.5 font-bold rounded-xl transition-all shadow-lg mt-4 flex items-center justify-center gap-2 ${
              type === 'buy' 
                ? 'bg-quantum-accent text-quantum-bg hover:bg-emerald-400 hover:shadow-quantum-accentGlow' 
                : 'bg-quantum-red text-white hover:bg-red-400 hover:shadow-quantum-redDim'
            }`}
          >
            {type === 'buy' ? 'Confirmar Compra' : 'Confirmar Venda'}
          </button>
        </form>

      </div>
    </div>
  );
}