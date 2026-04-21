import { ArrowUpRight, ArrowDownRight, CircleDollarSign, Receipt } from 'lucide-react';

const transactions = [
  { name: 'Compra Bitcoin',    date: 'Hoje, 14:32',    amount: '+0.05 BTC', sub: 'R$ 17.642,00', type: 'buy',      color: '#F7931A' },
  { name: 'Venda PETR4',       date: 'Hoje, 11:15',    amount: '-200 un',   sub: 'R$ 7.784,00',  type: 'sell',     color: '#00A651' },
  { name: 'Dividendo VALE3',   date: 'Ontem, 18:00',   amount: '+R$ 842,50',sub: 'Rendimento',   type: 'dividend', color: '#FFB800' },
  { name: 'Compra Ethereum',   date: 'Ontem, 09:44',   amount: '+1.2 ETH',  sub: 'R$ 23.820,00', type: 'buy',      color: '#627EEA' },
];

export default function RecentInvestments() {
  const getIcon = (type: string) => {
    if (type === 'buy')      return <ArrowUpRight className="w-5 h-5" />;
    if (type === 'sell')     return <ArrowDownRight className="w-5 h-5" />;
    if (type === 'dividend') return <CircleDollarSign className="w-5 h-5" />;
    return <Receipt className="w-5 h-5" />;
  };

  return (
    <div className="glass-card-quantum p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-white">Transações Recentes</h3>
        <button className="text-xs font-bold text-quantum-accent hover:text-white transition-colors">Ver todas</button>
      </div>
      <div className="flex flex-col gap-3">
        {transactions.map((tx, i) => (
          <div key={i} className="flex items-center gap-3 p-3 bg-quantum-bg/50 rounded-xl hover:bg-quantum-bg transition-colors">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${tx.color}20`, color: tx.color }}>
              {getIcon(tx.type)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white truncate">{tx.name}</p>
              <p className="text-xs text-quantum-fgMuted">{tx.date}</p>
            </div>
            <div className="text-right">
              <p className={`text-sm font-bold font-mono ${tx.amount.startsWith('+') ? 'text-quantum-accent' : 'text-quantum-red'}`}>{tx.amount}</p>
              <p className="text-xs text-quantum-fgMuted font-mono">{tx.sub}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
