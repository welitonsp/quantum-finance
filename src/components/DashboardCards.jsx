// src/components/DashboardCards.jsx
export default function DashboardCards({ balances }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
      <div className="glass-card-dark p-5 border-t-4 border-t-indigo-500 relative overflow-hidden group">
        <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1">Saldo Atual</p>
        <h3 className={`text-3xl font-black font-mono ${balances.saldoAtual >= 0 ? 'text-indigo-400' : 'text-red-400'}`}>
          R$ {balances.saldoAtual.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
        </h3>
      </div>

      <div className="glass-card-dark p-5 border-t-4 border-t-emerald-500 relative overflow-hidden group">
        <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1">Total Receitas</p>
        <h3 className="text-3xl font-black text-emerald-400 font-mono">
          +R$ {balances.entradas.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
        </h3>
      </div>

      <div className="glass-card-dark p-5 border-t-4 border-t-red-500 relative overflow-hidden group">
        <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1">Total Despesas</p>
        <h3 className="text-3xl font-black text-red-400 font-mono">
          -R$ {balances.saidas.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
        </h3>
      </div>
    </div>
  );
}