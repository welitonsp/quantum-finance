// src/components/MarketAssets.jsx
import React from 'react';

const assets = [
  { symbol: 'BTC', name: 'Bitcoin', price: 352840.00, change: 4.82, volume: 'R$ 48.2B', color: '#F7931A', icon: '₿' },
  { symbol: 'ETH', name: 'Ethereum', price: 19850.00, change: 3.17, volume: 'R$ 22.1B', color: '#627EEA', icon: 'Ξ' },
  { symbol: 'PETR4', name: 'Petrobras PN', price: 38.92, change: -1.24, volume: 'R$ 3.8B', color: '#00A651', icon: 'P' },
  { symbol: 'VALE3', name: 'Vale ON', price: 61.45, change: 2.08, volume: 'R$ 2.1B', color: '#008C45', icon: 'V' },
  { symbol: 'AAPL', name: 'Apple Inc.', price: 942.30, change: 1.56, volume: 'R$ 8.7B', color: '#A2AAAD', icon: 'A' },
];

export default function MarketAssets({ onTradeClick }) {
  return (
    <div className="glass-card-quantum p-6 flex-1">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-bold text-white">Ativos em Destaque</h3>
          <p className="text-xs text-quantum-fgMuted mt-1">Top performers do dia</p>
        </div>
        <button className="px-4 py-2 text-xs font-bold text-quantum-fgMuted border border-quantum-border rounded-lg hover:border-quantum-accent hover:text-quantum-accent transition-colors">
          Ver Todos
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {/* Cabeçalho da Tabela */}
        <div className="grid grid-cols-12 gap-4 pb-2 border-b border-quantum-border text-xs text-quantum-fgMuted font-semibold px-2">
          <div className="col-span-5 md:col-span-4">Ativo</div>
          <div className="col-span-3">Preço</div>
          <div className="col-span-2 text-right">24h</div>
          <div className="col-span-2 text-right hidden md:block">Volume</div>
          <div className="col-span-2 text-right">Ação</div>
        </div>

        {/* Linhas de Ativos */}
        {assets.map((a) => (
          <div key={a.symbol} className="grid grid-cols-12 gap-4 items-center py-3 px-2 rounded-xl hover:bg-quantum-accentDim/30 transition-colors group cursor-default border-b border-quantum-border/50 last:border-0">
            <div className="col-span-5 md:col-span-4 flex items-center gap-3">
              <div 
                className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg flex-shrink-0"
                style={{ backgroundColor: `${a.color}22`, color: a.color }}
              >
                {a.icon}
              </div>
              <div className="overflow-hidden">
                <div className="font-bold text-sm text-quantum-fg truncate">{a.symbol}</div>
                <div className="text-xs text-quantum-fgMuted truncate">{a.name}</div>
              </div>
            </div>
            
            <div className="col-span-3 font-mono font-semibold text-sm text-white">
              {a.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
            
            <div className={`col-span-2 text-right font-bold text-xs ${a.change >= 0 ? 'text-quantum-accent' : 'text-quantum-red'}`}>
              {a.change >= 0 ? '+' : ''}{a.change.toFixed(2)}%
            </div>
            
            <div className="col-span-2 text-right text-xs font-mono text-quantum-fgMuted hidden md:block">
              {a.volume}
            </div>
            
            <div className="col-span-2 text-right">
              <button 
                onClick={() => onTradeClick && onTradeClick(a.symbol)}
                className="px-3 py-1.5 bg-quantum-accentDim text-quantum-accent text-xs font-bold rounded-lg hover:bg-quantum-accent hover:text-quantum-bg transition-colors"
              >
                Operar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}