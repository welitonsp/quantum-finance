// src/components/MarketTicker.jsx
import React from 'react';

// Dados simulados do mercado
const tickerData = [
  { symbol: 'BTC', price: 'R$ 352.840', change: '+4.82%' },
  { symbol: 'ETH', price: 'R$ 19.850', change: '+3.17%' },
  { symbol: 'SOL', price: 'R$ 1.420', change: '+6.24%' },
  { symbol: 'AAPL', price: 'R$ 942,30', change: '+1.56%' },
  { symbol: 'PETR4', price: 'R$ 38,92', change: '-1.24%' },
  { symbol: 'VALE3', price: 'R$ 61,45', change: '+2.08%' },
  { symbol: 'MSFT', price: 'R$ 1.280', change: '+0.93%' },
  { symbol: 'GOOG', price: 'R$ 168,40', change: '+2.31%' },
  { symbol: 'BNB', price: 'R$ 4.280', change: '+1.12%' },
  { symbol: 'ADA', price: 'R$ 2,84', change: '-0.67%' },
];

export default function MarketTicker() {
  // 🧠 Lógica Educativa: Duplicamos o array de dados para que a animação
  // CSS (tickerScroll) possa fazer o loop infinito sem mostrar espaços vazios.
  const items = [...tickerData, ...tickerData];

  return (
    <div className="w-full border-b border-quantum-border bg-quantum-bgSecondary overflow-hidden relative py-2.5">
      
      {/* Sombras laterais (Gradientes) para dar o efeito de entrada e saída suave */}
      <div className="absolute top-0 bottom-0 left-0 w-16 bg-gradient-to-r from-quantum-bgSecondary to-transparent z-10 pointer-events-none"></div>
      <div className="absolute top-0 bottom-0 right-0 w-16 bg-gradient-to-l from-quantum-bgSecondary to-transparent z-10 pointer-events-none"></div>

      {/* A faixa que realmente se move através da classe 'animate-tickerScroll' */}
      <div className="flex gap-8 animate-tickerScroll w-max px-4">
        {items.map((item, index) => {
          const isPositive = item.change.startsWith('+');
          return (
            <div key={index} className="flex items-center gap-2.5 text-sm whitespace-nowrap">
              <span className="font-bold text-quantum-fg">{item.symbol}</span>
              <span className="text-quantum-fgMuted font-mono">{item.price}</span>
              <span className={`font-bold text-xs ${isPositive ? 'text-quantum-accent' : 'text-quantum-red'}`}>
                {item.change}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}