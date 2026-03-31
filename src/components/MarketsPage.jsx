import React from 'react';
import MarketAssets from './MarketAssets';

export default function MarketsPage({ onTradeClick }) {
  return (
    <div className="space-y-6 animate-in fade-in duration-500 relative z-10">
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">Mercados</h1>
        <p className="text-sm text-quantum-fgMuted">Explore ativos em destaque e execute ordens de mercado.</p>
      </div>

      <MarketAssets onTradeClick={onTradeClick} />
    </div>
  );
}