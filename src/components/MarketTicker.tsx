const tickerData = [
  { symbol: 'BTC',   price: 'R$ 352.840', change: '+4.82%' },
  { symbol: 'ETH',   price: 'R$ 19.850',  change: '+3.17%' },
  { symbol: 'SOL',   price: 'R$ 1.420',   change: '+6.24%' },
  { symbol: 'AAPL',  price: 'R$ 942,30',  change: '+1.56%' },
  { symbol: 'PETR4', price: 'R$ 38,92',   change: '-1.24%' },
  { symbol: 'VALE3', price: 'R$ 61,45',   change: '+2.08%' },
  { symbol: 'MSFT',  price: 'R$ 1.280',   change: '+0.93%' },
  { symbol: 'GOOG',  price: 'R$ 168,40',  change: '+2.31%' },
  { symbol: 'BNB',   price: 'R$ 4.280',   change: '+1.12%' },
  { symbol: 'ADA',   price: 'R$ 2,84',    change: '-0.67%' },
];

export default function MarketTicker() {
  const items = [...tickerData, ...tickerData];
  return (
    <div className="w-full border-b border-quantum-border bg-quantum-bgSecondary overflow-hidden relative py-2.5">
      <div className="absolute top-0 bottom-0 left-0 w-16 bg-gradient-to-r from-quantum-bgSecondary to-transparent z-10 pointer-events-none" />
      <div className="absolute top-0 bottom-0 right-0 w-16 bg-gradient-to-l from-quantum-bgSecondary to-transparent z-10 pointer-events-none" />
      <div className="flex animate-[tickerScroll_30s_linear_infinite]">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2 px-6 flex-shrink-0">
            <span className="text-xs font-bold text-white font-mono">{item.symbol}</span>
            <span className="text-xs text-quantum-fgMuted font-mono">{item.price}</span>
            <span className={`text-xs font-bold font-mono ${item.change.startsWith('+') ? 'text-quantum-accent' : 'text-quantum-red'}`}>{item.change}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
